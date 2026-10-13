-- Tables owned by schema ntf
-- Generated from BBDA-ERD data dictionary (document 04, section 5); see docs/decisions/database-assumptions.md

CREATE TABLE ntf.notification_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_code ntf_event_code NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  request_id uuid,
  case_id uuid,
  payload jsonb NOT NULL,
  source_outbox_event_id uuid,
  status ntf_event_status NOT NULL DEFAULT 'Pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_notification_event_source_outbox_event_id UNIQUE (source_outbox_event_id)
);

CREATE TABLE ntf.notification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_event_id uuid NOT NULL,
  recipient_user_id uuid NOT NULL,
  channel notification_channel NOT NULL,
  template_version_id uuid,
  language ui_language NOT NULL,
  request_id uuid,
  case_id uuid,
  invitation_id uuid,
  status notification_status NOT NULL DEFAULT 'Pending',
  suppression_reason suppression_reason,
  cancel_reason notification_cancel_reason,
  dedupe_key text NOT NULL,
  is_critical boolean NOT NULL DEFAULT false,
  fallback_of_id uuid,
  rendered_title text,
  rendered_body text,
  scheduled_for timestamptz NOT NULL,
  queued_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT uq_notification_dedupe_key UNIQUE (dedupe_key),
  CONSTRAINT uq_notification_fallback_of_id UNIQUE (fallback_of_id)
);

CREATE TABLE ntf.delivery_attempt (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL,
  attempt_no smallint NOT NULL,
  provider delivery_provider NOT NULL,
  provider_message_id text,
  result delivery_result,
  error_code text,
  requested_at timestamptz,
  result_at timestamptz,
  next_retry_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ntf.notification_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  event_code ntf_event_code NOT NULL,
  channel notification_channel NOT NULL,
  status active_status NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT uq_notification_template_code UNIQUE (code)
);

CREATE TABLE ntf.template_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL,
  version_no integer NOT NULL,
  language ui_language NOT NULL,
  title text,
  body text NOT NULL,
  variables text[] NOT NULL,
  status template_status NOT NULL DEFAULT 'Draft',
  created_by uuid,
  approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ntf.notification_rule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_code ntf_event_code NOT NULL,
  recipient_role role_code NOT NULL,
  channels notification_channel[] NOT NULL,
  sms_fallback_allowed boolean NOT NULL DEFAULT false,
  fallback_after_seconds jsonb,
  max_attempts smallint NOT NULL,
  retry_backoff_seconds integer[] NOT NULL,
  max_sms_per_request_per_day smallint NOT NULL,
  respects_quiet_hours boolean NOT NULL DEFAULT false,
  is_critical boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);

CREATE TABLE ntf.suppression (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  channel notification_channel,
  scope text,
  reason suppression_cause NOT NULL,
  active_from timestamptz,
  active_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ntf.bulk_send (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid,
  approved_by uuid,
  template_version_id uuid NOT NULL,
  audience_definition jsonb NOT NULL,
  estimated_recipients integer NOT NULL,
  status bulk_send_status NOT NULL DEFAULT 'Draft',
  notification_event_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT uq_bulk_send_notification_event_id UNIQUE (notification_event_id)
);

