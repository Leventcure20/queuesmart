-- Add database-level limits and non-empty checks for user-entered text.
BEGIN;

ALTER TABLE "UserCredentials"
  ADD CONSTRAINT usercredentials_email_length
    CHECK (char_length(email) BETWEEN 3 AND 254 AND email !~ '[[:space:]]'),
  ADD CONSTRAINT usercredentials_password_hash_length
    CHECK (char_length(password_hash) BETWEEN 1 AND 255 AND password_hash ~ '[^[:space:]]');

ALTER TABLE "UserProfile"
  ADD CONSTRAINT userprofile_full_name_length
    CHECK (char_length(full_name) BETWEEN 1 AND 100 AND full_name ~ '[^[:space:]]'),
  ADD CONSTRAINT userprofile_phone_number_length
    CHECK (phone_number IS NULL OR
      (char_length(phone_number) BETWEEN 1 AND 32 AND phone_number ~ '[^[:space:]]'));

ALTER TABLE "Service"
  ADD CONSTRAINT service_id_length
    CHECK (char_length(id) BETWEEN 1 AND 64 AND id ~ '[^[:space:]]'),
  ADD CONSTRAINT service_name_length
    CHECK (char_length(name) BETWEEN 1 AND 100 AND name ~ '[^[:space:]]'),
  ADD CONSTRAINT service_description_length
    CHECK (char_length(description) BETWEEN 1 AND 500 AND description ~ '[^[:space:]]');

ALTER TABLE "QueueTickets"
  ADD CONSTRAINT queue_tickets_number_length
    CHECK (char_length(number) BETWEEN 1 AND 32 AND number ~ '[^[:space:]]'),
  ADD CONSTRAINT queue_tickets_customer_name_length
    CHECK (char_length(customer_name) BETWEEN 1 AND 100 AND customer_name ~ '[^[:space:]]'),
  ADD CONSTRAINT queue_tickets_service_name_length
    CHECK (char_length(service_name) BETWEEN 1 AND 100 AND service_name ~ '[^[:space:]]');

ALTER TABLE "QueueNotifications"
  ADD CONSTRAINT queue_notifications_ticket_number_length
    CHECK (char_length(ticket_number) BETWEEN 1 AND 32 AND ticket_number ~ '[^[:space:]]'),
  ADD CONSTRAINT queue_notifications_service_name_length
    CHECK (char_length(service_name) BETWEEN 1 AND 100 AND service_name ~ '[^[:space:]]');

ALTER TABLE "PasswordResetTokens"
  ADD CONSTRAINT password_reset_token_hash_format
    CHECK (btrim(token_hash) ~ '^[a-f0-9]{64}$');

COMMIT;
