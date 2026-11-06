CREATE TABLE IF NOT EXISTS "Queue" (
  id UUID PRIMARY KEY,
  service_id TEXT NOT NULL UNIQUE REFERENCES "Service" (id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO "Queue" (id, service_id, status)
SELECT gen_random_uuid(), service.id, 'open'
FROM "Service" AS service
ON CONFLICT (service_id) DO NOTHING;

CREATE OR REPLACE FUNCTION create_queue_for_service()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO "Queue" (id, service_id, status)
  VALUES (gen_random_uuid(), NEW.id, 'open')
  ON CONFLICT (service_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS service_create_queue ON "Service";
CREATE TRIGGER service_create_queue
AFTER INSERT ON "Service"
FOR EACH ROW EXECUTE FUNCTION create_queue_for_service();

GRANT SELECT, INSERT, UPDATE, DELETE ON "Queue" TO queuesmart_user;
