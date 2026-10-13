-- Tables owned by schema crd
-- Generated from BBDA-ERD data dictionary (document 04, section 5); see docs/decisions/database-assumptions.md

CREATE TABLE crd.post_donation_checkin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_profile_id uuid NOT NULL,
  donation_record_id uuid,
  scheduled_for timestamptz NOT NULL,
  response checkin_response,
  free_text text,
  callback_request_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);

CREATE TABLE crd.coordination_case (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_no text NOT NULL,
  request_id uuid NOT NULL,
  status case_status NOT NULL DEFAULT 'Open',
  owner_user_id uuid,
  priority priority NOT NULL DEFAULT 'Normal',
  area_id uuid,
  opened_at timestamptz,
  first_owner_action_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  follow_up_due_at timestamptz,
  follow_up_done_at timestamptz,
  is_overdue boolean NOT NULL DEFAULT false,
  disputed boolean NOT NULL DEFAULT false,
  escalation_level smallint NOT NULL DEFAULT 0,
  csat_score smallint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT uq_coordination_case_case_no UNIQUE (case_no),
  CONSTRAINT uq_coordination_case_request_id UNIQUE (request_id)
);

CREATE TABLE crd.case_donor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL,
  donor_profile_id uuid NOT NULL,
  invitation_id uuid NOT NULL,
  status case_donor_status NOT NULL DEFAULT 'Active',
  joined_at timestamptz,
  withdrawn_at timestamptz,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT uq_case_donor_invitation_id UNIQUE (invitation_id)
);

CREATE TABLE crd.case_task (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid,
  request_id uuid,
  account_recovery_request_id uuid,
  case_donor_id uuid,
  task_type case_task_type NOT NULL,
  status task_status NOT NULL DEFAULT 'Open',
  assignee_user_id uuid,
  completed_by uuid,
  due_at timestamptz,
  completed_at timestamptz,
  dedupe_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT uq_case_task_account_recovery_request_id UNIQUE (account_recovery_request_id)
);

CREATE TABLE crd.case_note (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL,
  author_user_id uuid NOT NULL,
  note_type note_type NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE crd.contact_attempt (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL,
  case_donor_id uuid,
  target_user_id uuid,
  facility_id uuid,
  target_party contact_party NOT NULL,
  channel contact_channel NOT NULL,
  result contact_result NOT NULL,
  attempted_by uuid NOT NULL,
  attempted_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE crd.appointment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL,
  case_donor_id uuid NOT NULL,
  facility_id uuid NOT NULL,
  appointment_slot_id uuid,
  previous_appointment_id uuid,
  scheduled_start timestamptz NOT NULL,
  status appointment_status NOT NULL DEFAULT 'Proposed',
  confirmed_by_donor_at timestamptz,
  checked_in_at timestamptz,
  attended_reported_at timestamptz,
  no_show_marked_at timestamptz,
  cancelled_at timestamptz,
  checkin_method checkin_method,
  reminders_stopped boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT uq_appointment_previous_appointment_id UNIQUE (previous_appointment_id)
);

CREATE TABLE crd.outcome_update (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL,
  request_id uuid NOT NULL,
  case_donor_id uuid,
  appointment_id uuid,
  outcome_type outcome_type NOT NULL,
  source_type outcome_source_type NOT NULL,
  confidence outcome_confidence NOT NULL,
  reported_by_name text,
  reported_by_role text,
  reported_by_user_id uuid,
  facility_id uuid,
  channel report_channel NOT NULL,
  reported_at timestamptz NOT NULL,
  recorded_by uuid,
  units_count smallint,
  reason_text text,
  supersedes_id uuid,
  is_disputed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_outcome_update_supersedes_id UNIQUE (supersedes_id)
);

CREATE TABLE crd.escalation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sla_policy_id uuid,
  subject_type escalation_subject NOT NULL,
  subject_id uuid NOT NULL,
  request_id uuid,
  case_id uuid,
  level smallint NOT NULL,
  reason escalation_reason NOT NULL,
  status escalation_status NOT NULL DEFAULT 'Open',
  escalated_to_user_id uuid,
  acknowledged_by uuid,
  dedupe_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT uq_escalation_dedupe_key UNIQUE (dedupe_key)
);

