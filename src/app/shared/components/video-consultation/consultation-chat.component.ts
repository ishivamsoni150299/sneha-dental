import { ChangeDetectionStrategy, Component, ElementRef, input, output, signal, viewChild } from '@angular/core';

export interface ConsultationMessage { type: 'consultation-chat'; id: string; kind: 'message' | 'prescription'; text: string }
interface ChatEntry extends ConsultationMessage { mine: boolean; time: string }
export const CHAT_TOPIC = 'consultation-chat';

@Component({
  selector: 'app-consultation-chat', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full min-h-0 min-w-0 flex-col bg-white' },
  template: `
    <header class="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3">
      <div><h3 class="font-semibold text-gray-900">Chat & prescriptions</h3><p class="mt-1 text-xs text-gray-500">Save prescriptions before leaving.</p></div>
      <button type="button" (click)="dismissed.emit()" aria-label="Close chat" class="flex h-11 w-11 items-center justify-center rounded-xl text-gray-600 hover:bg-gray-100"><i class="ph ph-x text-xl" aria-hidden="true"></i></button>
    </header>
    <div #history role="log" aria-label="Consultation messages" aria-live="polite" aria-relevant="additions" class="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
      @if (!messages().length) {
        <div class="py-8 text-center"><i class="ph ph-chat-circle-text text-3xl text-blue-600" aria-hidden="true"></i><p class="mt-3 text-sm font-semibold text-gray-900">Everything you need, in one conversation</p><p class="mt-2 text-sm leading-6 text-gray-500">Send a message or share written prescription details during your call.</p></div>
      }
      @for (message of messages(); track message.id) {
        <article class="max-w-full rounded-2xl border p-3" [class.bg-blue-50]="message.mine" [class.border-blue-100]="message.mine" [class.bg-gray-50]="!message.mine" [class.border-gray-200]="!message.mine">
          <p class="mb-2 text-xs text-gray-500">{{ message.mine ? 'You' : 'Other participant' }} · {{ message.time }}</p>
          @if (message.kind === 'prescription') { <p class="mb-2 flex items-center gap-2 text-sm font-semibold text-blue-700"><i class="ph ph-prescription" aria-hidden="true"></i>Prescription</p> }
          <p class="whitespace-pre-wrap break-words text-sm leading-6 text-gray-900">{{ message.text }}</p>
          @if (message.kind === 'prescription') { <button type="button" (click)="save(message)" class="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-blue-200 bg-white px-3 text-sm font-semibold text-blue-700"><i class="ph ph-download-simple" aria-hidden="true"></i>Save prescription</button> }
        </article>
      }
    </div>
    <form (submit)="$event.preventDefault(); send()" class="shrink-0 space-y-2 border-t border-gray-200 p-3">
      @if (canPrescribe()) { <label class="flex min-h-11 items-center gap-2 text-sm font-medium text-gray-700"><input type="checkbox" [checked]="prescription()" (change)="prescription.set($any($event.target).checked)" class="h-4 w-4 accent-blue-600">Share as prescription</label> }
      <label for="consultation-message" class="sr-only">{{ prescription() ? 'Prescription details' : 'Message' }}</label>
      <textarea #composer id="consultation-message" [value]="draft()" (input)="draft.set($any($event.target).value)" [rows]="prescription() ? 5 : 2" maxlength="2000" [placeholder]="prescription() ? 'Medicine, dosage, duration and instructions…' : 'Type a message…'" class="w-full resize-none rounded-xl border border-gray-300 p-3 text-base text-gray-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"></textarea>
      @if (error()) { <p role="alert" class="text-sm text-red-700">{{ error() }}</p> }
      <div class="flex items-center justify-between gap-2"><p class="text-xs text-gray-500">{{ available() ? 'Chat clears when you leave.' : 'Available when both people join.' }}</p><button type="submit" [disabled]="!available() || sending() || !draft().trim()" class="min-h-11 shrink-0 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{{ sending() ? 'Sending…' : prescription() ? 'Share' : 'Send' }}</button></div>
    </form>
  `,
  styles: [`@media(max-height:500px){header{padding-top:4px;padding-bottom:4px}header p{display:none}form{padding:8px}textarea{max-height:64px}}`],
})
export class ConsultationChatComponent {
  readonly canPrescribe = input(false);
  readonly available = input(false);
  readonly transport = input.required<(message: ConsultationMessage) => Promise<void>>();
  readonly dismissed = output<void>();
  readonly received = output<void>();
  readonly messages = signal<ChatEntry[]>([]);
  readonly draft = signal('');
  readonly prescription = signal(false);
  readonly sending = signal(false);
  readonly error = signal('');
  private readonly history = viewChild<ElementRef<HTMLElement>>('history');
  private readonly composer = viewChild<ElementRef<HTMLTextAreaElement>>('composer');

  focus(): void { this.composer()?.nativeElement.focus(); }

  receive(value: unknown, mayPrescribe = false): void {
    if (!value || typeof value !== 'object') return;
    const message = value as ConsultationMessage;
    if (message.type !== CHAT_TOPIC || typeof message.id !== 'string' || message.id.length > 80 ||
      typeof message.text !== 'string' || !message.text.trim() || message.text.length > 2000 ||
      !['message', 'prescription'].includes(message.kind) || (message.kind === 'prescription' && !mayPrescribe) ||
      this.messages().some(entry => entry.id === message.id)) return;
    this.append(message, false); this.received.emit();
  }

  async send(): Promise<void> {
    if (!this.available() || this.sending() || !this.draft().trim()) return;
    const message: ConsultationMessage = { type: CHAT_TOPIC, id: crypto.randomUUID(), kind: this.canPrescribe() && this.prescription() ? 'prescription' : 'message', text: this.draft().trim() };
    if (new TextEncoder().encode(JSON.stringify(message)).length > 3000) { this.error.set('This message is too long. Please send it in smaller parts.'); return; }
    this.sending.set(true); this.error.set('');
    try { await this.transport()(message); this.append(message, true); this.draft.set(''); this.prescription.set(false); }
    catch { this.error.set('Message could not be sent. Your text is kept here. Try again.'); }
    finally { this.sending.set(false); }
  }

  save(message: ChatEntry): void {
    const url = URL.createObjectURL(new Blob([`Prescription\nShared during video consultation\n\n${message.text}\n`], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'consultation-prescription.txt'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private append(message: ConsultationMessage, mine: boolean): void {
    this.messages.update(entries => [...entries.slice(-199), { ...message, mine, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
    setTimeout(() => { const element = this.history()?.nativeElement; if (element) element.scrollTop = element.scrollHeight; });
  }
}
