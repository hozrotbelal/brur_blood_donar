-- Tables owned by schema src
-- Generated from BBDA-ERD data dictionary (document 04, section 5); see docs/decisions/database-assumptions.md

CREATE TABLE src.match_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  wave_no integer NOT NULL,
  status match_run_status NOT NULL DEFAULT 'Pending',
  trigger match_run_trigger NOT NULL,
  mode match_mode NOT NULL,
  radius_km numeric NOT NULL,
  wave_size integer NOT NULL,
  filters_version integer NOT NULL,
  group_rule_version integer NOT NULL,
  params_snapshot jsonb NOT NULL,
  candidates_evaluated integer NOT NULL DEFAULT 0,
  candidates_included integer NOT NULL DEFAULT 0,
  approved_by uuid,
  response_window_ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);

CREATE TABLE src.match_candidate (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_run_id uuid NOT NULL,
  donor_profile_id uuid NOT NULL,
  included boolean NOT NULL DEFAULT false,
  rank integer,
  score numeric,
  distance_km_approx numeric,
  reason_codes match_reason_code[] NOT NULL,
  deferred_until timestamptz,
  selected_for_invite boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE src.invitation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  donor_profile_id uuid NOT NULL,
  match_run_id uuid NOT NULL,
  match_candidate_id uuid NOT NULL,
  status invitation_status NOT NULL DEFAULT 'Queued',
  response invitation_response_value,
  queued_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  viewed_at timestamptz,
  responded_at timestamptz,
  expired_at timestamptz,
  cancelled_at timestamptz,
  withdrawn_at timestamptz,
  expires_at timestamptz NOT NULL,
  later_recheck_at timestamptz,
  reask_count smallint DEFAULT 0,
  cancel_reason invitation_cancel_reason,
  payload_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT uq_invitation_match_candidate_id UNIQUE (match_candidate_id)
);

CREATE TABLE src.invitation_response (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id uuid NOT NULL,
  response_value invitation_response_value,
  is_withdrawal boolean NOT NULL DEFAULT false,
  later_available_at timestamptz,
  withdrawal_reason withdrawal_reason,
  channel response_channel NOT NULL,
  recorded_by uuid,
  client_mutation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE src.outreach_group_rule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_set_version integer NOT NULL,
  requested_group blood_group NOT NULL,
  outreach_group blood_group NOT NULL,
  status rule_status NOT NULL,
  clinical_adviser_approval_ref text,
  approved_by uuid,
  effective_from date,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);

CREATE TABLE src.search_event (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid NOT NULL,
  actor_role role_code NOT NULL,
  search_type search_type NOT NULL,
  permission_used text NOT NULL,
  context_request_id uuid,
  reason_code text,
  reason_text text,
  filters jsonb NOT NULL,
  result_count integer NOT NULL,
  capped boolean NOT NULL DEFAULT false,
  exported boolean NOT NULL DEFAULT false,
  audit_event_id uuid NOT NULL,
  PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);

CREATE TABLE src.search_event_2026_10 PARTITION OF src.search_event FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE src.search_event_2026_11 PARTITION OF src.search_event FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE src.search_event_2026_12 PARTITION OF src.search_event FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');
CREATE TABLE src.search_event_2027_01 PARTITION OF src.search_event FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');
CREATE TABLE src.search_event_2027_02 PARTITION OF src.search_event FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');
CREATE TABLE src.search_event_2027_03 PARTITION OF src.search_event FOR VALUES FROM ('2027-03-01') TO ('2027-04-01');
CREATE TABLE src.search_event_2027_04 PARTITION OF src.search_event FOR VALUES FROM ('2027-04-01') TO ('2027-05-01');
CREATE TABLE src.search_event_2027_05 PARTITION OF src.search_event FOR VALUES FROM ('2027-05-01') TO ('2027-06-01');
CREATE TABLE src.search_event_2027_06 PARTITION OF src.search_event FOR VALUES FROM ('2027-06-01') TO ('2027-07-01');
CREATE TABLE src.search_event_2027_07 PARTITION OF src.search_event FOR VALUES FROM ('2027-07-01') TO ('2027-08-01');
CREATE TABLE src.search_event_2027_08 PARTITION OF src.search_event FOR VALUES FROM ('2027-08-01') TO ('2027-09-01');
CREATE TABLE src.search_event_2027_09 PARTITION OF src.search_event FOR VALUES FROM ('2027-09-01') TO ('2027-10-01');
CREATE TABLE src.search_event_2027_10 PARTITION OF src.search_event FOR VALUES FROM ('2027-10-01') TO ('2027-11-01');
CREATE TABLE src.search_event_2027_11 PARTITION OF src.search_event FOR VALUES FROM ('2027-11-01') TO ('2027-12-01');
CREATE TABLE src.search_event_2027_12 PARTITION OF src.search_event FOR VALUES FROM ('2027-12-01') TO ('2028-01-01');

