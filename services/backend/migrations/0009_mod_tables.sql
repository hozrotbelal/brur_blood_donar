-- Tables owned by schema mod
-- Generated from BBDA-ERD data dictionary (document 04, section 5); see docs/decisions/database-assumptions.md

CREATE TABLE mod.abuse_report (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type abuse_report_type NOT NULL,
  source report_source NOT NULL,
  reporter_user_id uuid,
  target_type moderation_target_type NOT NULL,
  target_id uuid NOT NULL,
  rule_code text,
  evidence jsonb,
  moderation_case_id uuid,
  status abuse_report_status NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE mod.moderation_case (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_no text NOT NULL,
  subject_type moderation_target_type NOT NULL,
  subject_id uuid NOT NULL,
  primary_report_type abuse_report_type NOT NULL,
  status moderation_case_status NOT NULL DEFAULT 'New',
  assigned_moderator_id uuid,
  outreach_paused_by_case boolean NOT NULL DEFAULT false,
  latest_action moderation_action_type,
  appeal_status appeal_state NOT NULL,
  is_false_positive boolean,
  opened_at timestamptz,
  decided_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT uq_moderation_case_case_no UNIQUE (case_no)
);

CREATE TABLE mod.moderation_action (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moderation_case_id uuid NOT NULL,
  action moderation_action_type NOT NULL,
  target_type moderation_target_type NOT NULL,
  target_id uuid NOT NULL,
  reason text NOT NULL,
  evidence_refs jsonb NOT NULL,
  reviewer_user_id uuid NOT NULL,
  effective_until timestamptz,
  appeal_status appeal_state NOT NULL,
  reverses_action_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_moderation_action_reverses_action_id UNIQUE (reverses_action_id)
);

CREATE TABLE mod.appeal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moderation_case_id uuid NOT NULL,
  moderation_action_id uuid NOT NULL,
  appellant_user_id uuid NOT NULL,
  grounds text NOT NULL,
  status appeal_status NOT NULL DEFAULT 'Submitted',
  reviewer_user_id uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);

