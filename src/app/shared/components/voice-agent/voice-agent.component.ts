import {
  Component, input, signal, ChangeDetectionStrategy,
  OnDestroy, inject, NgZone,
} from '@angular/core';

type CallStatus = 'idle' | 'connecting' | 'listening' | 'speaking' | 'ended';

interface ConversationInstance {
  endSession(): Promise<void>;
}

// Staggered waveform bars — 7 bars with individual delay + base duration
const WAVE_BARS = [
  { delay: '0ms',   dur: 900 },
  { delay: '80ms',  dur: 720 },
  { delay: '160ms', dur: 840 },
  { delay: '40ms',  dur: 660 },
  { delay: '220ms', dur: 980 },
  { delay: '120ms', dur: 760 },
  { delay: '280ms', dur: 860 },
] as const;

@Component({
  selector: 'app-voice-agent',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- ── Idle / Connecting button ─────────────────────────────────────── -->
    @if (status() === 'idle' || status() === 'connecting') {
      <div class="fixed z-[60] bottom-[108px] right-6 flex flex-col items-center gap-2 group
                  md:bottom-28">

        <!-- Tooltip -->
        <span class="opacity-0 group-hover:opacity-100 transition-all duration-200
                     bg-gray-950 text-white text-[11px] font-semibold tracking-wide
                     px-3 py-1.5 rounded-full shadow-xl whitespace-nowrap pointer-events-none
                     translate-y-1 group-hover:translate-y-0">
          ✦ AI Receptionist
        </span>

        <!-- Main FAB -->
        <button (click)="startCall()"
                [disabled]="status() === 'connecting'"
                aria-label="Talk to AI Receptionist"
                class="relative w-14 h-14 rounded-full flex items-center justify-center
                       shadow-2xl transition-all duration-300 hover:scale-110 hover:shadow-[0_0_32px_rgba(139,92,246,0.5)]
                       disabled:cursor-wait"
                style="background: linear-gradient(145deg, #5b21b6, #7c3aed, #9333ea)">

          <!-- Pulse ring (idle only) -->
          @if (status() === 'idle') {
            <span class="absolute inset-0 rounded-full animate-ping"
                  style="background: rgba(139,92,246,0.35); animation-duration: 2s"></span>
          }

          <!-- Outer glow ring -->
          <span class="absolute -inset-1 rounded-full opacity-30 blur-sm"
                style="background: linear-gradient(145deg, #7c3aed, #9333ea)"></span>

          <!-- Icon -->
          @if (status() === 'idle') {
            <!-- Waveform icon — distinctive for voice AI -->
            <svg class="relative w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M2 12h2"/><path d="M6 8v8"/><path d="M10 5v14"/><path d="M14 9v6"/><path d="M18 7v10"/><path d="M22 12h-2"/>
            </svg>
          } @else {
            <!-- Spinner -->
            <span class="relative w-5 h-5 border-2 rounded-full border-white/30 border-t-white animate-spin"></span>
          }
        </button>
      </div>
    }

    <!-- ── Active call panel ───────────────────────────────────────────────── -->
    @if (status() === 'listening' || status() === 'speaking') {
      <div class="fixed z-[60] animate-slide-up
                  bottom-0 left-0 right-0 rounded-t-3xl
                  md:bottom-6 md:left-auto md:right-6 md:w-80 md:rounded-2xl"
           style="background: rgba(8, 4, 22, 0.97);
                  border: 1px solid rgba(124, 58, 237, 0.35);
                  box-shadow: 0 -4px 60px rgba(124,58,237,0.25), 0 0 0 1px rgba(255,255,255,0.04);">

        <!-- Handle (mobile only) -->
        <div class="md:hidden w-10 h-1 bg-white/20 rounded-full mx-auto mt-3"></div>

        <!-- Header -->
        <div class="px-5 pt-4 pb-3 flex items-center justify-between"
             style="border-bottom: 1px solid rgba(255,255,255,0.06)">
          <div class="flex items-center gap-3">
            <!-- Avatar -->
            <div class="relative w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                 style="background: linear-gradient(145deg, #5b21b6, #9333ea)">
              <svg class="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M2 12h2"/><path d="M6 8v8"/><path d="M10 5v14"/><path d="M14 9v6"/><path d="M18 7v10"/><path d="M22 12h-2"/>
              </svg>
              <!-- Online dot -->
              <span class="absolute bottom-0 right-0 w-3 h-3 bg-green-400 rounded-full border-2"
                    style="border-color: rgba(8,4,22,0.97)"></span>
            </div>
            <div>
              <p class="text-white text-sm font-bold leading-none">AI Receptionist</p>
              <p class="text-purple-400 text-[11px] font-medium mt-0.5 flex items-center gap-1">
                @if (status() === 'speaking') {
                  <span class="w-1.5 h-1.5 bg-purple-400 rounded-full animate-pulse"></span>
                  Speaking…
                } @else {
                  <span class="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
                  Listening…
                }
              </p>
            </div>
          </div>
          <!-- Timer -->
          <span class="text-white/40 text-xs font-mono tabular-nums tracking-wider">
            {{ formattedTime() }}
          </span>
        </div>

        <!-- Waveform visualizer -->
        <div class="px-6 py-7 flex items-end justify-center gap-[5px]">
          @for (bar of WAVE_BARS; track $index) {
            <div class="wave-bar rounded-full transition-colors duration-500"
                 [style.animation-delay]="bar.delay"
                 [style.animation-duration]="(status() === 'speaking' ? bar.dur * 0.65 : bar.dur * 1.6) + 'ms'"
                 [style.background]="status() === 'speaking'
                   ? 'linear-gradient(to top, #7c3aed, #a78bfa)'
                   : 'rgba(139, 92, 246, 0.35)'">
            </div>
          }
        </div>

        <!-- Controls -->
        <div class="px-5 pb-6 md:pb-5 flex items-center justify-center gap-4">
          <!-- Mute hint (decorative) -->
          <div class="w-10 h-10 rounded-full flex items-center justify-center"
               style="background: rgba(255,255,255,0.06)">
            <svg class="w-4 h-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/>
            </svg>
          </div>

          <!-- End Call button -->
          <button (click)="endCall()"
                  aria-label="End call"
                  class="w-14 h-14 rounded-full flex items-center justify-center
                         shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-red-500/40"
                  style="background: linear-gradient(145deg, #dc2626, #ef4444)">
            <svg class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round"
                    d="M16.5 3.5a10 10 0 010 17M7.5 3.5a10 10 0 000 17M3 12h18"/>
            </svg>
          </button>

          <!-- Speaker hint (decorative) -->
          <div class="w-10 h-10 rounded-full flex items-center justify-center"
               style="background: rgba(255,255,255,0.06)">
            <svg class="w-4 h-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.536 8.464a5 5 0 010 7.072M12 6v12m-4-8.5a7 7 0 000 9M3 12h.01"/>
            </svg>
          </div>
        </div>

        <!-- Hint text -->
        <p class="text-center text-[11px] text-white/20 pb-4 md:pb-3 tracking-wide">
          Powered by ElevenLabs AI · Hindi &amp; English
        </p>
      </div>
    }

    <!-- ── Call ended state ────────────────────────────────────────────────── -->
    @if (status() === 'ended') {
      <div class="fixed z-[60] bottom-[108px] right-6 md:bottom-28 animate-scale-in">
        <div class="w-14 h-14 rounded-full flex items-center justify-center shadow-xl"
             style="background: linear-gradient(145deg, #1a0533, #2d1063); border: 1px solid rgba(124,58,237,0.4)">
          <svg class="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
          </svg>
        </div>
      </div>
    }
  `,
  styles: [`
    @keyframes waveAnim {
      0%, 100% { height: 4px; }
      50%       { height: 32px; }
    }
    .wave-bar {
      width: 4px;
      height: 4px;
      min-height: 4px;
      max-height: 32px;
      animation: waveAnim linear infinite;
    }
  `],
})
export class VoiceAgentComponent implements OnDestroy {
  readonly agentId  = input.required<string>();
  readonly WAVE_BARS = WAVE_BARS;

  status   = signal<CallStatus>('idle');
  duration = signal(0);

  private conv:       ConversationInstance | null = null;
  private timerRef:   ReturnType<typeof setInterval> | null = null;
  private zone        = inject(NgZone);

  formattedTime = () => {
    const s = this.duration();
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  async startCall() {
    if (this.status() !== 'idle') return;
    this.status.set('connecting');
    try {
      const { Conversation } = await import('@11labs/client');
      const conv = await Conversation.startSession({
        agentId: this.agentId(),
        connectionType: 'webrtc',
        onConnect: (_props: { conversationId: string }) => this.zone.run(() => {
          this.status.set('listening');
          this.startTimer();
        }),
        onDisconnect: () => this.zone.run(() => {
          this.status.set('ended');
          this.stopTimer();
          setTimeout(() => this.status.set('idle'), 2500);
        }),
        onModeChange: (prop: { mode: string }) => this.zone.run(() => {
          if (this.status() === 'ended') return;
          this.status.set(prop.mode === 'speaking' ? 'speaking' : 'listening');
        }),
        onError: (_message: string) => this.zone.run(() => this.status.set('idle')),
      });
      this.conv = conv as ConversationInstance;
    } catch (e) {
      console.error('[VoiceAgent] Failed to start session:', e);
      this.zone.run(() => this.status.set('idle'));
    }
  }

  async endCall() {
    this.stopTimer();
    try { await this.conv?.endSession(); } catch {}
    this.conv = null;
    this.status.set('ended');
    setTimeout(() => this.zone.run(() => this.status.set('idle')), 2500);
  }

  private startTimer() {
    this.duration.set(0);
    this.timerRef = setInterval(() => this.duration.update(d => d + 1), 1000);
  }

  private stopTimer() {
    if (this.timerRef) { clearInterval(this.timerRef); this.timerRef = null; }
  }

  ngOnDestroy() {
    this.stopTimer();
    this.conv?.endSession().catch(() => {});
  }
}
