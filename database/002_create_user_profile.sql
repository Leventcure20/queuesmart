-- Move profile details out of the credentials table and retain existing names.
BEGIN;

CREATE TABLE "UserProfile" (
  user_id UUID PRIMARY KEY REFERENCES "UserCredentials" (id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone_number TEXT,
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(preferences) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO "UserProfile" (user_id, full_name)
SELECT id, name FROM "UserCredentials";

ALTER TABLE "UserCredentials" DROP COLUMN name;

COMMIT;
