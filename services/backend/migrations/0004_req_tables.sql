-- Tables owned by schema req
-- Generated from BBDA-ERD data dictionary (document 04, section 5); see docs/decisions/database-assumptions.md

CREATE TABLE req.patient (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  year_of_birth smallint,
  hospital_patient_ref text,
  created_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  deleted_at timestamptz
);

CREATE TABLE req.representative_link (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  relationship patient_relationship NOT NULL,
  authorized boolean NOT NULL DEFAULT false,
  is_primary boolean NOT NULL DEFAULT false,
  status link_status NOT NULL,
  verified_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);

CREATE TABLE req.blood_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_no text,
  patient_id uuid NOT NULL,
  representative_link_id uuid NOT NULL,
  created_by_user_id uuid NOT NULL,
  contact_phone text,
  alt_contact_phone text,
  hospital_facility_id uuid,
  collection_facility_id uuid,
  area_id uuid,
  location geography(Point,4326),
  requested_blood_group blood_group NOT NULL,
  component blood_component NOT NULL,
  quantity_units smallint NOT NULL,
  required_by timestamptz NOT NULL,
  urgency urgency NOT NULL,
  special_instructions text,
  preferred_support_contact support_contact_method,
  status request_status NOT NULL DEFAULT 'Draft',
  is_terminal boolean GENERATED ALWAYS AS (status IN ('Closed','Rejected','Cancelled','Unable to fulfil')) STORED,
  priority priority NOT NULL DEFAULT 'Normal',
  outreach_paused boolean NOT NULL DEFAULT false,
  has_moderation_hold boolean NOT NULL DEFAULT false,
  assigned_support_user_id uuid,
  fulfilled_quantity_units smallint NOT NULL DEFAULT 0,
  search_wave_count integer NOT NULL DEFAULT 0,
  cancel_reason request_cancel_reason,
  submitted_at timestamptz,
  first_action_at timestamptz,
  verified_at timestamptz,
  first_invited_at timestamptz,
  first_willing_at timestamptz,
  donation_reported_at timestamptz,
  outcome_confirmed_at timestamptz,
  fulfilled_at timestamptz,
  closed_at timestamptz,
  client_mutation_id uuid,
  outreach_paused_reason text,
  outreach_paused_by uuid,
  outreach_paused_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  deleted_at timestamptz,
  CONSTRAINT uq_blood_request_reference_no UNIQUE (reference_no)
);

CREATE TABLE req.request_document (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  doc_type request_document_type NOT NULL,
  object_key text NOT NULL,
  sha256 text NOT NULL,
  uploaded_by uuid,
  reviewed_by uuid,
  status document_status NOT NULL,
  purge_after timestamptz,
  purged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);

CREATE TABLE req.request_change (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  change_type request_change_type NOT NULL,
  proposed_values jsonb NOT NULL,
  previous_values jsonb NOT NULL,
  is_material boolean NOT NULL DEFAULT false,
  status request_change_status NOT NULL,
  decided_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);

