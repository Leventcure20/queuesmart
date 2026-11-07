
-- QueueEntry (Assignment 4, requirement 5)
-- QueueTickets is the existing ticket/entry table. Extending it instead of
-- copying tickets to a second table, preserving the current backend and history.
-- Run after database/009_validation_constraints.sql.
BEGIN;

-- Associate existing tickets with their service's queue.
ALTER TABLE "QueueTickets"
  ADD COLUMN queue_id UUID;

UPDATE "QueueTickets" AS ticket
SET queue_id = queue.id
FROM "Queue" AS queue
WHERE queue.service_id = ticket.service_id;

-- A composite foreign key guarantees that queue_id and service_id agree.
-- The primary keys on QueueTickets(id) and Queue(id) remain unchanged.
ALTER TABLE "Queue"
  ADD CONSTRAINT queue_id_service_unique UNIQUE (id, service_id);

ALTER TABLE "QueueTickets"
  ALTER COLUMN queue_id SET NOT NULL,
  ADD CONSTRAINT queue_tickets_queue_service_fk
    FOREIGN KEY (queue_id, service_id)
    REFERENCES "Queue" (id, service_id)
    ON DELETE CASCADE;

-- Existing API INSERT statements supply service_id but not queue_id.
-- Fill it automatically, and reject inconsistent explicitly supplied IDs.
CREATE FUNCTION assign_queue_ticket_queue_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  expected_queue_id UUID;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.service_id IS NOT DISTINCT FROM OLD.service_id
       AND NEW.queue_id IS NOT DISTINCT FROM OLD.queue_id THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT id INTO expected_queue_id
  FROM "Queue"
  WHERE service_id = NEW.service_id;

  IF expected_queue_id IS NULL THEN
    RAISE EXCEPTION 'No queue exists for service %', NEW.service_id
      USING ERRCODE = '23503';
  END IF;

  IF NEW.queue_id IS NOT NULL AND NEW.queue_id <> expected_queue_id THEN
    RAISE EXCEPTION 'Queue % does not belong to service %', NEW.queue_id, NEW.service_id
      USING ERRCODE = '23503';
  END IF;

  NEW.queue_id := expected_queue_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER queue_tickets_assign_queue_id
BEFORE INSERT OR UPDATE OF queue_id, service_id ON "QueueTickets"
FOR EACH ROW
EXECUTE FUNCTION assign_queue_ticket_queue_id();

-- Positions are computed from active tickets, so they cannot become stale
-- after someone leaves or is served. History rows have NULL position.
-- The view uses the rubric's 'canceled' spelling while the existing backend
-- continues storing 'cancelled' and also supports the 'serving' state.
CREATE VIEW "QueueEntry" AS
WITH active_positions AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY queue_id
           ORDER BY joined_at, id
         ) AS position
  FROM "QueueTickets"
  WHERE status IN ('waiting', 'serving')
)
SELECT ticket.id,
       ticket.queue_id,
       ticket.user_id,
       active_positions.position,
       ticket.joined_at AS join_time,
       CASE WHEN ticket.status = 'cancelled' THEN 'canceled'
            ELSE ticket.status END AS status
FROM "QueueTickets" AS ticket
LEFT JOIN active_positions ON active_positions.id = ticket.id;

CREATE INDEX queue_tickets_active_queue_order_idx
  ON "QueueTickets" (queue_id, joined_at, id)
  WHERE status IN ('waiting', 'serving');

GRANT SELECT ON "QueueEntry" TO queuesmart_user;

COMMIT;
