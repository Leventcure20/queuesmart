BEGIN;

ALTER TABLE "QueueNotifications"
    ADD COLUMN status TEXT NOT NULL DEFAULT 'sent',
    ADD COLUMN viewed_at TIMESTAMPTZ,
    ADD CONSTRAINT queue_notifications_status_valid
        CHECK (status IN ('sent', 'viewed')),
    ADD CONSTRAINT queue_notifications_viewed_at_consistent
        CHECK (
            (status = 'sent' AND viewed_at IS NULL) OR
            (status = 'viewed' AND viewed_at IS NOT NULL)
        ),
    ADD CONSTRAINT queue_notifications_title_length
        CHECK (char_length(title) BETWEEN 1 AND 120 AND title ~ '[^[:space:]]'),
    ADD CONSTRAINT queue_notifications_message_length
        CHECK (char_length(message) BETWEEN 1 AND 2000 AND message ~ '[^[:space:]]');
    
    -- Completed and canceled tickets remain in participation history.
CREATE INDEX queue_tickets_user_history_idx
    ON "QueueTickets" (user_id, joined_at DESC, id DESC)
    WHERE status IN ('served', 'cancelled');

COMMIT;