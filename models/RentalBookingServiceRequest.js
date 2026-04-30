const pool = require("../config/database");

const DISTANCE_SQL = `
  6371 * acos(
    LEAST(
      1,
      GREATEST(
        -1,
        cos(radians(rbsr.latitude)) * cos(radians(sa.latitude)) *
        cos(radians(sa.longitude) - radians(rbsr.longitude)) +
        sin(radians(rbsr.latitude)) * sin(radians(sa.latitude))
      )
    )
  )
`;

const BASE_SELECT = `
  SELECT
    rbsr.id,
    rbsr.rental_booking_id AS "rentalBookingId",
    rbsr.property_id AS "propertyId",
    rbsr.tenant_id AS "tenantId",
    rbsr.owner_id AS "ownerId",
    rbsr.service_category_id AS "serviceCategoryId",
    sc.name AS "serviceCategoryName",
    sc.description AS "serviceCategoryDescription",
    rbsr.service_provider_id AS "serviceProviderId",
    provider.name AS "serviceProviderName",
    provider.phone AS "serviceProviderPhone",
    provider.email AS "serviceProviderEmail",
    rbsr.request_status AS "requestStatus",
    rbsr.tenant_notes AS "tenantNotes",
    rbsr.location_text AS "locationText",
    rbsr.latitude,
    rbsr.longitude,
    rb.booking_code AS "bookingCode",
    rb.check_in AS "checkIn",
    rb.check_out AS "checkOut",
    rb.guest_count AS "guestCount",
    rb.booking_status AS "bookingStatus",
    rb.payment_status AS "paymentStatus",
    rp.title AS "propertyTitle",
    tenant.name AS "tenantName",
    tenant.email AS "tenantEmail",
    owner.name AS "ownerName",
    owner.email AS "ownerEmail",
    rbsr.created_at AS "createdAt",
    rbsr.updated_at AS "updatedAt"
  FROM rental_booking_service_requests rbsr
  JOIN rental_bookings rb ON rb.id = rbsr.rental_booking_id
  JOIN rental_properties rp ON rp.id = rbsr.property_id
  JOIN service_categories sc ON sc.id = rbsr.service_category_id
  JOIN users tenant ON tenant.id = rbsr.tenant_id
  JOIN users owner ON owner.id = rbsr.owner_id
  LEFT JOIN users provider ON provider.id = rbsr.service_provider_id
`;

class RentalBookingServiceRequest {
  static async createMany(data, client = pool) {
    const normalizedCategoryIds = [...new Set(
      (data.serviceCategoryIds || [])
        .map((id) => parseInt(id, 10))
        .filter((id) => Number.isInteger(id) && id > 0),
    )];

    if (normalizedCategoryIds.length === 0) {
      return [];
    }

    const initialStatus =
      data.initialStatus && typeof data.initialStatus === "string"
        ? data.initialStatus
        : "pending";

    await client.query(
      `
        INSERT INTO rental_booking_service_requests (
          rental_booking_id,
          property_id,
          tenant_id,
          owner_id,
          service_category_id,
          service_provider_id,
          request_status,
          tenant_notes,
          location_text,
          latitude,
          longitude,
          created_at,
          updated_at
        )
        SELECT
          $1,
          $2,
          $3,
          $4,
          category_id,
          NULL,
          $5,
          $6,
          $7,
          $8,
          $9,
          NOW(),
          NOW()
        FROM UNNEST($10::int[]) AS category_id
        ON CONFLICT (rental_booking_id, service_category_id) DO NOTHING
      `,
      [
        data.rentalBookingId,
        data.propertyId,
        data.tenantId,
        data.ownerId,
        initialStatus,
        data.tenantNotes || null,
        data.locationText,
        data.latitude,
        data.longitude,
        normalizedCategoryIds,
      ],
    );

    const requests = await this.findByBookingIds([data.rentalBookingId], client);
    return requests.filter((request) =>
      normalizedCategoryIds.includes(request.serviceCategoryId),
    );
  }

  static async activateForBooking(bookingId, client = pool) {
    await client.query(
      `
        UPDATE rental_booking_service_requests
        SET
          request_status = 'pending',
          updated_at = NOW()
        WHERE rental_booking_id = $1
          AND request_status = 'awaiting_full_payment'
      `,
      [bookingId],
    );

    return this.findByBookingIds([bookingId], client);
  }

  static async findById(id, client = pool) {
    const result = await client.query(
      `
        ${BASE_SELECT}
        WHERE rbsr.id = $1
        LIMIT 1
      `,
      [id],
    );

    return result.rows[0];
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
        ${BASE_SELECT}
        WHERE rbsr.rental_booking_id = ANY($1::int[])
        ORDER BY rbsr.created_at ASC, sc.name ASC
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
    const requests = await this.findByBookingIds(bookingIds, client);
    const groupedRequests = requests.reduce((accumulator, request) => {
      const bookingId = request.rentalBookingId;

      if (!accumulator[bookingId]) {
        accumulator[bookingId] = [];
      }

      accumulator[bookingId].push(request);
      return accumulator;
    }, {});

    bookings.forEach((booking) => {
      booking.serviceRequests = groupedRequests[booking.id] || [];
    });

    return bookings;
  }

  static async findNearbyForProvider(providerId, { limit = 100 } = {}, client = pool) {
    const result = await client.query(
      `
        WITH matched_requests AS (
          SELECT DISTINCT ON (rbsr.id)
            rbsr.id AS request_id,
            sa.id AS service_area_id,
            sa.city AS service_area_city,
            ROUND(
              (
                CASE
                  WHEN sa.latitude IS NOT NULL AND sa.longitude IS NOT NULL THEN ${DISTANCE_SQL}
                  ELSE NULL
                END
              )::numeric,
              2
            ) AS distance_km
          FROM rental_booking_service_requests rbsr
          JOIN home_rental_accounts hra
            ON hra.user_id = $1
           AND hra.app_role = 'service_provider'
           AND hra.is_active = TRUE
          JOIN rental_service_provider_categories rspc
            ON rspc.provider_id = $1
           AND rspc.service_category_id = rbsr.service_category_id
          JOIN service_areas sa
            ON sa.supplier_id = $1
          LEFT JOIN rental_booking_service_responses rbsresp
            ON rbsresp.rental_service_request_id = rbsr.id
           AND rbsresp.provider_id = $1
          JOIN rental_bookings rb
            ON rb.id = rbsr.rental_booking_id
          WHERE rbsr.request_status = 'pending'
            AND rbsr.service_provider_id IS NULL
            AND rb.booking_status = 'confirmed'
            AND rb.payment_status = 'paid'
            AND rbsresp.id IS NULL
            AND (
              (
                sa.latitude IS NOT NULL
                AND sa.longitude IS NOT NULL
                AND ${DISTANCE_SQL} <= sa.area_radius_km
              )
              OR (
                (sa.latitude IS NULL OR sa.longitude IS NULL)
                AND sa.city IS NOT NULL
                AND rbsr.location_text ILIKE '%' || sa.city || '%'
              )
            )
          ORDER BY
            rbsr.id,
            distance_km NULLS LAST,
            sa.id ASC
        )
        SELECT
          rbsr.id,
          rbsr.rental_booking_id AS "rentalBookingId",
          rbsr.property_id AS "propertyId",
          rbsr.tenant_id AS "tenantId",
          rbsr.owner_id AS "ownerId",
          rbsr.service_category_id AS "serviceCategoryId",
          sc.name AS "serviceCategoryName",
          sc.description AS "serviceCategoryDescription",
          rbsr.request_status AS "requestStatus",
          rbsr.tenant_notes AS "tenantNotes",
          rbsr.location_text AS "locationText",
          rbsr.latitude,
          rbsr.longitude,
          rb.booking_code AS "bookingCode",
          rb.check_in AS "checkIn",
          rb.check_out AS "checkOut",
          rb.guest_count AS "guestCount",
          rp.title AS "propertyTitle",
          tenant.name AS "tenantName",
          tenant.email AS "tenantEmail",
          owner.name AS "ownerName",
          matched_requests.service_area_id AS "serviceAreaId",
          matched_requests.service_area_city AS "serviceAreaCity",
          matched_requests.distance_km AS "distanceKm",
          rbsr.created_at AS "createdAt",
          rbsr.updated_at AS "updatedAt"
        FROM matched_requests
        JOIN rental_booking_service_requests rbsr
          ON rbsr.id = matched_requests.request_id
        JOIN rental_bookings rb
          ON rb.id = rbsr.rental_booking_id
        JOIN rental_properties rp
          ON rp.id = rbsr.property_id
        JOIN service_categories sc
          ON sc.id = rbsr.service_category_id
        JOIN users tenant
          ON tenant.id = rbsr.tenant_id
        JOIN users owner
          ON owner.id = rbsr.owner_id
        ORDER BY
          COALESCE(matched_requests.distance_km, 999999),
          rbsr.created_at DESC
        LIMIT $2
      `,
      [providerId, limit],
    );

    return result.rows;
  }

  static async findAssignedToProvider(
    providerId,
    { status, limit = 100 } = {},
    client = pool,
  ) {
    const values = [providerId];
    let statusFilter = "";

    if (status) {
      values.push(status);
      statusFilter = `AND rbsr.request_status = $${values.length}`;
    }

    values.push(limit);

    const result = await client.query(
      `
        ${BASE_SELECT}
        LEFT JOIN rental_booking_service_responses rbsresp
          ON rbsresp.rental_service_request_id = rbsr.id
         AND rbsresp.provider_id = $1
        WHERE rbsr.service_provider_id = $1
          ${statusFilter}
        ORDER BY rbsr.updated_at DESC, rbsr.created_at DESC
        LIMIT $${values.length}
      `,
      values,
    );

    return result.rows.map((row) => ({
      ...row,
      providerResponseStatus: "accepted",
    }));
  }

  static async providerCanHandleRequest(providerId, requestId, client = pool) {
    const result = await client.query(
      `
        SELECT 1
        FROM rental_booking_service_requests rbsr
        JOIN home_rental_accounts hra
          ON hra.user_id = $1
         AND hra.app_role = 'service_provider'
         AND hra.is_active = TRUE
        JOIN rental_bookings rb
          ON rb.id = rbsr.rental_booking_id
        JOIN rental_service_provider_categories rspc
          ON rspc.provider_id = $1
         AND rspc.service_category_id = rbsr.service_category_id
        WHERE rbsr.id = $2
          AND rbsr.request_status = 'pending'
          AND rb.booking_status = 'confirmed'
          AND rb.payment_status = 'paid'
          AND EXISTS (
            SELECT 1
            FROM service_areas sa
            WHERE sa.supplier_id = $1
              AND (
                (
                  sa.latitude IS NOT NULL
                  AND sa.longitude IS NOT NULL
                  AND (
                    6371 * acos(
                      LEAST(
                        1,
                        GREATEST(
                          -1,
                          cos(radians(rbsr.latitude)) * cos(radians(sa.latitude)) *
                          cos(radians(sa.longitude) - radians(rbsr.longitude)) +
                          sin(radians(rbsr.latitude)) * sin(radians(sa.latitude))
                        )
                      )
                    )
                  ) <= sa.area_radius_km
                )
                OR (
                  (sa.latitude IS NULL OR sa.longitude IS NULL)
                  AND sa.city IS NOT NULL
                  AND rbsr.location_text ILIKE '%' || sa.city || '%'
                )
              )
          )
        LIMIT 1
      `,
      [providerId, requestId],
    );

    return result.rows.length > 0;
  }

  static async respond({ requestId, providerId, action, responseNotes }) {
    const client = await pool.connect();
    let transactionStarted = false;

    try {
      await client.query("BEGIN");
      transactionStarted = true;

      const requestResult = await client.query(
        `
          SELECT
            id,
            service_provider_id AS "serviceProviderId",
            request_status AS "requestStatus"
          FROM rental_booking_service_requests
          WHERE id = $1
          FOR UPDATE
        `,
        [requestId],
      );

      const request = requestResult.rows[0];

      if (!request) {
        throw new Error("Service request not found");
      }

      const isEligible = await this.providerCanHandleRequest(
        providerId,
        requestId,
        client,
      );

      if (!isEligible) {
        const error = new Error(
          "You cannot respond to this request because it is outside your configured service area or categories",
        );
        error.statusCode = 403;
        throw error;
      }

      if (
        action === "accept"
        && request.requestStatus === "accepted"
        && parseInt(request.serviceProviderId, 10) === parseInt(providerId, 10)
      ) {
        const currentRequest = await this.findById(requestId, client);
        await client.query("COMMIT");
        transactionStarted = false;

        return {
          request: currentRequest,
          providerResponse: {
            providerId,
            responseStatus: "accepted",
            responseNotes: responseNotes || null,
          },
        };
      }

      if (
        request.requestStatus !== "pending"
        || (
          request.serviceProviderId
          && parseInt(request.serviceProviderId, 10) !== parseInt(providerId, 10)
        )
      ) {
        const error = new Error(
          "This service request has already been handled by another provider",
        );
        error.statusCode = 409;
        throw error;
      }

      const responseResult = await client.query(
        `
          INSERT INTO rental_booking_service_responses (
            rental_service_request_id,
            provider_id,
            response_status,
            response_notes,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, NOW(), NOW())
          ON CONFLICT (rental_service_request_id, provider_id) DO UPDATE
          SET
            response_status = EXCLUDED.response_status,
            response_notes = EXCLUDED.response_notes,
            updated_at = NOW()
          RETURNING
            provider_id AS "providerId",
            response_status AS "responseStatus",
            response_notes AS "responseNotes",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
        `,
        [requestId, providerId, action === "accept" ? "accepted" : "rejected", responseNotes || null],
      );

      if (action === "accept") {
        await client.query(
          `
            UPDATE rental_booking_service_requests
            SET
              service_provider_id = $1,
              request_status = 'accepted',
              updated_at = NOW()
            WHERE id = $2
          `,
          [providerId, requestId],
        );
      }

      const updatedRequest = await this.findById(requestId, client);

      await client.query("COMMIT");
      transactionStarted = false;

      return {
        request: updatedRequest,
        providerResponse: responseResult.rows[0],
      };
    } catch (error) {
      if (transactionStarted) {
        await client.query("ROLLBACK");
      }

      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = RentalBookingServiceRequest;
