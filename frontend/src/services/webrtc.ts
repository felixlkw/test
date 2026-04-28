export interface WebRTCSesssionOptions {
  onSessionEnd?: () => void;
  onEvent?: (event: object) => void;
  mode?: 'tbm' | 'ehs';
  // v0.2.0: polish dropped, thai/indonesian added. Polish requests fold to english server-side.
  language?: 'english' | 'korean' | 'vietnamese' | 'thai' | 'indonesian';
  domain?: 'manufacturing' | 'construction' | 'heavy_industry' | 'semiconductor';
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
) {
  const body: Record<string, unknown> = { mode, language };
  if (domain) body.domain = domain;
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

  constructor(options: WebRTCSesssionOptions) {
    this.options = options;
    this.mode = options.mode || 'tbm';
    this.language = options.language || 'korean';
    this.domain = options.domain;
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
    const key = await getEphemeralKey(this.mode, this.language, this.domain);
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
 