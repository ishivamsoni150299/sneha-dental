import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PlatformBrandComponent } from '../../shared/components/platform-brand/platform-brand.component';

@Component({
  selector: 'app-professional-landing',
  standalone: true,
  imports: [RouterLink, PlatformBrandComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="border-b border-gray-200 bg-white">
      <div class="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a routerLink="/dentists" aria-label="mydentalplatform"><app-platform-brand /></a>
        <div class="flex items-center gap-3">
          <a routerLink="/professional/login" class="text-sm font-semibold text-gray-700">Sign in</a>
          <a routerLink="/professional/signup" class="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">List your profile</a>
        </div>
      </div>
    </header>
    <main>
      <section class="bg-gray-50 py-20 md:py-28">
        <div class="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
          <div>
            <p class="text-sm font-bold uppercase tracking-[0.18em] text-blue-700">For dentists</p>
            <h1 class="mt-4 text-4xl font-bold tracking-tight text-gray-950 md:text-6xl">Your professional identity. Independent of any clinic website.</h1>
            <p class="mt-6 max-w-xl text-lg leading-8 text-gray-600">Create one verified dentist profile, add every place where you practise, publish your availability, and receive patient appointments directly.</p>
            <div class="mt-8 flex flex-wrap gap-3">
              <a routerLink="/professional/signup" class="rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700">Create dentist profile</a>
              <a routerLink="/dentists" class="rounded-xl border border-gray-300 bg-white px-6 py-3 font-semibold text-gray-900">View directory</a>
            </div>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            @for (item of benefits; track item.title) {
              <article class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <p class="text-sm font-bold text-blue-700">{{ item.step }}</p>
                <h2 class="mt-2 text-lg font-bold text-gray-950">{{ item.title }}</h2>
                <p class="mt-2 text-sm leading-6 text-gray-600">{{ item.text }}</p>
              </article>
            }
          </div>
        </div>
      </section>
    </main>
  `,
})
export class ProfessionalLandingComponent {
  readonly benefits = [
    { step: '01', title: 'Own your profile', text: 'Your qualifications, registration and reputation stay with you.' },
    { step: '02', title: 'Add multiple locations', text: 'Set a different schedule and consultation fee for each practice.' },
    { step: '03', title: 'Get verified', text: 'Submit registration details once for platform review.' },
    { step: '04', title: 'Receive appointments', text: 'Patients choose you, a location and a real available time.' },
  ];
}

