-- Tables owned by schema platform
-- Generated from BBDA-ERD data dictionary (document 04, section 5); see docs/decisions/database-assumptions.md

CREATE TABLE platform.outbox_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  dedupe_key text NOT NULL,
  status outbox_status NOT NULL DEFAULT 'Pending',
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_outbox_event_dedupe_key UNIQUE (dedupe_key)
);

CREATE TABLE platform.job_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type job_type NOT NULL,
  job_key text NOT NULL,
  scheduled_for timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  status job_status NOT NULL DEFAULT 'Scheduled',
  attempts smallint,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_job_run_job_key UNIQUE (job_key)
);

