const pool = require("../config/database");

const SELECT_FIELDS = `
  SELECT
    rbm.id,
    rbm.rental_booking_id AS "rentalBookingId",
    rbm.sender_id AS "senderId",
    sender_user.name AS "senderName",
    CASE
      WHEN rbm.sender_id = rb.tenant_id THEN 'tenant'
      ELSE 'owner'
    END AS "senderRole",
    rbm.recipient_id AS "recipientId",
    recipient_user.name AS "recipientName",
    CASE
      WHEN rbm.recipient_id = rb.tenant_id THEN 'tenant'
      ELSE 'owner'
    END AS "recipientRole",
    rbm.message_text AS "messageText",
    rbm.is_read AS "isRead",
    rbm.read_at AS "readAt",
    rbm.created_at AS "createdAt",
    rbm.updated_at AS "updatedAt"
  FROM rental_booking_messages rbm
  JOIN rental_bookings rb ON rb.id = rbm.rental_booking_id
  JOIN users sender_user ON sender_user.id = rbm.sender_id
  JOIN users recipient_user ON recipient_user.id = rbm.recipient_id
`;

class RentalBookingMessage {
  static async findById(id, client = pool) {
    const result = await client.query(
      `
        ${SELECT_FIELDS}
        WHERE rbm.id = $1
        LIMIT 1
      `,
      [id],
    );

    return result.rows[0] || null;
  }

  static async findByBookingId(rentalBookingId, client = pool) {
    const result = await client.query(
      `
        ${SELECT_FIELDS}
        WHERE rbm.rental_booking_id = $1
        ORDER BY rbm.created_at ASC, rbm.id ASC
      `,
      [rentalBookingId],
    );

    return result.rows;
  }

  static async create(
    { rentalBookingId, senderId, recipientId, messageText },
    client = pool,
  ) {
    const result = await client.query(
      `
        INSERT INTO rental_booking_messages (
          rental_booking_id,
          sender_id,
          recipient_id,
          message_text,
          is_read,
          read_at,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, FALSE, NULL, NOW(), NOW())
        RETURNING id
      `,
      [rentalBookingId, senderId, recipientId, messageText],
    );

    return this.findById(result.rows[0].id, client);
  }

  static async markAsReadForUser(rentalBookingId, userId, client = pool) {
    await client.query(
      `
        UPDATE rental_booking_messages
        SET
          is_read = TRUE,
          read_at = COALESCE(read_at, NOW()),
          updated_at = NOW()
        WHERE rental_booking_id = $1
          AND recipient_id = $2
          AND is_read = FALSE
      `,
      [rentalBookingId, userId],
    );
  }
}

module.exports = RentalBookingMessage;
