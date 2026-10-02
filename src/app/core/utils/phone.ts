export function phoneDigits(phone: string): string {
  const value = phone.trim();
  const digits = value.replace(/\D/g, '');
  if (value.startsWith('+')) return digits;
  if (value.startsWith('00')) return digits.slice(2);
  return digits.length === 10 ? `91${digits}` : digits;
}

export function phoneHref(phone: string): string {
  const digits = phoneDigits(phone);
  return digits ? `tel:+${digits}` : '';
}