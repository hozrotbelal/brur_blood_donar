-- Tables owned by schema aud
-- Generated from BBDA-ERD data dictionary (document 04, section 5); see docs/decisions/database-assumptions.md

CREATE TABLE aud.legal_hold (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type hold_entity_type NOT NULL,
  entity_id uuid NOT NULL,
  moderation_case_id uuid,
  reason text NOT NULL,
  placed_by uuid,
  released_by uuid,
  placed_at timestamptz,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE aud.audit_event (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  category audit_category NOT NULL,
  action audit_action NOT NULL,
  result audit_result NOT NULL,
  actor_user_id uuid,
  actor_role actor_role NOT NULL,
  permission_used text,
  entity_type text,
  entity_id uuid,
  subject_user_id uuid,
  context_request_id uuid,
  field_group text,
  reason_code text,
  reason_text text,
  changes jsonb,
  device_id uuid,
  session_id uuid,
  ip_hash text,
  network_region text,
  correlation_id text NOT NULL,
  chain_seq bigint NOT NULL,
  prev_hash bytea NOT NULL,
  hash bytea NOT NULL,
  PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);

CREATE TABLE aud.audit_event_2026_10 PARTITION OF aud.audit_event FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE aud.audit_event_2026_11 PARTITION OF aud.audit_event FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE aud.audit_event_2026_12 PARTITION OF aud.audit_event FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');
CREATE TABLE aud.audit_event_2027_01 PARTITION OF aud.audit_event FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');
CREATE TABLE aud.audit_event_2027_02 PARTITION OF aud.audit_event FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');
CREATE TABLE aud.audit_event_2027_03 PARTITION OF aud.audit_event FOR VALUES FROM ('2027-03-01') TO ('2027-04-01');
CREATE TABLE aud.audit_event_2027_04 PARTITION OF aud.audit_event FOR VALUES FROM ('2027-04-01') TO ('2027-05-01');
CREATE TABLE aud.audit_event_2027_05 PARTITION OF aud.audit_event FOR VALUES FROM ('2027-05-01') TO ('2027-06-01');
CREATE TABLE aud.audit_event_2027_06 PARTITION OF aud.audit_event FOR VALUES FROM ('2027-06-01') TO ('2027-07-01');
CREATE TABLE aud.audit_event_2027_07 PARTITION OF aud.audit_event FOR VALUES FROM ('2027-07-01') TO ('2027-08-01');
CREATE TABLE aud.audit_event_2027_08 PARTITION OF aud.audit_event FOR VALUES FROM ('2027-08-01') TO ('2027-09-01');
CREATE TABLE aud.audit_event_2027_09 PARTITION OF aud.audit_event FOR VALUES FROM ('2027-09-01') TO ('2027-10-01');
CREATE TABLE aud.audit_event_2027_10 PARTITION OF aud.audit_event FOR VALUES FROM ('2027-10-01') TO ('2027-11-01');
CREATE TABLE aud.audit_event_2027_11 PARTITION OF aud.audit_event FOR VALUES FROM ('2027-11-01') TO ('2027-12-01');
CREATE TABLE aud.audit_event_2027_12 PARTITION OF aud.audit_event FOR VALUES FROM ('2027-12-01') TO ('2028-01-01');

CREATE TABLE aud.status_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  entity_type history_entity_type NOT NULL,
  entity_id uuid NOT NULL,
  context_request_id uuid,
  from_status text,
  to_status text NOT NULL,
  actor_user_id uuid,
  actor_role actor_role NOT NULL,
  source status_source NOT NULL,
  reason_code text,
  reason text,
  correlation_id text NOT NULL,
  details jsonb,
  PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);

CREATE TABLE aud.status_history_2026_10 PARTITION OF aud.status_history FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE aud.status_history_2026_11 PARTITION OF aud.status_history FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE aud.status_history_2026_12 PARTITION OF aud.status_history FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');
CREATE TABLE aud.status_history_2027_01 PARTITION OF aud.status_history FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');
CREATE TABLE aud.status_history_2027_02 PARTITION OF aud.status_history FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');
CREATE TABLE aud.status_history_2027_03 PARTITION OF aud.status_history FOR VALUES FROM ('2027-03-01') TO ('2027-04-01');
CREATE TABLE aud.status_history_2027_04 PARTITION OF aud.status_history FOR VALUES FROM ('2027-04-01') TO ('2027-05-01');
CREATE TABLE aud.status_history_2027_05 PARTITION OF aud.status_history FOR VALUES FROM ('2027-05-01') TO ('2027-06-01');
CREATE TABLE aud.status_history_2027_06 PARTITION OF aud.status_history FOR VALUES FROM ('2027-06-01') TO ('2027-07-01');
CREATE TABLE aud.status_history_2027_07 PARTITION OF aud.status_history FOR VALUES FROM ('2027-07-01') TO ('2027-08-01');
CREATE TABLE aud.status_history_2027_08 PARTITION OF aud.status_history FOR VALUES FROM ('2027-08-01') TO ('2027-09-01');
CREATE TABLE aud.status_history_2027_09 PARTITION OF aud.status_history FOR VALUES FROM ('2027-09-01') TO ('2027-10-01');
CREATE TABLE aud.status_history_2027_10 PARTITION OF aud.status_history FOR VALUES FROM ('2027-10-01') TO ('2027-11-01');
CREATE TABLE aud.status_history_2027_11 PARTITION OF aud.status_history FOR VALUES FROM ('2027-11-01') TO ('2027-12-01');
CREATE TABLE aud.status_history_2027_12 PARTITION OF aud.status_history FOR VALUES FROM ('2027-12-01') TO ('2028-01-01');

CREATE TABLE aud.data_export (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  export_type export_type NOT NULL,
  requested_by uuid NOT NULL,
  step_up_at timestamptz NOT NULL,
  approved_by uuid,
  reason text NOT NULL,
  decision_reason text,
  filters jsonb NOT NULL,
  search_event_id uuid,
  row_count integer,
  phones_masked boolean NOT NULL DEFAULT false,
  object_key text,
  file_hash text,
  status data_export_status NOT NULL DEFAULT 'Requested',
  requested_at timestamptz,
  decided_at timestamptz,
  generated_at timestamptz,
  downloaded_at timestamptz,
  expires_at timestamptz,
  file_deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);

