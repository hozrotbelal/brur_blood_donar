-- Tables owned by schema rpt
-- Generated from BBDA-ERD data dictionary (document 04, section 5); see docs/decisions/database-assumptions.md

CREATE TABLE rpt.report_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_code text NOT NULL,
  parameters jsonb NOT NULL,
  data jsonb NOT NULL,
  min_cell_size_applied integer NOT NULL,
  visibility_role role_code NOT NULL,
  job_run_id uuid,
  generated_by uuid,
  data_as_of timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rpt.kpi_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_date date NOT NULL,
  metric_key text NOT NULL,
  area_id uuid,
  blood_group blood_group,
  urgency urgency,
  channel text,
  category text,
  numerator numeric,
  denominator numeric,
  value_p50 numeric,
  value_p90 numeric,
  sample_count integer NOT NULL,
  is_suppressed boolean NOT NULL DEFAULT false,
  job_run_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

