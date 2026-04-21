import { Injectable, inject } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { filter } from 'rxjs/operators';
import { DOCUMENT } from '@angular/common';
import { ClinicConfigService } from './clinic-config.service';
import { environment } from '../../../environments/environment';

interface SeoRouteData {
  title?: string;
  description?: string;
  image?: string;
  noIndex?: boolean;
}

type SeoContext =
  | {
      kind: 'platform';
      siteName: string;
      defaultDescription: string;
    }
  | {
      kind: 'clinic';
      siteName: string;
      city?: string;
      defaultDescription: string;
    };

const PLATFORM_NAME = 'mydentalplatform';
const PLATFORM_DEFAULT_TITLE = 'mydentalplatform | Dental Clinic Websites, Booking and AI Reception';
const PLATFORM_DEFAULT_DESCRIPTION =
  'Dental clinic websites with online booking, WhatsApp integration, AI chat, and AI voice receptionist. Starter ₹999/month. Pro ₹2,499/month.';
const INDEXABLE_ROBOTS = 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1';
const NOINDEX_ROBOTS = 'noindex,nofollow';

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
      .subscribe(() => {
        this.update();
      });
    this.update();
  }

  private update(): void {
    const data = this.getRouteData(this.route);
    const path = this.normalizePath(this.router.url.split('?')[0] || '/');
    const context = this.getSeoContext(path);
    const title = this.buildTitle(data.title, context);
    const description = data.description ?? context.defaultDescription;
    const url = this.absoluteUrl(path);
    const image = this.absoluteUrl(data.image ?? '/og-default.svg');
    const imageAlt = context.kind === 'platform'
      ? 'mydentalplatform dental website platform preview'
      : `${context.siteName} dental clinic preview`;
    const robots = data.noIndex ? NOINDEX_ROBOTS : INDEXABLE_ROBOTS;

    this.title.setTitle(title);
    this.setMeta('description', description);
    this.setMeta('robots', robots);
    this.setMeta('googlebot', robots);

    this.setMeta('og:title', title, true);
    this.setMeta('og:description', description, true);
    this.setMeta('og:type', 'website', true);
    this.setMeta('og:url', url, true);
    this.setMeta('og:image', image, true);
    this.setMeta('og:image:alt', imageAlt, true);
    this.setMeta('og:site_name', context.siteName, true);
    this.setMeta('og:locale', 'en_IN', true);

    this.setMeta('twitter:card', 'summary_large_image');
    this.setMeta('twitter:title', title);
    this.setMeta('twitter:description', description);
    this.setMeta('twitter:image', image);
    this.setMeta('twitter:image:alt', imageAlt);

    this.setCanonical(url);
    this.updateSchema(context, path, title, description, url, image);
  }

  private updateSchema(
    context: SeoContext,
    path: string,
    title: string,
    description: string,
    url: string,
    image: string
  ): void {
    const graph = context.kind === 'platform'
      ? this.buildPlatformGraph(path, title, description, url, image)
      : this.buildClinicGraph(path, title, description, url, image, context.siteName);
    const schema = this.compact({
      '@context': 'https://schema.org',
      '@graph': graph,
    }) as Record<string, unknown> | undefined;

    if (!schema) return;

    let script = this.document.getElementById('seo-schema') as HTMLScriptElement | null;
    if (!script) {
      script = this.document.createElement('script');
      script.id = 'seo-schema';
      script.type = 'application/ld+json';
      this.document.head.appendChild(script);
    }
    script.text = JSON.stringify(schema);
  }

  private buildPlatformGraph(
    path: string,
    title: string,
    description: string,
    url: string,
    image: string
  ): Record<string, unknown>[] {
    const origin = this.document.location.origin;
    const breadcrumb = this.buildBreadcrumbSchema(path, title, PLATFORM_NAME);
    const graph = [
      this.compact({
        '@type': 'Organization',
        '@id': `${origin}/#organization`,
        name: PLATFORM_NAME,
        url: origin,
        logo: this.absoluteUrl('/icons/icon-512.png'),
        image,
        description: PLATFORM_DEFAULT_DESCRIPTION,
      }),
      this.compact({
        '@type': 'WebSite',
        '@id': `${origin}/#website`,
        url: origin,
        name: PLATFORM_NAME,
        description: PLATFORM_DEFAULT_DESCRIPTION,
        inLanguage: 'en-IN',
        publisher: { '@id': `${origin}/#organization` },
      }),
      this.compact({
        '@type': 'WebPage',
        '@id': `${url}#webpage`,
        url,
        name: title,
        description,
        isPartOf: { '@id': `${origin}/#website` },
        about: { '@id': `${origin}/#organization` },
        primaryImageOfPage: image,
        breadcrumb: breadcrumb ? { '@id': `${url}#breadcrumb` } : undefined,
      }),
      breadcrumb,
    ].filter(Boolean);

    return graph as Record<string, unknown>[];
  }

  private buildClinicGraph(
    path: string,
    title: string,
    description: string,
    url: string,
    image: string,
    clinicName: string
  ): Record<string, unknown>[] {
    const config = this.clinic.config;
    const sameAs = [
      config.social.facebook,
      config.social.instagram,
      config.social.linkedin,
    ].filter(Boolean) as string[];
    const origin = this.document.location.origin;
    const breadcrumb = this.buildBreadcrumbSchema(path, title, clinicName);
    const graph = [
      this.compact({
        '@type': 'Dentist',
        '@id': `${origin}/#clinic`,
        name: clinicName,
        url: origin,
        image,
        telephone: config.phone || undefined,
        medicalSpecialty: 'Dentistry',
        hasMap: config.mapDirectionsUrl || undefined,
        areaServed: config.city || undefined,
        address: this.compact({
          '@type': 'PostalAddress',
          streetAddress: [config.addressLine1, config.addressLine2].filter(Boolean).join(', ') || undefined,
          addressLocality: config.city || undefined,
        }),
        sameAs: sameAs.length ? sameAs : undefined,
        contactPoint: config.phone
          ? {
              '@type': 'ContactPoint',
              telephone: config.phone,
              contactType: 'customer support',
              areaServed: config.city || 'IN',
              availableLanguage: ['English', 'Hindi'],
            }
          : undefined,
        openingHoursSpecification: this.buildOpeningHoursSpecification(config.hours),
      }),
      this.compact({
        '@type': 'WebSite',
        '@id': `${origin}/#website`,
        url: origin,
        name: clinicName,
        description,
        inLanguage: 'en-IN',
        publisher: { '@id': `${origin}/#clinic` },
      }),
      this.compact({
        '@type': 'WebPage',
        '@id': `${url}#webpage`,
        url,
        name: title,
        description,
        isPartOf: { '@id': `${origin}/#website` },
        about: { '@id': `${origin}/#clinic` },
        primaryImageOfPage: image,
        breadcrumb: breadcrumb ? { '@id': `${url}#breadcrumb` } : undefined,
      }),
      breadcrumb,
    ].filter(Boolean);

    return graph as Record<string, unknown>[];
  }

  private getSeoContext(path: string): SeoContext {
    const hostname = this.normalizeHostname(this.document.location.hostname);
    const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';

    if (path.startsWith('/business') || (!isLocalHost && this.getPlatformHostnames().has(hostname))) {
      return {
        kind: 'platform',
        siteName: PLATFORM_NAME,
        defaultDescription: PLATFORM_DEFAULT_DESCRIPTION,
      };
    }

    const clinicName = this.clinic.config.name.trim() || 'Dental Clinic';
    const city = this.clinic.config.city.trim() || undefined;
    const cityLabel = city ? ` in ${city}` : '';

    return {
      kind: 'clinic',
      siteName: clinicName,
      city,
      defaultDescription: city
        ? `Book in 60 seconds with ${clinicName}${cityLabel}. Same-day appointments available with transparent pricing and modern dental care.`
        : `Book in 60 seconds with ${clinicName}. Same-day appointments available with transparent pricing and modern dental care.`,
    };
  }

  private buildTitle(routeTitle: string | undefined, context: SeoContext): string {
    if (routeTitle) {
      const siteName = context.siteName.toLowerCase();
      return routeTitle.toLowerCase().includes(siteName)
        ? routeTitle
        : `${routeTitle} | ${context.siteName}`;
    }

    if (context.kind === 'platform') {
      return PLATFORM_DEFAULT_TITLE;
    }

    return context.city
      ? `${context.siteName} | Dentist in ${context.city}`
      : `${context.siteName} | Pain-Free Dental Care`;
  }

  private buildBreadcrumbSchema(
    path: string,
    pageTitle: string,
    siteName: string
  ): Record<string, unknown> | undefined {
    const segments = path.split('/').filter(Boolean);
    if (!segments.length) return undefined;

    const origin = this.document.location.origin;
    const items = [{ name: siteName, item: origin }];
    let currentPath = '';

    for (const segment of segments) {
      currentPath += `/${segment}`;
      items.push({
        name: this.humanizePathSegment(segment),
        item: `${origin}${currentPath}`,
      });
    }

    items[items.length - 1].name = this.stripSiteSuffix(pageTitle, siteName);

    return this.compact({
      '@type': 'BreadcrumbList',
      '@id': `${this.absoluteUrl(path)}#breadcrumb`,
      itemListElement: items.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: item.name,
        item: item.item,
      })),
    }) as Record<string, unknown> | undefined;
  }

  private buildOpeningHoursSpecification(
    hours: { days: string; time: string }[]
  ): Record<string, unknown>[] | undefined {
    const specs = hours
      .map(slot => {
        const dayOfWeek = this.parseDayRange(slot.days);
        const timeRange = this.parseTimeRange(slot.time);

        if (!dayOfWeek || !timeRange) return undefined;

        return this.compact({
          '@type': 'OpeningHoursSpecification',
          dayOfWeek,
          opens: timeRange.opens,
          closes: timeRange.closes,
        }) as Record<string, unknown> | undefined;
      })
      .filter(Boolean) as Record<string, unknown>[];

    return specs.length ? specs : undefined;
  }

  private parseDayRange(days: string): string[] | undefined {
    const normalized = days.replace(/[–—−]/g, '-').trim();
    const dayNames = [
      'https://schema.org/Sunday',
      'https://schema.org/Monday',
      'https://schema.org/Tuesday',
      'https://schema.org/Wednesday',
      'https://schema.org/Thursday',
      'https://schema.org/Friday',
      'https://schema.org/Saturday',
    ];

    const toIndex = (value: string): number => {
      const token = value.trim().toLowerCase();
      if (token.startsWith('sun')) return 0;
      if (token.startsWith('mon')) return 1;
      if (token.startsWith('tue')) return 2;
      if (token.startsWith('wed')) return 3;
      if (token.startsWith('thu')) return 4;
      if (token.startsWith('fri')) return 5;
      if (token.startsWith('sat')) return 6;
      return -1;
    };

    if (normalized.includes(',')) {
      const values = normalized
        .split(',')
        .map(day => toIndex(day))
        .filter(index => index >= 0)
        .map(index => dayNames[index]);
      return values.length ? values : undefined;
    }

    if (!normalized.includes('-')) {
      const index = toIndex(normalized);
      return index >= 0 ? [dayNames[index]] : undefined;
    }

    const [startToken, endToken] = normalized.split('-').map(part => part.trim());
    const start = toIndex(startToken);
    const end = toIndex(endToken);
    if (start < 0 || end < 0) return undefined;

    const values: string[] = [];
    let current = start;
    for (;;) {
      values.push(dayNames[current]);
      if (current === end) break;
      current = (current + 1) % 7;
    }

    return values;
  }

  private parseTimeRange(time: string): { opens: string; closes: string } | undefined {
    const normalized = time.replace(/[–—−]/g, '-').trim();
    const parts = normalized.split('-').map(part => part.trim());
    if (parts.length < 2) return undefined;

    const opens = this.to24Hour(parts[0]);
    const closes = this.to24Hour(parts.slice(1).join('-'));

    return opens && closes ? { opens, closes } : undefined;
  }

  private to24Hour(value: string): string | undefined {
    const match = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i.exec(value.trim());
    if (!match) return undefined;

    const [, hoursText, minutes = '00', meridiemText] = match;
    let hours = Number(hoursText);
    const meridiem = meridiemText.toUpperCase();

    if (meridiem === 'PM' && hours !== 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;

    return `${hours.toString().padStart(2, '0')}:${minutes}`;
  }

  private getPlatformHostnames(): Set<string> {
    const values = [
      environment.firebase.authDomain,
      'mydentalplatform.com',
      'www.mydentalplatform.com',
    ];

    return new Set(
      values
        .map(value => this.extractHostname(value))
        .filter((value): value is string => !!value)
    );
  }

  private extractHostname(value: string | undefined): string | undefined {
    if (!value) return undefined;

    try {
      const normalizedValue = value.includes('://') ? value : `https://${value}`;
      return this.normalizeHostname(new URL(normalizedValue).hostname);
    } catch {
      return this.normalizeHostname(value);
    }
  }

  private normalizeHostname(value: string): string {
    return value.trim().toLowerCase().replace(/:\d+$/, '');
  }

  private normalizePath(path: string): string {
    if (!path.startsWith('/')) return `/${path}`;
    return path === '' ? '/' : path;
  }

  private humanizePathSegment(value: string): string {
    return value
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, char => char.toUpperCase());
  }

  private stripSiteSuffix(title: string, siteName: string): string {
    const suffix = ` | ${siteName}`;
    return title.endsWith(suffix) ? title.slice(0, -suffix.length) : title;
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

  private setMeta(name: string, content: string, isProperty = false): void {
    const selector = isProperty ? `property='${name}'` : `name='${name}'`;
    this.meta.updateTag(isProperty ? { property: name, content } : { name, content }, selector);
  }

  private setCanonical(url: string): void {
    let link = this.document.querySelector<HTMLLinkElement>("link[rel='canonical']");
    if (!link) {
      link = this.document.createElement('link');
      link.setAttribute('rel', 'canonical');
      this.document.head.appendChild(link);
    }
    link.setAttribute('href', url);
  }

  private absoluteUrl(path: string): string {
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
