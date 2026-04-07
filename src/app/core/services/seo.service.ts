import { Injectable, inject } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { filter } from 'rxjs/operators';
import { DOCUMENT } from '@angular/common';
import { ClinicConfigService } from './clinic-config.service';

type SeoRouteData = {
  title?: string;
  description?: string;
  image?: string;
  noIndex?: boolean;
};

@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly clinic = inject(ClinicConfigService);
  private readonly document = inject(DOCUMENT);

  constructor() {
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => this.update());
    this.update();
  }

  private update() {
    const data = this.getRouteData(this.route);

    const clinicName = this.clinic.config.name || 'Dental Clinic';
    const city = this.clinic.config.city || '';
    const cityText = city ? ` in ${city}` : '';

    const defaultTitle = city
      ? `${clinicName} | Dental Clinic${cityText}`
      : `${clinicName} | Pain-Free Dental Care`;
    const title = data.title ? `${data.title} | ${clinicName}` : defaultTitle;

    const defaultDescription = city
      ? `Gentle, pain-free dental care${cityText}. Book appointments, explore services, and contact ${clinicName}.`
      : `Gentle, pain-free dental care with modern equipment and transparent pricing. Book appointments and contact ${clinicName}.`;
    const description = data.description || defaultDescription;

    const url = this.absoluteUrl(this.router.url.split('?')[0]);
    const image = data.image || `${this.document.location.origin}/og-default.svg`;

    this.title.setTitle(title);
    this.setMeta('description', description);
    this.setMeta('robots', data.noIndex ? 'noindex,nofollow' : 'index,follow');

    this.setMeta('og:title', title, true);
    this.setMeta('og:description', description, true);
    this.setMeta('og:type', 'website', true);
    this.setMeta('og:url', url, true);
    this.setMeta('og:image', image, true);
    this.setMeta('og:site_name', clinicName, true);
    this.setMeta('og:locale', 'en_IN', true);

    this.setMeta('twitter:card', 'summary_large_image');
    this.setMeta('twitter:title', title);
    this.setMeta('twitter:description', description);
    this.setMeta('twitter:image', image);

    this.setCanonical(url);
    this.updateSchema(clinicName, url, image);
  }

  private updateSchema(clinicName: string, url: string, image: string) {
    const config = this.clinic.config;
    const sameAs = [
      config.social?.facebook,
      config.social?.instagram,
      config.social?.linkedin,
    ].filter(Boolean) as string[];

    const schema = this.compact({
      '@context': 'https://schema.org',
      '@type': 'Dentist',
      name: clinicName,
      url,
      image,
      telephone: config.phone || undefined,
      address: this.compact({
        '@type': 'PostalAddress',
        streetAddress: [config.addressLine1, config.addressLine2].filter(Boolean).join(', ') || undefined,
        addressLocality: config.city || undefined,
      }),
      sameAs: sameAs.length ? sameAs : undefined,
    }) as Record<string, unknown> | undefined;

    if (!schema) return;

    let script = this.document.getElementById('clinic-schema') as HTMLScriptElement | null;
    if (!script) {
      script = this.document.createElement('script');
      script.id = 'clinic-schema';
      script.type = 'application/ld+json';
      this.document.head.appendChild(script);
    }
    script.text = JSON.stringify(schema);
  }

  private getRouteData(route: ActivatedRoute): SeoRouteData {
    let active: ActivatedRoute | null = route;
    let data: SeoRouteData = {};
    while (active) {
      data = { ...data, ...(active.snapshot.data as SeoRouteData) };
      active = active.firstChild ?? null;
    }
    return data;
  }

  private setMeta(name: string, content: string, isProperty = false) {
    const selector = isProperty ? `property='${name}'` : `name='${name}'`;
    this.meta.updateTag(isProperty ? { property: name, content } : { name, content }, selector);
  }

  private setCanonical(url: string) {
    let link = this.document.querySelector("link[rel='canonical']") as HTMLLinkElement | null;
    if (!link) {
      link = this.document.createElement('link');
      link.setAttribute('rel', 'canonical');
      this.document.head.appendChild(link);
    }
    link.setAttribute('href', url);
  }

  private absoluteUrl(path: string) {
    const base = this.document.location.origin;
    if (!path.startsWith('/')) return `${base}/${path}`;
    return `${base}${path}`;
  }

  private compact(value: unknown): unknown {
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'string') return value.trim() ? value : undefined;
    if (Array.isArray(value)) {
      const items = value.map(v => this.compact(v)).filter(v => v !== undefined);
      return items.length ? items : undefined;
    }
    if (typeof value === 'object') {
      const obj: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        const next = this.compact(val);
        if (next !== undefined) obj[key] = next;
      }
      return Object.keys(obj).length ? obj : undefined;
    }
    return value;
  }
}
