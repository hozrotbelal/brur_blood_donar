-- Tables owned by schema apt
-- Generated from BBDA-ERD data dictionary (document 04, section 5); see docs/decisions/database-assumptions.md

CREATE TABLE apt.facility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_type facility_type NOT NULL,
  name_en text NOT NULL,
  name_bn text,
  area_id uuid NOT NULL,
  location geography(Point,4326),
  contact_phone text,
  supports_booking boolean NOT NULL DEFAULT false,
  supports_qr_checkin boolean NOT NULL DEFAULT false,
  is_verified boolean NOT NULL DEFAULT false,
  status active_status NOT NULL,
  managed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);

CREATE TABLE apt.campaign (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_en text NOT NULL,
  title_bn text NOT NULL,
  facility_id uuid,
  area_id uuid NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status campaign_status NOT NULL DEFAULT 'Draft',
  organizer_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);

CREATE TABLE apt.campaign_follow (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  user_id uuid NOT NULL,
  unfollowed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE apt.appointment_slot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL,
  campaign_id uuid,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  capacity integer NOT NULL,
  booked_count integer NOT NULL DEFAULT 0,
  status slot_status NOT NULL DEFAULT 'Open',
  source slot_source NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);

