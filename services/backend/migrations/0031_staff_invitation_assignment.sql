ALTER TABLE idn.staff_invitation
  ADD COLUMN permission_set_id uuid REFERENCES idn.permission_set (id),
  ADD COLUMN area_ids uuid[] NOT NULL DEFAULT '{}';
CREATE INDEX ix_staff_invitation_phone_pending ON idn.staff_invitation (phone_e164) WHERE status = 'Pending';

-- Administrators grant support and moderation tiers they do not hold themselves; the holds-every-permission rule stays for administrator tiers
CREATE OR REPLACE FUNCTION idn.check_grantor() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.granted_by IS NOT NULL
     AND (SELECT role_code FROM idn.permission_set WHERE id = NEW.permission_set_id) = 'ADM'
     AND EXISTS (
    SELECT 1 FROM idn.permission_set_item i JOIN idn.permission p ON p.id = i.permission_id
    WHERE i.permission_set_id = NEW.permission_set_id
      AND NOT EXISTS (SELECT 1 FROM idn.v_effective_permission e WHERE e.user_id = NEW.granted_by AND e.key = p.key AND e.scope >= i.scope))
  THEN RAISE EXCEPTION 'grantor does not hold every permission in the set';
  END IF;
  RETURN NEW;
END $$;
