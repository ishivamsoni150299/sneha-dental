import { RenderMode, type ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    path: 'dentists',
    renderMode: RenderMode.Prerender,
  },
  { path: 'dentists/noida', renderMode: RenderMode.Prerender },
  { path: 'dentists/delhi', renderMode: RenderMode.Prerender },
  { path: 'dentists/gurugram', renderMode: RenderMode.Prerender },
  { path: 'dentists/ghaziabad', renderMode: RenderMode.Prerender },
  { path: 'dentists/faridabad', renderMode: RenderMode.Prerender },
  { path: 'dentists/noida/sector-75', renderMode: RenderMode.Prerender },
  { path: 'dentists/root-canal/noida', renderMode: RenderMode.Prerender },
  { path: 'dentists/dental-implants/delhi', renderMode: RenderMode.Prerender },
  { path: 'dentists/braces/delhi', renderMode: RenderMode.Prerender },
  {
    path: 'business',
    renderMode: RenderMode.Prerender,
  },
  {
    path: '**',
    renderMode: RenderMode.Client,
  },
];
