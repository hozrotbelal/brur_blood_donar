-- Tables owned by schema com
-- Generated from BBDA-ERD data dictionary (document 04, section 5); see docs/decisions/database-assumptions.md

CREATE TABLE com.community_post (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_user_id uuid NOT NULL,
  post_type post_type NOT NULL,
  body text NOT NULL,
  visibility post_visibility NOT NULL,
  area_id uuid,
  campaign_id uuid,
  status post_status NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  deleted_at timestamptz
);

CREATE TABLE com.post_comment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL,
  author_user_id uuid NOT NULL,
  body text NOT NULL,
  status post_status NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  deleted_at timestamptz
);

CREATE TABLE com.post_reaction (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL,
  user_id uuid NOT NULL,
  reaction reaction_type NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE com.appeal_post_link (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL,
  request_id uuid NOT NULL,
  verified_by uuid NOT NULL,
  status appeal_link_status NOT NULL,
  unlinked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT uq_appeal_post_link_post_id UNIQUE (post_id)
);

