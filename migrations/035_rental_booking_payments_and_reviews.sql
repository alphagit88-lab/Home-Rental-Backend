ALTER TABLE rental_bookings
ADD COLUMN IF NOT EXISTS deposit_amount DECIMAL(12, 2),
ADD COLUMN IF NOT EXISTS deposit_due_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS deposit_paid_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS remaining_amount DECIMAL(12, 2),
ADD COLUMN IF NOT EXISTS remaining_paid_at TIMESTAMP;

UPDATE rental_bookings
SET payment_status = 'deposit_pending'
WHERE payment_status = 'pending';

UPDATE rental_bookings
SET
    deposit_amount = ROUND(COALESCE(total_amount, 0) * 0.20, 2),
    remaining_amount = COALESCE(total_amount, 0) - ROUND(COALESCE(total_amount, 0) * 0.20, 2)
WHERE deposit_amount IS NULL
   OR remaining_amount IS NULL;

UPDATE rental_bookings
SET deposit_due_at = created_at + INTERVAL '24 hours'
WHERE deposit_due_at IS NULL;

UPDATE rental_bookings
SET
    deposit_paid_at = COALESCE(deposit_paid_at, created_at),
    remaining_paid_at = COALESCE(remaining_paid_at, updated_at, created_at)
WHERE payment_status = 'paid';

DO $$
DECLARE
    constraint_record RECORD;
BEGIN
    FOR constraint_record IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'rental_bookings'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%payment_status%'
    LOOP
        EXECUTE format(
            'ALTER TABLE rental_bookings DROP CONSTRAINT %I',
            constraint_record.conname
        );
    END LOOP;
END $$;

ALTER TABLE rental_bookings
ADD CONSTRAINT rental_bookings_payment_status_check
CHECK (
    payment_status IN (
        'deposit_pending',
        'deposit_paid',
        'paid',
        'failed',
        'expired',
        'refunded'
    )
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_rental_bookings_payment_breakdown'
    ) THEN
        ALTER TABLE rental_bookings
        ADD CONSTRAINT chk_rental_bookings_payment_breakdown
        CHECK (
            deposit_amount IS NULL
            OR remaining_amount IS NULL
            OR total_amount IS NULL
            OR ABS((deposit_amount + remaining_amount) - total_amount) <= 0.01
        );
    END IF;
END $$;

DO $$
DECLARE
    constraint_record RECORD;
BEGIN
    FOR constraint_record IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'rental_booking_service_requests'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%request_status%'
    LOOP
        EXECUTE format(
            'ALTER TABLE rental_booking_service_requests DROP CONSTRAINT %I',
            constraint_record.conname
        );
    END LOOP;
END $$;

ALTER TABLE rental_booking_service_requests
ALTER COLUMN request_status TYPE VARCHAR(30);

ALTER TABLE rental_booking_service_requests
ADD CONSTRAINT rental_booking_service_requests_request_status_check
CHECK (
    request_status IN (
        'awaiting_full_payment',
        'pending',
        'accepted',
        'cancelled',
        'completed'
    )
);

CREATE TABLE IF NOT EXISTS rental_booking_reviews (
    id SERIAL PRIMARY KEY,
    rental_booking_id INTEGER NOT NULL REFERENCES rental_bookings(id) ON DELETE CASCADE,
    reviewer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reviewee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reviewer_role VARCHAR(20) NOT NULL
        CHECK (reviewer_role IN ('tenant', 'owner')),
    reviewee_role VARCHAR(20) NOT NULL
        CHECK (reviewee_role IN ('tenant', 'owner')),
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_rental_booking_reviews_booking_reviewer
        UNIQUE (rental_booking_id, reviewer_id),
    CONSTRAINT chk_rental_booking_reviews_not_self
        CHECK (reviewer_id <> reviewee_id)
);

CREATE INDEX IF NOT EXISTS idx_rental_booking_reviews_booking_id
ON rental_booking_reviews(rental_booking_id);

CREATE INDEX IF NOT EXISTS idx_rental_booking_reviews_reviewee_id
ON rental_booking_reviews(reviewee_id);
