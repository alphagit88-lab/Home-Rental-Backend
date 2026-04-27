const pool = require("../config/database");

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
    rb.notes,
    rb.created_at AS "createdAt",
    rb.updated_at AS "updatedAt",
    rp.property_code AS "propertyCode",
    rp.title AS "propertyTitle",
    rp.location_text AS "propertyLocationText",
    rp.monthly_rent AS "monthlyRent",
    owner_user.name AS "ownerName"
  FROM rental_bookings rb
  JOIN rental_properties rp ON rp.id = rb.property_id
  JOIN users owner_user ON owner_user.id = rb.owner_id
`;

class RentalBooking {
  static async findById(id) {
    const result = await pool.query(
      `
        ${SELECT_FIELDS}
        WHERE rb.id = $1
        LIMIT 1
      `,
      [id],
    );

    return result.rows[0];
  }

  static async findByTenant(tenantId, { limit } = {}) {
    const values = [tenantId];
    let limitClause = "";

    if (limit) {
      values.push(limit);
      limitClause = `LIMIT $${values.length}`;
    }

    const result = await pool.query(
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

  static async findByOwner(ownerId, { from, to, limit } = {}) {
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

    const result = await pool.query(
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

  static async findAvailabilityByProperty(propertyId, { from, to } = {}) {
    const values = [propertyId];
    const filters = [
      "rb.property_id = $1",
      "rb.booking_status IN ('pending', 'confirmed')",
    ];

    if (from) {
      values.push(from);
      filters.push(`rb.check_out > $${values.length}`);
    }

    if (to) {
      values.push(to);
      filters.push(`rb.check_in <= $${values.length}`);
    }

    const result = await pool.query(
      `
        ${SELECT_FIELDS}
        WHERE ${filters.join(" AND ")}
        ORDER BY rb.check_in ASC
      `,
      values,
    );

    return result.rows;
  }

  static async findConflicts(propertyId, checkIn, checkOut) {
    const result = await pool.query(
      `
        ${SELECT_FIELDS}
        WHERE rb.property_id = $1
          AND rb.booking_status IN ('pending', 'confirmed')
          AND rb.check_in < $3
          AND rb.check_out > $2
        ORDER BY rb.check_in ASC
      `,
      [propertyId, checkIn, checkOut],
    );

    return result.rows;
  }

  static async create(data) {
    const result = await pool.query(
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
          notes,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14, $15, $16,
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
        data.notes || null,
      ],
    );

    return this.findById(result.rows[0].id);
  }
}

module.exports = RentalBooking;
