import {
  Component, input, signal, ChangeDetectionStrategy,
  OnDestroy, inject, NgZone, ViewChild, ElementRef, AfterViewChecked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

// ── Types ─────────────────────────────────────────────────────────────────────
type UIMode    = 'idle' | 'voice' | 'text';
type VoicePhase = 'connecting' | 'listening' | 'speaking' | 'ended';

interface ChatMessage { role: 'user' | 'assistant'; text: string }

interface ConversationInstance { endSession(): Promise<void> }

// ── Constants ─────────────────────────────────────────────────────────────────
const DOT_DELAYS = ['0ms', '150ms', '300ms'] as const;

@Component({
  selector: 'app-voice-agent',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- ── Error toast ─────────────────────────────────────────────────────── -->
    @if (errorMsg()) {
      <div class="fixed z-[70] left-1/2 -translate-x-1/2
                  bottom-[160px] md:bottom-36
                  w-[calc(100%-2rem)] max-w-sm
                  bg-gray-950 border border-red-500/40 text-white
                  rounded-2xl px-4 py-3 shadow-2xl
                  animate-in slide-in-from-bottom-4 duration-300">
        <div class="flex items-start gap-2.5">
          <svg class="w-4 h-4 text-red-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          </svg>
          <p class="text-xs leading-relaxed text-white/90">{{ errorMsg() }}</p>
        </div>
      </div>
    }

    <!-- ══════════════════════════════════════════════════════════════════════
         IDLE PILL — bottom-center, always visible
    ══════════════════════════════════════════════════════════════════════════ -->
    @if (mode() === 'idle') {
      <div class="fixed z-[60]
                  bottom-[88px] md:bottom-8
                  left-1/2 -translate-x-1/2
                  flex items-center gap-2
                  bg-[#1a1a1a] rounded-full shadow-2xl
                  px-2 py-2
                  border border-white/10
                  transition-all duration-300 hover:border-white/20"
           style="box-shadow: 0 8px 32px rgba(0,0,0,0.5)">

        <!-- Mic button → start voice -->
        @if (agentId()) {
          <button (click)="startVoice()"
                  aria-label="Start voice conversation"
                  class="w-10 h-10 rounded-full bg-[#2a2a2a] hover:bg-[#333]
                         flex items-center justify-center
                         transition-all duration-200 hover:scale-105
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30">
            <svg class="w-5 h-5 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/>
            </svg>
          </button>
        }

        <!-- Label -->
        <button (click)="startText()"
                class="px-3 text-white/60 text-sm font-medium whitespace-nowrap
                       hover:text-white/90 transition-colors duration-200
                       focus-visible:outline-none">
          {{ agentId() ? 'Ask AI' : 'Chat with AI' }}
        </button>

        <!-- Text / keyboard button → open chat -->
        <button (click)="startText()"
                aria-label="Open text chat"
                class="w-10 h-10 rounded-full bg-[#2a2a2a] hover:bg-[#333]
                       flex items-center justify-center
                       transition-all duration-200 hover:scale-105
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30">
          <svg class="w-4 h-4 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/>
          </svg>
        </button>
      </div>
    }

    <!-- ══════════════════════════════════════════════════════════════════════
         VOICE ACTIVE PILL — expanded, bottom-center
    ══════════════════════════════════════════════════════════════════════════ -->
    @if (mode() === 'voice') {
      <div class="fixed z-[60]
                  bottom-[88px] md:bottom-8
                  left-1/2 -translate-x-1/2
                  flex items-center gap-3
                  bg-[#1a1a1a] rounded-full shadow-2xl
                  px-3 py-2.5
                  border border-white/10
                  transition-all duration-500"
           style="box-shadow: 0 8px 40px rgba(0,0,0,0.6)">

        <!-- Mic status circle -->
        <div class="relative w-10 h-10 rounded-full flex items-center justify-center shrink-0"
             [style.background]="voicePhase() === 'listening' ? '#fff' : '#2a2a2a'">
          <!-- Pulse ring when listening -->
          @if (voicePhase() === 'listening') {
            <span class="absolute inset-0 rounded-full bg-white animate-ping opacity-30"></span>
          }
          <svg class="w-5 h-5 transition-colors duration-300"
               [style.color]="voicePhase() === 'listening' ? '#111' : 'rgba(255,255,255,0.5)'"
               fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/>
          </svg>
        </div>

        <!-- Animated dots / status -->
        <div class="flex items-center gap-1 px-1 min-w-[60px] justify-center">
          @if (voicePhase() === 'connecting') {
            <span class="text-white/40 text-xs">Connecting…</span>
          } @else if (voicePhase() === 'ended') {
            <svg class="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
            </svg>
          } @else {
            @for (delay of DOT_DELAYS; track $index) {
              <span class="w-2 h-2 rounded-full"
                    [style.background]="voicePhase() === 'speaking' ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.5)'"
                    [style.animation-name]="'voiceDot'"
                    [style.animation-duration]="'1.2s'"
                    [style.animation-timing-function]="'ease-in-out'"
                    [style.animation-iteration-count]="'infinite'"
                    [style.animation-delay]="delay"></span>
            }
          }
        </div>

        <!-- Duration timer -->
        @if (voicePhase() === 'listening' || voicePhase() === 'speaking') {
          <span class="text-white/30 text-xs font-mono tabular-nums tracking-wider">
            {{ formattedTime() }}
          </span>
        }

        <!-- End button (blue pill) -->
        @if (voicePhase() !== 'ended') {
          <button (click)="endVoice()"
                  aria-label="End voice call"
                  class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold
                         px-4 py-2 rounded-full
                         transition-all duration-200 hover:scale-105
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400
                         shrink-0">
            End
          </button>
        }
      </div>
    }

    <!-- ══════════════════════════════════════════════════════════════════════
         TEXT CHAT PANEL — slides up from bottom
    ══════════════════════════════════════════════════════════════════════════ -->
    @if (mode() === 'text') {
      <div class="fixed z-[60]
                  bottom-0 left-0 right-0
                  md:bottom-6 md:left-auto md:right-6 md:w-[380px]
                  flex flex-col
                  rounded-t-3xl md:rounded-2xl
                  overflow-hidden
                  border border-white/10
                  animate-slide-up"
           style="background: #111114;
                  box-shadow: 0 -4px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05);
                  height: min(560px, 72vh);">

        <!-- Handle (mobile) -->
        <div class="md:hidden w-10 h-1 bg-white/20 rounded-full mx-auto mt-3 shrink-0"></div>

        <!-- Header -->
        <div class="flex items-center justify-between px-5 py-3.5 shrink-0"
             style="border-bottom: 1px solid rgba(255,255,255,0.07)">
          <div class="flex items-center gap-3">
            <!-- AI avatar -->
            <div class="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-blue-800
                        flex items-center justify-center shrink-0">
              <svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15M14.25 3.104c.251.023.501.05.75.082M19.8 15a2.25 2.25 0 01.1 2.3L17.7 21H6.3l-2.2-3.7A2.25 2.25 0 014.2 15m15.6 0H4.2"/>
              </svg>
            </div>
            <div>
              <p class="text-white text-sm font-bold leading-none">AI Receptionist</p>
              <p class="text-white/40 text-[11px] mt-0.5">
                {{ clinicName() || 'Dental Clinic' }}
              </p>
            </div>
          </div>
          <!-- Switch to voice (if available) + close -->
          <div class="flex items-center gap-2">
            @if (agentId()) {
              <button (click)="switchToVoice()"
                      aria-label="Switch to voice"
                      title="Switch to voice"
                      class="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10
                             flex items-center justify-center
                             transition-colors duration-200
                             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30">
                <svg class="w-4 h-4 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/>
                </svg>
              </button>
            }
            <button (click)="closeChat()"
                    aria-label="Close chat"
                    class="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10
                           flex items-center justify-center
                           transition-colors duration-200
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30">
              <svg class="w-4 h-4 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Messages list -->
        <div #messagesContainer
             class="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3"
             style="scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.1) transparent;">

          <!-- Welcome message (no history yet) -->
          @if (messages().length === 0) {
            <div class="flex items-start gap-2.5">
              <div class="w-6 h-6 rounded-full bg-blue-700 flex items-center justify-center shrink-0 mt-0.5">
                <svg class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
              </div>
              <div class="bg-white/8 rounded-2xl rounded-tl-sm px-4 py-3 max-w-[85%]"
                   style="background: rgba(255,255,255,0.07)">
                <p class="text-white/80 text-sm leading-relaxed">
                  Hi! I'm the AI receptionist for {{ clinicName() || 'the clinic' }}.
                  How can I help you today? 😊
                </p>
              </div>
            </div>
          }

          <!-- Chat messages -->
          @for (msg of messages(); track $index) {
            @if (msg.role === 'assistant') {
              <div class="flex items-start gap-2.5">
                <div class="w-6 h-6 rounded-full bg-blue-700 flex items-center justify-center shrink-0 mt-0.5">
                  <svg class="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5"/>
                  </svg>
                </div>
                <div class="rounded-2xl rounded-tl-sm px-4 py-3 max-w-[85%]"
                     style="background: rgba(255,255,255,0.07)">
                  <p class="text-white/80 text-sm leading-relaxed">{{ msg.text }}</p>
                </div>
              </div>
            } @else {
              <div class="flex justify-end">
                <div class="bg-blue-600 rounded-2xl rounded-tr-sm px-4 py-3 max-w-[85%]">
                  <p class="text-white text-sm leading-relaxed">{{ msg.text }}</p>
                </div>
              </div>
            }
          }

          <!-- Typing indicator -->
          @if (isTyping()) {
            <div class="flex items-start gap-2.5">
              <div class="w-6 h-6 rounded-full bg-blue-700 flex items-center justify-center shrink-0 mt-0.5">
                <svg class="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5"/>
                </svg>
              </div>
              <div class="rounded-2xl rounded-tl-sm px-4 py-3.5"
                   style="background: rgba(255,255,255,0.07)">
                <div class="flex items-center gap-1">
                  @for (delay of DOT_DELAYS; track $index) {
                    <span class="w-1.5 h-1.5 rounded-full"
                          style="background: rgba(255,255,255,0.4)"
                          [style.animation-name]="'voiceDot'"
                          [style.animation-duration]="'1.2s'"
                          [style.animation-timing-function]="'ease-in-out'"
                          [style.animation-iteration-count]="'infinite'"
                          [style.animation-delay]="delay"></span>
                  }
                </div>
              </div>
            </div>
          }
        </div>

        <!-- Input row -->
        <div class="shrink-0 px-4 py-3"
             style="border-top: 1px solid rgba(255,255,255,0.07)">
          <form (ngSubmit)="sendMessage()" class="flex items-end gap-2">
            <textarea #inputField
                      [(ngModel)]="inputText"
                      name="message"
                      placeholder="Type a message…"
                      rows="1"
                      (keydown.enter)="onEnterKey($event)"
                      (input)="autoResize($event)"
                      class="flex-1 bg-white/5 border border-white/10 rounded-2xl
                             px-4 py-3 text-white text-sm placeholder-white/30
                             resize-none overflow-hidden leading-5
                             focus:outline-none focus:border-blue-500/50 focus:bg-white/8
                             transition-all duration-200"
                      style="min-height: 44px; max-height: 120px;"></textarea>
            <button type="submit"
                    [disabled]="!inputText.trim() || isTyping()"
                    aria-label="Send message"
                    class="w-11 h-11 rounded-full bg-blue-600 hover:bg-blue-700
                           flex items-center justify-center shrink-0
                           transition-all duration-200 hover:scale-105
                           disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
              <svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
              </svg>
            </button>
          </form>
        </div>
      </div>
    }
  `,
  styles: [`
    @keyframes voiceDot {
      0%, 80%, 100% { transform: scale(0.7); opacity: 0.4; }
      40%            { transform: scale(1);   opacity: 1;   }
    }
  `],
})
export class VoiceAgentComponent implements OnDestroy, AfterViewChecked {
  // ── Inputs ───────────────────────────────────────────────────────────────────
  readonly agentId    = input<string>('');
  readonly clinicName = input<string>('');
  readonly services   = input<string[]>([]);

  // ── Public constants ─────────────────────────────────────────────────────────
  readonly DOT_DELAYS = DOT_DELAYS;

  // ── UI state ─────────────────────────────────────────────────────────────────
  mode       = signal<UIMode>('idle');
  voicePhase = signal<VoicePhase>('connecting');
  messages   = signal<ChatMessage[]>([]);
  isTyping   = signal(false);
  errorMsg   = signal<string | null>(null);
  duration   = signal(0);
  inputText  = '';

  @ViewChild('messagesContainer') private messagesEl?: ElementRef<HTMLElement>;

  private conv:            ConversationInstance | null = null;
  private timerRef:        ReturnType<typeof setInterval> | null = null;
  private shouldScrollDown = false;
  private zone             = inject(NgZone);

  // ── Computed ─────────────────────────────────────────────────────────────────
  formattedTime(): string {
    const s = this.duration();
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  // ── AfterViewChecked — scroll messages to bottom after each render ────────────
  ngAfterViewChecked() {
    if (this.shouldScrollDown && this.messagesEl) {
      const el = this.messagesEl.nativeElement;
      el.scrollTop = el.scrollHeight;
      this.shouldScrollDown = false;
    }
  }

  // ── Voice mode ────────────────────────────────────────────────────────────────
  async startVoice() {
    if (this.mode() !== 'idle') return;
    this.mode.set('voice');
    this.voicePhase.set('connecting');
    this.clearError();

    // Request mic permission first
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
    } catch {
      this.zone.run(() => this.showError('Microphone access denied. Please allow mic and try again.'));
      this.mode.set('idle');
      return;
    }

    try {
      const { Conversation } = await import('@11labs/client');
      const conv = await Conversation.startSession({
        agentId: this.agentId(),
        connectionType: 'websocket',
        onConnect: () => this.zone.run(() => {
          this.voicePhase.set('listening');
          this.startTimer();
        }),
        onDisconnect: () => this.zone.run(() => {
          this.voicePhase.set('ended');
          this.stopTimer();
          setTimeout(() => this.zone.run(() => this.mode.set('idle')), 2000);
        }),
        onModeChange: (prop: { mode: string }) => this.zone.run(() => {
          if (this.voicePhase() === 'ended') return;
          this.voicePhase.set(prop.mode === 'speaking' ? 'speaking' : 'listening');
        }),
        onError: (message: string) => {
          console.error('[VoiceAgent] error:', message);
          this.zone.run(() => {
            this.showError('Connection error. Please try again.');
            this.stopTimer();
            setTimeout(() => this.zone.run(() => this.mode.set('idle')), 4000);
          });
        },
      });
      this.conv = conv as ConversationInstance;
    } catch (e) {
      console.error('[VoiceAgent] Failed to start session:', e);
      const msg = e instanceof Error ? e.message : String(e);
      this.zone.run(() => {
        this.showError(
          msg.toLowerCase().includes('agent') ? 'Agent not found. Check your ElevenLabs agent ID.' :
          msg.toLowerCase().includes('network') ? 'Network error. Check your internet connection.' :
          'Could not connect. Please try again.'
        );
        this.mode.set('idle');
      });
    }
  }

  async endVoice() {
    this.stopTimer();
    try { await this.conv?.endSession(); } catch { /* ignore */ }
    this.conv = null;
    this.voicePhase.set('ended');
    setTimeout(() => this.zone.run(() => this.mode.set('idle')), 2000);
  }

  // ── Text chat mode ────────────────────────────────────────────────────────────
  startText() {
    this.mode.set('text');
    this.shouldScrollDown = true;
  }

  async switchToVoice() {
    this.mode.set('idle');
    // Small delay so the transition feels intentional
    setTimeout(() => this.zone.run(() => this.startVoice()), 100);
  }

  closeChat() {
    this.mode.set('idle');
  }

  onEnterKey(event: Event) {
    const ke = event as KeyboardEvent;
    if (!ke.shiftKey) {
      ke.preventDefault();
      void this.sendMessage();
    }
  }

  autoResize(event: Event) {
    const el = event.target as HTMLTextAreaElement;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  async sendMessage() {
    const text = this.inputText.trim();
    if (!text || this.isTyping()) return;

    // Add user message
    this.messages.update(msgs => [...msgs, { role: 'user', text }]);
    this.inputText = '';
    this.isTyping.set(true);
    this.shouldScrollDown = true;

    // Reset textarea height
    const textarea = document.querySelector<HTMLTextAreaElement>('textarea[name="message"]');
    if (textarea) textarea.style.height = 'auto';

    try {
      const history = this.messages().slice(-10).map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.text,
      }));

      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          clinicName: this.clinicName(),
          services: this.services(),
          history: history.slice(0, -1), // exclude the message we just added
        }),
      });

      const data = await resp.json() as { reply?: string; error?: string };
      const reply = data.reply ?? 'Sorry, I could not process that. Please try again.';

      this.zone.run(() => {
        this.messages.update(msgs => [...msgs, { role: 'assistant', text: reply }]);
        this.isTyping.set(false);
        this.shouldScrollDown = true;
        // Optional: speak the reply using browser TTS
        this.speakReply(reply);
      });
    } catch {
      this.zone.run(() => {
        this.messages.update(msgs => [...msgs, {
          role: 'assistant',
          text: 'Sorry, I\'m having trouble connecting right now. Please try again in a moment.',
        }]);
        this.isTyping.set(false);
        this.shouldScrollDown = true;
      });
    }
  }

  /** Speak the AI reply using the browser's built-in Speech Synthesis API. */
  private speakReply(text: string) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate  = 1.05;
    utter.pitch = 1.0;
    // Prefer a female English voice if available
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => /female|woman/i.test(v.name) && v.lang.startsWith('en'))
      ?? voices.find(v => v.lang.startsWith('en'))
      ?? null;
    if (preferred) utter.voice = preferred;
    window.speechSynthesis.speak(utter);
  }

  // ── Timer ─────────────────────────────────────────────────────────────────────
  private startTimer() {
    this.duration.set(0);
    this.timerRef = setInterval(() => this.duration.update(d => d + 1), 1000);
  }

  private stopTimer() {
    if (this.timerRef) { clearInterval(this.timerRef); this.timerRef = null; }
  }

  // ── Error ─────────────────────────────────────────────────────────────────────
  private showError(msg: string) {
    this.errorMsg.set(msg);
    setTimeout(() => this.zone.run(() => this.errorMsg.set(null)), 5000);
  }

  private clearError() { this.errorMsg.set(null); }

  // ── Cleanup ───────────────────────────────────────────────────────────────────
  ngOnDestroy() {
    this.stopTimer();
    window.speechSynthesis?.cancel();
    this.conv?.endSession().catch(() => { /* ignore */ });
  }
}
