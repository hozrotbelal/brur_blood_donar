-- Notification rules, templates and approved versions for the events implemented so far

INSERT INTO ntf.notification_rule
  (event_code, recipient_role, channels, sms_fallback_allowed, fallback_after_seconds, max_attempts, retry_backoff_seconds, max_sms_per_request_per_day, respects_quiet_hours, is_critical, enabled)
VALUES
  ('NTF-EV-01', 'PAT', '{IN_APP,PUSH}', false, NULL, 3, '{60,300}', 0, false, false, true),
  ('NTF-EV-01', 'SUP', '{IN_APP,PUSH}', false, NULL, 3, '{60,300}', 0, false, false, true),
  ('NTF-EV-02', 'PAT', '{IN_APP,PUSH,SMS}', true, '{"Critical":120,"Urgent":300,"Routine":900}', 3, '{60,300}', 2, false, false, true),
  ('NTF-EV-03', 'PAT', '{IN_APP,PUSH}', false, NULL, 3, '{60,300}', 0, false, false, true),
  ('NTF-EV-03', 'SUP', '{IN_APP,PUSH}', false, NULL, 3, '{60,300}', 0, false, false, true),
  ('NTF-EV-04', 'DON', '{PUSH,IN_APP,SMS}', true, '{"Critical":120,"Urgent":300,"Routine":900}', 3, '{30,120}', 2, true, false, true),
  ('NTF-EV-05', 'DON', '{IN_APP,PUSH}', false, NULL, 3, '{60,300}', 0, false, false, true),
  ('NTF-EV-05', 'SUP', '{IN_APP,PUSH}', false, NULL, 3, '{60,300}', 0, false, false, true),
  ('NTF-EV-07', 'DON', '{IN_APP,PUSH,SMS}', true, '{"Critical":120,"Urgent":300,"Routine":900}', 3, '{30,120}', 2, false, true, true),
  ('NTF-EV-07', 'PAT', '{IN_APP,PUSH}', false, NULL, 3, '{60,300}', 0, false, true, true),
  ('NTF-EV-07', 'SUP', '{IN_APP,PUSH}', false, NULL, 3, '{60,300}', 0, false, false, true),
  ('NTF-EV-08', 'SUP', '{IN_APP,PUSH}', false, NULL, 3, '{30,120}', 0, false, true, true),
  ('NTF-EV-08', 'PAT', '{IN_APP,PUSH}', false, NULL, 3, '{60,300}', 0, false, false, true),
  ('NTF-EV-09', 'PAT', '{IN_APP,PUSH}', false, NULL, 3, '{60,300}', 0, false, false, true),
  ('NTF-EV-09', 'DON', '{IN_APP,PUSH}', false, NULL, 3, '{60,300}', 0, false, false, true),
  ('NTF-EV-09', 'SUP', '{IN_APP,PUSH}', false, NULL, 3, '{60,300}', 0, false, false, true),
  ('NTF-EV-11', 'DON', '{IN_APP,PUSH}', false, NULL, 3, '{300,900}', 0, true, false, true),
  ('NTF-EV-13', 'DON', '{IN_APP,PUSH}', false, NULL, 3, '{60,300}', 0, false, false, true),
  ('NTF-EV-13', 'SUP', '{IN_APP,PUSH}', false, NULL, 3, '{60,300}', 0, false, false, true),
  ('NTF-EV-14', 'DON', '{IN_APP,PUSH,SMS}', true, '{"Critical":300,"Urgent":600,"Routine":1800}', 3, '{60,300}', 2, true, false, true),
  ('NTF-EV-18', 'SUP', '{IN_APP,PUSH}', false, NULL, 3, '{30,120}', 0, false, true, true),
  ('NTF-EV-18', 'ADM', '{IN_APP,PUSH}', false, NULL, 3, '{30,120}', 0, false, true, true);

INSERT INTO ntf.notification_template (code, event_code, channel, status)
SELECT 'TPL-' || e || '-' || c, e::ntf_event_code, c::notification_channel, 'Active'
FROM unnest(ARRAY['NTF-EV-01','NTF-EV-03','NTF-EV-05','NTF-EV-08','NTF-EV-09','NTF-EV-11','NTF-EV-13','NTF-EV-18']) AS e,
     unnest(ARRAY['IN_APP','PUSH']) AS c;

INSERT INTO ntf.notification_template (code, event_code, channel, status)
SELECT 'TPL-' || e || '-' || c, e::ntf_event_code, c::notification_channel, 'Active'
FROM unnest(ARRAY['NTF-EV-02','NTF-EV-04','NTF-EV-07','NTF-EV-14']) AS e,
     unnest(ARRAY['IN_APP','PUSH','SMS']) AS c;

CREATE TEMP TABLE tpl_text (event_code text, sms boolean, lang text, title text, body text, vars text[]);

INSERT INTO tpl_text VALUES
  ('NTF-EV-01', false, 'en', 'Request submitted', 'Blood request {{ref}} was submitted and is waiting for review.', '{ref}'),
  ('NTF-EV-01', false, 'bn', 'অনুরোধ জমা হয়েছে', 'রক্তের অনুরোধ {{ref}} জমা হয়েছে এবং পর্যালোচনার অপেক্ষায় আছে।', '{ref}'),
  ('NTF-EV-02', false, 'en', 'More information needed', 'More information is needed for request {{ref}}. Please open the request to add it.', '{ref}'),
  ('NTF-EV-02', false, 'bn', 'আরও তথ্য প্রয়োজন', 'অনুরোধ {{ref}}-এর জন্য আরও তথ্য প্রয়োজন। অনুগ্রহ করে অনুরোধটি খুলে তথ্য যোগ করুন।', '{ref}'),
  ('NTF-EV-02', true, 'en', NULL, 'BBDA: more information is needed for request {{ref}}. Please open the app.', '{ref}'),
  ('NTF-EV-02', true, 'bn', NULL, 'BBDA: অনুরোধ {{ref}}-এর জন্য আরও তথ্য প্রয়োজন। অ্যাপ খুলুন।', '{ref}'),
  ('NTF-EV-03', false, 'en', 'Request verified', 'Request {{ref}} is verified. The search for donors has started.', '{ref}'),
  ('NTF-EV-03', false, 'bn', 'অনুরোধ যাচাই হয়েছে', 'অনুরোধ {{ref}} যাচাই হয়েছে। রক্তদাতা খোঁজা শুরু হয়েছে।', '{ref}'),
  ('NTF-EV-04', false, 'en', 'A blood request needs donors', 'A {{urgency}} blood request for {{bloodGroup}} needs donors near you. Please open the app to respond.', '{urgency,bloodGroup}'),
  ('NTF-EV-04', false, 'bn', 'রক্তদাতা প্রয়োজন', 'আপনার কাছাকাছি একটি {{urgency}} রক্তের অনুরোধে ({{bloodGroup}}) রক্তদাতা প্রয়োজন। সাড়া দিতে অ্যাপ খুলুন।', '{urgency,bloodGroup}'),
  ('NTF-EV-04', true, 'en', NULL, 'BBDA: a {{urgency}} blood request ({{bloodGroup}}) needs donors near you. Open the app to respond.', '{urgency,bloodGroup}'),
  ('NTF-EV-04', true, 'bn', NULL, 'BBDA: আপনার কাছে {{urgency}} রক্তের অনুরোধ ({{bloodGroup}})। সাড়া দিতে অ্যাপ খুলুন।', '{urgency,bloodGroup}'),
  ('NTF-EV-05', false, 'en', 'A donor is available', 'A donor is available for request {{ref}}. Coordination has started.', '{ref}'),
  ('NTF-EV-05', false, 'bn', 'একজন রক্তদাতা প্রস্তুত', 'অনুরোধ {{ref}}-এর জন্য একজন রক্তদাতা সাড়া দিয়েছেন। সমন্বয় শুরু হয়েছে।', '{ref}'),
  ('NTF-EV-07', false, 'en', 'Appointment update', 'Appointment {{status}} for request {{ref}}: {{time}} at {{facility}}.', '{ref,status,time,facility}'),
  ('NTF-EV-07', false, 'bn', 'অ্যাপয়েন্টমেন্ট হালনাগাদ', 'অনুরোধ {{ref}}-এর অ্যাপয়েন্টমেন্ট {{status}}: {{time}}, {{facility}}।', '{ref,status,time,facility}'),
  ('NTF-EV-07', true, 'en', NULL, 'BBDA: appointment {{status}} for request {{ref}}: {{time}} at {{facility}}.', '{ref,status,time,facility}'),
  ('NTF-EV-07', true, 'bn', NULL, 'BBDA: অনুরোধ {{ref}}-এর অ্যাপয়েন্টমেন্ট {{status}}: {{time}}, {{facility}}।', '{ref,status,time,facility}'),
  ('NTF-EV-08', false, 'en', 'A donor cannot attend', 'A donor can no longer attend for request {{ref}}. We are looking for a replacement.', '{ref}'),
  ('NTF-EV-08', false, 'bn', 'একজন রক্তদাতা উপস্থিত হতে পারছেন না', 'অনুরোধ {{ref}}-এর একজন রক্তদাতা আর উপস্থিত হতে পারছেন না। আমরা বিকল্প রক্তদাতা খুঁজছি।', '{ref}'),
  ('NTF-EV-09', false, 'en', 'Outcome confirmed', 'An outcome was confirmed for request {{ref}}: {{outcome}}.', '{ref,outcome}'),
  ('NTF-EV-09', false, 'bn', 'ফলাফল নিশ্চিত হয়েছে', 'অনুরোধ {{ref}}-এর ফলাফল নিশ্চিত হয়েছে: {{outcome}}।', '{ref,outcome}'),
  ('NTF-EV-11', false, 'en', 'Time to review your availability', 'Your provisional next donation date has arrived. Please review your availability in the app.', '{}'),
  ('NTF-EV-11', false, 'bn', 'প্রাপ্যতা দেখে নিন', 'আপনার সম্ভাব্য পরবর্তী রক্তদানের তারিখ এসেছে। অনুগ্রহ করে অ্যাপে আপনার প্রাপ্যতা দেখে নিন।', '{}'),
  ('NTF-EV-13', false, 'en', 'Request cancelled or changed', 'Request {{ref}} was cancelled or changed. No further action is needed.', '{ref}'),
  ('NTF-EV-13', false, 'bn', 'অনুরোধ বাতিল বা পরিবর্তিত', 'অনুরোধ {{ref}} বাতিল বা পরিবর্তন করা হয়েছে। আর কিছু করার প্রয়োজন নেই।', '{ref}'),
  ('NTF-EV-14', false, 'en', 'Appointment reminder', 'Reminder: appointment for request {{ref}} on {{time}} at {{facility}}.', '{ref,time,facility}'),
  ('NTF-EV-14', false, 'bn', 'অ্যাপয়েন্টমেন্টের অনুস্মারক', 'অনুস্মারক: অনুরোধ {{ref}}-এর অ্যাপয়েন্টমেন্ট {{time}}, {{facility}}।', '{ref,time,facility}'),
  ('NTF-EV-14', true, 'en', NULL, 'BBDA reminder: appointment for request {{ref}} on {{time}} at {{facility}}.', '{ref,time,facility}'),
  ('NTF-EV-14', true, 'bn', NULL, 'BBDA অনুস্মারক: অনুরোধ {{ref}}-এর অ্যাপয়েন্টমেন্ট {{time}}, {{facility}}।', '{ref,time,facility}'),
  ('NTF-EV-18', false, 'en', 'Delivery failed', 'A critical message for request {{ref}} could not be delivered. Please contact the recipient by phone.', '{ref}'),
  ('NTF-EV-18', false, 'bn', 'বার্তা পৌঁছায়নি', 'অনুরোধ {{ref}}-এর একটি জরুরি বার্তা পৌঁছায়নি। অনুগ্রহ করে প্রাপককে ফোনে জানান।', '{ref}');

INSERT INTO ntf.template_version (template_id, version_no, language, title, body, variables, status)
SELECT t.id, 1, x.lang::ui_language, x.title, x.body, x.vars, 'Approved'
FROM ntf.notification_template t
JOIN tpl_text x ON x.event_code = t.event_code::text AND x.sms = (t.channel = 'SMS');

DROP TABLE tpl_text;
