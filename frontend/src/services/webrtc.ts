// PR A_v2-4: prepare-stage summary derived from Session.prepared_baseline +
// prepared_context. Sent on /api/webrtc-key body so the backend can inject a
// [Prepare Stage Result] block into the TBM system prompt.
//
// shape (c8 §6):
//   work_type_label  — current work type (id or label fallback).
//   baseline_count   — total baseline items (LLM uses for "X건 필수").
//   top_hazards      — first 3 baseline content strings (already in user lang).
//   context_summary  — single-line user-context summary, or "" when empty.
//
// EHS mode ignores this on the backend (TBM only injection).
export interface PreparedSummary {
  work_type_label: string;
  baseline_count: number;
  top_hazards: string[];
  context_summary: string;
  /** PR F — Briefing Review Mode 분기 힌트. baseline_count >= 3일 때만 true.
   *  backend prompt.py가 이 플래그가 true일 때 prior_info 수집을 건너뛰고
   *  곧장 Push 브리핑 도우미 모드로 전환한다. */
  has_full_baseline?: boolean;
}

export interface WebRTCSesssionOptions {
  onSessionEnd?: () => void;
  onEvent?: (event: object) => void;
  mode?: 'tbm' | 'ehs';
  // v0.2.0: polish dropped, thai/indonesian added. Polish requests fold to english server-side.
  language?: 'english' | 'korean' | 'vietnamese' | 'thai' | 'indonesian';
  domain?: 'manufacturing' | 'construction' | 'heavy_industry' | 'semiconductor';
  // PR A: optional work-type id from PrepareScreen. Backend uses it to inject
  // the matching baseline checklist block into the system prompt.
  work_type_id?: string;
  /** PR A_v2-4: optional prepare-stage summary. TBM-only injection. */
  prepared_summary?: PreparedSummary;
}

const INITIAL_MESSAGE = `\
Greet the user and proceed with the first procedure.
Make sure to display proper cues at proper times.
`;

type EphemeralLanguage = 'english' | 'korean' | 'vietnamese' | 'thai' | 'indonesian';
type EphemeralDomain = 'manufacturing' | 'construction' | 'heavy_industry' | 'semiconductor';

async function getEphemeralKey(
  mode: 'tbm' | 'ehs' = 'tbm',
  language: EphemeralLanguage = 'korean',
  domain?: EphemeralDomain,
  work_type_id?: string,
  prepared_summary?: PreparedSummary,
) {
  const body: Record<string, unknown> = { mode, language };
  if (domain) body.domain = domain;
  // PR A: only TBM mode uses work_type_id; EHS ignores it server-side.
  if (work_type_id && mode === 'tbm') body.work_type_id = work_type_id;
  // PR A_v2-4: TBM-only — backend prompt.get_system_prompt injects the
  // [Prepare Stage Result] block. EHS mode discards this server-side.
  if (prepared_summary && mode === 'tbm') body.prepared_summary = prepared_summary;
  const res = await fetch('/api/webrtc-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Failed to get ephemeral key');
  const { key } = await res.json();
  return key;
}

export class WebRTCSession {
  private conn: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private audioStream: MediaStream | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private options: WebRTCSesssionOptions;
  private mode: 'tbm' | 'ehs';
  private language: EphemeralLanguage;
  private domain?: EphemeralDomain;
  private workTypeId?: string;
  private preparedSummary?: PreparedSummary;

  constructor(options: WebRTCSesssionOptions) {
    this.options = options;
    this.mode = options.mode || 'tbm';
    this.language = options.language || 'korean';
    this.domain = options.domain;
    this.workTypeId = options.work_type_id;
    this.preparedSummary = options.prepared_summary;
  }

  async start(
    audioElement: HTMLAudioElement, 
    outgoingStream?: MediaStream, 
    initialMessage: string = INITIAL_MESSAGE,
    initialMessageRole: 'user' | 'assistant' | 'system' = 'system'
  ) {
    // Create RTCPeerConnection
    this.conn = new RTCPeerConnection();

    // Set up audio playback
    this.audioElement = audioElement;
    this.conn.ontrack = (e: RTCTrackEvent) => {
      if (this.audioElement) this.audioElement.srcObject = e.streams[0];
    };

    // Use provided stream or capture mic
    if (outgoingStream) {
      this.audioStream = outgoingStream;
    } else {
      this.audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }
    this.audioStream.getTracks().forEach(
      track => this.conn!.addTrack(track, this.audioStream!));

    // Create data channel for events
    this.dataChannel = this.conn.createDataChannel('oai-events');
    this.dataChannel.onmessage = (e: MessageEvent) => {
      const event = JSON.parse(e.data);
      if (this.options.onEvent) {
        this.options.onEvent(event);
      }
    };
    this.dataChannel.onopen = () => {
      this.sendTextMessage(initialMessage, initialMessageRole, true); // Audio response for initial greeting
    };

    // Create SDP offer
    const offer = await this.conn.createOffer();
    await this.conn.setLocalDescription(offer);

    // Send offer to OpenAI and get answer
    const key = await getEphemeralKey(
      this.mode,
      this.language,
      this.domain,
      this.workTypeId,
      this.preparedSummary,
    );
    const sdpRes = await fetch('https://api.openai.com/v1/realtime', {
      method: 'POST',
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/sdp',
      },
    });

    const answer: RTCSessionDescriptionInit = { type: 'answer', sdp: await sdpRes.text() };
    await this.conn.setRemoteDescription(answer);
  }

  stop() {
    this.dataChannel?.close();
    this.conn?.close();
    this.audioStream?.getTracks().forEach(track => track.stop());
    if (this.audioElement) this.audioElement.srcObject = null;
    this.options.onSessionEnd?.();
  }

  sendTextMessage(text: string, role: 'user' | 'assistant' | 'system', audioResponse: boolean = false) {
    if (!this.dataChannel || !text.trim()) return;

    const event = {
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role,
        content: [{ type: 'input_text', text }],
      },
    };
    this.dataChannel.send(JSON.stringify(event));

    // Create response with appropriate modalities
    const responseEvent = {
      type: 'response.create',
      response: {
        modalities: audioResponse ? ['text', 'audio'] : ['text']
      }
    };
    this.dataChannel.send(JSON.stringify(responseEvent));
  }

  /**
   * PR-feedback-3 (v0.2.3) — system context inject without triggering response.
   *
   * sendTextMessage와 달리 response.create를 발사하지 않는다. LLM이 다음
   * 사용자 응답을 처리할 때 conversation 컨텍스트로 자연 활용. [Slot Status]
   * 와 [Closing Reminder] 같은 메타 블록을 사용자 발화에 echo 시키지 않으면서
   * 프롬프트 사이드에서 가시화하는 패턴. dataChannel이 닫혔거나 빈 텍스트면
   * silently noop — 세션 미연결/종료 후 호출 안전.
   *
   * 회귀 가드: 기존 sendTextMessage / sendToolResult 흐름은 본 메서드 추가에
   * 영향 받지 않음. 본 메서드는 호출되지 않으면 기존 v0.2.2 동작과 동일.
   */
  injectSystemContext(text: string) {
    if (!this.dataChannel || !text.trim()) return;
    if (this.dataChannel.readyState !== 'open') return;
    const event = {
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'system',
        content: [{ type: 'input_text', text }],
      },
    };
    try {
      this.dataChannel.send(JSON.stringify(event));
    } catch {
      // dataChannel이 race로 닫히는 경우 — silently noop. 인젝트 실패는 다음
      // 발화 사이클에서 자연 회복(매 턴 inject라 단발 누락 무시 가능).
    }
  }

  sendToolResult(callId: string, result: object) {
    if (!this.dataChannel) return;
    const event = {
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output: JSON.stringify(result),
      },
    };
    this.dataChannel.send(JSON.stringify(event));
    this.dataChannel.send(JSON.stringify({ type: 'response.create' }));
  }

  // Cycle 3: 마이크 토글 — 사용자 음성 송신 enable/disable.
  // track.enabled=false면 OpenAI로 무음 프레임이 가서 사용자 발화로 인식되지 않음.
  // AI 응답(원격 트랙) 수신은 영향 받지 않음.
  setMicEnabled(enabled: boolean): void {
    if (!this.audioStream) return;
    this.audioStream.getAudioTracks().forEach((t) => {
      t.enabled = enabled;
    });
  }

  isMicEnabled(): boolean {
    if (!this.audioStream) return false;
    const tracks = this.audioStream.getAudioTracks();
    if (tracks.length === 0) return false;
    return tracks.every((t) => t.enabled);
  }

  // Add method to interrupt audio output
  interruptResponse() {
    if (!this.dataChannel) return;
    
    console.log('🛑 Interrupting audio response...');
    
    // Clear the output audio buffer immediately
    const clearEvent = {
      type: 'output_audio_buffer.clear',
    };
    this.dataChannel.send(JSON.stringify(clearEvent));
    
    // Cancel the current response
    const cancelEvent = {
      type: 'response.cancel',
    };
    this.dataChannel.send(JSON.stringify(cancelEvent));
  }
}
 