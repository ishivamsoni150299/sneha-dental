import { Directive, ElementRef, Input, OnInit, OnDestroy } from '@angular/core';

@Directive({ selector: '[reveal]', standalone: true })
export class RevealDirective implements OnInit, OnDestroy {
  @Input() revealDelay = 0;
  @Input() revealDir: 'up' | 'left' | 'right' | 'scale' = 'up';

  private io?: IntersectionObserver;

  constructor(private el: ElementRef<HTMLElement>) {}

  ngOnInit() {
    const el = this.el.nativeElement;
    const transforms: Record<string, string> = {
      up:    'translateY(52px)',
      left:  'translateX(-52px)',
      right: 'translateX(52px)',
      scale: 'scale(0.88) translateY(20px)',
    };
    Object.assign(el.style, {
      opacity:    '0',
      transform:  transforms[this.revealDir],
      transition: `opacity 0.85s cubic-bezier(0.16,1,0.3,1) ${this.revealDelay}ms,
                   transform 0.85s cubic-bezier(0.16,1,0.3,1) ${this.revealDelay}ms`,
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

  ngOnDestroy() { this.io?.disconnect(); }
}
