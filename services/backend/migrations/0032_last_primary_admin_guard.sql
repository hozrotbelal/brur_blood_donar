-- The system must always keep at least one active Primary Administrator
CREATE FUNCTION idn.guard_last_primary_admin() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE primary_id uuid;
BEGIN
  SELECT id INTO primary_id FROM idn.permission_set WHERE code = 'TIER_PRIMARY_ADMINISTRATOR';
  IF OLD.permission_set_id = primary_id AND OLD.status = 'Active'
     AND (NEW.status <> 'Active' OR (NEW.expires_at IS NOT NULL AND NEW.expires_at <= now()))
     AND NOT EXISTS (
       SELECT 1 FROM idn.user_permission_set u
        WHERE u.permission_set_id = primary_id AND u.status = 'Active' AND u.id <> OLD.id
          AND u.effective_from <= now() AND (u.expires_at IS NULL OR u.expires_at > now()))
  THEN RAISE EXCEPTION 'the last active Primary Administrator cannot be removed';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER user_permission_set_last_primary_admin BEFORE UPDATE ON idn.user_permission_set FOR EACH ROW EXECUTE FUNCTION idn.guard_last_primary_admin();
