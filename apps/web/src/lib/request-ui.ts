import { ApiError } from './api';
import { hasMessage, type Locale, type MessageKey } from './messages';
import type { RequestView } from './public-data';

export const PATIENT_CANCELLABLE = ['Draft', 'Submitted', 'Under review', 'Needs information', 'Verified', 'Searching', 'Donor coordination'];
export const UPDATABLE = PATIENT_CANCELLABLE;
export const CANCEL_REASONS = ['NEED_MET_ELSEWHERE', 'NO_LONGER_REQUIRED', 'DUPLICATE', 'ENTERED_IN_ERROR', 'OTHER'] as const;
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
export const COMPONENTS = ['WHOLE_BLOOD', 'RED_CELLS', 'PLATELETS', 'PLASMA', 'OTHER_AS_STATED'] as const;
export const URGENCIES = ['Routine', 'Urgent', 'Critical'] as const;

export const facilityLabel = (name: RequestView['hospital'], locale: Locale): string | null =>
  name ? (locale === 'bn' && name.nameBn ? name.nameBn : name.nameEn) : null;

export const urgencyTone = (urgency: string) => (urgency === 'Critical' ? 'red' : urgency === 'Urgent' ? 'amb' : 'blu');

export const outcomeTone = (confidence: string | null | undefined) =>
  confidence === 'Service-confirmed' ? 'grn' : confidence === 'Self-reported' ? 'amb' : '';

export function errorKey(caught: unknown): MessageKey {
  const key = caught instanceof ApiError ? `error.${caught.code}` : '';
  return key && hasMessage(key) ? (key as MessageKey) : 'error.generic';
}

export const isUnauthenticated = (caught: unknown) => caught instanceof ApiError && caught.status === 401;

export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
