-- NTF-EV-21 security alerts (SRS: password changed or reset, new-device sign-in, account locked, suspicious sign-in reported)

INSERT INTO ntf.notification_rule
  (event_code, recipient_role, channels, sms_fallback_allowed, fallback_after_seconds, max_attempts, retry_backoff_seconds, max_sms_per_request_per_day, respects_quiet_hours, is_critical, enabled)
SELECT 'NTF-EV-21', r, '{IN_APP,PUSH,SMS}', true, '{"Critical":300,"Urgent":300,"Routine":300}', 3, '{60,300}', 2, false, true, true
FROM unnest(ARRAY['DON','PAT','SUP','MOD','ADM']::role_code[]) AS r;

INSERT INTO ntf.notification_template (code, event_code, channel, status)
SELECT 'TPL-NTF-EV-21-' || c, 'NTF-EV-21', c::notification_channel, 'Active'
FROM unnest(ARRAY['IN_APP','PUSH','SMS']) AS c;

CREATE TEMP TABLE tpl_text (event_code text, sms boolean, lang text, title text, body text, vars text[]);

INSERT INTO tpl_text VALUES
  ('NTF-EV-21', false, 'en', 'Security alert', '{{event}} on your BBDA account at {{time}}. If this was not you, reset your password now.', '{event,time}'),
  ('NTF-EV-21', false, 'bn', 'নিরাপত্তা সতর্কতা', '{{time}}-এ আপনার BBDA অ্যাকাউন্টে {{event}}। এটি আপনি না হলে এখনই পাসওয়ার্ড রিসেট করুন।', '{event,time}'),
  ('NTF-EV-21', true, 'en', NULL, 'BBDA: {{event}} on your account at {{time}}. Not you? Reset your password in the app.', '{event,time}'),
  ('NTF-EV-21', true, 'bn', NULL, 'BBDA: {{time}}-এ আপনার অ্যাকাউন্টে {{event}}। আপনি না হলে অ্যাপে পাসওয়ার্ড রিসেট করুন।', '{event,time}');

INSERT INTO ntf.template_version (template_id, version_no, language, title, body, variables, status)
SELECT t.id, 1, x.lang::ui_language, x.title, x.body, x.vars, 'Approved'
FROM ntf.notification_template t
JOIN tpl_text x ON x.event_code = t.event_code::text AND x.sms = (t.channel = 'SMS')
WHERE t.event_code = 'NTF-EV-21';

DROP TABLE tpl_text;
