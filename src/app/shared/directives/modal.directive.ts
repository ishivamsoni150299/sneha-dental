import { AfterViewInit, Directive, ElementRef, HostListener, OnDestroy, inject, output } from '@angular/core';

/** Native modality keeps background controls inert and contains keyboard focus. */
@Directive({ selector: 'dialog[appModal]', standalone: true })
export class ModalDirective implements AfterViewInit, OnDestroy {
  private readonly dialog = inject<ElementRef<HTMLDialogElement>>(ElementRef).nativeElement;
  private opener: HTMLElement | null = null;
  readonly dismissed = output<void>();

  ngAfterViewInit(): void {
    if (typeof this.dialog.showModal !== 'function') return;
    const active = this.dialog.ownerDocument.activeElement;
    this.opener = active instanceof HTMLElement ? active : null;
    this.dialog.showModal();
  }

  @HostListener('cancel', ['$event'])
  onCancel(event: Event): void {
    event.preventDefault();
    this.dismissed.emit();
  }

  @HostListener('click', ['$event'])
  onClick(event: MouseEvent): void {
    if (event.target !== this.dialog) return;
    const rect = this.dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
      this.dismissed.emit();
    }
  }

  ngOnDestroy(): void {
    if (this.dialog.open) this.dialog.close();
    if (this.opener?.isConnected) this.opener.focus({ preventScroll: true });
  }
}
