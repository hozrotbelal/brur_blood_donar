-- Sample data for development only. Replace with real values before go-live.
-- Run it with scripts/db-seed-sample.ps1. It can be run again safely.

INSERT INTO cfg.area (level, code, name_en, name_bn, centroid, is_active) VALUES
  ('DIVISION', 'SAMPLE-RANGPUR-DIVISION', 'Rangpur Division', 'রংপুর বিভাগ', ST_SetSRID(ST_MakePoint(89.2752, 25.7439), 4326)::geography, true),
  ('DISTRICT', 'SAMPLE-RANGPUR-DISTRICT', 'Rangpur District', 'রংপুর জেলা', ST_SetSRID(ST_MakePoint(89.2752, 25.7439), 4326)::geography, true),
  ('UPAZILA', 'SAMPLE-RANGPUR-SADAR', 'Rangpur Sadar', 'রংপুর সদর', ST_SetSRID(ST_MakePoint(89.2752, 25.7439), 4326)::geography, true)
ON CONFLICT (code) DO NOTHING;

UPDATE cfg.area c SET parent_id = p.id FROM cfg.area p
 WHERE c.code = 'SAMPLE-RANGPUR-DISTRICT' AND p.code = 'SAMPLE-RANGPUR-DIVISION' AND c.parent_id IS NULL;
UPDATE cfg.area c SET parent_id = p.id FROM cfg.area p
 WHERE c.code = 'SAMPLE-RANGPUR-SADAR' AND p.code = 'SAMPLE-RANGPUR-DISTRICT' AND c.parent_id IS NULL;

INSERT INTO apt.facility (facility_type, name_en, name_bn, area_id, location, status, is_verified)
SELECT 'HOSPITAL', '[SAMPLE] Rangpur Medical College Hospital', '[নমুনা] রংপুর মেডিকেল কলেজ হাসপাতাল', a.id,
       ST_SetSRID(ST_MakePoint(89.2517, 25.7466), 4326)::geography, 'Active', false
  FROM cfg.area a
 WHERE a.code = 'SAMPLE-RANGPUR-SADAR'
   AND NOT EXISTS (SELECT 1 FROM apt.facility f WHERE f.name_en = '[SAMPLE] Rangpur Medical College Hospital');

INSERT INTO apt.facility (facility_type, name_en, name_bn, area_id, location, status, is_verified)
SELECT 'COLLECTION_SERVICE', '[SAMPLE] Rangpur Blood Collection Service', '[নমুনা] রংপুর রক্ত সংগ্রহ সেবা', a.id,
       ST_SetSRID(ST_MakePoint(89.2650, 25.7500), 4326)::geography, 'Active', false
  FROM cfg.area a
 WHERE a.code = 'SAMPLE-RANGPUR-SADAR'
   AND NOT EXISTS (SELECT 1 FROM apt.facility f WHERE f.name_en = '[SAMPLE] Rangpur Blood Collection Service');

-- Placeholder targets, not agreed values
INSERT INTO cfg.sla_policy (code, applies_to, urgency, target_minutes, warn_at_percent, escalate_to_role) VALUES
  ('SAMPLE_FIRST_ACTION_CRITICAL', 'REQUEST_FIRST_ACTION', 'Critical', 15, 80, 'SUP'),
  ('SAMPLE_FIRST_ACTION_URGENT', 'REQUEST_FIRST_ACTION', 'Urgent', 30, 80, 'SUP'),
  ('SAMPLE_FIRST_ACTION_ROUTINE', 'REQUEST_FIRST_ACTION', 'Routine', 120, 80, 'SUP'),
  ('SAMPLE_VERIFICATION_CRITICAL', 'REQUEST_VERIFICATION', 'Critical', 30, 80, 'SUP'),
  ('SAMPLE_VERIFICATION_URGENT', 'REQUEST_VERIFICATION', 'Urgent', 60, 80, 'SUP'),
  ('SAMPLE_VERIFICATION_ROUTINE', 'REQUEST_VERIFICATION', 'Routine', 240, 80, 'SUP'),
  ('SAMPLE_WILLING_DONOR_CRITICAL', 'WILLING_DONOR', 'Critical', 60, 80, 'SUP'),
  ('SAMPLE_WILLING_DONOR_URGENT', 'WILLING_DONOR', 'Urgent', 180, 80, 'SUP'),
  ('SAMPLE_WILLING_DONOR_ROUTINE', 'WILLING_DONOR', 'Routine', 720, 80, 'SUP')
ON CONFLICT (code) DO NOTHING;
