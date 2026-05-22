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

// 2026-05-22 — 모드별 첫 그리팅 분리. 이전 단일 INITIAL_MESSAGE("Greet ... and
// proceed with the first procedure")는 EHS 모드에서 "first procedure" 부분이
// 무의미해 모델이 종종 입을 떼지 않는 회귀가 있었음. 이제 mode에 따라:
//   TBM: 따뜻하게 인사 + TBM 활동 시작 선언 + 첫 사전정보 질문(작업 장소).
//   EHS: 한 문장으로 짧게 인사 + 어떤 안전 관련 도움이 필요한지 묻기.
// 둘 다 system role + audioResponse=true로 즉시 AI가 입을 떼게 함.
const INITIAL_MESSAGE_TBM = `\
Greet the user warmly in the configured response language, announce that you'll
start today's TBM (toolbox meeting) together, and then proceed with the first
prior-information question per the configured procedure. Keep it short — one
short greeting sentence + one question. Display proper cues at proper times.
`;

const INITIAL_MESSAGE_EHS = `\
Greet the user briefly in the configured response language (one short sentence)
and ask what safety-related help they need today. Do not list capabilities or
read a long intro — keep it to a single sentence.
`;

function defaultInitialMessageFor(mode: 'tbm' | 'ehs'): string {
  return mode === 'ehs' ? INITIAL_MESSAGE_EHS : INITIAL_MESSAGE_TBM;
}

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
    initialMessage?: string,
    initialMessageRole: 'user' | 'assistant' | 'system' = 'system'
  ) {
    // 2026-05-22 — initialMessage 기본값을 mode 기반으로. 호출자가 명시한 값이
    // 있으면 그대로 사용(EHS recommended-question 클릭 경로 등).
    const resolvedInitialMessage = initialMessage ?? defaultInitialMessageFor(this.mode);

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
    // 2026-05-23 — 자동 인사 회귀 픽스. 옛 패턴(dataChannel.onopen에서
    //   conversation.item.create(role='system') + response.create({modalities:[...]}))은
    // Realtime GA에서 동작하지 않아 AI가 입을 떼지 않고 사용자 발화 후에만
    // 응답이 나왔다(서버 VAD 트리거). GA 네이티브 패턴 2가지를 사용:
    //   1) `session.created`를 받은 뒤에야 트리거 — 서버 측 세션 초기화 완료 보장.
    //   2) role='user'면 sendTextMessage 그대로 (사용자가 명시 메시지를 첫 입력으로
    //      주입하는 EHS recommended-question 등). 그 외(default 'system')는
    //      response.create의 instructions/output_modalities 필드를 직접 써서 채팅
    //      에 system 말풍선을 흘리지 않고 AI 인사만 발화.
    let kickoffFired = false;
    const fireKickoff = () => {
      if (kickoffFired) return;
      kickoffFired = true;
      if (initialMessageRole === 'user') {
        this.sendTextMessage(resolvedInitialMessage, 'user', true);
        return;
      }
      // GA: response.create + instructions(ephemeral). conversation.item을 만들지 않으므로
      // 사용자 채팅에 system 메시지가 떠다니지 않는다.
      this.dataChannel?.send(JSON.stringify({
        type: 'response.create',
        response: {
          instructions: resolvedInitialMessage,
          output_modalities: ['audio'],
        },
      }));
    };
    this.dataChannel.onmessage = (e: MessageEvent) => {
      const event = JSON.parse(e.data);
      // GA 권장: 세션 준비 완료 후 첫 응답 트리거. 옛 onopen-only 트리거는 너무 일찍
      // 발사돼 서버가 무시하던 케이스가 있었다.
      if (!kickoffFired && (event.type === 'session.created' || event.type === 'session.updated')) {
        fireKickoff();
      }
      if (this.options.onEvent) {
        this.options.onEvent(event);
      }
    };
    this.dataChannel.onopen = () => {
      // 2.5초 동안 session.created가 안 오면 폴백 fire — 호환성 보호망.
      setTimeout(fireKickoff, 2500);
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
    // 2026-05-22 — Realtime GA: SDP exchange moved from /v1/realtime to
    // /v1/realtime/calls. Model is encoded inside the ephemeral client_secret,
    // so we MUST NOT pass `?model=...` (GA returns 400 if we do).
    const sdpRes = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST',
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/sdp',
      },
    });

    const sdpText = await sdpRes.text();
    if (!sdpRes.ok) {
      throw new Error(`Realtime SDP exchange failed: ${sdpRes.status} ${sdpText}`);
    }
    const answer: RTCSessionDescriptionInit = { type: 'answer', sdp: sdpText };
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

    // 2026-05-23 — GA에서 response.create.modalities → response.create.output_modalities
    // 로 이름이 바뀌어 Beta 이름은 무시된다. 'text'-only 응답이 필요한 케이스를
    // 살리려고 명시 지정은 유지하되 GA 이름으로 보낸다(없으면 세션 default
    // [audio] 적용).
    const responseEvent = {
      type: 'response.create',
      response: {
        output_modalities: audioResponse ? ['audio'] : ['text'],
      },
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
 