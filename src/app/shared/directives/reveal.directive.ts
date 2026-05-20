import { Directive, ElementRef, Input, inject, type OnDestroy, type OnInit } from '@angular/core';

@Directive({ selector: '[appReveal]', standalone: true })
export class RevealDirective implements OnInit, OnDestroy {
  @Input() appRevealDelay = 0;
  @Input() appRevealDir: 'up' | 'left' | 'right' | 'scale' = 'up';

  private io?: IntersectionObserver;
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);

  ngOnInit(): void {
    const el = this.el.nativeElement;
    const delay = String(this.appRevealDelay);
    const transforms: Record<string, string> = {
      up:    'translateY(52px)',
      left:  'translateX(-52px)',
      right: 'translateX(52px)',
      scale: 'scale(0.88) translateY(20px)',
    };
    Object.assign(el.style, {
      opacity:    '0',
      transform:  transforms[this.appRevealDir],
      transition: `opacity 0.85s cubic-bezier(0.16,1,0.3,1) ${delay}ms,
                   transform 0.85s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
      willChange: 'opacity, transform',
    });

    this.io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          Object.assign(el.style, { opacity: '1', transform: 'none' });
          this.io?.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );
    this.io.observe(el);
  }

  ngOnDestroy(): void {
    this.io?.disconnect();
  }
}
