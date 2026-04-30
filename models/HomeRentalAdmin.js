const pool = require("../config/database");

const toNumber = (value) => Number(value || 0);

class HomeRentalAdmin {
  static async getDashboard() {
    const [summaryResult, recentPropertiesResult, recentBookingsResult, recentRequestsResult] =
      await Promise.all([
        pool.query(`
          SELECT
            (SELECT COUNT(*) FROM home_rental_accounts WHERE is_active = TRUE) AS "activeAccounts",
            (SELECT COUNT(*) FROM home_rental_accounts WHERE app_role = 'owner' AND is_active = TRUE) AS owners,
            (SELECT COUNT(*) FROM home_rental_accounts WHERE app_role = 'tenant' AND is_active = TRUE) AS tenants,
            (SELECT COUNT(*) FROM home_rental_accounts WHERE app_role = 'service_provider' AND is_active = TRUE) AS "serviceProviders",
            (SELECT COUNT(*) FROM rental_properties) AS "totalProperties",
            (SELECT COUNT(*) FROM rental_properties WHERE is_active = TRUE) AS "activeProperties",
            (SELECT COUNT(*) FROM rental_properties WHERE is_active = FALSE) AS "inactiveProperties",
            (SELECT COUNT(*) FROM rental_bookings) AS "totalBookings",
            (SELECT COUNT(*) FROM rental_bookings WHERE booking_status = 'pending') AS "pendingBookings",
            (SELECT COUNT(*) FROM rental_bookings WHERE booking_status = 'confirmed') AS "confirmedBookings",
            (SELECT COUNT(*) FROM rental_bookings WHERE booking_status = 'completed') AS "completedBookings",
            (SELECT COUNT(*) FROM rental_bookings WHERE booking_status = 'cancelled') AS "cancelledBookings",
            (SELECT COUNT(*) FROM rental_bookings WHERE payment_status = 'deposit_pending') AS "depositPendingBookings",
            (SELECT COUNT(*) FROM rental_bookings WHERE payment_status = 'deposit_paid') AS "depositPaidBookings",
            (SELECT COUNT(*) FROM rental_bookings WHERE payment_status = 'paid') AS "paidBookings",
            (SELECT COALESCE(SUM(total_amount), 0) FROM rental_bookings) AS "grossBookingValue",
            (SELECT COALESCE(SUM(deposit_amount), 0) FROM rental_bookings WHERE deposit_paid_at IS NOT NULL) AS "collectedDeposits",
            (
              SELECT COALESCE(
                SUM(
                  CASE
                    WHEN payment_status = 'paid' THEN total_amount
                    WHEN payment_status = 'deposit_paid' THEN deposit_amount
                    ELSE 0
                  END
                ),
                0
              )
              FROM rental_bookings
            ) AS "recognizedRevenue",
            (SELECT COUNT(*) FROM rental_booking_service_requests) AS "totalServiceRequests",
            (SELECT COUNT(*) FROM rental_booking_service_requests WHERE request_status = 'awaiting_full_payment') AS "awaitingPaymentRequests",
            (SELECT COUNT(*) FROM rental_booking_service_requests WHERE request_status = 'pending') AS "pendingServiceRequests",
            (SELECT COUNT(*) FROM rental_booking_service_requests WHERE request_status = 'accepted') AS "acceptedServiceRequests",
            (SELECT COUNT(*) FROM rental_booking_service_requests WHERE request_status = 'completed') AS "completedServiceRequests",
            (SELECT COUNT(*) FROM rental_booking_service_requests WHERE request_status = 'cancelled') AS "cancelledServiceRequests"
        `),
        pool.query(`
          SELECT
            rp.id,
            rp.property_code AS "propertyCode",
            rp.title,
            rp.location_text AS "locationText",
            rp.monthly_rent AS "monthlyRent",
            rp.is_active AS "isActive",
            owner.name AS "ownerName",
            owner.email AS "ownerEmail",
            rp.created_at AS "createdAt"
          FROM rental_properties rp
          JOIN users owner ON owner.id = rp.owner_id
          ORDER BY rp.created_at DESC
          LIMIT 5
        `),
        pool.query(`
          SELECT
            rb.id,
            rb.booking_code AS "bookingCode",
            rb.booking_status AS "bookingStatus",
            rb.payment_status AS "paymentStatus",
            rb.total_amount AS "totalAmount",
            rb.check_in AS "checkIn",
            rb.check_out AS "checkOut",
            rp.title AS "propertyTitle",
            owner.name AS "ownerName",
            rb.tenant_name AS "tenantName",
            rb.created_at AS "createdAt"
          FROM rental_bookings rb
          JOIN rental_properties rp ON rp.id = rb.property_id
          JOIN users owner ON owner.id = rb.owner_id
          ORDER BY rb.created_at DESC
          LIMIT 5
        `),
        pool.query(`
          SELECT
            rbsr.id,
            rb.booking_code AS "bookingCode",
            rp.title AS "propertyTitle",
            sc.name AS "serviceCategoryName",
            rbsr.request_status AS "requestStatus",
            tenant.name AS "tenantName",
            owner.name AS "ownerName",
            provider.name AS "serviceProviderName",
            rbsr.created_at AS "createdAt"
          FROM rental_booking_service_requests rbsr
          JOIN rental_bookings rb ON rb.id = rbsr.rental_booking_id
          JOIN rental_properties rp ON rp.id = rbsr.property_id
          JOIN service_categories sc ON sc.id = rbsr.service_category_id
          JOIN users tenant ON tenant.id = rbsr.tenant_id
          JOIN users owner ON owner.id = rbsr.owner_id
          LEFT JOIN users provider ON provider.id = rbsr.service_provider_id
          ORDER BY rbsr.created_at DESC
          LIMIT 5
        `),
      ]);

    const summaryRow = summaryResult.rows[0] || {};

    return {
      summary: {
        activeAccounts: toNumber(summaryRow.activeAccounts),
        owners: toNumber(summaryRow.owners),
        tenants: toNumber(summaryRow.tenants),
        serviceProviders: toNumber(summaryRow.serviceProviders),
        totalProperties: toNumber(summaryRow.totalProperties),
        activeProperties: toNumber(summaryRow.activeProperties),
        inactiveProperties: toNumber(summaryRow.inactiveProperties),
        totalBookings: toNumber(summaryRow.totalBookings),
        pendingBookings: toNumber(summaryRow.pendingBookings),
        confirmedBookings: toNumber(summaryRow.confirmedBookings),
        completedBookings: toNumber(summaryRow.completedBookings),
        cancelledBookings: toNumber(summaryRow.cancelledBookings),
        depositPendingBookings: toNumber(summaryRow.depositPendingBookings),
        depositPaidBookings: toNumber(summaryRow.depositPaidBookings),
        paidBookings: toNumber(summaryRow.paidBookings),
        grossBookingValue: toNumber(summaryRow.grossBookingValue),
        collectedDeposits: toNumber(summaryRow.collectedDeposits),
        recognizedRevenue: toNumber(summaryRow.recognizedRevenue),
        totalServiceRequests: toNumber(summaryRow.totalServiceRequests),
        awaitingPaymentRequests: toNumber(summaryRow.awaitingPaymentRequests),
        pendingServiceRequests: toNumber(summaryRow.pendingServiceRequests),
        acceptedServiceRequests: toNumber(summaryRow.acceptedServiceRequests),
        completedServiceRequests: toNumber(summaryRow.completedServiceRequests),
        cancelledServiceRequests: toNumber(summaryRow.cancelledServiceRequests),
      },
      recentProperties: recentPropertiesResult.rows,
      recentBookings: recentBookingsResult.rows,
      recentServiceRequests: recentRequestsResult.rows,
    };
  }

  static async getAccounts({ role, search, limit = 100 } = {}) {
    const values = [];
    const filters = [];

    if (role && role !== "all") {
      values.push(role);
      filters.push(`hra.app_role = $${values.length}`);
    }

    if (search) {
      values.push(`%${search}%`);
      filters.push(`(
        u.name ILIKE $${values.length}
        OR hra.email ILIKE $${values.length}
        OR COALESCE(u.phone, '') ILIKE $${values.length}
      )`);
    }

    values.push(limit);

    const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

    const result = await pool.query(
      `
        SELECT
          hra.id AS "accountId",
          hra.user_id AS "userId",
          hra.email,
          hra.app_role AS "appRole",
          hra.is_active AS "isActive",
          hra.created_at AS "createdAt",
          hra.updated_at AS "updatedAt",
          u.name,
          u.phone,
          u.role AS "systemRole",
          u.supplier_type AS "supplierType",
          u.supplier_id AS "supplierId",
          COALESCE(property_stats.property_count, 0) AS "propertyCount",
          COALESCE(tenant_stats.booking_count, 0) AS "bookingCount",
          COALESCE(provider_stats.assigned_request_count, 0) AS "assignedRequestCount"
        FROM home_rental_accounts hra
        JOIN users u ON u.id = hra.user_id
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS property_count
          FROM rental_properties rp
          WHERE rp.owner_id = u.id
        ) property_stats ON TRUE
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS booking_count
          FROM rental_bookings rb
          WHERE rb.tenant_id = u.id
        ) tenant_stats ON TRUE
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS assigned_request_count
          FROM rental_booking_service_requests rbsr
          WHERE rbsr.service_provider_id = u.id
        ) provider_stats ON TRUE
        ${whereClause}
        ORDER BY hra.created_at DESC
        LIMIT $${values.length}
      `,
      values,
    );

    return result.rows;
  }

  static async getProperties({ status, search, limit = 100 } = {}) {
    const values = [];
    const filters = [];

    if (status === "active") {
      filters.push("rp.is_active = TRUE");
    } else if (status === "inactive") {
      filters.push("rp.is_active = FALSE");
    }

    if (search) {
      values.push(`%${search}%`);
      filters.push(`(
        rp.title ILIKE $${values.length}
        OR rp.property_code ILIKE $${values.length}
        OR rp.location_text ILIKE $${values.length}
        OR owner.name ILIKE $${values.length}
        OR COALESCE(owner.email, '') ILIKE $${values.length}
      )`);
    }

    values.push(limit);

    const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

    const result = await pool.query(
      `
        SELECT
          rp.id,
          rp.owner_id AS "ownerId",
          rp.property_code AS "propertyCode",
          rp.title,
          rp.property_type AS "propertyType",
          rp.listing_type AS "listingType",
          rp.monthly_rent AS "monthlyRent",
          rp.available_from AS "availableFrom",
          rp.available_to AS "availableTo",
          rp.bedrooms,
          rp.bathrooms,
          COALESCE(rp.amenities, '[]'::jsonb) AS amenities,
          rp.location_text AS "locationText",
          rp.latitude,
          rp.longitude,
          COALESCE(rp.gallery_urls, '[]'::jsonb) AS "galleryUrls",
          rp.description,
          rp.is_active AS "isActive",
          rp.created_at AS "createdAt",
          rp.updated_at AS "updatedAt",
          owner.name AS "ownerName",
          owner.email AS "ownerEmail",
          owner.phone AS "ownerPhone",
          COALESCE(booking_stats.total_bookings, 0) AS "totalBookings",
          COALESCE(booking_stats.active_bookings, 0) AS "activeBookings"
        FROM rental_properties rp
        JOIN users owner ON owner.id = rp.owner_id
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*)::int AS total_bookings,
            (COUNT(*) FILTER (
              WHERE rb.booking_status IN ('pending', 'confirmed')
            ))::int AS active_bookings
          FROM rental_bookings rb
          WHERE rb.property_id = rp.id
        ) booking_stats ON TRUE
        ${whereClause}
        ORDER BY rp.created_at DESC
        LIMIT $${values.length}
      `,
      values,
    );

    return result.rows;
  }

  static async updatePropertyStatus(propertyId, isActive) {
    await pool.query(
      `
        UPDATE rental_properties
        SET
          is_active = $2,
          updated_at = NOW()
        WHERE id = $1
      `,
      [propertyId, isActive],
    );

    const result = await pool.query(
      `
        SELECT
          rp.id,
          rp.owner_id AS "ownerId",
          rp.property_code AS "propertyCode",
          rp.title,
          rp.property_type AS "propertyType",
          rp.listing_type AS "listingType",
          rp.monthly_rent AS "monthlyRent",
          rp.available_from AS "availableFrom",
          rp.available_to AS "availableTo",
          rp.bedrooms,
          rp.bathrooms,
          COALESCE(rp.amenities, '[]'::jsonb) AS amenities,
          rp.location_text AS "locationText",
          rp.latitude,
          rp.longitude,
          COALESCE(rp.gallery_urls, '[]'::jsonb) AS "galleryUrls",
          rp.description,
          rp.is_active AS "isActive",
          rp.created_at AS "createdAt",
          rp.updated_at AS "updatedAt",
          owner.name AS "ownerName",
          owner.email AS "ownerEmail",
          owner.phone AS "ownerPhone"
        FROM rental_properties rp
        JOIN users owner ON owner.id = rp.owner_id
        WHERE rp.id = $1
        LIMIT 1
      `,
      [propertyId],
    );

    return result.rows[0];
  }

  static async getBookings({ bookingStatus, paymentStatus, search, limit = 100 } = {}) {
    const values = [];
    const filters = [];

    if (bookingStatus && bookingStatus !== "all") {
      values.push(bookingStatus);
      filters.push(`rb.booking_status = $${values.length}`);
    }

    if (paymentStatus && paymentStatus !== "all") {
      values.push(paymentStatus);
      filters.push(`rb.payment_status = $${values.length}`);
    }

    if (search) {
      values.push(`%${search}%`);
      filters.push(`(
        rb.booking_code ILIKE $${values.length}
        OR rp.title ILIKE $${values.length}
        OR rb.tenant_name ILIKE $${values.length}
        OR rb.tenant_email ILIKE $${values.length}
        OR owner.name ILIKE $${values.length}
      )`);
    }

    values.push(limit);

    const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

    const result = await pool.query(
      `
        SELECT
          rb.id,
          rb.booking_code AS "bookingCode",
          rb.property_id AS "propertyId",
          rb.owner_id AS "ownerId",
          rb.tenant_id AS "tenantId",
          rb.tenant_name AS "tenantName",
          rb.tenant_email AS "tenantEmail",
          tenant_user.phone AS "tenantPhone",
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
          rp.monthly_rent AS "monthlyRent",
          owner.name AS "ownerName",
          owner.email AS "ownerEmail",
          owner.phone AS "ownerPhone",
          COALESCE(service_request_stats.service_request_count, 0) AS "serviceRequestCount",
          COALESCE(review_stats.review_count, 0) AS "reviewCount"
        FROM rental_bookings rb
        JOIN rental_properties rp ON rp.id = rb.property_id
        JOIN users owner ON owner.id = rb.owner_id
        LEFT JOIN users tenant_user ON tenant_user.id = rb.tenant_id
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS service_request_count
          FROM rental_booking_service_requests rbsr
          WHERE rbsr.rental_booking_id = rb.id
        ) service_request_stats ON TRUE
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS review_count
          FROM rental_booking_reviews rbr
          WHERE rbr.rental_booking_id = rb.id
        ) review_stats ON TRUE
        ${whereClause}
        ORDER BY rb.created_at DESC
        LIMIT $${values.length}
      `,
      values,
    );

    return result.rows;
  }

  static async getServiceRequests({ status, search, limit = 100 } = {}) {
    const values = [];
    const filters = [];

    if (status && status !== "all") {
      values.push(status);
      filters.push(`rbsr.request_status = $${values.length}`);
    }

    if (search) {
      values.push(`%${search}%`);
      filters.push(`(
        rb.booking_code ILIKE $${values.length}
        OR rp.title ILIKE $${values.length}
        OR sc.name ILIKE $${values.length}
        OR tenant.name ILIKE $${values.length}
        OR owner.name ILIKE $${values.length}
        OR COALESCE(provider.name, '') ILIKE $${values.length}
      )`);
    }

    values.push(limit);

    const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

    const result = await pool.query(
      `
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
          rp.property_code AS "propertyCode",
          rp.title AS "propertyTitle",
          tenant.name AS "tenantName",
          tenant.email AS "tenantEmail",
          owner.name AS "ownerName",
          owner.email AS "ownerEmail",
          COALESCE(response_stats.response_count, 0) AS "responseCount",
          rbsr.created_at AS "createdAt",
          rbsr.updated_at AS "updatedAt"
        FROM rental_booking_service_requests rbsr
        JOIN rental_bookings rb ON rb.id = rbsr.rental_booking_id
        JOIN rental_properties rp ON rp.id = rbsr.property_id
        JOIN service_categories sc ON sc.id = rbsr.service_category_id
        JOIN users tenant ON tenant.id = rbsr.tenant_id
        JOIN users owner ON owner.id = rbsr.owner_id
        LEFT JOIN users provider ON provider.id = rbsr.service_provider_id
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS response_count
          FROM rental_booking_service_responses rbsresp
          WHERE rbsresp.rental_service_request_id = rbsr.id
        ) response_stats ON TRUE
        ${whereClause}
        ORDER BY rbsr.updated_at DESC, rbsr.created_at DESC
        LIMIT $${values.length}
      `,
      values,
    );

    return result.rows;
  }
}

module.exports = HomeRentalAdmin;
