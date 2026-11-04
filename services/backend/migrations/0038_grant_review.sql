-- Expand only: monthly access review decisions on a grant (FR-CFG-028). A kept grant records who reviewed it and when; a revoked grant uses the existing revoke columns.
ALTER TABLE idn.user_permission_set ADD COLUMN IF NOT EXISTS last_reviewed_at timestamptz;
ALTER TABLE idn.user_permission_set ADD COLUMN IF NOT EXISTS last_reviewed_by uuid REFERENCES idn.app_user (id);
