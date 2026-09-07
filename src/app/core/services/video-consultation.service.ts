import { Injectable, inject } from '@angular/core';
import { AuthenticatedApiService } from './authenticated-api.service';

export interface VideoSession { url: string; token: string; expiresAt: string }
export interface VideoSettings { providerReady: boolean; enabled: boolean; fee: string | number | null }
export class VideoAccessError extends Error {}

@Injectable({ providedIn: 'root' })
export class VideoConsultationService {
  private readonly api = inject(AuthenticatedApiService);

  async join(id: string, staff: boolean, bookingRef: string, phone: string): Promise<VideoSession> {
    const prefix = staff ? '/api/clinics/current/appointments/' : '/api/public/appointments/';
    const request: RequestInit = { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(staff ? {} : { bookingRef, phone }) };
    const path = `${prefix}${encodeURIComponent(id)}/video/join`;
    const response = await this.api.fetch(path, request);
    const session = await this.read<VideoSession>(response);
    const url = new URL(session.url);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.daily.co') || url.username || url.password || url.port) {
      throw new Error('The video room could not be opened. Please contact the clinic.');
    }
    return session;
  }

  async settings(): Promise<VideoSettings> {
    return this.read<VideoSettings>(await this.api.fetch('/api/clinics/current/video-settings'));
  }

  async checkAccess(id: string, staff: boolean, bookingRef: string, phone: string): Promise<void> {
    const path = `${staff ? '/api/clinics/current' : '/api/public'}/appointments/${encodeURIComponent(id)}/video/access`;
    const init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(staff ? {} : { bookingRef, phone }) };
    const response = await this.api.fetch(path, init);
    if (!response.ok) await this.read(response);
  }

  async saveSettings(enabled: boolean, fee: number | null): Promise<void> {
    const response = await this.api.fetch('/api/clinics/current/video-settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled, fee }),
    });
    if (!response.ok) await this.read(response);
  }

  private async read<T>(response: Response): Promise<T> {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new VideoAccessError(body.detail || body.message || 'Video consultations are temporarily unavailable.');
    return body as T;
  }
}
