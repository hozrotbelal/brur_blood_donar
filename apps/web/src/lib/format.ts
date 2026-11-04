import { hasMessage, type Locale, type MessageKey } from './messages';

/**
 * Formats a date. Accepts a Date, a full ISO timestamp, or a plain YYYY-MM-DD date.
 * Returns a dash when the value cannot be read, instead of an "Invalid time value" error.
 */
export function fmtDate(value: string | Date | null | undefined, locale: Locale, withTime = false): string {
  if (!value) return '—';
  const parsed = value instanceof Date ? value : value.includes('T') ? new Date(value) : new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: withTime ? 'short' : undefined,
  }).format(parsed);
}

/** Returns the translated label for `prefix.value`, or the raw value when no label exists. */
export function labelFor(t: (key: MessageKey) => string, prefix: string, value: string | null | undefined): string {
  if (!value) return '—';
  const key = `${prefix}.${value}`;
  return hasMessage(key) ? t(key) : value;
}

export const toneOfStatus = (status: string): 'red' | 'amb' | 'blu' | 'grn' | '' => {
  if (['Rejected', 'Unable to fulfil', 'Expired', 'Withdrawn'].includes(status)) return 'red';
  if (['Needs information', 'Under review', 'Submitted', 'Draft', 'Queued'].includes(status)) return 'amb';
  if (['Fulfilled', 'Verified', 'Accepted', 'Available', 'Responded', 'Closed'].includes(status)) return 'grn';
  if (['Searching', 'Donor coordination', 'Sent', 'Viewed', 'Delivered', 'Scheduled'].includes(status)) return 'blu';
  return '';
};

export function fmtDayMonth(value: string | null | undefined, locale: Locale): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-GB', { day: 'numeric', month: 'short' }).format(parsed);
}
