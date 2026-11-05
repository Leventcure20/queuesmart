CREATE TABLE IF NOT EXISTS "Service" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  expected_duration INTEGER NOT NULL
    CHECK (expected_duration BETWEEN 1 AND 1440),
  priority_level TEXT NOT NULL
    CHECK (priority_level IN ('low', 'medium', 'high')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
