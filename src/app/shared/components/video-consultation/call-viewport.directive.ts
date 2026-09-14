import { Directive, ElementRef, OnDestroy, OnInit, inject } from '@angular/core';

/** Keeps the mobile call controls above the on-screen keyboard in Safari and Chrome. */
@Directive({ selector: '[appCallViewport]', standalone: true })
export class CallViewportDirective implements OnInit, OnDestroy {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private viewport: VisualViewport | null = null;
  private readonly resize = () => {
    this.element.nativeElement.style.setProperty('--call-viewport-height', `${this.viewport?.height ?? window.innerHeight}px`);
    this.element.nativeElement.style.setProperty('--call-viewport-top', `${this.viewport?.offsetTop ?? 0}px`);
  };
  ngOnInit(): void {
    if (typeof window === 'undefined') return;
    this.viewport = window.visualViewport;
    this.resize();
    this.viewport?.addEventListener('resize', this.resize);
    this.viewport?.addEventListener('scroll', this.resize);
    window.addEventListener('resize', this.resize);
  }
  ngOnDestroy(): void {
    this.viewport?.removeEventListener('resize', this.resize);
    this.viewport?.removeEventListener('scroll', this.resize);
    if (typeof window !== 'undefined') window.removeEventListener('resize', this.resize);
  }
}
