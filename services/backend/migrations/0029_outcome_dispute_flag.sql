-- crd.outcome_update stays append-only except for the is_disputed flag
CREATE FUNCTION crd.guard_outcome_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'outcome_update is append-only';
  END IF;
  IF (to_jsonb(NEW) - 'is_disputed') IS DISTINCT FROM (to_jsonb(OLD) - 'is_disputed') THEN
    RAISE EXCEPTION 'outcome_update is append-only';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER outcome_update_append_only ON crd.outcome_update;
CREATE TRIGGER outcome_update_append_only BEFORE UPDATE OR DELETE ON crd.outcome_update FOR EACH ROW EXECUTE FUNCTION crd.guard_outcome_update();
