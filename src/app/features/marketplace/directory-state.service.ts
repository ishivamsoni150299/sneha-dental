import { Injectable } from '@angular/core';

export interface DirectoryPreferences {
  search: string; locality: string; treatment: string; video: boolean;
  type: 'dentists' | 'clinics'; today: boolean; fee: number | null;
  experience: number; gender: string; rating: number; language: string; sort: string;
}

/** Same-visit search preferences only; no persisted location coordinates or patient data. */
@Injectable({ providedIn: 'root' })
export class DirectoryStateService {
  private readonly entries = new Map<string, DirectoryPreferences>();
  read(key: string): DirectoryPreferences | undefined { return this.entries.get(key); }
  save(key: string, preferences: DirectoryPreferences): void {
    this.entries.delete(key);
    this.entries.set(key, preferences);
    if (this.entries.size > 8) this.entries.delete(this.entries.keys().next().value!);
  }
}
