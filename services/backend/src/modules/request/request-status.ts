import { StateMachine } from '../../platform/status/state-machine';

export const REQUEST_STATUSES = [
  'Draft', 'Submitted', 'Under review', 'Needs information', 'Verified', 'Searching',
  'Donor coordination', 'Awaiting outcome', 'Partially fulfilled', 'Fulfilled', 'Closed',
  'Rejected', 'Cancelled', 'Unable to fulfil',
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export type RequestCommand =
  | 'submit' | 'pick_up' | 'request_information' | 'supply_information' | 'verify' | 'reject'
  | 'start_search' | 'first_available_response' | 'withdrawal_or_no_show' | 'attendance_reported'
  | 'record_partial_outcome' | 'record_full_outcome' | 'more_donors_needed' | 'close'
  | 'declare_unable' | 'cancel';
export type TransitionActor = 'PAT' | 'SUP' | 'MOD' | 'SYSTEM';

export interface RequestTransition {
  from: RequestStatus;
  to: RequestStatus;
  command: RequestCommand;
  actors: readonly TransitionActor[];
}

const CANCELLABLE: RequestStatus[] = [
  'Draft', 'Submitted', 'Under review', 'Needs information', 'Verified', 'Searching', 'Donor coordination',
];

export const REQUEST_TRANSITIONS: readonly RequestTransition[] = [
  { from: 'Draft', to: 'Submitted', command: 'submit', actors: ['PAT'] },
  { from: 'Submitted', to: 'Under review', command: 'pick_up', actors: ['SUP', 'SYSTEM'] },
  { from: 'Under review', to: 'Needs information', command: 'request_information', actors: ['SUP'] },
  { from: 'Needs information', to: 'Under review', command: 'supply_information', actors: ['PAT'] },
  { from: 'Under review', to: 'Verified', command: 'verify', actors: ['SUP'] },
  { from: 'Under review', to: 'Rejected', command: 'reject', actors: ['SUP', 'MOD'] },
  { from: 'Needs information', to: 'Rejected', command: 'reject', actors: ['SUP', 'MOD'] },
  { from: 'Verified', to: 'Searching', command: 'start_search', actors: ['SYSTEM'] },
  { from: 'Searching', to: 'Donor coordination', command: 'first_available_response', actors: ['SYSTEM'] },
  { from: 'Donor coordination', to: 'Searching', command: 'withdrawal_or_no_show', actors: ['SYSTEM', 'SUP'] },
  { from: 'Donor coordination', to: 'Awaiting outcome', command: 'attendance_reported', actors: ['SYSTEM', 'SUP'] },
  { from: 'Awaiting outcome', to: 'Partially fulfilled', command: 'record_partial_outcome', actors: ['SUP'] },
  { from: 'Awaiting outcome', to: 'Fulfilled', command: 'record_full_outcome', actors: ['SUP'] },
  { from: 'Partially fulfilled', to: 'Searching', command: 'more_donors_needed', actors: ['SUP'] },
  { from: 'Partially fulfilled', to: 'Closed', command: 'close', actors: ['SUP'] },
  { from: 'Fulfilled', to: 'Closed', command: 'close', actors: ['SUP'] },
  { from: 'Searching', to: 'Unable to fulfil', command: 'declare_unable', actors: ['SUP'] },
  { from: 'Donor coordination', to: 'Unable to fulfil', command: 'declare_unable', actors: ['SUP'] },
  { from: 'Partially fulfilled', to: 'Unable to fulfil', command: 'declare_unable', actors: ['SUP'] },
  ...CANCELLABLE.map((from): RequestTransition => ({ from, to: 'Cancelled', command: 'cancel', actors: ['PAT', 'SUP'] })),
];

const table = Object.fromEntries(REQUEST_STATUSES.map((s) => [s, [] as RequestStatus[]])) as Record<
  RequestStatus,
  RequestStatus[]
>;
for (const t of REQUEST_TRANSITIONS) table[t.from].push(t.to);

export const requestStateMachine = new StateMachine<RequestStatus>(table);

export type OutcomeSource =
  | 'DONOR_SELF_REPORT' | 'REPRESENTATIVE_REPORT' | 'SUPPORT_OBSERVATION'
  | 'COLLECTION_SERVICE_CONFIRMATION' | 'HOSPITAL_CONFIRMATION' | 'PARTNER_INTEGRATION';

export function findTransition(from: RequestStatus, command: RequestCommand): RequestTransition | undefined {
  return REQUEST_TRANSITIONS.find((t) => t.from === from && t.command === command);
}

export function canActorRun(transition: RequestTransition, actor: TransitionActor, from: RequestStatus): boolean {
  if (!transition.actors.includes(actor)) return false;
  if (transition.command === 'cancel' && actor === 'PAT') return from !== 'Awaiting outcome';
  return true;
}

export function isFulfilmentEvidence(sources: readonly OutcomeSource[]): boolean {
  return sources.some((s) => s !== 'DONOR_SELF_REPORT');
}
