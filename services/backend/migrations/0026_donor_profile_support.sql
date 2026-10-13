CREATE FUNCTION public.snap_to_grid(p geography, size_m integer) RETURNS geography
LANGUAGE sql IMMUTABLE AS $$
  SELECT ST_Transform(ST_SetSRID(ST_MakePoint(
    floor(ST_X(g) / size_m) * size_m + size_m / 2.0,
    floor(ST_Y(g) / size_m) * size_m + size_m / 2.0), 32646), 4326)::geography
  FROM ST_Transform(p::geometry, 32646) AS g
$$;

CREATE UNIQUE INDEX ux_notification_preference_user_category ON idn.notification_preference (user_id, category);
