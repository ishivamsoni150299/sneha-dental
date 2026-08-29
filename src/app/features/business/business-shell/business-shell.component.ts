import { Component, ChangeDetectionStrategy, inject, signal, HostListener, type OnInit } from '@angular/core';
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
  private readonly router      = inject(Router);
  private readonly clinicStore = inject(ClinicFirestoreService);

  clinicCount  = signal<number | null>(null);
  menuOpen     = signal(false);

  @HostListener('document:keydown.escape')
  closeMenu(): void { this.menuOpen.set(false); }

  ngOnInit(): void {
    void this.loadClinicCount();
  }

  private async loadClinicCount(): Promise<void> {
    try {
      const list = await this.clinicStore.getAll();
      this.clinicCount.set(list.length);
    } catch { /* non-critical */ }
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigate(['/business/login']);
  }
}
