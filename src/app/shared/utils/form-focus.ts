/** Bring validation failures into view without moving focus after a successful submit. */
export function focusFirstInvalidControl(form: HTMLFormElement): void {
  if (!form.isConnected) return;
  const controls = form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
    'input.ng-invalid, select.ng-invalid, textarea.ng-invalid, input:invalid, select:invalid, textarea:invalid',
  );
  for (const control of controls) {
    if (control.matches(':disabled, [readonly], [type="hidden"]') || !control.getClientRects().length) continue;
    control.focus();
    return;
  }
}
