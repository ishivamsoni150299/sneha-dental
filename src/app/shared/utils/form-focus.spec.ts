import { focusFirstInvalidControl } from './form-focus';

describe('Invalid form focus', () => {
  let form: HTMLFormElement;
  beforeEach(() => {
    form = document.createElement('form');
    document.body.appendChild(form);
  });
  afterEach(() => form.remove());

  it('skips hidden and disabled errors and focuses the first editable error', () => {
    form.innerHTML = '<input required hidden><input required disabled><input required readonly><input id="editable" class="ng-invalid"><input required>';
    focusFirstInvalidControl(form);
    expect(document.activeElement).toBe(form.querySelector('#editable'));
  });

  it('leaves focus alone when the form is valid or has been removed', () => {
    form.innerHTML = '<button type="submit">Save</button><input value="valid" required>';
    const button = form.querySelector('button')!;
    button.focus();
    focusFirstInvalidControl(form);
    expect(document.activeElement).toBe(button);
    form.remove();
    expect(() => focusFirstInvalidControl(form)).not.toThrow();
  });
});
