import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from '../navbar/navbar.component';
import { FooterComponent } from '../footer/footer.component';
import { ClinicConfigService } from '../../../core/services/clinic-config.service';

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
    <a [href]="clinic.bookingWhatsappUrl"
       target="_blank"
       rel="noopener noreferrer"
       aria-label="Chat on WhatsApp"
       title="Chat with us on WhatsApp"
       class="fixed bottom-6 right-6 z-50 w-14 h-14 bg-green-500 hover:bg-green-600 text-white rounded-full shadow-lg hover:shadow-xl flex items-center justify-center transition-all duration-300 hover:scale-110">
      <svg class="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347M12 0C5.373 0 0 5.373 0 12c0 2.117.549 4.104 1.508 5.835L0 24l6.335-1.484A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/>
      </svg>
    </a>

    <!-- Mobile sticky booking bar -->
    <div class="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 px-4 py-3 safe-bottom">
      <a href="/appointment"
         class="block text-center bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold text-sm transition-colors shadow-md">
        Book Appointment - Same Day Available
      </a>
    </div>
  `,
  styles: [`
    .safe-bottom { padding-bottom: env(safe-area-inset-bottom, 12px); }
  `]
})
export class ClinicLayoutComponent {
  readonly clinic = inject(ClinicConfigService);
}
