export function normalizeBdPhone(input: string): string | null {
  const digits = input.replace(/[\s\-()]/g, '');
  const match = /^(?:\+?880|0)?(1[3-9]\d{8})$/.exec(digits);
  return match ? `+880${match[1]}` : null;
}

export function maskPhone(e164: string): string {
  return `${e164.slice(0, 7)}XXXX${e164.slice(-2)}`;
}
