import { Component, ChangeDetectionStrategy, inject, signal, OnInit, HostListener } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { SuperAuthService } from '../../../core/services/super-auth.service';
import { ClinicFirestoreService } from '../../../core/services/clinic-firestore.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-business-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './business-shell.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusinessShellComponent implements OnInit {
  readonly auth        = inject(SuperAuthService);
  private  router      = inject(Router);
  private  clinicStore = inject(ClinicFirestoreService);

  clinicCount  = signal<number | null>(null);
  menuOpen     = signal(false);

  @HostListener('document:keydown.escape')
  closeMenu() { this.menuOpen.set(false); }

  async ngOnInit() {
    try {
      const list = await this.clinicStore.getAll();
      this.clinicCount.set(list.length);
    } catch { /* non-critical */ }
  }

  async logout() {
    await this.auth.logout();
    this.router.navigate(['/business/login']);
  }
}
