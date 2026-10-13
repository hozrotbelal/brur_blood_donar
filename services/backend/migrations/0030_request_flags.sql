CREATE TABLE req.request_flag (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES req.blood_request (id),
  flag_type text NOT NULL CHECK (flag_type IN ('DUPLICATE_ACTIVE', 'RAPID_SUBMISSION', 'SHARED_CONTACT')),
  matched_request_id uuid REFERENCES req.blood_request (id),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Dismissed', 'Confirmed')),
  resolved_by uuid REFERENCES idn.app_user (id),
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_request_flag_resolved CHECK ((status = 'Open') = (resolved_at IS NULL))
);
CREATE UNIQUE INDEX uq_request_flag_dedupe ON req.request_flag (request_id, flag_type, COALESCE(matched_request_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX ix_request_flag_open ON req.request_flag (request_id) WHERE status = 'Open';
