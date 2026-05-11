CREATE TABLE IF NOT EXISTS rental_booking_messages (
    id SERIAL PRIMARY KEY,
    rental_booking_id INTEGER NOT NULL REFERENCES rental_bookings(id) ON DELETE CASCADE,
    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_text TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_rental_booking_messages_not_self
        CHECK (sender_id <> recipient_id),
    CONSTRAINT chk_rental_booking_messages_text
        CHECK (char_length(btrim(message_text)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_rental_booking_messages_booking_id
ON rental_booking_messages(rental_booking_id, created_at);

CREATE INDEX IF NOT EXISTS idx_rental_booking_messages_recipient_unread
ON rental_booking_messages(recipient_id, is_read, created_at);
