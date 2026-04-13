import { Component, inject, OnInit, OnDestroy, signal, HostListener } from '@angular/core';
import { RouterOutlet, RouterLink } from '@angular/router';
import { NavbarComponent } from '../navbar/navbar.component';
import { FooterComponent } from '../footer/footer.component';
import { ClinicConfigService } from '../../../core/services/clinic-config.service';
import { ComingSoonComponent } from '../../../features/coming-soon/coming-soon.component';
import { VoiceAgentComponent } from '../voice-agent/voice-agent.component';

@Component({
  selector: 'app-clinic-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, NavbarComponent, FooterComponent, ComingSoonComponent, VoiceAgentComponent],
  template: `
    @if (clinic.config.comingSoon) {
      <app-coming-soon />
    } @else {
    <app-navbar />

    <!-- ── Mobile call nudge banner (first-visit only) ── -->
    @if (showCallBanner()) {
      <div class="md:hidden bg-blue-600 text-white flex items-center justify-between gap-2 px-4 py-2.5 shadow-md animate-slide-up">
        <a [href]="'tel:+' + clinic.config.phoneE164"
           class="flex items-center gap-2 flex-1 text-sm font-semibold truncate">
          <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
          </svg>
          <span>Same-day slots · Tap to call <strong>{{ clinic.config.phone }}</strong></span>
        </a>
        <button (click)="dismissCallBanner()"
                aria-label="Dismiss"
                class="text-blue-200 hover:text-white p-1 shrink-0 transition-colors">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
    }

    <main class="min-h-[60vh]">
      <router-outlet />
    </main>
    <app-footer />

    <!-- ── Desktop Speed-Dial FAB (hidden on mobile — bottom bar handles it) ── -->
    <div class="hidden md:flex flex-col items-end gap-2.5 fixed bottom-8 right-6 z-50">

      <!-- Action items (revealed when open) -->
      @if (speedDialOpen()) {
        <!-- Book Appointment -->
        <div class="flex items-center gap-2 animate-slide-up" style="animation-duration:180ms">
          <span class="bg-gray-900/80 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow backdrop-blur-sm whitespace-nowrap">Book Appointment</span>
          <a routerLink="/appointment" (click)="speedDialOpen.set(false)"
             class="w-12 h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>
          </a>
        </div>
        <!-- Call -->
        <div class="flex items-center gap-2 animate-slide-up" style="animation-duration:220ms">
          <span class="bg-gray-900/80 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow backdrop-blur-sm whitespace-nowrap">{{ clinic.config.phone }}</span>
          <a [href]="'tel:+' + clinic.config.phoneE164"
             class="w-12 h-12 bg-gray-700 hover:bg-gray-900 text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
            </svg>
          </a>
        </div>
        <!-- WhatsApp -->
        <div class="flex items-center gap-2 animate-slide-up" style="animation-duration:260ms">
          <span class="bg-gray-900/80 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow backdrop-blur-sm whitespace-nowrap">WhatsApp</span>
          <a [href]="clinic.bookingWhatsappUrl" target="_blank" rel="noopener noreferrer" (click)="speedDialOpen.set(false)"
             class="w-12 h-12 bg-green-500 hover:bg-green-600 text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110">
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347M12 0C5.373 0 0 5.373 0 12c0 2.117.549 4.104 1.508 5.835L0 24l6.335-1.484A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/>
            </svg>
          </a>
        </div>
      }

      <!-- Main FAB toggle -->
      <button (click)="speedDialOpen.set(!speedDialOpen())"
              aria-label="Quick actions"
              class="relative w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-xl hover:shadow-2xl hover:shadow-blue-300 flex items-center justify-center transition-all duration-300 hover:scale-110">
        <span class="absolute inset-0 rounded-full bg-blue-400 animate-ping opacity-20 pointer-events-none"></span>
        <svg class="w-6 h-6 transition-transform duration-300" [class.rotate-45]="speedDialOpen()" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>
        </svg>
      </button>
    </div>

    <!-- ── Back-to-Top button (desktop + mobile, appears after 400px scroll) ── -->
    @if (showBackToTop()) {
      <button (click)="scrollToTop()"
              aria-label="Back to top"
              class="fixed bottom-24 md:bottom-28 left-4 md:left-6 z-40 w-10 h-10 bg-white border border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-300 rounded-full shadow-md hover:shadow-lg flex items-center justify-center transition-all duration-300 hover:-translate-y-1 animate-slide-up">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7"/>
        </svg>
      </button>
    }

    <!-- ── WhatsApp nudge popup (appears after 15s, desktop only) ── -->
    @if (showWaPopup()) {
      <div class="hidden md:block fixed bottom-28 right-6 z-50 w-72 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden animate-slide-up">
        <div class="bg-green-500 px-4 py-3 flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347M12 0C5.373 0 0 5.373 0 12c0 2.117.549 4.104 1.508 5.835L0 24l6.335-1.484A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/>
            </svg>
            <span class="text-white font-bold text-sm">{{ clinic.config.name || 'Clinic' }} on WhatsApp</span>
          </div>
          <button (click)="dismissPopup()" class="text-white/70 hover:text-white transition-colors">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div class="p-4">
          <div class="bg-green-50 rounded-xl px-3 py-2.5 mb-3">
            <p class="text-xs text-gray-600 leading-relaxed">👋 Hi! Ready to book your appointment or have a question? Chat with us — we usually reply in minutes.</p>
          </div>
          <a [href]="clinic.bookingWhatsappUrl" target="_blank" rel="noopener noreferrer"
             (click)="dismissPopup()"
             class="flex items-center justify-center gap-2 w-full bg-green-500 hover:bg-green-600 text-white py-2.5 rounded-xl font-bold text-sm transition-all">
            Start Chat
          </a>
        </div>
      </div>
    }

    <!-- ── ElevenLabs AI Voice Agent ── -->
    @if (clinic.config.elevenLabsAgentId) {
      <app-voice-agent [agentId]="clinic.config.elevenLabsAgentId" />
    }

    <!-- ── Mobile 3-tab sticky bottom bar ── -->
    <div class="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 safe-bottom shadow-lg">
      <div class="grid grid-cols-3">
        <!-- Call -->
        <a [href]="'tel:+' + clinic.config.phoneE164"
           class="flex flex-col items-center justify-center py-3 gap-1 text-gray-500 hover:text-blue-600 active:bg-gray-50 transition-colors">
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
          </svg>
          <span class="text-[11px] font-semibold">Call</span>
        </a>
        <!-- Book Now (primary) -->
        <a routerLink="/appointment"
           class="flex flex-col items-center justify-center py-3 gap-1 bg-blue-600 text-white active:bg-blue-700 transition-colors">
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
          </svg>
          <span class="text-[11px] font-bold">Book Now</span>
        </a>
        <!-- WhatsApp -->
        <a [href]="clinic.bookingWhatsappUrl" target="_blank" rel="noopener noreferrer"
           class="flex flex-col items-center justify-center py-3 gap-1 text-gray-500 hover:text-green-600 active:bg-gray-50 transition-colors">
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347M12 0C5.373 0 0 5.373 0 12c0 2.117.549 4.104 1.508 5.835L0 24l6.335-1.484A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/>
          </svg>
          <span class="text-[11px] font-semibold">WhatsApp</span>
        </a>
      </div>
    </div>
    }
  `,
  styles: [`
    .safe-bottom { padding-bottom: env(safe-area-inset-bottom, 4px); }
  `]
})
export class ClinicLayoutComponent implements OnInit, OnDestroy {
  readonly clinic = inject(ClinicConfigService);
  readonly showWaPopup    = signal(false);
  readonly speedDialOpen  = signal(false);
  readonly showBackToTop  = signal(false);
  readonly showCallBanner = signal(!sessionStorage.getItem('call_banner_dismissed'));
  private popupTimer: ReturnType<typeof setTimeout> | null = null;

  @HostListener('window:scroll')
  onScroll() {
    this.showBackToTop.set(window.scrollY > 400);
  }

  ngOnInit() {
    const cfg = this.clinic.config;
    if (!sessionStorage.getItem('wa_popup_dismissed')) {
      this.popupTimer = setTimeout(() => this.showWaPopup.set(true), 15_000);
    }
  }

  ngOnDestroy() {
    if (this.popupTimer) clearTimeout(this.popupTimer);
  }

  dismissPopup() {
    this.showWaPopup.set(false);
    sessionStorage.setItem('wa_popup_dismissed', '1');
  }

  dismissCallBanner() {
    this.showCallBanner.set(false);
    sessionStorage.setItem('call_banner_dismissed', '1');
  }

  scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
