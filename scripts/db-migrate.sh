#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL in the environment (see services/backend/.env.example)}"
dir="$(cd "$(dirname "$0")/../services/backend/migrations" && pwd)"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c "CREATE TABLE IF NOT EXISTS public.schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"
for f in "$dir"/*.sql; do
  name="$(basename "$f")"
  done_already="$(psql "$DATABASE_URL" -tA -v ON_ERROR_STOP=1 -c "SELECT 1 FROM public.schema_migrations WHERE name = '$name'")"
  if [ -n "$done_already" ]; then echo "skip  $name"; continue; fi
  echo "apply $name"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q --single-transaction -f "$f" -c "INSERT INTO public.schema_migrations (name) VALUES ('$name')"
done
