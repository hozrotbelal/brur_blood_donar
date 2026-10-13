-- Starter permission keys and the BASE set for PAT, limited to what the Request module uses so far.
-- The full catalogue (document 02 section 3.2) is still to be seeded and needs human review.

INSERT INTO idn.permission (key, resource, action, allowed_scopes, allowed_roles, description_en, description_bn) VALUES
  ('patient.view',   'patient',       'View',   '{Own}', '{PAT}', 'View patients you represent', 'আপনি যে রোগীদের প্রতিনিধিত্ব করেন তাদের দেখা'),
  ('patient.create', 'patient',       'Create', '{Own}', '{PAT}', 'Add a patient you represent', 'আপনি যে রোগীর প্রতিনিধিত্ব করেন তাকে যোগ করা'),
  ('blood_request.view',   'blood_request', 'View',   '{Own,Assigned,Area,All}', '{PAT,SUP,ADM}', 'View blood requests', 'রক্তের অনুরোধ দেখা'),
  ('blood_request.create', 'blood_request', 'Create', '{Own,Assigned,Area,All}', '{PAT,SUP,ADM}', 'Create a blood request', 'রক্তের অনুরোধ তৈরি করা'),
  ('blood_request.edit',   'blood_request', 'Edit',   '{Own,Assigned,Area,All}', '{PAT,SUP,ADM}', 'Edit and submit a blood request', 'রক্তের অনুরোধ সম্পাদনা ও জমা দেওয়া'),
  ('blood_request.cancel', 'blood_request', 'Edit',   '{Own,Assigned,Area,All}', '{PAT,SUP,ADM}', 'Cancel a blood request', 'রক্তের অনুরোধ বাতিল করা')
ON CONFLICT (key) DO NOTHING;

INSERT INTO idn.permission_set (code, name_en, name_bn, role_code, kind, is_system)
VALUES ('BASE_PAT', 'Patient or representative (base)', 'রোগী বা প্রতিনিধি (মূল)', 'PAT', 'BASE', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO idn.permission_set_item (permission_set_id, permission_id, scope)
SELECT s.id, p.id, 'Own'
  FROM idn.permission_set s
  JOIN idn.permission p ON p.key IN ('patient.view', 'patient.create', 'blood_request.view', 'blood_request.create', 'blood_request.edit', 'blood_request.cancel')
 WHERE s.code = 'BASE_PAT'
ON CONFLICT (permission_set_id, permission_id) DO NOTHING;
