-- Tables owned by schema sup
-- Generated from BBDA-ERD data dictionary (document 04, section 5); see docs/decisions/database-assumptions.md

CREATE TABLE sup.conversation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_type conversation_type NOT NULL,
  request_id uuid,
  case_id uuid,
  status conversation_status NOT NULL DEFAULT 'Open',
  assigned_user_id uuid,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);

CREATE TABLE sup.conversation_participant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  user_id uuid NOT NULL,
  participant_role role_code NOT NULL,
  left_at timestamptz,
  last_read_message_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sup.message (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  sender_user_id uuid,
  body text NOT NULL,
  message_template_id uuid,
  attachment_object_key text,
  client_message_id uuid NOT NULL,
  redacted_at timestamptz,
  redacted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sup.support_ticket (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_no text NOT NULL,
  opened_by_user_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  request_id uuid,
  case_id uuid,
  category ticket_category NOT NULL,
  status ticket_status NOT NULL DEFAULT 'New',
  priority priority NOT NULL,
  assignee_user_id uuid,
  first_response_due_at timestamptz,
  first_response_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  csat_score smallint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT uq_support_ticket_ticket_no UNIQUE (ticket_no),
  CONSTRAINT uq_support_ticket_conversation_id UNIQUE (conversation_id)
);

CREATE TABLE sup.callback_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by_user_id uuid NOT NULL,
  request_id uuid,
  case_id uuid,
  support_ticket_id uuid,
  case_task_id uuid,
  phone_to_call text NOT NULL,
  status callback_status NOT NULL DEFAULT 'Requested',
  scheduled_for timestamptz,
  assigned_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT uq_callback_request_case_task_id UNIQUE (case_task_id)
);

CREATE TABLE sup.message_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  language ui_language NOT NULL,
  body text NOT NULL,
  status active_status NOT NULL,
  approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);

