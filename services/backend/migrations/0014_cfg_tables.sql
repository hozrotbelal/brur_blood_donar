-- Tables owned by schema cfg
-- Generated from BBDA-ERD data dictionary (document 04, section 5); see docs/decisions/database-assumptions.md

CREATE TABLE cfg.area (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid,
  level area_level NOT NULL,
  code text NOT NULL,
  name_en text NOT NULL,
  name_bn text NOT NULL,
  centroid geography,
  boundary geography,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_area_code UNIQUE (code)
);

CREATE TABLE cfg.config_setting (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  value jsonb NOT NULL,
  scope_type config_scope,
  scope_ref text,
  version integer NOT NULL DEFAULT 1,
  status config_status NOT NULL DEFAULT 'Draft',
  changed_by uuid,
  approved_by uuid,
  change_reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cfg.sla_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  applies_to sla_subject NOT NULL,
  urgency urgency,
  priority priority,
  target_minutes integer NOT NULL,
  warn_at_percent smallint NOT NULL,
  escalate_to_role role_code NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT uq_sla_policy_code UNIQUE (code)
);

