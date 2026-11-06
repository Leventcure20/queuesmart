CREATE SEQUENCE IF NOT EXISTS queue_ticket_number_seq START WITH 1;

CREATE TABLE IF NOT EXISTS "QueueTickets" (
  id UUID PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES "UserCredentials" (id) ON DELETE CASCADE,
  service_id TEXT NOT NULL REFERENCES "Service" (id) ON DELETE CASCADE,
  service_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('waiting', 'serving', 'served', 'cancelled')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scheduled_start_at TIMESTAMPTZ,
  service_started_at TIMESTAMPTZ,
  served_at TIMESTAMPTZ,
  cancellation_reason TEXT CHECK (cancellation_reason IN ('left', 'removed') OR cancellation_reason IS NULL),
  left_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS queue_tickets_user_joined_idx
  ON "QueueTickets" (user_id, joined_at DESC);
CREATE INDEX IF NOT EXISTS queue_tickets_service_status_joined_idx
  ON "QueueTickets" (service_id, status, joined_at);

CREATE TABLE IF NOT EXISTS "QueueNotifications" (
  id UUID PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES "QueueTickets" (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES "UserCredentials" (id) ON DELETE CASCADE,
  ticket_number TEXT NOT NULL,
  service_name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('joined', 'your_turn', 'almost_ready', 'removed')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT queue_notifications_ticket_type_unique UNIQUE (ticket_id, type)
);

CREATE INDEX IF NOT EXISTS queue_notifications_user_created_idx
  ON "QueueNotifications" (user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON "QueueTickets", "QueueNotifications" TO queuesmart_user;
GRANT USAGE, SELECT ON SEQUENCE queue_ticket_number_seq TO queuesmart_user;
