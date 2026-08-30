export type RealtimeSpeaker = 'user' | 'ai';
export type RealtimeMode = 'listening' | 'speaking';

export interface OpenAIRealtimeCallbacks {
  onConnect(): void;
  onDisconnect(): void;
  onModeChange(mode: RealtimeMode): void;
  onCaption(source: RealtimeSpeaker, text: string): void;
  onError(message: string): void;
}

interface VoiceSessionCredentials {
  sdp: string;
  sessionId: string;
  sessionToken: string;
  maxDurationSeconds: number;
  error?: string;
}

interface RealtimeFunctionCall {
  type?: string;
  name?: string;
  call_id?: string;
  arguments?: string;
}

interface RealtimeServerEvent {
  type?: string;
  delta?: string;
  transcript?: string;
  name?: string;
  call_id?: string;
  arguments?: string;
  error?: { message?: string };
  response?: { output?: RealtimeFunctionCall[] };
}

const BOOKING_TOOL = 'submit_voice_booking_request';

export class OpenAIRealtimeSession {
  private peer: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private microphone: MediaStream | null = null;
  private audio: HTMLAudioElement | null = null;
  private credentials: VoiceSessionCredentials | null = null;
  private maxDurationTimer: ReturnType<typeof setTimeout> | null = null;
  private closing = false;
  private disconnectNotified = false;
  private userTranscript = '';
  private assistantTranscript = '';
  private readonly handledCalls = new Set<string>();

  private constructor(
    private readonly clinicId: string,
    private readonly callbacks: OpenAIRealtimeCallbacks,
  ) {}

  static async start(
    clinicId: string,
    callbacks: OpenAIRealtimeCallbacks,
  ): Promise<OpenAIRealtimeSession> {
    const session = new OpenAIRealtimeSession(clinicId, callbacks);
    await session.connect();
    return session;
  }

  setMicMuted(isMuted: boolean): void {
    this.microphone?.getAudioTracks().forEach(track => { track.enabled = !isMuted; });
  }

  async endSession(): Promise<void> {
    if (this.closing) return;
    this.closing = true;
    this.releaseMedia();
    await this.reportUsage();
  }

  private async connect(): Promise<void> {
    try {
      this.microphone = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const peer = new RTCPeerConnection();
      const channel = peer.createDataChannel('oai-events');
      const audio = document.createElement('audio');
      audio.autoplay = true;
      audio.hidden = true;
      audio.setAttribute('playsinline', '');
      audio.setAttribute('aria-hidden', 'true');
      document.body.appendChild(audio);
      this.peer = peer;
      this.channel = channel;
      this.audio = audio;

      peer.ontrack = event => {
        audio.srcObject = event.streams[0] ?? null;
        void audio.play().catch(() => this.callbacks.onError('Voice audio playback was blocked. Please try again.'));
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'failed') {
          this.callbacks.onError('OpenAI voice connection failed.');
        }
      };
      this.microphone.getTracks().forEach(track => peer.addTrack(track, this.microphone!));

      channel.addEventListener('open', () => this.handleOpen());
      channel.addEventListener('message', event => this.handleMessage(event.data));
      channel.addEventListener('close', () => { void this.handleUnexpectedDisconnect(); });
      channel.addEventListener('error', () => this.callbacks.onError('OpenAI voice event channel failed.'));

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      this.credentials = await this.createCredentials(offer.sdp ?? '');
      await peer.setRemoteDescription({ type: 'answer', sdp: this.credentials.sdp });
    } catch (error) {
      this.closing = true;
      this.releaseMedia();
      await this.reportUsage();
      throw error;
    }
  }

  private async createCredentials(sdp: string): Promise<VoiceSessionCredentials> {
    const response = await fetch('/api/voice-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clinicId: this.clinicId, sdp }),
    });
    const data = await response.json() as Partial<VoiceSessionCredentials>;
    if (!response.ok || !data.sdp || !data.sessionId || !data.sessionToken || !data.maxDurationSeconds) {
      throw new Error(data.error || 'Could not create a secure OpenAI voice session.');
    }
    return data as VoiceSessionCredentials;
  }

  private handleOpen(): void {
    if (this.closing) return;
    const maxDurationSeconds = this.credentials?.maxDurationSeconds ?? 0;
    this.maxDurationTimer = setTimeout(() => {
      void this.handleUnexpectedDisconnect();
    }, maxDurationSeconds * 1_000);
    this.callbacks.onConnect();
    this.send({
      type: 'response.create',
      response: {
        instructions: 'Greet the patient now using the configured opening greeting, then ask how you can help.',
      },
    });
  }

  private handleMessage(raw: unknown): void {
    if (typeof raw !== 'string') return;

    let event: RealtimeServerEvent;
    try {
      event = JSON.parse(raw) as RealtimeServerEvent;
    } catch {
      return;
    }

    switch (event.type) {
      case 'input_audio_buffer.speech_started':
        this.callbacks.onModeChange('listening');
        break;
      case 'response.created':
      case 'response.output_audio.delta':
        this.callbacks.onModeChange('speaking');
        break;
      case 'response.output_audio.done':
        this.callbacks.onModeChange('listening');
        break;
      case 'conversation.item.input_audio_transcription.delta':
        this.userTranscript += event.delta ?? '';
        this.emitCaption('user', this.userTranscript);
        break;
      case 'conversation.item.input_audio_transcription.completed':
        this.userTranscript = event.transcript ?? this.userTranscript;
        this.emitCaption('user', this.userTranscript);
        this.userTranscript = '';
        break;
      case 'response.output_audio_transcript.delta':
        this.assistantTranscript += event.delta ?? '';
        this.emitCaption('ai', this.assistantTranscript);
        break;
      case 'response.output_audio_transcript.done':
        this.assistantTranscript = event.transcript ?? this.assistantTranscript;
        this.emitCaption('ai', this.assistantTranscript);
        this.assistantTranscript = '';
        break;
      case 'response.function_call_arguments.done':
        void this.executeFunctionCall(event);
        break;
      case 'response.done':
        this.callbacks.onModeChange('listening');
        event.response?.output
          ?.filter(item => item.type === 'function_call')
          .forEach(item => { void this.executeFunctionCall(item); });
        break;
      case 'error':
        this.callbacks.onError(event.error?.message || 'OpenAI voice returned an error.');
        break;
    }
  }

  private emitCaption(source: RealtimeSpeaker, text: string): void {
    const caption = text.trim();
    if (caption) this.callbacks.onCaption(source, caption);
  }

  private async executeFunctionCall(call: RealtimeFunctionCall): Promise<void> {
    const callId = call.call_id?.trim() ?? '';
    if (call.name !== BOOKING_TOOL || !callId || this.handledCalls.has(callId)) return;
    this.handledCalls.add(callId);

    let args: Record<string, unknown> = {};
    try {
      args = call.arguments ? JSON.parse(call.arguments) as Record<string, unknown> : {};
    } catch {
      args = {};
    }

    let output: Record<string, unknown>;
    try {
      const response = await fetch('/api/voice-booking-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Voice-Session-Token': this.credentials?.sessionToken ?? '',
        },
        body: JSON.stringify({ ...args, clinicId: this.clinicId }),
      });
      output = await response.json() as Record<string, unknown>;
      if (!response.ok && !output['message']) output['message'] = 'The booking request could not be submitted.';
      if (response.ok && output['success'] === true && output['booking_created'] === true) {
        this.notifyBooking(String(output['booking_ref'] ?? ''), String(args['phone'] ?? ''));
      }
    } catch {
      output = { success: false, message: 'The booking service is temporarily unavailable.' };
    }

    this.send({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output: JSON.stringify(output),
      },
    });
    this.send({ type: 'response.create' });
  }

  private notifyBooking(bookingRef: string, phone: string): void {
    if (!bookingRef || !phone) return;
    void fetch('/api/voice-booking-action?action=notify-web-booking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({ clinicId: this.clinicId, bookingRef, phone }),
    }).catch(() => undefined);
  }

  private send(event: Record<string, unknown>): void {
    if (this.channel?.readyState === 'open') this.channel.send(JSON.stringify(event));
  }

  private async handleUnexpectedDisconnect(): Promise<void> {
    if (this.closing) return;
    await this.endSession();
    if (!this.disconnectNotified) {
      this.disconnectNotified = true;
      this.callbacks.onDisconnect();
    }
  }

  private releaseMedia(): void {
    if (this.maxDurationTimer) {
      clearTimeout(this.maxDurationTimer);
      this.maxDurationTimer = null;
    }
    this.channel?.close();
    this.peer?.close();
    this.microphone?.getTracks().forEach(track => track.stop());
    if (this.audio) {
      this.audio.srcObject = null;
      this.audio.remove();
    }
    this.channel = null;
    this.peer = null;
    this.microphone = null;
    this.audio = null;
  }

  private async reportUsage(): Promise<void> {
    if (!this.credentials) return;
    const credentials = this.credentials;
    this.credentials = null;

    try {
      await fetch('/api/openai-voice?action=end-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({
          clinicId: this.clinicId,
          sessionId: credentials.sessionId,
          sessionToken: credentials.sessionToken,
        }),
      });
    } catch {
      // The reservation remains at its conservative maximum when reporting fails.
    }
  }
}