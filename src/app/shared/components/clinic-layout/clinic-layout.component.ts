import { Component, HostListener, OnDestroy, OnInit, PLATFORM_ID, ViewChild, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NavbarComponent } from '../navbar/navbar.component';
import { FooterComponent } from '../footer/footer.component';
import { ClinicConfigService } from '../../../core/services/clinic-config.service';
import { ComingSoonComponent } from '../../../features/coming-soon/coming-soon.component';
import { VoiceAgentComponent } from '../voice-agent/voice-agent.component';

@Component({
  selector: 'app-clinic-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NavbarComponent, FooterComponent, ComingSoonComponent, VoiceAgentComponent],
  template: `
    @if (clinic.config.comingSoon) {
      <app-coming-soon />
    } @else {
      <app-navbar />

      <!-- Mobile status banner -->
      @if (showCallBanner()) {
        <div class="md:hidden border-b border-[var(--accent-bd)] bg-[var(--accent-lt)] animate-slide-up">
          <div class="flex items-center justify-between gap-3 px-4 py-2.5">
            <div class="min-w-0 flex-1">
              <p class="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--accent)]">Fast booking support</p>
              <a [href]="'tel:+' + clinic.config.phoneE164"
                 class="mt-1 flex items-center gap-2 text-sm font-semibold text-gray-800 truncate">
                <span class="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white text-[var(--accent)] shadow-sm">
                  <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
                  </svg>
                </span>
                <span class="truncate">Same-day slots. Tap to call {{ clinic.config.phone }}</span>
              </a>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <span class="inline-flex items-center gap-1 rounded-full border border-white bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-gray-700">
                <span class="h-1.5 w-1.5 rounded-full" [class]="clinic.isOpenNow ? 'bg-emerald-500' : 'bg-amber-400'"></span>
                {{ clinic.isOpenNow ? 'Open now' : 'Quick reply' }}
              </span>
              <button (click)="dismissCallBanner()"
                      aria-label="Dismiss"
                      class="rounded-full bg-white/80 p-1.5 text-gray-400 transition-colors hover:text-gray-700">
                <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      }

      <main class="min-h-[60vh] overflow-x-clip bg-gradient-to-b from-slate-50 via-white to-slate-100 md:bg-none">
        <router-outlet />
      </main>
      <app-footer />

      <!-- Spacer so page content is not hidden under the fixed dock -->
      <div class="md:hidden" style="height: calc(96px + env(safe-area-inset-bottom, 0px));" aria-hidden="true"></div>

      <!-- Desktop speed dial -->
      <div class="hidden md:flex fixed bottom-8 right-6 z-50 flex-col items-end gap-2.5">
        @if (speedDialOpen()) {
          <div class="flex items-center gap-2 animate-slide-up" style="animation-duration:180ms">
            <span class="rounded-full bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white shadow whitespace-nowrap">Book Appointment</span>
            <a routerLink="/appointment" (click)="speedDialOpen.set(false)"
               aria-label="Book appointment"
               class="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-lg transition-all hover:scale-110 hover:bg-[var(--accent-dk)]">
              <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
              </svg>
            </a>
          </div>
          <div class="flex items-center gap-2 animate-slide-up" style="animation-duration:220ms">
            <span class="rounded-full bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white shadow whitespace-nowrap">{{ clinic.config.phone }}</span>
            <a [href]="'tel:+' + clinic.config.phoneE164"
               [attr.aria-label]="'Call ' + (clinic.config.phone || 'clinic')"
               class="flex h-12 w-12 items-center justify-center rounded-full bg-gray-700 text-white shadow-lg transition-all hover:scale-110 hover:bg-gray-900">
              <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
              </svg>
            </a>
          </div>
          <div class="flex items-center gap-2 animate-slide-up" style="animation-duration:260ms">
            <span class="rounded-full bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white shadow whitespace-nowrap">WhatsApp</span>
            <a [href]="clinic.bookingWhatsappUrl" target="_blank" rel="noopener noreferrer" (click)="speedDialOpen.set(false)"
               aria-label="Chat on WhatsApp"
               class="flex h-12 w-12 items-center justify-center rounded-full bg-green-500 text-white shadow-lg transition-all hover:scale-110 hover:bg-green-600">
              <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347M12 0C5.373 0 0 5.373 0 12c0 2.117.549 4.104 1.508 5.835L0 24l6.335-1.484A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/>
              </svg>
            </a>
          </div>
        }

        <button (click)="speedDialOpen.set(!speedDialOpen())"
                aria-label="Quick actions"
                class="relative flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-xl transition-all duration-300 hover:scale-110 hover:bg-[var(--accent-dk)] hover:shadow-2xl hover:shadow-[var(--accent-sh)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-dk)] focus-visible:ring-offset-2">
          <span class="pointer-events-none absolute inset-0 rounded-full bg-[var(--accent-md)] opacity-20 animate-ping"></span>
          <svg class="h-6 w-6 transition-transform duration-300" [class.rotate-45]="speedDialOpen()" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>
          </svg>
        </button>
      </div>

      <!-- Back to top -->
      @if (showBackToTop()) {
        <button (click)="scrollToTop()"
                aria-label="Back to top"
                class="fixed bottom-24 left-4 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-md transition-all duration-300 hover:-translate-y-1 hover:border-blue-300 hover:text-blue-600 hover:shadow-lg animate-slide-up md:bottom-28 md:left-6">
          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7"/>
          </svg>
        </button>
      }

      <!-- WhatsApp nudge popup -->
      @if (showWaPopup()) {
        <div class="fixed bottom-28 right-6 z-50 hidden w-72 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl animate-slide-up md:block">
          <div class="flex items-center justify-between bg-green-500 px-4 py-3">
            <div class="flex items-center gap-2.5">
              <svg class="h-5 w-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347M12 0C5.373 0 0 5.373 0 12c0 2.117.549 4.104 1.508 5.835L0 24l6.335-1.484A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/>
              </svg>
              <span class="text-sm font-bold text-white">{{ clinic.config.name || 'Clinic' }} on WhatsApp</span>
            </div>
            <button (click)="dismissPopup()" aria-label="Close" class="text-white/70 transition-colors hover:text-white">
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="p-4">
            <div class="mb-3 rounded-xl bg-green-50 px-3 py-2.5">
              <p class="text-xs leading-relaxed text-gray-600">Hi. Ready to book your appointment or have a question? Chat with us and we usually reply in minutes.</p>
            </div>
            <a [href]="clinic.bookingWhatsappUrl" target="_blank" rel="noopener noreferrer"
               (click)="dismissPopup()"
               class="flex w-full items-center justify-center gap-2 rounded-xl bg-green-500 py-2.5 text-sm font-bold text-white transition-all hover:bg-green-600">
              Start Chat
            </a>
          </div>
        </div>
      }

      <!-- AI receptionist -->
      @if (clinic.isLoaded) {
        <app-voice-agent
          [agentId]="voiceAgentId()"
          [clinicId]="clinic.config.clinicId || ''"
          [bookingRefPrefix]="clinic.config.bookingRefPrefix"
          [clinicName]="clinic.config.name"
          [services]="serviceNames()"
          [city]="clinic.config.city"
          [phone]="clinic.config.phone"
          [address]="clinicAddress()"
          [hours]="clinicHours()"
          [whatsappNumber]="clinic.config.whatsappNumber" />
      }

      <!-- PWA install banner -->
      @if (showInstallBanner()) {
        <div class="fixed bottom-24 left-3 right-3 z-50 animate-slide-up md:hidden">
          <div class="flex items-center gap-3 rounded-2xl bg-gray-900 px-4 py-3.5 text-white shadow-2xl">
            <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg">
              <svg class="h-6 w-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2.5c-2.4 0-4.2 1.5-5.1 3.4-.5.9-.7 2-.7 3 0 1.8.8 3.1.8 4.9 0 1.3.8 4.5 2 6 .4.5.9.1 1.1-.6.3-1.8.4-3.2 1.9-3.2s1.6 1.4 1.9 3.2c.2.7.7 1.1 1.1.6 1.2-1.5 2-4.7 2-6 0-1.8.8-3.1.8-4.9 0-1-.2-2.1-.7-3C16.2 4 14.4 2.5 12 2.5z"/>
              </svg>
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-bold leading-tight">Add to Home Screen</p>
              @if (isIos) {
                <p class="mt-0.5 text-xs leading-tight text-gray-400">Tap <strong class="text-gray-300">Share</strong> then <strong class="text-gray-300">Add to Home Screen</strong> for the full app</p>
              } @else {
                <p class="mt-0.5 text-xs leading-tight text-gray-400">Get the full-screen app with no browser chrome</p>
              }
            </div>
            @if (isIos) {
              <button (click)="dismissInstallBanner()"
                      class="shrink-0 p-1 text-gray-400 transition-colors hover:text-white">
                <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            } @else {
              <button (click)="triggerInstall()"
                      class="shrink-0 rounded-xl bg-[var(--accent)] px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-[var(--accent-dk)]">
                Install
              </button>
            }
          </div>
          @if (isIos) {
            <div class="mt-1.5 flex justify-center">
              <div class="flex items-center gap-1.5 rounded-full bg-gray-900 px-3 py-1.5 text-xs text-white shadow-lg">
                <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                </svg>
                Tap Share below, then "Add to Home Screen"
              </div>
            </div>
          }
        </div>
      }

      <!-- Mobile action dock — anchored flush to viewport bottom -->
      <div class="fixed bottom-0 left-0 right-0 z-40 md:hidden" style="padding: 0 12px calc(12px + env(safe-area-inset-bottom, 0px)) 12px;">
        <div class="mobile-dock-shell">
          <div class="grid grid-cols-5 gap-1.5">
            <a routerLink="/"
               routerLinkActive="mobile-dock-link-active"
               [routerLinkActiveOptions]="{ exact: true }"
               class="mobile-dock-link">
              <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.85">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 10.5L12 3l9 7.5M5.25 9.75V21h13.5V9.75"/>
              </svg>
              <span class="leading-none">Home</span>
            </a>

            <a [href]="'tel:+' + clinic.config.phoneE164"
               class="mobile-dock-link">
              <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.85">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
              </svg>
              <span class="leading-none">Call</span>
            </a>

            <a routerLink="/appointment"
               routerLinkActive="scale-[1.02]"
               [routerLinkActiveOptions]="{ exact: true }"
               class="mobile-dock-book">
              <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.85">
                <path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
              </svg>
              <span class="leading-none">Book</span>
            </a>

            <button (click)="openAiChat()"
                    class="mobile-dock-link">
              <div class="relative">
                <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85">
                  <path stroke-linecap="round" stroke-linejoin="round"
                        d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15M14.25 3.104c.251.023.501.05.75.082M19.8 15a2.25 2.25 0 01.1 2.3L17.7 21H6.3l-2.2-3.7A2.25 2.25 0 014.2 15m15.6 0H4.2"/>
                </svg>
                <span class="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-white"></span>
              </div>
              <span class="leading-none">Chat</span>
            </button>

            <a [href]="clinic.bookingWhatsappUrl" target="_blank" rel="noopener noreferrer"
               class="mobile-dock-link">
              <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347M12 0C5.373 0 0 5.373 0 12c0 2.117.549 4.104 1.508 5.835L0 24l6.335-1.484A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/>
              </svg>
              <span class="leading-none">WA</span>
            </a>
          </div>
        </div>
      </div>
    }
  `,
  styles: []
})
export class ClinicLayoutComponent implements OnInit, OnDestroy {
  readonly clinic = inject(ClinicConfigService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  @ViewChild(VoiceAgentComponent) private voiceAgent?: VoiceAgentComponent;

  openAiChat(): void {
    this.voiceAgent?.startText();
  }

  readonly showWaPopup = signal(false);
  readonly speedDialOpen = signal(false);
  readonly showBackToTop = signal(false);
  readonly showCallBanner = signal(false);
  readonly showInstallBanner = signal(false);

  readonly isIos = (() => {
    if (!this.isBrowser) {
      return false;
    }
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
  })();

  private deferredInstallPrompt: (Event & { prompt?: () => Promise<void> }) | null = null;
  private beforeInstallPromptHandler: ((event: Event) => void) | null = null;

  readonly voiceAgentId = computed(() => {
    const cfg = this.clinic.config;
    return cfg.subscriptionPlan === 'pro' && cfg.subscriptionStatus === 'active'
      ? (cfg.elevenLabsAgentId ?? '')
      : '';
  });

  readonly serviceNames = computed(() => this.clinic.config.services?.map((service) => service.name) ?? []);
  readonly clinicHours = computed(() => this.clinic.config.hours?.map((slot) => `${slot.days}: ${slot.time}`) ?? []);
  readonly clinicAddress = computed(() =>
    [this.clinic.config.addressLine1, this.clinic.config.addressLine2, this.clinic.config.city]
      .filter(Boolean)
      .join(', ')
  );

  private popupTimer: ReturnType<typeof setTimeout> | null = null;
  private installTimer: ReturnType<typeof setTimeout> | null = null;

  @HostListener('window:scroll')
  onScroll(): void {
    if (!this.isBrowser) return;
    this.showBackToTop.set(window.scrollY > 400);
  }

  ngOnInit(): void {
    if (!this.isBrowser) {
      return;
    }

    this.showCallBanner.set(!sessionStorage.getItem('call_banner_dismissed'));

    if (!sessionStorage.getItem('wa_popup_dismissed')) {
      this.popupTimer = setTimeout(() => this.showWaPopup.set(true), 15_000);
    }

    const alreadyInstalled =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;

    if (!alreadyInstalled && !localStorage.getItem('pwa_install_dismissed')) {
      this.beforeInstallPromptHandler = (event: Event) => {
        event.preventDefault();
        this.deferredInstallPrompt = event as Event & { prompt?: () => Promise<void> };
        this.installTimer = setTimeout(() => this.showInstallBanner.set(true), 4_000);
      };
      window.addEventListener('beforeinstallprompt', this.beforeInstallPromptHandler);

      if (this.isIos) {
        this.installTimer = setTimeout(() => this.showInstallBanner.set(true), 4_000);
      }
    }
  }

  ngOnDestroy(): void {
    if (this.popupTimer) {
      clearTimeout(this.popupTimer);
    }
    if (this.installTimer) {
      clearTimeout(this.installTimer);
    }
    if (this.isBrowser && this.beforeInstallPromptHandler) {
      window.removeEventListener('beforeinstallprompt', this.beforeInstallPromptHandler);
    }
  }

  dismissPopup(): void {
    if (!this.isBrowser) return;
    this.showWaPopup.set(false);
    sessionStorage.setItem('wa_popup_dismissed', '1');
  }

  dismissCallBanner(): void {
    if (!this.isBrowser) return;
    this.showCallBanner.set(false);
    sessionStorage.setItem('call_banner_dismissed', '1');
  }

  dismissInstallBanner(): void {
    if (!this.isBrowser) return;
    this.showInstallBanner.set(false);
    localStorage.setItem('pwa_install_dismissed', '1');
  }

  async triggerInstall(): Promise<void> {
    if (!this.isBrowser) return;
    if (!this.deferredInstallPrompt?.prompt) {
      return;
    }
    await this.deferredInstallPrompt.prompt();
    this.dismissInstallBanner();
  }

  scrollToTop(): void {
    if (!this.isBrowser) return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
