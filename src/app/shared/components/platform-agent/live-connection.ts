export interface LiveCallbacks {
  ready(): void;
  caption(source: 'user' | 'assistant', delta: string): void;
  delegate(id: string): Promise<string>;
  ended(message?: string): void;
}

/** GPT-Live media connection; only the application server holds an OpenAI key. */
export class LiveConnection {
  private peer?: RTCPeerConnection;
  private channel?: RTCDataChannel;
  private microphone?: MediaStream;
  private audio?: HTMLAudioElement;
  private timer?: ReturnType<typeof setTimeout>;
  private cancelled = false;
  private readonly abort = new AbortController();
  private readonly delegations = new Set<string>();

  constructor(private readonly callbacks: LiveCallbacks) {}

  async start(exchange: (sdp: string, signal: AbortSignal) => Promise<{ sdp: string; maxDurationSeconds: number }>): Promise<void> {
    try {
      this.microphone = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (this.cancelled) { this.release(); return; }
      this.peer = new RTCPeerConnection();
      this.audio = new Audio();
      this.audio.autoplay = true;
      this.peer.ontrack = event => {
        if (!this.audio || this.cancelled) return;
        this.audio.srcObject = event.streams[0];
        void this.audio.play().catch(() => this.fail('Audio playback was blocked. You can continue by typing.'));
      };
      this.peer.onconnectionstatechange = () => {
        if (this.peer?.connectionState === 'failed') this.fail('Voice disconnected. You can reconnect or type.');
      };
      this.microphone.getTracks().forEach(track => this.peer!.addTrack(track, this.microphone!));
      this.channel = this.peer.createDataChannel('oai-events');
      this.channel.onmessage = event => this.message(event.data);
      this.channel.onclose = () => { if (!this.cancelled) this.fail('Voice conversation ended.'); };
      this.channel.onerror = () => this.fail('Voice disconnected. Please try again.');
      await this.peer.setLocalDescription(await this.peer.createOffer());
      if (this.cancelled) return;
      const answer = await exchange(this.peer.localDescription?.sdp ?? '', this.abort.signal);
      if (this.cancelled) return;
      await this.peer.setRemoteDescription({ type: 'answer', sdp: answer.sdp });
      this.timer = setTimeout(() => this.fail('Voice paused after three minutes. Start again when you are ready.'), Math.min(answer.maxDurationSeconds, 180) * 1000);
    } catch (error) {
      if (!this.cancelled) {
        this.stop();
        throw error;
      }
    }
  }

  mute(muted: boolean): void { this.microphone?.getAudioTracks().forEach(track => { track.enabled = !muted; }); }

  stop(): void {
    if (this.cancelled) return;
    this.cancelled = true;
    this.abort.abort();
    clearTimeout(this.timer);
    this.microphone?.getTracks().forEach(track => track.stop());
    if (this.channel?.readyState === 'open') {
      this.send({ type: 'session.close', event_id: crypto.randomUUID() });
      // Keep the channel briefly for session.closed; release even if the peer vanished.
      this.timer = setTimeout(() => this.release(), 1500);
    } else this.release();
  }

  private message(raw: unknown): void {
    if (typeof raw !== 'string') return;
    let event: { type?: string; delta?: string; delegation?: { id?: string; target?: string } };
    try { event = JSON.parse(raw); } catch { return; }
    if (event.type === 'session.closed') { this.release(); return; }
    if (this.cancelled) return;
    if (event.type === 'session.started') this.callbacks.ready();
    if (event.type === 'session.input_transcript.delta') this.callbacks.caption('user', event.delta ?? '');
    if (event.type === 'session.output_transcript.delta') this.callbacks.caption('assistant', event.delta ?? '');
    if (event.type === 'error') this.fail('The voice service could not continue. Please try typing.');
    const id = event.delegation?.id;
    if (event.type === 'session.delegation.created' && event.delegation?.target === 'client' && id && !this.delegations.has(id)) {
      this.delegations.add(id);
      void this.callbacks.delegate(id).then(content => {
        if (!this.cancelled) this.send({ type: 'session.commentary.append', event_id: crypto.randomUUID(), delegation_id: id, content: content.slice(0, 1200) });
      }).catch(() => {
        if (!this.cancelled) this.send({ type: 'session.commentary.append', event_id: crypto.randomUUID(), delegation_id: id, content: 'The action did not finish. Ask the user to check the task panel and try again.' });
      });
    }
  }
  private send(event: object): void { if (this.channel?.readyState === 'open') this.channel.send(JSON.stringify(event)); }
  private fail(message: string): void { if (this.cancelled) return; this.stop(); this.callbacks.ended(message); }
  private release(): void {
    clearTimeout(this.timer);
    this.microphone?.getTracks().forEach(track => track.stop());
    if (this.audio) { this.audio.pause(); this.audio.srcObject = null; }
    this.channel?.close(); this.peer?.close();
    this.audio = undefined; this.channel = undefined; this.peer = undefined;
  }
}
