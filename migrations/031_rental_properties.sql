CREATE TABLE IF NOT EXISTS rental_properties (
    id SERIAL PRIMARY KEY,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    property_code VARCHAR(40) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    property_type VARCHAR(50) NOT NULL,
    listing_type VARCHAR(50) NOT NULL,
    bedrooms INTEGER NOT NULL DEFAULT 1 CHECK (bedrooms > 0),
    bathrooms INTEGER NOT NULL DEFAULT 1 CHECK (bathrooms > 0),
    amenities JSONB NOT NULL DEFAULT '[]'::jsonb,
    location_text TEXT NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    gallery_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rental_properties_owner_id
ON rental_properties(owner_id);

CREATE INDEX IF NOT EXISTS idx_rental_properties_active
ON rental_properties(is_active);

CREATE INDEX IF NOT EXISTS idx_rental_properties_location
ON rental_properties(latitude, longitude);
