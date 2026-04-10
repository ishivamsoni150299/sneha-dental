import { Component, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from '../navbar/navbar.component';
import { FooterComponent } from '../footer/footer.component';
import { ClinicConfigService } from '../../../core/services/clinic-config.service';
import { startVapiWidget } from '../../../core/utils/vapi-widget';

@Component({
  selector: 'app-clinic-layout',
  standalone: true,
  imports: [RouterOutlet, NavbarComponent, FooterComponent],
  template: `
    <app-navbar />
    <main class="min-h-[60vh]">
      <router-outlet />
    </main>
    <app-footer />

    <!-- WhatsApp Floating Button -->
    <div class="fixed bottom-20 md:bottom-6 right-6 z-50">
      <!-- Pulse ring -->
      <span class="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-30 pointer-events-none"></span>
      <a [href]="clinic.bookingWhatsappUrl"
         target="_blank"
         rel="noopener noreferrer"
         aria-label="Chat on WhatsApp"
         title="Chat with us on WhatsApp"
         class="relative w-14 h-14 bg-green-500 hover:bg-green-600 text-white rounded-full shadow-xl hover:shadow-2xl flex items-center justify-center transition-all duration-300 hover:scale-110">
        <svg class="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347M12 0C5.373 0 0 5.373 0 12c0 2.117.549 4.104 1.508 5.835L0 24l6.335-1.484A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/>
        </svg>
      </a>
    </div>

    <!-- Mobile sticky booking bar -->
    <div class="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur border-t border-gray-200 px-4 py-3 safe-bottom shadow-lg">
      <a href="/appointment"
         class="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold text-sm transition-colors shadow-md">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
        </svg>
        Book Appointment · Same Day Available
      </a>
    </div>
  `,
  styles: [`
    .safe-bottom { padding-bottom: env(safe-area-inset-bottom, 12px); }
  `]
})
export class ClinicLayoutComponent implements OnInit {
  readonly clinic = inject(ClinicConfigService);

  ngOnInit() {
    const cfg = this.clinic.config;
    if (cfg.vapiAssistantId && cfg.vapiPublicKey) {
      startVapiWidget(cfg.vapiPublicKey, cfg.vapiAssistantId);
    }
  }
}
