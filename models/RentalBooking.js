const pool = require("../config/database");

const ACTIVE_BOOKING_FILTER = `
  (
    rb.booking_status = 'confirmed'
    OR (
      rb.booking_status = 'pending'
      AND (
        rb.deposit_due_at IS NULL
        OR rb.deposit_due_at >= NOW()
      )
    )
  )
`;

const SELECT_FIELDS = `
  SELECT
    rb.id,
    rb.booking_code AS "bookingCode",
    rb.property_id AS "propertyId",
    rb.owner_id AS "ownerId",
    rb.tenant_id AS "tenantId",
    rb.tenant_name AS "tenantName",
    rb.tenant_email AS "tenantEmail",
    rb.check_in AS "checkIn",
    rb.check_out AS "checkOut",
    rb.guest_count AS "guestCount",
    rb.booking_status AS "bookingStatus",
    rb.payment_status AS "paymentStatus",
    rb.payment_method AS "paymentMethod",
    rb.payment_reference AS "paymentReference",
    rb.card_last4 AS "cardLast4",
    rb.total_amount AS "totalAmount",
    rb.deposit_amount AS "depositAmount",
    rb.deposit_due_at AS "depositDueAt",
    rb.deposit_paid_at AS "depositPaidAt",
    rb.remaining_amount AS "remainingAmount",
    rb.remaining_paid_at AS "remainingPaidAt",
    rb.notes,
    rb.created_at AS "createdAt",
    rb.updated_at AS "updatedAt",
    rp.property_code AS "propertyCode",
    rp.title AS "propertyTitle",
    rp.location_text AS "propertyLocationText",
    rp.latitude AS "propertyLatitude",
    rp.longitude AS "propertyLongitude",
    rp.monthly_rent AS "monthlyRent",
    owner_user.name AS "ownerName"
  FROM rental_bookings rb
  JOIN rental_properties rp ON rp.id = rb.property_id
  JOIN users owner_user ON owner_user.id = rb.owner_id
`;

class RentalBooking {
  static async syncLifecycle(client = pool) {
    await client.query(
      `
        WITH expired_bookings AS (
          UPDATE rental_bookings
          SET
            booking_status = 'cancelled',
            payment_status = 'expired',
            updated_at = NOW()
          WHERE booking_status = 'pending'
            AND payment_status = 'deposit_pending'
            AND deposit_due_at IS NOT NULL
            AND deposit_due_at < NOW()
          RETURNING id
        )
        UPDATE rental_booking_service_requests rbsr
        SET
          request_status = 'cancelled',
          updated_at = NOW()
        FROM expired_bookings
        WHERE rbsr.rental_booking_id = expired_bookings.id
          AND rbsr.request_status IN ('awaiting_full_payment', 'pending', 'accepted')
      `,
    );

    await client.query(
      `
        WITH completed_bookings AS (
          UPDATE rental_bookings
          SET
            booking_status = 'completed',
            updated_at = NOW()
          WHERE booking_status = 'confirmed'
            AND payment_status = 'paid'
            AND check_out <= CURRENT_DATE
          RETURNING id
        )
        UPDATE rental_booking_service_requests rbsr
        SET
          request_status = CASE
            WHEN rbsr.request_status = 'accepted' THEN 'completed'
            ELSE 'cancelled'
          END,
          updated_at = NOW()
        FROM completed_bookings
        WHERE rbsr.rental_booking_id = completed_bookings.id
          AND rbsr.request_status IN ('awaiting_full_payment', 'pending', 'accepted')
      `,
    );
  }

  static async findById(id, client = pool) {
    const result = await client.query(
      `
        ${SELECT_FIELDS}
        WHERE rb.id = $1
        LIMIT 1
      `,
      [id],
    );

    return result.rows[0];
  }

  static async findByTenant(tenantId, { limit } = {}, client = pool) {
    const values = [tenantId];
    let limitClause = "";

    if (limit) {
      values.push(limit);
      limitClause = `LIMIT $${values.length}`;
    }

    const result = await client.query(
      `
        ${SELECT_FIELDS}
        WHERE rb.tenant_id = $1
        ORDER BY rb.created_at DESC
        ${limitClause}
      `,
      values,
    );

    return result.rows;
  }

  static async findByOwner(ownerId, { from, to, limit } = {}, client = pool) {
    const values = [ownerId];
    const filters = ["rb.owner_id = $1"];

    if (from) {
      values.push(from);
      filters.push(`rb.check_out > $${values.length}`);
    }

    if (to) {
      values.push(to);
      filters.push(`rb.check_in <= $${values.length}`);
    }

    let limitClause = "";

    if (limit) {
      values.push(limit);
      limitClause = `LIMIT $${values.length}`;
    }

    const result = await client.query(
      `
        ${SELECT_FIELDS}
        WHERE ${filters.join(" AND ")}
        ORDER BY rb.check_in ASC, rb.created_at DESC
        ${limitClause}
      `,
      values,
    );

    return result.rows;
  }

  static async findAvailabilityByProperty(
    propertyId,
    { from, to } = {},
    client = pool,
  ) {
    const values = [propertyId];
    const filters = [
      "rb.property_id = $1",
      ACTIVE_BOOKING_FILTER,
    ];

    if (from) {
      values.push(from);
      filters.push(`rb.check_out > $${values.length}`);
    }

    if (to) {
      values.push(to);
      filters.push(`rb.check_in <= $${values.length}`);
    }

    const result = await client.query(
      `
        ${SELECT_FIELDS}
        WHERE ${filters.join(" AND ")}
        ORDER BY rb.check_in ASC
      `,
      values,
    );

    return result.rows;
  }

  static async findConflicts(propertyId, checkIn, checkOut, client = pool) {
    const result = await client.query(
      `
        ${SELECT_FIELDS}
        WHERE rb.property_id = $1
          AND ${ACTIVE_BOOKING_FILTER}
          AND rb.check_in < $3
          AND rb.check_out > $2
        ORDER BY rb.check_in ASC
      `,
      [propertyId, checkIn, checkOut],
    );

    return result.rows;
  }

  static async update(id, updates, client = pool) {
    const columnMap = {
      bookingStatus: "booking_status",
      paymentStatus: "payment_status",
      paymentMethod: "payment_method",
      paymentReference: "payment_reference",
      cardLast4: "card_last4",
      depositPaidAt: "deposit_paid_at",
      remainingPaidAt: "remaining_paid_at",
      depositDueAt: "deposit_due_at",
      depositAmount: "deposit_amount",
      remainingAmount: "remaining_amount",
      notes: "notes",
    };

    const assignments = [];
    const values = [];
    let paramCount = 1;

    Object.entries(columnMap).forEach(([key, columnName]) => {
      if (updates[key] !== undefined) {
        assignments.push(`${columnName} = $${paramCount++}`);
        values.push(updates[key]);
      }
    });

    if (assignments.length === 0) {
      return this.findById(id, client);
    }

    values.push(id);

    await client.query(
      `
        UPDATE rental_bookings
        SET ${assignments.join(", ")}, updated_at = NOW()
        WHERE id = $${paramCount}
      `,
      values,
    );

    return this.findById(id, client);
  }

  static async create(data, client = pool) {
    const result = await client.query(
      `
        INSERT INTO rental_bookings (
          booking_code,
          property_id,
          owner_id,
          tenant_id,
          tenant_name,
          tenant_email,
          check_in,
          check_out,
          guest_count,
          booking_status,
          payment_status,
          payment_method,
          payment_reference,
          card_last4,
          total_amount,
          deposit_amount,
          deposit_due_at,
          deposit_paid_at,
          remaining_amount,
          remaining_paid_at,
          notes,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14, $15, $16,
          $17, $18, $19, $20, $21,
          NOW(), NOW()
        )
        RETURNING id
      `,
      [
        data.bookingCode,
        data.propertyId,
        data.ownerId,
        data.tenantId,
        data.tenantName,
        data.tenantEmail,
        data.checkIn,
        data.checkOut,
        data.guestCount,
        data.bookingStatus,
        data.paymentStatus,
        data.paymentMethod || null,
        data.paymentReference || null,
        data.cardLast4 || null,
        data.totalAmount,
        data.depositAmount ?? null,
        data.depositDueAt || null,
        data.depositPaidAt || null,
        data.remainingAmount ?? null,
        data.remainingPaidAt || null,
        data.notes || null,
      ],
    );

    return this.findById(result.rows[0].id, client);
  }
}

module.exports = RentalBooking;
