import { TestBed } from '@angular/core/testing';
import { ConsultationChatComponent, ConsultationMessage } from './consultation-chat.component';

describe('ConsultationChatComponent', () => {
  function fixture() {
    const view = TestBed.createComponent(ConsultationChatComponent);
    const transport = jasmine.createSpy('transport').and.resolveTo();
    view.componentRef.setInput('transport', transport);
    view.componentRef.setInput('available', true);
    view.detectChanges();
    return { view, chat: view.componentInstance, transport };
  }
  const prescription: ConsultationMessage = { type: 'consultation-chat', id: 'rx-1', kind: 'prescription', text: 'Written instructions' };

  it('shares prescription text and offers a download', async () => {
    const { view, chat, transport } = fixture();
    view.componentRef.setInput('canPrescribe', true);
    chat.prescription.set(true); chat.draft.set('Written instructions'); await chat.send(); view.detectChanges();
    expect(transport).toHaveBeenCalledWith(jasmine.objectContaining({ kind: 'prescription', text: 'Written instructions' }));
    expect(view.nativeElement.textContent).toContain('Save prescription'); expect(chat.draft()).toBe('');
  });
  it('keeps a failed message for retry', async () => {
    const { chat, transport } = fixture(); transport.and.rejectWith(new Error('offline'));
    chat.draft.set('Please repeat that'); await chat.send();
    expect(chat.draft()).toBe('Please repeat that'); expect(chat.messages().length).toBe(0); expect(chat.error()).toContain('Try again');
  });
  it('rejects prescriptions from a patient and ignores duplicate messages', () => {
    const { chat } = fixture(); chat.receive(prescription, false); expect(chat.messages().length).toBe(0);
    chat.receive(prescription, true); chat.receive(prescription, true); expect(chat.messages().length).toBe(1);
    chat.receive({ ...prescription, id: '2', text: 42 }, true); expect(chat.messages().length).toBe(1);
  });
  it('renders shared content as text, never HTML', () => {
    const { chat, view } = fixture(); chat.receive({ ...prescription, text: '<img src=x onerror=alert(1)>' }, true); view.detectChanges();
    expect(view.nativeElement.querySelector('article img')).toBeNull();
    expect(view.nativeElement.querySelector('article').textContent).toContain('<img');
  });
  it('limits encoded message size and prevents offline sends', async () => {
    const { chat, view, transport } = fixture(); chat.draft.set('🙂'.repeat(900)); await chat.send(); expect(transport).not.toHaveBeenCalled();
    view.componentRef.setInput('available', false); chat.draft.set('Hello'); await chat.send(); expect(transport).not.toHaveBeenCalled();
  });
});
