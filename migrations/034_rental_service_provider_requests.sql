DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'home_rental_accounts_app_role_check'
    ) THEN
        ALTER TABLE home_rental_accounts
        DROP CONSTRAINT home_rental_accounts_app_role_check;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'home_rental_accounts_app_role_check'
    ) THEN
        ALTER TABLE home_rental_accounts
        ADD CONSTRAINT home_rental_accounts_app_role_check
        CHECK (app_role IN ('tenant', 'owner', 'service_provider'));
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS rental_service_provider_categories (
    provider_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    service_category_id INTEGER NOT NULL REFERENCES service_categories(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (provider_id, service_category_id)
);

CREATE INDEX IF NOT EXISTS idx_rental_service_provider_categories_provider_id
ON rental_service_provider_categories(provider_id);

CREATE INDEX IF NOT EXISTS idx_rental_service_provider_categories_category_id
ON rental_service_provider_categories(service_category_id);

CREATE TABLE IF NOT EXISTS rental_booking_service_requests (
    id SERIAL PRIMARY KEY,
    rental_booking_id INTEGER NOT NULL REFERENCES rental_bookings(id) ON DELETE CASCADE,
    property_id INTEGER NOT NULL REFERENCES rental_properties(id) ON DELETE CASCADE,
    tenant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    service_category_id INTEGER NOT NULL REFERENCES service_categories(id) ON DELETE CASCADE,
    service_provider_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    request_status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (request_status IN ('pending', 'accepted', 'cancelled', 'completed')),
    tenant_notes TEXT,
    location_text TEXT NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rental_booking_service_requests_unique_booking_category
ON rental_booking_service_requests(rental_booking_id, service_category_id);

CREATE INDEX IF NOT EXISTS idx_rental_booking_service_requests_provider_id
ON rental_booking_service_requests(service_provider_id);

CREATE INDEX IF NOT EXISTS idx_rental_booking_service_requests_status
ON rental_booking_service_requests(request_status);

CREATE INDEX IF NOT EXISTS idx_rental_booking_service_requests_booking_id
ON rental_booking_service_requests(rental_booking_id);

CREATE INDEX IF NOT EXISTS idx_rental_booking_service_requests_category_id
ON rental_booking_service_requests(service_category_id);

CREATE INDEX IF NOT EXISTS idx_rental_booking_service_requests_location
ON rental_booking_service_requests(latitude, longitude);

CREATE TABLE IF NOT EXISTS rental_booking_service_responses (
    id SERIAL PRIMARY KEY,
    rental_service_request_id INTEGER NOT NULL REFERENCES rental_booking_service_requests(id) ON DELETE CASCADE,
    provider_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    response_status VARCHAR(20) NOT NULL
        CHECK (response_status IN ('accepted', 'rejected')),
    response_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_rental_booking_service_responses_request_provider
        UNIQUE (rental_service_request_id, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_rental_booking_service_responses_request_id
ON rental_booking_service_responses(rental_service_request_id);

CREATE INDEX IF NOT EXISTS idx_rental_booking_service_responses_provider_id
ON rental_booking_service_responses(provider_id);
