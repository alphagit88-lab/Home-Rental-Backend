const pool = require("../config/database");

const SELECT_FIELDS = `
  SELECT
    rbr.id,
    rbr.rental_booking_id AS "rentalBookingId",
    rbr.reviewer_id AS "reviewerId",
    reviewer.name AS "reviewerName",
    rbr.reviewee_id AS "revieweeId",
    reviewee.name AS "revieweeName",
    rbr.reviewer_role AS "reviewerRole",
    rbr.reviewee_role AS "revieweeRole",
    rbr.rating,
    rbr.comment,
    rbr.created_at AS "createdAt",
    rbr.updated_at AS "updatedAt"
  FROM rental_booking_reviews rbr
  JOIN users reviewer ON reviewer.id = rbr.reviewer_id
  JOIN users reviewee ON reviewee.id = rbr.reviewee_id
`;

class RentalBookingReview {
  static async findById(id, client = pool) {
    const result = await client.query(
      `
        ${SELECT_FIELDS}
        WHERE rbr.id = $1
        LIMIT 1
      `,
      [id],
    );

    return result.rows[0];
  }

  static async findByBookingId(bookingId, client = pool) {
    const result = await client.query(
      `
        ${SELECT_FIELDS}
        WHERE rbr.rental_booking_id = $1
        ORDER BY rbr.created_at ASC
      `,
      [bookingId],
    );

    return result.rows;
  }

  static async findByBookingIds(bookingIds = [], client = pool) {
    const normalizedIds = [...new Set(
      bookingIds
        .map((id) => parseInt(id, 10))
        .filter((id) => Number.isInteger(id) && id > 0),
    )];

    if (normalizedIds.length === 0) {
      return [];
    }

    const result = await client.query(
      `
        ${SELECT_FIELDS}
        WHERE rbr.rental_booking_id = ANY($1::int[])
        ORDER BY rbr.created_at ASC
      `,
      [normalizedIds],
    );

    return result.rows;
  }

  static async attachToBookings(bookings, client = pool) {
    if (!Array.isArray(bookings) || bookings.length === 0) {
      return bookings;
    }

    const bookingIds = bookings
      .map((booking) => parseInt(booking.id, 10))
      .filter((id) => Number.isInteger(id) && id > 0);
    const reviews = await this.findByBookingIds(bookingIds, client);
    const groupedReviews = reviews.reduce((accumulator, review) => {
      if (!accumulator[review.rentalBookingId]) {
        accumulator[review.rentalBookingId] = [];
      }

      accumulator[review.rentalBookingId].push(review);
      return accumulator;
    }, {});

    bookings.forEach((booking) => {
      booking.reviews = groupedReviews[booking.id] || [];
    });

    return bookings;
  }

  static async upsert(data, client = pool) {
    const result = await client.query(
      `
        INSERT INTO rental_booking_reviews (
          rental_booking_id,
          reviewer_id,
          reviewee_id,
          reviewer_role,
          reviewee_role,
          rating,
          comment,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        ON CONFLICT (rental_booking_id, reviewer_id) DO UPDATE
        SET
          reviewee_id = EXCLUDED.reviewee_id,
          reviewer_role = EXCLUDED.reviewer_role,
          reviewee_role = EXCLUDED.reviewee_role,
          rating = EXCLUDED.rating,
          comment = EXCLUDED.comment,
          updated_at = NOW()
        RETURNING id
      `,
      [
        data.rentalBookingId,
        data.reviewerId,
        data.revieweeId,
        data.reviewerRole,
        data.revieweeRole,
        data.rating,
        data.comment || null,
      ],
    );

    return this.findById(result.rows[0].id, client);
  }
}

module.exports = RentalBookingReview;
