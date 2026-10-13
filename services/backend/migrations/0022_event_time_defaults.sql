-- Event-time columns that should default to now(); sample DDL (document 04 section 14) shows these defaults

ALTER TABLE idn.user_role ALTER COLUMN assigned_at SET DEFAULT now();
ALTER TABLE idn.device ALTER COLUMN first_seen_at SET DEFAULT now();
ALTER TABLE idn.device ALTER COLUMN last_seen_at SET DEFAULT now();
ALTER TABLE idn.credential ALTER COLUMN password_set_at SET DEFAULT now();
ALTER TABLE idn.consent_record ALTER COLUMN captured_at SET DEFAULT now();
ALTER TABLE idn.donor_card ALTER COLUMN issued_at SET DEFAULT now();
ALTER TABLE idn.password_reset ALTER COLUMN requested_at SET DEFAULT now();
ALTER TABLE idn.sensitive_access_grant ALTER COLUMN granted_at SET DEFAULT now();
ALTER TABLE idn.user_permission_set ALTER COLUMN effective_from SET DEFAULT now();
ALTER TABLE crd.contact_attempt ALTER COLUMN attempted_at SET DEFAULT now();
ALTER TABLE rpt.report_snapshot ALTER COLUMN data_as_of SET DEFAULT now();
