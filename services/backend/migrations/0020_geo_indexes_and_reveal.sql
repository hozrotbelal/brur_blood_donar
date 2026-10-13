-- PostGIS indexes and the reveal function (requires PostGIS)
-- Generated from BBDA-ERD data dictionary (document 04, section 5); see docs/decisions/database-assumptions.md


CREATE INDEX ix_donor_profile_geo ON idn.donor_profile USING gist (approx_location) WHERE deleted_at IS NULL AND donor_status = 'Active';
CREATE INDEX ix_donor_location_approx ON idn.donor_location USING gist (approx_point) WHERE status = 'Approved';
CREATE INDEX ix_donor_location_exact ON idn.donor_location USING gist (exact_point) WHERE status = 'Approved';
CREATE INDEX ix_donor_location_cell ON idn.donor_location (grid_cell) WHERE status = 'Approved';
CREATE INDEX ix_blood_request_geo ON req.blood_request USING gist (location);
CREATE INDEX ix_facility_geo ON apt.facility USING gist (location);
CREATE INDEX ix_area_centroid ON cfg.area USING gist (centroid);
CREATE INDEX ix_area_boundary ON cfg.area USING gist (boundary);

CREATE FUNCTION idn.reveal_exact_location(p_grant uuid) RETURNS geography
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT l.exact_point FROM idn.sensitive_access_grant g
  JOIN idn.donor_location l ON l.id = g.donor_location_id AND l.status = 'Approved'
  WHERE g.id = p_grant AND g.field = 'DONOR_EXACT_LOCATION' AND g.status = 'Active'
    AND g.expires_at > now()
    AND g.grantee_user_id = current_setting('app.user_id', true)::uuid $$;
