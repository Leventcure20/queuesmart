-- QueueSmart user accounts.
-- Store the bcrypt hash produced by the backend, never the user's raw password.
CREATE TABLE IF NOT EXISTS "UserCredentials" (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT usercredentials_email_normalized CHECK (email = LOWER(BTRIM(email)))
);
