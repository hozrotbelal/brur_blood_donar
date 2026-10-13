-- Tables owned by schema idn
-- Generated from BBDA-ERD data dictionary (document 04, section 5); see docs/decisions/database-assumptions.md

CREATE TABLE idn.app_user (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164 text NOT NULL,
  phone_verified_at timestamptz,
  display_name text,
  preferred_language ui_language NOT NULL DEFAULT 'bn',
  text_scale numeric(3,2) NOT NULL DEFAULT 1.00,
  account_status account_status NOT NULL DEFAULT 'Active',
  suspended_until timestamptz,
  is_staff boolean NOT NULL DEFAULT false,
  last_login_at timestamptz,
  anonymized_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  deleted_at timestamptz
);

CREATE TABLE idn.role (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code role_code NOT NULL,
  name_en text NOT NULL,
  name_bn text NOT NULL,
  is_staff boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_role_code UNIQUE (code)
);

CREATE TABLE idn.user_role (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role_id uuid NOT NULL,
  status user_role_status NOT NULL DEFAULT 'Active',
  assigned_by uuid,
  revoked_by uuid,
  assigned_at timestamptz NOT NULL,
  revoked_at timestamptz,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);

CREATE TABLE idn.permission_scope (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_role_id uuid NOT NULL,
  scope_code scope_code NOT NULL,
  area_id uuid,
  granted_by uuid NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE idn.device (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  install_id text NOT NULL,
  platform device_platform NOT NULL,
  device_model text NOT NULL,
  os_version text NOT NULL,
  app_version text NOT NULL,
  is_rooted boolean NOT NULL DEFAULT false,
  push_token text,
  is_trusted boolean NOT NULL DEFAULT false,
  biometric_enabled boolean NOT NULL DEFAULT false,
  staff_mfa_verified_at timestamptz,
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  sign_out_status device_sign_out_status NOT NULL DEFAULT 'Active',
  signed_out_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE idn.otp_challenge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164 text NOT NULL,
  user_id uuid,
  purpose otp_purpose NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts smallint NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  request_ip inet,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE idn.session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_id uuid NOT NULL,
  refresh_token_hash text NOT NULL,
  rotated_from_id uuid,
  active_role role_code NOT NULL,
  expires_at timestamptz NOT NULL,
  step_up_at timestamptz,
  revoked_at timestamptz,
  revoke_reason session_revoke_reason,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_session_refresh_token_hash UNIQUE (refresh_token_hash)
);

CREATE TABLE idn.credential (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  password_hash text NOT NULL,
  hash_algorithm hash_algorithm NOT NULL DEFAULT 'ARGON2ID',
  hash_params jsonb NOT NULL,
  password_set_at timestamptz NOT NULL,
  must_change boolean NOT NULL DEFAULT false,
  failed_attempts smallint NOT NULL DEFAULT 0,
  locked_until timestamptz,
  lock_count_24h smallint NOT NULL DEFAULT 0,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT uq_credential_user_id UNIQUE (user_id)
);

CREATE TABLE idn.password_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE idn.password_reset (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  otp_challenge_id uuid,
  reset_token_hash text,
  status password_reset_status NOT NULL DEFAULT 'Requested',
  requested_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  device_id uuid,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT uq_password_reset_otp_challenge_id UNIQUE (otp_challenge_id),
  CONSTRAINT uq_password_reset_reset_token_hash UNIQUE (reset_token_hash)
);

CREATE TABLE idn.account_recovery_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_no text NOT NULL,
  target_user_id uuid NOT NULL,
  requester_user_id uuid,
  claimed_old_phone text NOT NULL,
  new_phone text NOT NULL,
  status recovery_status NOT NULL DEFAULT 'Submitted',
  evidence jsonb,
  reviewer_id uuid,
  approver_id uuid,
  cooling_off_until timestamptz,
  cancelled_by_old_number boolean NOT NULL DEFAULT false,
  decided_at timestamptz,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT uq_account_recovery_request_reference_no UNIQUE (reference_no)
);

CREATE TABLE idn.staff_invitation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164 text NOT NULL,
  role_code role_code NOT NULL,
  invited_by uuid NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  status staff_invitation_status NOT NULL DEFAULT 'Pending',
  accepted_user_id uuid,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT uq_staff_invitation_token_hash UNIQUE (token_hash),
  CONSTRAINT uq_staff_invitation_accepted_user_id UNIQUE (accepted_user_id)
);

CREATE TABLE idn.login_event (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  phone_lookup_hash text NOT NULL,
  device_id uuid,
  session_id uuid,
  method login_method NOT NULL,
  result login_result NOT NULL,
  device_model text,
  os_name text,
  os_version text,
  app_version text,
  is_new_device boolean NOT NULL DEFAULT false,
  is_rooted boolean NOT NULL DEFAULT false,
  ip_hash text,
  network_region_area_id uuid,
  location_source login_location_source NOT NULL DEFAULT 'NOT_SHARED',
  location geography(Point,4326),
  location_accuracy_m integer,
  risk_flags login_risk_flag[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);

CREATE TABLE idn.login_event_2026_10 PARTITION OF idn.login_event FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE idn.login_event_2026_11 PARTITION OF idn.login_event FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE idn.login_event_2026_12 PARTITION OF idn.login_event FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');
CREATE TABLE idn.login_event_2027_01 PARTITION OF idn.login_event FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');
CREATE TABLE idn.login_event_2027_02 PARTITION OF idn.login_event FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');
CREATE TABLE idn.login_event_2027_03 PARTITION OF idn.login_event FOR VALUES FROM ('2027-03-01') TO ('2027-04-01');
CREATE TABLE idn.login_event_2027_04 PARTITION OF idn.login_event FOR VALUES FROM ('2027-04-01') TO ('2027-05-01');
CREATE TABLE idn.login_event_2027_05 PARTITION OF idn.login_event FOR VALUES FROM ('2027-05-01') TO ('2027-06-01');
CREATE TABLE idn.login_event_2027_06 PARTITION OF idn.login_event FOR VALUES FROM ('2027-06-01') TO ('2027-07-01');
CREATE TABLE idn.login_event_2027_07 PARTITION OF idn.login_event FOR VALUES FROM ('2027-07-01') TO ('2027-08-01');
CREATE TABLE idn.login_event_2027_08 PARTITION OF idn.login_event FOR VALUES FROM ('2027-08-01') TO ('2027-09-01');
CREATE TABLE idn.login_event_2027_09 PARTITION OF idn.login_event FOR VALUES FROM ('2027-09-01') TO ('2027-10-01');
CREATE TABLE idn.login_event_2027_10 PARTITION OF idn.login_event FOR VALUES FROM ('2027-10-01') TO ('2027-11-01');
CREATE TABLE idn.login_event_2027_11 PARTITION OF idn.login_event FOR VALUES FROM ('2027-11-01') TO ('2027-12-01');
CREATE TABLE idn.login_event_2027_12 PARTITION OF idn.login_event FOR VALUES FROM ('2027-12-01') TO ('2028-01-01');

CREATE TABLE idn.permission (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  resource text NOT NULL,
  action permission_action NOT NULL,
  allowed_scopes permission_scope_level[] NOT NULL,
  allowed_roles role_code[] NOT NULL,
  is_sensitive boolean NOT NULL DEFAULT false,
  requires_reason boolean NOT NULL DEFAULT false,
  requires_step_up boolean NOT NULL DEFAULT false,
  description_en text NOT NULL,
  description_bn text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_permission_key UNIQUE (key)
);

CREATE TABLE idn.permission_set (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name_en text NOT NULL,
  name_bn text NOT NULL,
  role_code role_code NOT NULL,
  kind permission_set_kind NOT NULL,
  tier_rank smallint,
  is_system boolean NOT NULL DEFAULT false,
  status active_status NOT NULL DEFAULT 'Active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT uq_permission_set_code UNIQUE (code)
);

CREATE TABLE idn.permission_set_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permission_set_id uuid NOT NULL,
  permission_id uuid NOT NULL,
  scope permission_scope_level NOT NULL,
  conditions jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE idn.user_permission_set (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  permission_set_id uuid NOT NULL,
  status grant_status NOT NULL DEFAULT 'Pending approval',
  granted_by uuid,
  approved_by uuid,
  reason text,
  effective_from timestamptz NOT NULL,
  expires_at timestamptz,
  revoked_by uuid,
  revoked_at timestamptz,
  revoke_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);

CREATE TABLE idn.sensitive_access_grant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grantee_user_id uuid NOT NULL,
  grantee_role role_code NOT NULL,
  permission_used text NOT NULL,
  field reveal_field NOT NULL,
  subject_user_id uuid NOT NULL,
  subject_donor_profile_id uuid,
  donor_location_id uuid,
  context_request_id uuid NOT NULL,
  scope_used permission_scope_level NOT NULL,
  basis reveal_basis NOT NULL,
  reason_code text NOT NULL,
  reason_text text,
  granted_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  status reveal_grant_status NOT NULL DEFAULT 'Active',
  ended_at timestamptz,
  ended_by uuid,
  audit_event_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE idn.consent_record (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  consent_type consent_type NOT NULL,
  granted boolean NOT NULL DEFAULT false,
  policy_version text NOT NULL,
  captured_at timestamptz NOT NULL,
  withdrawn_at timestamptz,
  capture_channel consent_capture_channel NOT NULL,
  language ui_language NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE idn.notification_preference (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  category notification_category NOT NULL,
  push_enabled boolean NOT NULL DEFAULT false,
  sms_enabled boolean NOT NULL DEFAULT false,
  inapp_enabled boolean NOT NULL DEFAULT false,
  quiet_start time,
  quiet_end time,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);

CREATE TABLE idn.data_subject_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  request_type dsr_type NOT NULL,
  status dsr_status NOT NULL,
  cooling_off_until timestamptz,
  blocking_reasons jsonb,
  handled_by uuid,
  export_object_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);

CREATE TABLE idn.donor_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  donor_code text NOT NULL,
  blood_group blood_group,
  blood_group_status blood_group_status NOT NULL DEFAULT 'Self-declared',
  blood_group_verified_by uuid,
  area_id uuid,
  approx_location geography(Point,4326),
  location_source location_source NOT NULL,
  travel_radius_km integer NOT NULL DEFAULT 10,
  last_donation_date date,
  provisional_next_contact_date date,
  next_contact_basis next_contact_basis NOT NULL,
  donor_status donor_status NOT NULL DEFAULT 'Active',
  invitations_90d integer NOT NULL DEFAULT 0,
  available_90d integer NOT NULL DEFAULT 0,
  last_invited_at timestamptz,
  last_response_at timestamptz,
  blood_group_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  deleted_at timestamptz,
  CONSTRAINT uq_donor_profile_user_id UNIQUE (user_id),
  CONSTRAINT uq_donor_profile_donor_code UNIQUE (donor_code)
);

CREATE TABLE idn.donor_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_profile_id uuid NOT NULL,
  routine_available boolean NOT NULL DEFAULT false,
  urgent_available boolean NOT NULL DEFAULT false,
  paused_until timestamptz,
  contact_start time NOT NULL,
  contact_end time NOT NULL,
  contact_days text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT uq_donor_availability_donor_profile_id UNIQUE (donor_profile_id)
);

CREATE TABLE idn.donation_record (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_profile_id uuid NOT NULL,
  donation_date date NOT NULL,
  facility_id uuid,
  source donation_source NOT NULL,
  verified boolean NOT NULL DEFAULT false,
  verification_status donation_verification_status NOT NULL,
  verified_by uuid,
  case_donor_id uuid,
  outcome_update_id uuid,
  evidence_document_id uuid,
  counts_for_next_contact boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT uq_donation_record_case_donor_id UNIQUE (case_donor_id)
);

CREATE TABLE idn.donor_restriction (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_profile_id uuid NOT NULL,
  reason_category restriction_category NOT NULL,
  until_date date,
  source restriction_source NOT NULL,
  recorded_by uuid,
  lifted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);

CREATE TABLE idn.donor_card (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_profile_id uuid NOT NULL,
  qr_token_hash text NOT NULL,
  status card_status NOT NULL,
  issued_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_donor_card_qr_token_hash UNIQUE (qr_token_hash)
);

CREATE TABLE idn.certificate (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_profile_id uuid NOT NULL,
  donation_record_id uuid NOT NULL,
  certificate_no text NOT NULL,
  language ui_language NOT NULL,
  object_key text NOT NULL,
  status certificate_status NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_certificate_donation_record_id UNIQUE (donation_record_id),
  CONSTRAINT uq_certificate_certificate_no UNIQUE (certificate_no)
);

CREATE TABLE idn.donor_document (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_profile_id uuid NOT NULL,
  doc_type donor_document_type NOT NULL,
  object_key text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  sha256 text NOT NULL,
  status document_status NOT NULL,
  reviewed_by uuid,
  purge_after timestamptz,
  purged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);

CREATE TABLE idn.donor_location (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_profile_id uuid NOT NULL,
  source donor_location_source NOT NULL,
  status donor_location_status NOT NULL DEFAULT 'Pending',
  exact_point geography(Point,4326) NOT NULL,
  approx_point geography(Point,4326) NOT NULL,
  grid_cell text NOT NULL,
  grid_size_m integer NOT NULL,
  area_id uuid,
  accuracy_m integer,
  recorded_by uuid,
  call_reference text,
  confirmed_by_donor_at timestamptz,
  approved_by uuid,
  validated_at timestamptz,
  approved_at timestamptz,
  superseded_at timestamptz,
  supersedes_id uuid,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT uq_donor_location_supersedes_id UNIQUE (supersedes_id)
);

CREATE TABLE idn.idempotency_key (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  key text NOT NULL,
  endpoint text NOT NULL,
  request_hash text NOT NULL,
  status idempotency_status NOT NULL DEFAULT 'In progress',
  response_code integer,
  response_body jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

