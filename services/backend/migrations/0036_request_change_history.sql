-- Expand only: lets status_history record permitted-update requests (FR-REQ-014).
ALTER TYPE history_entity_type ADD VALUE IF NOT EXISTS 'REQUEST_CHANGE';

CREATE OR REPLACE FUNCTION aud.check_status_label() RETURNS trigger LANGUAGE plpgsql AS $$
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
    WHEN 'REQUEST_CHANGE' THEN PERFORM NEW.to_status::request_change_status, NEW.from_status::request_change_status;
    ELSE NULL;
  END CASE;
  RETURN NEW;
END $$;
