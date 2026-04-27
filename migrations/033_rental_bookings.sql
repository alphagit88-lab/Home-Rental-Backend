CREATE TABLE IF NOT EXISTS rental_bookings (
    id SERIAL PRIMARY KEY,
    booking_code VARCHAR(40) NOT NULL UNIQUE,
    property_id INTEGER NOT NULL REFERENCES rental_properties(id) ON DELETE CASCADE,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_name VARCHAR(255) NOT NULL,
    tenant_email VARCHAR(255) NOT NULL,
    check_in DATE NOT NULL,
    check_out DATE NOT NULL,
    guest_count INTEGER NOT NULL DEFAULT 1 CHECK (guest_count > 0),
    booking_status VARCHAR(20) NOT NULL DEFAULT 'confirmed'
        CHECK (booking_status IN ('pending', 'confirmed', 'cancelled', 'completed')),
    payment_status VARCHAR(20) NOT NULL DEFAULT 'paid'
        CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
    payment_method VARCHAR(50),
    payment_reference VARCHAR(120),
    card_last4 VARCHAR(4),
    total_amount DECIMAL(12, 2),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_rental_bookings_dates CHECK (check_out > check_in),
    CONSTRAINT chk_rental_bookings_total_amount CHECK (
        total_amount IS NULL OR total_amount >= 0
    )
);

CREATE INDEX IF NOT EXISTS idx_rental_bookings_property_id
ON rental_bookings(property_id);

CREATE INDEX IF NOT EXISTS idx_rental_bookings_owner_id
ON rental_bookings(owner_id);

CREATE INDEX IF NOT EXISTS idx_rental_bookings_tenant_id
ON rental_bookings(tenant_id);

CREATE INDEX IF NOT EXISTS idx_rental_bookings_check_in
ON rental_bookings(check_in);

CREATE INDEX IF NOT EXISTS idx_rental_bookings_check_out
ON rental_bookings(check_out);

CREATE INDEX IF NOT EXISTS idx_rental_bookings_status
ON rental_bookings(booking_status);
