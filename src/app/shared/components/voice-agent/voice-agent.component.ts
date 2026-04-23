import {
  Component, input, signal, ChangeDetectionStrategy,
  OnDestroy, inject, NgZone, ViewChild, ElementRef, AfterViewChecked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

// ── Types ─────────────────────────────────────────────────────────────────────
type UIMode     = 'idle' | 'voice' | 'text';
type VoicePhase = 'connecting' | 'listening' | 'speaking' | 'ended';

interface ChatMessage { role: 'user' | 'assistant'; text: string }
interface ConversationInstance { endSession(): Promise<void> }

// ── Waveform bars — 9 bars with individual height + delay for organic look ────
const BARS = [
  { delay: '0ms',   min: 4,  max: 22 },
  { delay: '70ms',  min: 6,  max: 32 },
  { delay: '140ms', min: 3,  max: 28 },
  { delay: '30ms',  min: 8,  max: 36 },
  { delay: '200ms', min: 4,  max: 30 },
  { delay: '110ms', min: 7,  max: 34 },
  { delay: '60ms',  min: 5,  max: 26 },
  { delay: '170ms', min: 6,  max: 32 },
  { delay: '90ms',  min: 3,  max: 20 },
] as const;

const DOT_DELAYS = ['0ms', '160ms', '320ms'] as const;

const QUICK_REPLIES = [
  'Book an appointment',
  'What are your hours?',
  'What services do you offer?',
  'How do I reach the clinic?',
] as const;

@Component({
  selector: 'app-voice-agent',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- ── Error toast ─────────────────────────────────────────────────────── -->
    @if (errorMsg()) {
      <div class="fixed z-[70] left-4 right-4
                  bottom-[148px] md:bottom-36 md:left-1/2 md:right-auto md:-translate-x-1/2
                  max-w-sm md:w-[calc(100%-2rem)]
                  rounded-2xl px-4 py-3.5 shadow-2xl
                  animate-in slide-in-from-bottom-4 duration-300"
           style="background: rgba(20,6,6,0.97); border: 1px solid rgba(248,113,113,0.35);">
        <div class="flex items-start gap-3">
          <div class="w-7 h-7 rounded-full bg-red-500/20 flex items-center justify-center shrink-0 mt-0.5">
            <svg class="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </div>
          <p class="text-xs leading-relaxed text-white/85 pt-0.5">{{ errorMsg() }}</p>
        </div>
      </div>
    }

    <!-- ══════════════════════════════════════════════════════════════════════
         IDLE PILL — glass, bottom-center
    ══════════════════════════════════════════════════════════════════════════ -->
    @if (mode() === 'idle') {
      <div class="hidden md:block fixed z-[60]
                  bottom-8
                  left-1/2 -translate-x-1/2
                  group cursor-pointer select-none"
           style="filter: drop-shadow(0 8px 24px rgba(0,0,0,0.4))">

        <div class="flex items-center gap-2.5 rounded-full px-3 py-2
                    transition-all duration-300 group-hover:scale-105"
             style="background: rgba(12,12,16,0.88);
                    backdrop-filter: blur(20px) saturate(180%);
                    border: 1px solid rgba(255,255,255,0.12);
                    box-shadow: 0 0 0 1px rgba(255,255,255,0.04) inset,
                                0 8px 32px rgba(0,0,0,0.5);">

          <!-- Mic button (voice mode) -->
          @if (agentId()) {
            <button (click)="startVoice()"
                    aria-label="Start voice conversation"
                    class="relative w-9 h-9 rounded-full flex items-center justify-center
                           transition-all duration-200
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                    style="background: rgba(255,255,255,0.08);">
              <!-- Subtle pulse ring -->
              <span class="absolute inset-0 rounded-full animate-ping"
                    style="background: rgba(255,255,255,0.06); animation-duration: 3s;"></span>
              <svg class="relative w-4 h-4" style="color: rgba(255,255,255,0.7)"
                   fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round"
                      d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/>
              </svg>
            </button>
          }

          <!-- AI sparkle icon + label -->
          <button (click)="startText()"
                  class="flex items-center gap-2 pr-1 focus-visible:outline-none">
            <!-- Sparkle icon -->
            <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 style="color: var(--accent-md, #3B7BF8)">
              <path stroke-linecap="round" stroke-linejoin="round"
                    d="M12 3v1m0 16v1M3 12h1m16 0h1m-3.5-8.5-.7.7M7.2 16.8l-.7.7m0-10 .7.7M16.8 16.8l.7.7"/>
              <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>
            </svg>
            <span class="text-sm font-semibold whitespace-nowrap"
                  style="color: rgba(255,255,255,0.75);">
              {{ agentId() ? 'Ask AI' : 'Chat with AI' }}
            </span>
            <!-- Live indicator -->
            <span class="flex items-center gap-1 ml-0.5">
              <span class="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
              <span class="text-[10px] font-semibold text-green-400">Live</span>
            </span>
          </button>

          <!-- Divider -->
          <div class="w-px h-5" style="background: rgba(255,255,255,0.1)"></div>

          <!-- Chat bubble icon -->
          <button (click)="startText()"
                  aria-label="Open text chat"
                  class="w-9 h-9 rounded-full flex items-center justify-center
                         transition-all duration-200
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                  style="background: linear-gradient(135deg, var(--accent, #1E56DC), var(--accent-dk, #1235A9))">
            <svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round"
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
            </svg>
          </button>
        </div>
      </div>
    }

    <!-- ══════════════════════════════════════════════════════════════════════
         VOICE ACTIVE PILL
    ══════════════════════════════════════════════════════════════════════════ -->
    @if (mode() === 'voice') {
      <div class="fixed z-[60]
                  bottom-[102px] md:bottom-8
                  left-3 right-3 md:left-1/2 md:right-auto md:-translate-x-1/2
                  flex items-center gap-3 rounded-full px-4 py-3
                  transition-all duration-500"
           [style.box-shadow]="voicePhase() === 'speaking'
             ? '0 0 0 1px rgba(255,255,255,0.08) inset, 0 8px 40px rgba(0,0,0,0.6), 0 0 60px rgba(59,123,248,0.25)'
             : '0 0 0 1px rgba(255,255,255,0.08) inset, 0 8px 40px rgba(0,0,0,0.6)'"
           style="background: rgba(12,12,16,0.95);
                  backdrop-filter: blur(20px);
                  border: 1px solid rgba(255,255,255,0.1);">

        <!-- Mic / status orb -->
        <div class="relative w-9 h-9 rounded-full flex items-center justify-center shrink-0"
             [style.background]="voicePhase() === 'listening'
               ? 'linear-gradient(135deg, #fff 0%, #e5e7eb 100%)'
               : 'rgba(255,255,255,0.08)'">

          @if (voicePhase() === 'listening') {
            <span class="absolute inset-0 rounded-full animate-ping"
                  style="background: rgba(255,255,255,0.3); animation-duration: 1.5s;"></span>
          }
          @if (voicePhase() === 'speaking') {
            <span class="absolute inset-0 rounded-full animate-ping"
                  style="background: rgba(59,123,248,0.3); animation-duration: 1s;"></span>
          }

          <svg class="relative w-4 h-4"
               [style.color]="voicePhase() === 'listening' ? '#111827' : 'rgba(255,255,255,0.6)'"
               fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round"
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/>
          </svg>
        </div>

        <!-- Waveform / status -->
        <div class="flex items-center justify-center"
             style="min-width: 80px; height: 36px;">

          @if (voicePhase() === 'connecting') {
            <div class="flex items-center gap-1.5">
              @for (d of DOT_DELAYS; track $index) {
                <span class="w-1.5 h-1.5 rounded-full"
                      style="background: rgba(255,255,255,0.4)"
                      [style.animation-name]="'vaDot'"
                      [style.animation-duration]="'1s'"
                      [style.animation-timing-function]="'ease-in-out'"
                      [style.animation-iteration-count]="'infinite'"
                      [style.animation-delay]="d"></span>
              }
            </div>
          } @else if (voicePhase() === 'ended') {
            <div class="flex items-center gap-1.5">
              <div class="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center">
                <svg class="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
                </svg>
              </div>
              <span class="text-xs text-green-400 font-semibold">Done</span>
            </div>
          } @else {
            <!-- Waveform bars -->
            <div class="flex items-end gap-[3px]" style="height: 28px;">
              @for (bar of BARS; track $index) {
                <div class="rounded-full"
                     style="width: 3px;"
                     [style.background]="voicePhase() === 'speaking'
                       ? 'linear-gradient(to top, var(--accent, #1E56DC), var(--accent-md, #3B7BF8))'
                       : 'rgba(255,255,255,0.25)'"
                     [style.animation-name]="'vaBar'"
                     [style.animation-duration]="(voicePhase() === 'speaking' ? '600' : '1400') + 'ms'"
                     [style.animation-timing-function]="'ease-in-out'"
                     [style.animation-iteration-count]="'infinite'"
                     [style.animation-delay]="bar.delay"
                     [style.min-height]="bar.min + 'px'"
                     [style.max-height]="bar.max + 'px'"></div>
              }
            </div>
          }
        </div>

        <!-- Timer -->
        @if (voicePhase() === 'listening' || voicePhase() === 'speaking') {
          <span class="text-xs font-mono tabular-nums"
                style="color: rgba(255,255,255,0.3); letter-spacing: 0.05em;">
            {{ formattedTime() }}
          </span>
        }

        <!-- End button -->
        @if (voicePhase() !== 'ended') {
          <button (click)="endVoice()"
                  aria-label="End voice call"
                  class="flex items-center gap-1.5 text-sm font-semibold text-white
                         px-4 py-2 rounded-full shrink-0
                         transition-all duration-200 hover:opacity-90 hover:scale-105
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                  style="background: linear-gradient(135deg, #dc2626, #b91c1c);">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
            End
          </button>
        }
      </div>
    }

    <!-- ══════════════════════════════════════════════════════════════════════
         TEXT CHAT PANEL
    ══════════════════════════════════════════════════════════════════════════ -->
    @if (mode() === 'text') {
      <div class="fixed z-[60]
                  bottom-[84px] left-3 right-3
                  md:bottom-6 md:left-auto md:right-6 md:w-[400px]
                  flex flex-col rounded-[24px] md:rounded-[24px]
                  overflow-hidden animate-slide-up"
           style="background: #0d0d12;
                  border: 1px solid rgba(255,255,255,0.09);
                  box-shadow: 0 -8px 80px rgba(0,0,0,0.7),
                              0 0 0 1px rgba(255,255,255,0.04) inset;
                  height: min(560px, 68vh);">

        <!-- Pull handle (mobile only) -->
        <div class="md:hidden flex justify-center pt-3 pb-1 shrink-0">
          <div class="w-9 h-1 rounded-full" style="background: rgba(255,255,255,0.15)"></div>
        </div>

        <!-- ── Header ──────────────────────────────────────────────────────── -->
        <div class="shrink-0 px-5 pt-4 pb-4"
             style="background: linear-gradient(135deg, var(--accent, #1E56DC) 0%, var(--accent-dk, #1235A9) 100%);
                    border-bottom: 1px solid rgba(255,255,255,0.1);">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <!-- AI avatar with glow -->
              <div class="relative w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                   style="background: rgba(255,255,255,0.2); backdrop-filter: blur(8px);">
                <svg class="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round"
                        d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15M14.25 3.104c.251.023.501.05.75.082M19.8 15a2.25 2.25 0 01.1 2.3L17.7 21H6.3l-2.2-3.7A2.25 2.25 0 014.2 15m15.6 0H4.2"/>
                </svg>
                <!-- Online dot -->
                <span class="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-green-400 border-2 border-white/20"
                      style="box-shadow: 0 0 8px rgba(74,222,128,0.6)"></span>
              </div>
              <div>
                <p class="text-white font-bold text-sm leading-none">AI Receptionist</p>
                <p class="text-white/60 text-[11px] mt-0.5 font-medium">
                  {{ clinicName() || 'Dental Clinic' }}
                  <span class="ml-1.5 text-green-300 font-semibold">● Online</span>
                </p>
              </div>
            </div>
            <!-- Actions -->
            <div class="flex items-center gap-1.5">
              @if (agentId()) {
                <button (click)="switchToVoice()"
                        aria-label="Switch to voice"
                        title="Switch to voice call"
                        class="w-8 h-8 rounded-full flex items-center justify-center
                               transition-all duration-200 hover:scale-110
                               focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                        style="background: rgba(255,255,255,0.15); backdrop-filter: blur(8px);">
                  <svg class="w-4 h-4 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round"
                          d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/>
                  </svg>
                </button>
              }
              <button (click)="closeChat()"
                      aria-label="Close"
                      class="w-8 h-8 rounded-full flex items-center justify-center
                             transition-all duration-200 hover:scale-110
                             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                      style="background: rgba(255,255,255,0.15); backdrop-filter: blur(8px);">
                <svg class="w-4 h-4 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- ── Messages ────────────────────────────────────────────────────── -->
        <div #messagesContainer
             class="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3"
             style="scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.08) transparent;">

          <!-- Welcome message -->
          @if (messages().length === 0) {
            <div class="flex items-end gap-2.5 animate-in fade-in duration-500">
              <!-- Avatar -->
              <div class="w-7 h-7 rounded-full shrink-0 mb-0.5 flex items-center justify-center"
                   style="background: linear-gradient(135deg, var(--accent, #1E56DC), var(--accent-dk, #1235A9));">
                <svg class="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round"
                        d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5"/>
                </svg>
              </div>
              <div class="max-w-[82%]">
                <div class="rounded-2xl rounded-bl-md px-4 py-3"
                     style="background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.06);">
                  <p class="text-sm leading-relaxed" style="color: rgba(255,255,255,0.82);">
                    Hi there! 👋 I'm your AI receptionist for
                    <strong class="text-white">{{ clinicName() || 'the clinic' }}</strong>.
                    How can I help you today?
                  </p>
                </div>
                <p class="text-[10px] mt-1 ml-1" style="color: rgba(255,255,255,0.25);">Just now</p>
              </div>
            </div>

            <!-- Quick reply chips -->
            <div class="flex flex-wrap gap-2 mt-1 pl-9">
              @for (q of QUICK_REPLIES; track q) {
                <button (click)="sendQuickReply(q)"
                        class="text-xs font-medium px-3 py-1.5 rounded-full
                               transition-all duration-200 hover:scale-105 active:scale-95"
                        style="background: rgba(255,255,255,0.06);
                               border: 1px solid rgba(255,255,255,0.1);
                               color: rgba(255,255,255,0.65);">
                  {{ q }}
                </button>
              }
            </div>
          }

          <!-- Chat messages -->
          @for (msg of messages(); track $index) {
            @if (msg.role === 'assistant') {
              <div class="flex items-end gap-2.5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div class="w-7 h-7 rounded-full shrink-0 mb-0.5 flex items-center justify-center"
                     style="background: linear-gradient(135deg, var(--accent, #1E56DC), var(--accent-dk, #1235A9));">
                  <svg class="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round"
                          d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5"/>
                  </svg>
                </div>
                <div class="max-w-[82%]">
                  <div class="rounded-2xl rounded-bl-md px-4 py-3"
                       style="background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.06);">
                    <p class="text-sm leading-relaxed" style="color: rgba(255,255,255,0.82);">{{ msg.text }}</p>
                  </div>
                </div>
              </div>
            } @else {
              <div class="flex justify-end animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div class="max-w-[82%]">
                  <div class="rounded-2xl rounded-br-md px-4 py-3"
                       style="background: linear-gradient(135deg, var(--accent, #1E56DC) 0%, var(--accent-dk, #1235A9) 100%);">
                    <p class="text-sm leading-relaxed text-white">{{ msg.text }}</p>
                  </div>
                </div>
              </div>
            }
          }

          <!-- Typing indicator -->
          @if (isTyping()) {
            <div class="flex items-end gap-2.5 animate-in fade-in duration-300">
              <div class="w-7 h-7 rounded-full shrink-0 mb-0.5 flex items-center justify-center"
                   style="background: linear-gradient(135deg, var(--accent, #1E56DC), var(--accent-dk, #1235A9));">
                <svg class="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round"
                        d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5"/>
                </svg>
              </div>
              <div class="rounded-2xl rounded-bl-md px-4 py-3.5"
                   style="background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.06);">
                <div class="flex items-center gap-1.5">
                  @for (d of DOT_DELAYS; track $index) {
                    <span class="w-2 h-2 rounded-full"
                          style="background: rgba(255,255,255,0.4)"
                          [style.animation-name]="'vaDot'"
                          [style.animation-duration]="'1s'"
                          [style.animation-timing-function]="'ease-in-out'"
                          [style.animation-iteration-count]="'infinite'"
                          [style.animation-delay]="d"></span>
                  }
                </div>
              </div>
            </div>
          }
        </div>

        <!-- ── Input row ───────────────────────────────────────────────────── -->
        <div class="shrink-0 px-4 pb-4 pt-3"
             style="border-top: 1px solid rgba(255,255,255,0.07);">
          <form (ngSubmit)="sendMessage()" class="flex items-end gap-2.5">
            <div class="flex-1 relative">
              <textarea #inputField
                        [(ngModel)]="inputText"
                        name="message"
                        placeholder="Ask anything about the clinic…"
                        rows="1"
                        (keydown.enter)="onEnterKey($event)"
                        (input)="autoResize($event)"
                        class="w-full px-4 py-3 text-sm text-white placeholder-white/25
                               resize-none overflow-hidden leading-5 rounded-2xl
                               outline-none transition-all duration-200"
                        style="background: rgba(255,255,255,0.06);
                               border: 1px solid rgba(255,255,255,0.1);
                               min-height: 44px; max-height: 112px;"></textarea>
            </div>
            <!-- Send button -->
            <button type="submit"
                    [disabled]="!inputText.trim() || isTyping()"
                    aria-label="Send"
                    class="w-11 h-11 rounded-full flex items-center justify-center shrink-0
                           transition-all duration-200 hover:scale-110 active:scale-95
                           disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                    style="background: linear-gradient(135deg, var(--accent, #1E56DC), var(--accent-dk, #1235A9));
                           box-shadow: 0 4px 16px rgba(30,86,220,0.4);">
              <svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
            </button>
          </form>
          <!-- Footer label -->
          <p class="text-center text-[10px] mt-2.5" style="color: rgba(255,255,255,0.2);">
            Powered by AI · Replies may not be 100% accurate
          </p>
        </div>
      </div>
    }
  `,
  styles: [`
    @keyframes vaBar {
      0%, 100% { height: var(--min, 4px); }
      50%       { height: var(--max, 28px); }
    }
    @keyframes vaDot {
      0%, 80%, 100% { transform: scale(0.6); opacity: 0.3; }
      40%            { transform: scale(1);   opacity: 1;   }
    }
  `],
})
export class VoiceAgentComponent implements OnDestroy, AfterViewChecked {
  // ── Inputs ───────────────────────────────────────────────────────────────────
  readonly agentId    = input<string>('');
  readonly clinicId   = input<string>('');
  readonly bookingRefPrefix = input<string>('');
  readonly clinicName = input<string>('');
  readonly services   = input<string[]>([]);
  readonly city       = input<string>('');
  readonly phone      = input<string>('');
  readonly address    = input<string>('');
  readonly hours      = input<string[]>([]);
  readonly whatsappNumber = input<string>('');

  // ── Constants ─────────────────────────────────────────────────────────────────
  readonly BARS         = BARS;
  readonly DOT_DELAYS   = DOT_DELAYS;
  readonly QUICK_REPLIES = QUICK_REPLIES;

  // ── State ─────────────────────────────────────────────────────────────────────
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

  // ── Timer display ─────────────────────────────────────────────────────────────
  formattedTime(): string {
    const s = this.duration();
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  // ── Auto-scroll ───────────────────────────────────────────────────────────────
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

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
    } catch {
      this.zone.run(() => {
        this.showError('Microphone access denied. Please allow mic and try again.');
        this.mode.set('idle');
      });
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
          setTimeout(() => this.zone.run(() => this.mode.set('idle')), 2200);
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
          msg.toLowerCase().includes('agent') ? 'AI agent not found. Please contact the clinic.' :
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
    setTimeout(() => this.zone.run(() => this.mode.set('idle')), 2200);
  }

  // ── Text chat ─────────────────────────────────────────────────────────────────
  startText() {
    this.mode.set('text');
    this.shouldScrollDown = true;
  }

  async switchToVoice() {
    this.mode.set('idle');
    setTimeout(() => this.zone.run(() => this.startVoice()), 80);
  }

  closeChat() { this.mode.set('idle'); }

  sendQuickReply(text: string) {
    this.inputText = text;
    void this.sendMessage();
  }

  onEnterKey(event: Event) {
    const ke = event as KeyboardEvent;
    if (!ke.shiftKey) { ke.preventDefault(); void this.sendMessage(); }
  }

  autoResize(event: Event) {
    const el = event.target as HTMLTextAreaElement;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
  }

  async sendMessage() {
    const text = this.inputText.trim();
    if (!text || this.isTyping()) return;

    this.messages.update(msgs => [...msgs, { role: 'user', text }]);
    this.inputText = '';
    this.isTyping.set(true);
    this.shouldScrollDown = true;

    const textarea = document.querySelector<HTMLTextAreaElement>('textarea[name="message"]');
    if (textarea) textarea.style.height = 'auto';

    try {
      const history = this.messages().slice(-12).map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.text,
      }));

      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicId:    this.clinicId(),
          bookingRefPrefix: this.bookingRefPrefix(),
          message:    text,
          clinicName: this.clinicName(),
          services:   this.services(),
          city:       this.city(),
          phone:      this.phone(),
          address:    this.address(),
          hours:      this.hours(),
          whatsappNumber: this.whatsappNumber(),
          history:    history.slice(0, -1),
        }),
      });

      const data  = await resp.json() as { reply?: string };
      const reply = data.reply ?? 'Sorry, I couldn\'t process that. Please try again.';

      this.zone.run(() => {
        this.messages.update(msgs => [...msgs, { role: 'assistant', text: reply }]);
        this.isTyping.set(false);
        this.shouldScrollDown = true;
        this.speakReply(reply);
      });
    } catch {
      this.zone.run(() => {
        this.messages.update(msgs => [...msgs, {
          role: 'assistant',
          text: 'I\'m having trouble connecting right now. Please call or WhatsApp the clinic directly.',
        }]);
        this.isTyping.set(false);
        this.shouldScrollDown = true;
      });
    }
  }

  private speakReply(text: string) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utter  = new SpeechSynthesisUtterance(text);
    utter.rate   = 1.05;
    utter.pitch  = 1.0;
    const voices = window.speechSynthesis.getVoices();
    const pref   = voices.find(v => /female|woman/i.test(v.name) && v.lang.startsWith('en'))
      ?? voices.find(v => v.lang.startsWith('en')) ?? null;
    if (pref) utter.voice = pref;
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
