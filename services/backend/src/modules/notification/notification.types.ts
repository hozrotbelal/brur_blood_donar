export type Channel = 'IN_APP' | 'PUSH' | 'SMS';
export type Lang = 'bn' | 'en';
export type NotificationRole = 'DON' | 'PAT' | 'SUP' | 'MOD' | 'ADM';
export type Vars = Record<string, string | number>;

export interface Recipient {
  userId: string;
  role: NotificationRole;
}

export interface EnqueueInput {
  eventCode: string;
  aggregateType: string;
  aggregateId: string;
  dedupeBase: string;
  recipients: Recipient[];
  vars: Vars | ((lang: Lang) => Vars);
  sourceOutboxEventId?: string;
  requestId?: string;
  caseId?: string;
  invitationId?: string;
  urgency?: string;
  scheduledFor?: Date;
}

export interface NotificationRow {
  id: string;
  notification_event_id: string;
  recipient_user_id: string;
  channel: Channel;
  language: Lang;
  request_id: string | null;
  case_id: string | null;
  invitation_id: string | null;
  status: string;
  is_critical: boolean;
  rendered_title: string | null;
  rendered_body: string | null;
  event_code: string;
  role: NotificationRole;
  attempts: number;
  scheduled_for: Date;
}

export const CATEGORY_BY_EVENT: Record<string, string> = {
  'NTF-EV-04': 'INVITATIONS',
  'NTF-EV-11': 'REMINDERS',
  'NTF-EV-14': 'REMINDERS',
  'NTF-EV-18': 'SYSTEM',
};

export const categoryOf = (eventCode: string) => CATEGORY_BY_EVENT[eventCode] ?? 'REQUEST_UPDATES';
