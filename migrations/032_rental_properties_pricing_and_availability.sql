ALTER TABLE rental_properties
ADD COLUMN IF NOT EXISTS monthly_rent DECIMAL(12, 2),
ADD COLUMN IF NOT EXISTS available_from DATE,
ADD COLUMN IF NOT EXISTS available_to DATE;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_rental_properties_monthly_rent_non_negative'
    ) THEN
        ALTER TABLE rental_properties
        ADD CONSTRAINT chk_rental_properties_monthly_rent_non_negative
        CHECK (monthly_rent IS NULL OR monthly_rent >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_rental_properties_available_range'
    ) THEN
        ALTER TABLE rental_properties
        ADD CONSTRAINT chk_rental_properties_available_range
        CHECK (
            available_from IS NULL
            OR available_to IS NULL
            OR available_to >= available_from
        );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_rental_properties_available_from
ON rental_properties(available_from);

CREATE INDEX IF NOT EXISTS idx_rental_properties_available_to
ON rental_properties(available_to);
