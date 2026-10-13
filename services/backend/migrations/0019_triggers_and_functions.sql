-- Append-only guards, status label validation, permission guards and partition helper
-- Generated from BBDA-ERD data dictionary (document 04, section 5); see docs/decisions/database-assumptions.md


CREATE FUNCTION platform.reject_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME; END $$;
CREATE TRIGGER audit_event_append_only BEFORE UPDATE OR DELETE ON aud.audit_event FOR EACH ROW EXECUTE FUNCTION platform.reject_change();
CREATE TRIGGER status_history_append_only BEFORE UPDATE OR DELETE ON aud.status_history FOR EACH ROW EXECUTE FUNCTION platform.reject_change();
CREATE TRIGGER login_event_append_only BEFORE UPDATE OR DELETE ON idn.login_event FOR EACH ROW EXECUTE FUNCTION platform.reject_change();
CREATE TRIGGER outcome_update_append_only BEFORE UPDATE OR DELETE ON crd.outcome_update FOR EACH ROW EXECUTE FUNCTION platform.reject_change();
CREATE TRIGGER case_note_append_only BEFORE UPDATE OR DELETE ON crd.case_note FOR EACH ROW EXECUTE FUNCTION platform.reject_change();
CREATE TRIGGER moderation_action_append_only BEFORE UPDATE OR DELETE ON mod.moderation_action FOR EACH ROW EXECUTE FUNCTION platform.reject_change();
CREATE TRIGGER invitation_response_append_only BEFORE UPDATE OR DELETE ON src.invitation_response FOR EACH ROW EXECUTE FUNCTION platform.reject_change();
CREATE TRIGGER contact_attempt_append_only BEFORE UPDATE OR DELETE ON crd.contact_attempt FOR EACH ROW EXECUTE FUNCTION platform.reject_change();
CREATE TRIGGER password_history_append_only BEFORE UPDATE OR DELETE ON idn.password_history FOR EACH ROW EXECUTE FUNCTION platform.reject_change();

CREATE FUNCTION aud.check_status_label() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  CASE NEW.entity_type
    WHEN 'BLOOD_REQUEST' THEN PERFORM NEW.to_status::request_status, NEW.from_status::request_status;
    WHEN 'INVITATION' THEN PERFORM NEW.to_status::invitation_status, NEW.from_status::invitation_status;
    WHEN 'MATCH_RUN' THEN PERFORM NEW.to_status::match_run_status, NEW.from_status::match_run_status;
    WHEN 'COORDINATION_CASE' THEN PERFORM NEW.to_status::case_status, NEW.from_status::case_status;
    WHEN 'CASE_TASK' THEN PERFORM NEW.to_status::task_status, NEW.from_status::task_status;
    WHEN 'APPOINTMENT' THEN PERFORM NEW.to_status::appointment_status, NEW.from_status::appointment_status;
    WHEN 'NOTIFICATION' THEN PERFORM NEW.to_status::notification_status, NEW.from_status::notification_status;
    WHEN 'SUPPORT_TICKET' THEN PERFORM NEW.to_status::ticket_status, NEW.from_status::ticket_status;
    WHEN 'CALLBACK_REQUEST' THEN PERFORM NEW.to_status::callback_status, NEW.from_status::callback_status;
    WHEN 'MODERATION_CASE' THEN PERFORM NEW.to_status::moderation_case_status, NEW.from_status::moderation_case_status;
    WHEN 'APPEAL' THEN PERFORM NEW.to_status::appeal_status, NEW.from_status::appeal_status;
    WHEN 'ACCOUNT_RECOVERY_REQUEST' THEN PERFORM NEW.to_status::recovery_status, NEW.from_status::recovery_status;
    WHEN 'PASSWORD_RESET' THEN PERFORM NEW.to_status::password_reset_status, NEW.from_status::password_reset_status;
    WHEN 'STAFF_INVITATION' THEN PERFORM NEW.to_status::staff_invitation_status, NEW.from_status::staff_invitation_status;
    WHEN 'DONOR_LOCATION' THEN PERFORM NEW.to_status::donor_location_status, NEW.from_status::donor_location_status;
    WHEN 'DATA_EXPORT' THEN PERFORM NEW.to_status::data_export_status, NEW.from_status::data_export_status;
    WHEN 'APP_USER_ACCOUNT_STATUS' THEN PERFORM NEW.to_status::account_status, NEW.from_status::account_status;
    ELSE NULL;
  END CASE;
  RETURN NEW;
END $$;
CREATE TRIGGER status_history_label BEFORE INSERT ON aud.status_history FOR EACH ROW EXECUTE FUNCTION aud.check_status_label();

CREATE FUNCTION idn.check_item_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM idn.permission p WHERE p.id = NEW.permission_id AND NEW.scope = ANY (p.allowed_scopes)) THEN
    RAISE EXCEPTION 'scope % is not allowed for this permission', NEW.scope;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER permission_set_item_scope BEFORE INSERT OR UPDATE ON idn.permission_set_item FOR EACH ROW EXECUTE FUNCTION idn.check_item_scope();

CREATE VIEW idn.v_effective_permission AS
SELECT u.user_id, p.key, i.scope, s.code AS source_set, u.expires_at
FROM idn.user_permission_set u
JOIN idn.permission_set s ON s.id = u.permission_set_id AND s.status = 'Active'
JOIN idn.permission_set_item i ON i.permission_set_id = s.id
JOIN idn.permission p ON p.id = i.permission_id
WHERE u.status = 'Active' AND u.effective_from <= now() AND (u.expires_at IS NULL OR u.expires_at > now());

CREATE FUNCTION idn.check_grantor() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.granted_by IS NOT NULL AND EXISTS (
    SELECT 1 FROM idn.permission_set_item i JOIN idn.permission p ON p.id = i.permission_id
    WHERE i.permission_set_id = NEW.permission_set_id
      AND NOT EXISTS (SELECT 1 FROM idn.v_effective_permission e WHERE e.user_id = NEW.granted_by AND e.key = p.key AND e.scope >= i.scope))
  THEN RAISE EXCEPTION 'grantor does not hold every permission in the set';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER user_permission_set_grantor BEFORE INSERT ON idn.user_permission_set FOR EACH ROW EXECUTE FUNCTION idn.check_grantor();

CREATE FUNCTION sup.check_participant() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.participant_role IN ('DON','PAT') AND EXISTS (
    SELECT 1 FROM sup.conversation_participant c WHERE c.conversation_id = NEW.conversation_id AND c.participant_role IN ('DON','PAT') AND c.id <> NEW.id) THEN
    RAISE EXCEPTION 'a conversation may have at most one DON or PAT participant';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER conversation_participant_separation BEFORE INSERT OR UPDATE ON sup.conversation_participant FOR EACH ROW EXECUTE FUNCTION sup.check_participant();

CREATE FUNCTION platform.ensure_month_partition(parent regclass, month_start date) RETURNS void LANGUAGE plpgsql AS $$
DECLARE part text := parent::text || '_' || to_char(month_start, 'YYYY_MM');
BEGIN
  EXECUTE format('CREATE TABLE IF NOT EXISTS %s PARTITION OF %s FOR VALUES FROM (%L) TO (%L)', part, parent, month_start, (month_start + interval '1 month')::date);
END $$;
