import { StateMachine } from '../../platform/status/state-machine';

export const CASE_STATUSES = [
  'Open', 'Scheduling', 'Scheduled', 'Attendance pending', 'Outcome pending', 'Resolved', 'Closed', 'Needs replacement',
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const caseStateMachine = new StateMachine<CaseStatus>({
  Open: ['Scheduling', 'Needs replacement', 'Resolved'],
  Scheduling: ['Scheduled', 'Needs replacement', 'Resolved'],
  Scheduled: ['Scheduling', 'Attendance pending', 'Needs replacement', 'Resolved'],
  'Attendance pending': ['Outcome pending', 'Needs replacement', 'Resolved'],
  'Outcome pending': ['Resolved', 'Open'],
  Resolved: ['Closed'],
  Closed: [],
  'Needs replacement': ['Open', 'Resolved'],
});

export const APPOINTMENT_STATUSES = [
  'Proposed', 'Confirmed', 'Rescheduled', 'Checked-in', 'Attended (reported)', 'No-show', 'Cancelled',
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const appointmentStateMachine = new StateMachine<AppointmentStatus>({
  Proposed: ['Confirmed', 'Rescheduled', 'Cancelled'],
  Confirmed: ['Rescheduled', 'Checked-in', 'Attended (reported)', 'No-show', 'Cancelled'],
  Rescheduled: [],
  'Checked-in': ['Attended (reported)'],
  'Attended (reported)': [],
  'No-show': [],
  Cancelled: [],
});

export const LIVE_CASE_STATUSES: CaseStatus[] = ['Open', 'Scheduling', 'Scheduled', 'Attendance pending', 'Outcome pending', 'Needs replacement'];
