-- Synthetic demo data for the patient web flow. Development only; never run against staging or production.
-- Needs seeds/sample-data.sql, the demo patient +8801700000005, the demo Support Lead +8801700000001
-- and at least 18 donor profiles. It does nothing when it has already run.
--
-- Gives the demo patient one request in each state the patient screens show:
--   Searching (active, with aggregate search counts), Fulfilled (Service-confirmed outcome), Cancelled, Draft.

DO $$
DECLARE
  pat uuid;
  sup uuid;
  hospital uuid;
  collection uuid;
  area uuid;
  self_patient uuid;
  self_link uuid;
  parent_patient uuid := 'a0000000-0000-4000-8000-000000000101';
  parent_link uuid := 'a0000000-0000-4000-8000-000000000102';
  req_active uuid := 'a0000000-0000-4000-8000-000000000201';
  req_done uuid := 'a0000000-0000-4000-8000-000000000202';
  req_cancelled uuid := 'a0000000-0000-4000-8000-000000000203';
  req_draft uuid := 'a0000000-0000-4000-8000-000000000204';
  run1 uuid := 'a0000000-0000-4000-8000-000000000301';
  run2 uuid := 'a0000000-0000-4000-8000-000000000302';
  case_done uuid := 'a0000000-0000-4000-8000-000000000401';
  t0 timestamptz := now() - interval '3 hours';
  -- status_history is partitioned by month from October 2026, so older samples stay inside the current month.
  d0 timestamptz := greatest(now() - interval '10 days', date_trunc('month', now()) + interval '2 hours');
  c0 timestamptz := greatest(now() - interval '12 days', date_trunc('month', now()) + interval '1 hour');
  donor record;
  n int := 0;
  cand uuid;
  ref_active text;
BEGIN
  IF EXISTS (SELECT 1 FROM req.blood_request WHERE id = req_active) THEN
    RAISE NOTICE 'patient flow demo data already present';
    RETURN;
  END IF;

  SELECT id INTO pat FROM idn.app_user WHERE phone_e164 = '+8801700000005';
  SELECT id INTO sup FROM idn.app_user WHERE phone_e164 = '+8801700000001';
  SELECT id INTO hospital FROM apt.facility WHERE name_en = '[SAMPLE] Rangpur Medical College Hospital';
  -- The district the demo Support Lead is scoped to.
  SELECT id INTO area FROM cfg.area WHERE code = 'SAMPLE-RANGPUR-DISTRICT';
  SELECT id INTO collection FROM apt.facility WHERE name_en = '[SAMPLE] Rangpur Blood Collection Service';
  IF pat IS NULL OR sup IS NULL OR hospital IS NULL OR collection IS NULL OR area IS NULL THEN
    RAISE EXCEPTION 'demo users or sample facilities are missing';
  END IF;

  SELECT p.id, l.id INTO self_patient, self_link
    FROM req.patient p JOIN req.representative_link l ON l.patient_id = p.id
   WHERE l.user_id = pat AND l.status = 'Active' ORDER BY p.created_at LIMIT 1;
  IF self_patient IS NULL THEN
    RAISE EXCEPTION 'the demo patient has no patient profile yet; sign in once and add one';
  END IF;
  UPDATE req.patient SET hospital_patient_ref = 'PT-7781' WHERE id = self_patient AND hospital_patient_ref IS NULL;

  INSERT INTO req.patient (id, display_name, year_of_birth, hospital_patient_ref, created_by_user_id)
  VALUES (parent_patient, '[SAMPLE] Patient B', 1958, 'PT-6120', pat);
  INSERT INTO req.representative_link (id, user_id, patient_id, relationship, authorized, is_primary, status)
  VALUES (parent_link, pat, parent_patient, 'PARENT', true, true, 'Active');

  -- 1. Active request: Searching in wave 2, one donor willing.
  ref_active := 'REQ-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('req.blood_request_reference_seq')::text, 6, '0');
  INSERT INTO req.blood_request (
    id, reference_no, patient_id, representative_link_id, created_by_user_id, contact_phone, hospital_facility_id, collection_facility_id, area_id,
    requested_blood_group, component, quantity_units, required_by, urgency, special_instructions, status, assigned_support_user_id,
    search_wave_count, submitted_at, first_action_at, verified_at, first_invited_at, first_willing_at, created_at, updated_at)
  VALUES (
    req_active, ref_active, self_patient, self_link, pat, '+8801700000005', hospital, collection, area,
    'B+', 'WHOLE_BLOOD', 2, now() + interval '1 day', 'Critical', '[SAMPLE] Ward 4, bed 12', 'Searching', sup,
    2, t0, t0 + interval '9 minutes', t0 + interval '28 minutes', t0 + interval '30 minutes', t0 + interval '51 minutes', t0, t0 + interval '51 minutes');

  INSERT INTO src.match_run (id, request_id, wave_no, status, trigger, mode, radius_km, wave_size, filters_version, group_rule_version, params_snapshot, candidates_evaluated, candidates_included, approved_by, created_at)
  VALUES
    (run1, req_active, 1, 'Completed', 'AUTO_ON_VERIFIED', 'PHASE1_CONTROLLED', 5, 10, 1, 1, '{"sample": true}', 40, 10, sup, t0 + interval '29 minutes'),
    (run2, req_active, 2, 'Awaiting responses', 'AUTO_NEXT_WAVE', 'PHASE1_CONTROLLED', 10, 8, 1, 1, '{"sample": true}', 55, 8, sup, t0 + interval '40 minutes');

  FOR donor IN SELECT dp.id FROM idn.donor_profile dp ORDER BY dp.created_at LIMIT 18 LOOP
    n := n + 1;
    INSERT INTO src.match_candidate (match_run_id, donor_profile_id, included, rank, reason_codes, selected_for_invite)
    VALUES (CASE WHEN n <= 10 THEN run1 ELSE run2 END, donor.id, true, n, '{}'::match_reason_code[], true)
    RETURNING id INTO cand;
    INSERT INTO src.invitation (request_id, donor_profile_id, match_run_id, match_candidate_id, status, response, queued_at, sent_at, delivered_at, responded_at, expires_at, payload_snapshot)
    VALUES (
      req_active, donor.id, CASE WHEN n <= 10 THEN run1 ELSE run2 END, cand,
      CASE WHEN n <= 6 THEN 'Responded' WHEN n <= 10 THEN 'Expired' ELSE 'Delivered' END::invitation_status,
      CASE WHEN n = 1 THEN 'Available' WHEN n <= 4 THEN 'Unavailable' WHEN n <= 6 THEN 'Later' END::invitation_response_value,
      t0 + interval '30 minutes', t0 + interval '30 minutes', t0 + interval '31 minutes',
      CASE WHEN n <= 6 THEN t0 + interval '50 minutes' END,
      now() + interval '2 hours',
      jsonb_build_object('urgency', 'Critical', 'component', 'WHOLE_BLOOD', 'bloodGroup', 'B+', 'requestReference', ref_active, 'sample', true));
  END LOOP;
  IF n < 18 THEN
    RAISE EXCEPTION 'only % donor profiles exist; 18 are needed', n;
  END IF;

  INSERT INTO aud.status_history (entity_type, entity_id, context_request_id, from_status, to_status, actor_user_id, actor_role, source, correlation_id, occurred_at) VALUES
    ('BLOOD_REQUEST', req_active, req_active, NULL, 'Draft', pat, 'PAT', 'USER', gen_random_uuid(), t0 - interval '2 minutes'),
    ('BLOOD_REQUEST', req_active, req_active, 'Draft', 'Submitted', pat, 'PAT', 'USER', gen_random_uuid(), t0),
    ('BLOOD_REQUEST', req_active, req_active, 'Submitted', 'Under review', sup, 'SUP', 'USER', gen_random_uuid(), t0 + interval '9 minutes'),
    ('BLOOD_REQUEST', req_active, req_active, 'Under review', 'Verified', sup, 'SUP', 'USER', gen_random_uuid(), t0 + interval '28 minutes'),
    ('BLOOD_REQUEST', req_active, req_active, 'Verified', 'Searching', NULL, 'SYSTEM', 'SYSTEM', gen_random_uuid(), t0 + interval '30 minutes');

  -- 2. Earlier request for the same patient: Fulfilled with a Service-confirmed outcome.
  INSERT INTO req.blood_request (
    id, reference_no, patient_id, representative_link_id, created_by_user_id, contact_phone, hospital_facility_id, collection_facility_id, area_id,
    requested_blood_group, component, quantity_units, required_by, urgency, status, assigned_support_user_id, fulfilled_quantity_units, search_wave_count,
    submitted_at, verified_at, first_invited_at, first_willing_at, donation_reported_at, outcome_confirmed_at, fulfilled_at, created_at, updated_at)
  VALUES (
    req_done, 'REQ-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('req.blood_request_reference_seq')::text, 6, '0'),
    self_patient, self_link, pat, '+8801700000005', hospital, collection, area,
    'B+', 'WHOLE_BLOOD', 1, (d0 + interval '2 days'), 'Urgent', 'Fulfilled', sup, 1, 1,
    d0, d0 + interval '30 minutes', d0 + interval '35 minutes',
    d0 + interval '2 hours', (d0 + interval '1 day'), (d0 + interval '1 day') + interval '3 hours',
    (d0 + interval '1 day') + interval '3 hours', d0, (d0 + interval '1 day') + interval '3 hours');
  INSERT INTO crd.coordination_case (id, case_no, request_id, status, owner_user_id, area_id, opened_at, resolved_at)
  VALUES (case_done, 'CASE-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('crd.coordination_case_no_seq')::text, 6, '0'), req_done, 'Resolved', sup, area,
          d0 + interval '2 hours', (d0 + interval '1 day') + interval '3 hours');
  INSERT INTO crd.outcome_update (case_id, request_id, outcome_type, source_type, confidence, reported_by_role, facility_id, channel, reported_at, recorded_by, units_count)
  VALUES (case_done, req_done, 'UNITS_RECEIVED_BY_PATIENT_SERVICE', 'COLLECTION_SERVICE_CONFIRMATION', 'Service-confirmed', 'Collection service', collection, 'IN_APP',
          (d0 + interval '1 day') + interval '3 hours', sup, 1);
  INSERT INTO aud.status_history (entity_type, entity_id, context_request_id, from_status, to_status, actor_user_id, actor_role, source, correlation_id, occurred_at) VALUES
    ('BLOOD_REQUEST', req_done, req_done, 'Draft', 'Submitted', pat, 'PAT', 'USER', gen_random_uuid(), d0),
    ('BLOOD_REQUEST', req_done, req_done, 'Under review', 'Verified', sup, 'SUP', 'USER', gen_random_uuid(), d0 + interval '30 minutes'),
    ('BLOOD_REQUEST', req_done, req_done, 'Verified', 'Searching', NULL, 'SYSTEM', 'SYSTEM', gen_random_uuid(), d0 + interval '35 minutes'),
    ('BLOOD_REQUEST', req_done, req_done, 'Searching', 'Donor coordination', NULL, 'SYSTEM', 'SYSTEM', gen_random_uuid(), d0 + interval '2 hours'),
    ('BLOOD_REQUEST', req_done, req_done, 'Donor coordination', 'Awaiting outcome', sup, 'SUP', 'USER', gen_random_uuid(), (d0 + interval '1 day')),
    ('BLOOD_REQUEST', req_done, req_done, 'Awaiting outcome', 'Fulfilled', sup, 'SUP', 'USER', gen_random_uuid(), (d0 + interval '1 day') + interval '3 hours');

  -- 3. Request for a second patient, cancelled by the representative.
  INSERT INTO req.blood_request (
    id, reference_no, patient_id, representative_link_id, created_by_user_id, contact_phone, hospital_facility_id, area_id,
    requested_blood_group, component, quantity_units, required_by, urgency, status, cancel_reason, submitted_at, created_at, updated_at)
  VALUES (
    req_cancelled, 'REQ-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('req.blood_request_reference_seq')::text, 6, '0'),
    parent_patient, parent_link, pat, '+8801700000005', hospital, area,
    'A+', 'RED_CELLS', 1, (c0 + interval '2 days'), 'Routine', 'Cancelled', 'NEED_MET_ELSEWHERE',
    c0, c0, (c0 + interval '1 day'));
  INSERT INTO aud.status_history (entity_type, entity_id, context_request_id, from_status, to_status, actor_user_id, actor_role, source, reason_code, correlation_id, occurred_at) VALUES
    ('BLOOD_REQUEST', req_cancelled, req_cancelled, 'Draft', 'Submitted', pat, 'PAT', 'USER', NULL, gen_random_uuid(), c0),
    ('BLOOD_REQUEST', req_cancelled, req_cancelled, 'Submitted', 'Cancelled', pat, 'PAT', 'USER', 'NEED_MET_ELSEWHERE', gen_random_uuid(), (c0 + interval '1 day'));

  -- 4. Draft not yet submitted.
  INSERT INTO req.blood_request (
    id, patient_id, representative_link_id, created_by_user_id, contact_phone, hospital_facility_id, area_id,
    requested_blood_group, component, quantity_units, required_by, urgency, status, created_at, updated_at)
  VALUES (
    req_draft, parent_patient, parent_link, pat, '+8801700000005', hospital, area,
    'O-', 'WHOLE_BLOOD', 1, now() + interval '5 days', 'Routine', 'Draft', now() - interval '3 days', now() - interval '3 days');
  INSERT INTO aud.status_history (entity_type, entity_id, context_request_id, from_status, to_status, actor_user_id, actor_role, source, correlation_id, occurred_at)
  VALUES ('BLOOD_REQUEST', req_draft, req_draft, NULL, 'Draft', pat, 'PAT', 'USER', gen_random_uuid(), now() - interval '3 days');

  RAISE NOTICE 'patient flow demo data added; active request %', ref_active;
END $$;
