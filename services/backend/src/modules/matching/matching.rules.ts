export type Urgency = 'Routine' | 'Urgent' | 'Critical';

export interface SearchParams {
  urgency: Urgency;
  radiusKm: number;
  waveSize: number;
  requireVerifiedGroup: boolean;
  maxInvitesPer24h: number;
  maxInvitesPer30d: number;
  criticalBypassContactHours: boolean;
  now: Date;
}

export interface DonorFacts {
  donorProfileId: string;
  bloodGroupStatus: string;
  donorStatus: string;
  accountStatus: string;
  nextContactDate: string | null;
  travelRadiusKm: number;
  distanceKm: number | null;
  routineAvailable: boolean;
  urgentAvailable: boolean;
  pausedUntil: Date | null;
  contactStart: string;
  contactEnd: string;
  contactDays: string[];
  hasUrgentConsent: boolean;
  hasRoutineConsent: boolean;
  hasChannel: boolean;
  restricted: boolean;
  activeCommitment: boolean;
  invites24h: number;
  invites30d: number;
  invitedForRequest: boolean;
  isRequester: boolean;
  lastAvailableAt: Date | null;
}

export type ExclusionCode =
  | 'EX_NO_CONSENT' | 'EX_CHANNEL_NOT_PERMITTED' | 'EX_BLOOD_GROUP_UNVERIFIED' | 'EX_INTERVAL_NOT_REACHED'
  | 'EX_RESTRICTION_RECORDED' | 'EX_AVAILABILITY_OFF' | 'EX_OUTSIDE_TRAVEL_RADIUS' | 'EX_ACTIVE_COMMITMENT'
  | 'EX_RECENTLY_INVITED' | 'EX_CONTACT_LIMIT' | 'EX_ACCOUNT_SUSPENDED' | 'EX_SAME_PERSON_AS_PATIENT';

export interface Evaluation {
  included: boolean;
  reasons: string[];
  deferredUntil: Date | null;
}

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const DHAKA_OFFSET_MS = 6 * 3_600_000;
const BANDS_KM = [5, 10, 20, 40];

export const REASON_LABELS: Record<string, string> = {
  EX_NO_CONSENT: 'Has not agreed to invitations of this urgency',
  EX_CHANNEL_NOT_PERMITTED: 'Has not allowed any way to be contacted',
  EX_BLOOD_GROUP_MISMATCH: 'Blood group does not match the request as stated',
  EX_BLOOD_GROUP_UNVERIFIED: 'Blood group is self-declared and this urgency needs it checked',
  EX_INTERVAL_NOT_REACHED: 'Next contact date has not been reached',
  EX_RESTRICTION_RECORDED: 'A temporary restriction is recorded',
  EX_AVAILABILITY_OFF: 'Marked as not available',
  EX_OUTSIDE_TRAVEL_RADIUS: 'Too far away, or no usable location',
  EX_ACTIVE_COMMITMENT: 'Already helping with another request',
  EX_RECENTLY_INVITED: 'Invited recently',
  EX_CONTACT_LIMIT: 'Reached the limit on invitations in 30 days',
  EX_ACCOUNT_SUSPENDED: 'Account is not active',
  EX_SAME_PERSON_AS_PATIENT: 'Is the requester or linked to the patient',
  DF_OUTSIDE_CONTACT_HOURS: 'Outside preferred contact hours; invitation will wait',
  RK_DISTANCE_BAND: 'Ranked by distance band',
};

export const radiusSteps = (steps: number[], waveNo: number): number => steps[Math.min(waveNo, steps.length) - 1];

export function responseWindowMinutes(urgency: Urgency): number {
  return urgency === 'Critical' ? 30 : urgency === 'Urgent' ? 120 : 720;
}

export function distanceBand(km: number | null): number {
  if (km === null) return BANDS_KM.length;
  const i = BANDS_KM.findIndex((b) => km <= b);
  return i === -1 ? BANDS_KM.length : i;
}

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

function insideWindow(minutes: number, start: string, end: string): boolean {
  return minutes >= toMinutes(start) && minutes < toMinutes(end);
}

export function nextWindowOpen(now: Date, start: string, end: string, days: string[]): Date | null {
  const local = new Date(now.getTime() + DHAKA_OFFSET_MS);
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  for (let d = 0; d <= 7; d++) {
    const day = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + d));
    if (!days.includes(DAYS[day.getUTCDay()])) continue;
    if (d === 0 && insideWindow(minutes, start, end)) return now;
    const opens = day.getTime() + toMinutes(start) * 60_000 - DHAKA_OFFSET_MS;
    if (opens > now.getTime()) return new Date(opens);
  }
  return null;
}

export function evaluateDonor(f: DonorFacts, p: SearchParams): Evaluation {
  const reasons: ExclusionCode[] = [];
  const urgent = p.urgency !== 'Routine';

  if (f.accountStatus !== 'Active' || f.donorStatus === 'Suspended') reasons.push('EX_ACCOUNT_SUSPENDED');
  if (f.isRequester) reasons.push('EX_SAME_PERSON_AS_PATIENT');
  if (!(urgent ? f.hasUrgentConsent : f.hasRoutineConsent)) reasons.push('EX_NO_CONSENT');
  else if (!f.hasChannel) reasons.push('EX_CHANNEL_NOT_PERMITTED');
  if (p.requireVerifiedGroup && f.bloodGroupStatus === 'Self-declared') reasons.push('EX_BLOOD_GROUP_UNVERIFIED');
  if (f.nextContactDate && f.nextContactDate > p.now.toISOString().slice(0, 10)) reasons.push('EX_INTERVAL_NOT_REACHED');
  if (f.restricted) reasons.push('EX_RESTRICTION_RECORDED');
  const available = urgent ? f.urgentAvailable : f.routineAvailable;
  if (!available || f.donorStatus !== 'Active' || (f.pausedUntil && f.pausedUntil.getTime() > p.now.getTime())) {
    if (f.donorStatus !== 'Suspended') reasons.push('EX_AVAILABILITY_OFF');
  }
  if (f.distanceKm === null || f.distanceKm > Math.min(f.travelRadiusKm, p.radiusKm)) reasons.push('EX_OUTSIDE_TRAVEL_RADIUS');
  if (f.activeCommitment) reasons.push('EX_ACTIVE_COMMITMENT');
  if (f.invitedForRequest || f.invites24h >= p.maxInvitesPer24h) reasons.push('EX_RECENTLY_INVITED');
  if (f.invites30d >= p.maxInvitesPer30d) reasons.push('EX_CONTACT_LIMIT');

  if (reasons.length > 0) return { included: false, reasons, deferredUntil: null };

  const bypass = p.urgency === 'Critical' && p.criticalBypassContactHours && f.hasUrgentConsent;
  const open = bypass ? p.now : nextWindowOpen(p.now, f.contactStart, f.contactEnd, f.contactDays);
  if (open && open.getTime() > p.now.getTime()) return { included: true, reasons: ['DF_OUTSIDE_CONTACT_HOURS'], deferredUntil: open };
  return { included: true, reasons: [], deferredUntil: null };
}

export function compareCandidates(
  a: { facts: DonorFacts },
  b: { facts: DonorFacts },
): number {
  const band = distanceBand(a.facts.distanceKm) - distanceBand(b.facts.distanceKm);
  if (band !== 0) return band;
  const at = a.facts.lastAvailableAt?.getTime() ?? 0;
  const bt = b.facts.lastAvailableAt?.getTime() ?? 0;
  if (at !== bt) return bt - at;
  return a.facts.invites30d - b.facts.invites30d;
}
