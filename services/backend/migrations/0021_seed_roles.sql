-- Reference data: the five fixed roles
-- Generated from BBDA-ERD data dictionary (document 04, section 5); see docs/decisions/database-assumptions.md


INSERT INTO idn.role (code, name_en, name_bn, is_staff) VALUES
  ('DON', 'Donor', 'রক্তদাতা', false),
  ('PAT', 'Patient or representative', 'রোগী বা প্রতিনিধি', false),
  ('SUP', 'Support', 'সহায়তা কর্মী', true),
  ('MOD', 'Moderator', 'মডারেটর', true),
  ('ADM', 'Administrator', 'প্রশাসক', true)
ON CONFLICT (code) DO NOTHING;
