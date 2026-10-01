import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ModalDirective } from './modal.directive';

@Component({
  standalone: true,
  imports: [ModalDirective],
  template: `
    <button id="opener" (click)="open.set(true)">Open editor</button>
    @if (open()) {
      <dialog appModal aria-label="Editor" (dismissed)="open.set(false)">
        <input aria-label="Name" autofocus>
        <button (click)="open.set(false)">Done</button>
      </dialog>
    }
  `,
})
class ModalHostComponent {
  readonly open = signal(false);
}

describe('ModalDirective', () => {
  function setup() {
    const fixture = TestBed.createComponent(ModalHostComponent);
    fixture.detectChanges();
    const opener = fixture.nativeElement.querySelector('#opener') as HTMLButtonElement;
    opener.focus();
    opener.click();
    fixture.detectChanges();
    return { fixture, opener, dialog: fixture.nativeElement.querySelector('dialog') as HTMLDialogElement };
  }

  it('opens with native modality and focuses the editor', () => {
    const { dialog } = setup();
    expect(dialog.matches(':modal')).toBeTrue();
    expect(dialog.contains(document.activeElement)).toBeTrue();
  });

  it('dismisses on cancel and restores the original control', () => {
    const { fixture, opener, dialog } = setup();
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('does not dismiss an interaction inside the dialog', () => {
    const { fixture, dialog } = setup();
    const rect = dialog.getBoundingClientRect();
    dialog.dispatchEvent(new MouseEvent('click', { clientX: rect.left + 1, clientY: rect.top + 1 }));
    fixture.detectChanges();
    expect(dialog.open).toBeTrue();
  });

  it('dismisses a click outside the dialog bounds', () => {
    const { fixture, dialog } = setup();
    const rect = dialog.getBoundingClientRect();
    dialog.dispatchEvent(new MouseEvent('click', { clientX: rect.left - 1, clientY: rect.top - 1 }));
    fixture.detectChanges();
    expect(fixture.componentInstance.open()).toBeFalse();
  });
});
