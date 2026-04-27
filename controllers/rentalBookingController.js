const pool = require("../config/database");
const RentalBooking = require("../models/RentalBooking");
const ServiceCategory = require("../models/ServiceCategory");
const RentalBookingServiceRequest = require("../models/RentalBookingServiceRequest");

const buildBookingCode = () =>
  `RB-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;

const toPositiveInteger = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsedValue = parseInt(value, 10);
  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : null;
};

const toDateString = (value) => {
  const normalizedValue = String(value ?? "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
    return null;
  }

  const parsedDate = new Date(`${normalizedValue}T00:00:00Z`);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return normalizedValue;
};

const addDaysToIsoDate = (value, days) => {
  const normalizedValue = toDateString(value);

  if (!normalizedValue || !Number.isInteger(days)) {
    return null;
  }

  const parsedDate = new Date(`${normalizedValue}T00:00:00Z`);
  parsedDate.setUTCDate(parsedDate.getUTCDate() + days);

  return `${String(parsedDate.getUTCFullYear()).padStart(4, "0")}-${String(
    parsedDate.getUTCMonth() + 1,
  ).padStart(2, "0")}-${String(parsedDate.getUTCDate()).padStart(2, "0")}`;
};

const expandStayDates = (checkIn, checkOut) => {
  const normalizedCheckIn = toDateString(checkIn);
  const normalizedCheckOut = toDateString(checkOut);

  if (
    !normalizedCheckIn
    || !normalizedCheckOut
    || normalizedCheckOut <= normalizedCheckIn
  ) {
    return [];
  }

  const dates = [];
  let currentDate = normalizedCheckIn;

  while (currentDate < normalizedCheckOut) {
    dates.push(currentDate);
    const nextDate = addDaysToIsoDate(currentDate, 1);

    if (!nextDate) {
      break;
    }

    currentDate = nextDate;
  }

  return dates;
};

const getTodayIsoDate = () => {
  const today = new Date();

  return `${String(today.getUTCFullYear()).padStart(4, "0")}-${String(
    today.getUTCMonth() + 1,
  ).padStart(2, "0")}-${String(today.getUTCDate()).padStart(2, "0")}`;
};

const parseServiceCategoryIds = (...candidateValues) => {
  const rawValue = candidateValues.find(
    (value) => value !== undefined && value !== null && value !== "",
  );

  if (rawValue === undefined) {
    return [];
  }

  let parsedValues = rawValue;

  if (typeof parsedValues === "string") {
    const trimmedValue = parsedValues.trim();

    if (!trimmedValue) {
      return [];
    }

    if (trimmedValue.startsWith("[")) {
      try {
        parsedValues = JSON.parse(trimmedValue);
      } catch (error) {
        parsedValues = trimmedValue.split(",");
      }
    } else {
      parsedValues = trimmedValue.split(",");
    }
  }

  if (!Array.isArray(parsedValues)) {
    parsedValues = [parsedValues];
  }

  return [...new Set(
    parsedValues
      .map((value) => parseInt(value, 10))
      .filter((value) => Number.isInteger(value) && value > 0),
  )];
};

const getPropertyById = async (propertyId, client = pool) => {
  const result = await client.query(
    `
      SELECT
        id,
        owner_id AS "ownerId",
        property_code AS "propertyCode",
        title,
        location_text AS "locationText",
        latitude,
        longitude,
        monthly_rent AS "monthlyRent",
        available_from AS "availableFrom",
        available_to AS "availableTo",
        is_active AS "isActive"
      FROM rental_properties
      WHERE id = $1
      LIMIT 1
    `,
    [propertyId],
  );

  return result.rows[0];
};

const attachServiceRequests = async (bookings) => {
  await RentalBookingServiceRequest.attachToBookings(bookings);
  return bookings;
};

const getMyBookings = async (req, res) => {
  try {
    const limit = toPositiveInteger(req.query.limit);
    const bookings = await RentalBooking.findByTenant(req.user.id, { limit });

    await attachServiceRequests(bookings);

    res.json({
      success: true,
      data: { bookings },
    });
  } catch (error) {
    console.error("Get my rental bookings error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching your bookings",
      error: error.message,
    });
  }
};

const getOwnerBookings = async (req, res) => {
  try {
    const from = req.query.from ? toDateString(req.query.from) : null;
    const to = req.query.to ? toDateString(req.query.to) : null;
    const limit = toPositiveInteger(req.query.limit);

    if ((req.query.from && !from) || (req.query.to && !to)) {
      return res.status(400).json({
        success: false,
        message: "from and to must use the YYYY-MM-DD format",
      });
    }

    const bookings = await RentalBooking.findByOwner(req.user.id, {
      from,
      to,
      limit,
    });

    await attachServiceRequests(bookings);

    res.json({
      success: true,
      data: { bookings },
    });
  } catch (error) {
    console.error("Get owner rental bookings error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching owner bookings",
      error: error.message,
    });
  }
};

const getPropertyAvailability = async (req, res) => {
  try {
    const propertyId = toPositiveInteger(req.params.propertyId);

    if (!propertyId) {
      return res.status(400).json({
        success: false,
        message: "A valid propertyId is required",
      });
    }

    const property = await getPropertyById(propertyId);

    if (!property || !property.isActive) {
      return res.status(404).json({
        success: false,
        message: "Property not found",
      });
    }

    const from = req.query.from
      ? toDateString(req.query.from)
      : getTodayIsoDate();
    const to = req.query.to
      ? toDateString(req.query.to)
      : addDaysToIsoDate(from, 365);

    if (!from || !to || to <= from) {
      return res.status(400).json({
        success: false,
        message: "Use valid YYYY-MM-DD dates and ensure to is after from",
      });
    }

    const bookings = await RentalBooking.findAvailabilityByProperty(
      propertyId,
      {
        from,
        to,
      },
    );

    const bookedDates = Array.from(
      new Set(
        bookings.flatMap((booking) =>
          expandStayDates(booking.checkIn, booking.checkOut),
        ),
      ),
    ).sort((a, b) => a.localeCompare(b));

    res.json({
      success: true,
      data: {
        availability: {
          bookings,
          bookedDates,
          from,
          propertyId,
          to,
        },
      },
    });
  } catch (error) {
    console.error("Get property rental availability error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching property availability",
      error: error.message,
    });
  }
};

const createBooking = async (req, res) => {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    const propertyId = toPositiveInteger(
      req.body.propertyId || req.body.property_id,
    );
    const guestCount = toPositiveInteger(
      req.body.guestCount || req.body.guest_count,
    );
    const checkIn = toDateString(req.body.checkIn || req.body.check_in);
    const checkOut = toDateString(req.body.checkOut || req.body.check_out);
    const contactName = String(
      req.body.contactName || req.body.contact_name || "",
    ).trim();
    const contactEmail = String(
      req.body.contactEmail || req.body.contact_email || "",
    )
      .trim()
      .toLowerCase();
    const paymentMethod = String(
      req.body.paymentMethod || req.body.payment_method || "card",
    ).trim();
    const paymentReference = String(
      req.body.paymentReference || req.body.payment_reference || "",
    ).trim();
    const cardLast4 = String(req.body.cardLast4 || req.body.card_last4 || "")
      .replace(/\D/g, "")
      .slice(-4);
    const requestedServiceCategoryIds = parseServiceCategoryIds(
      req.body.serviceCategoryIds,
      req.body.service_category_ids,
      req.body.selectedServiceIds,
      req.body.selected_service_ids,
      req.body.selectedServices,
      req.body.selected_services,
    );
    const serviceNotes = String(
      req.body.serviceNotes || req.body.service_notes || "",
    ).trim();

    if (!propertyId || !guestCount || !checkIn || !checkOut) {
      return res.status(400).json({
        success: false,
        message: "propertyId, checkIn, checkOut, and guestCount are required",
      });
    }

    if (!contactName || !contactEmail.includes("@")) {
      return res.status(400).json({
        success: false,
        message: "Valid contactName and contactEmail are required",
      });
    }

    if (checkOut <= checkIn) {
      return res.status(400).json({
        success: false,
        message: "checkOut must be after checkIn",
      });
    }

    let selectedServiceCategories = [];
    if (requestedServiceCategoryIds.length > 0) {
      selectedServiceCategories = await ServiceCategory.findByIds(
        requestedServiceCategoryIds,
      );

      if (selectedServiceCategories.length !== requestedServiceCategoryIds.length) {
        return res.status(400).json({
          success: false,
          message: "One or more selected service categories are invalid or inactive",
        });
      }
    }

    await client.query("BEGIN");
    transactionStarted = true;

    await client.query(
      "SELECT id FROM rental_properties WHERE id = $1 FOR UPDATE",
      [propertyId],
    );

    const property = await getPropertyById(propertyId, client);

    if (!property || !property.isActive) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(404).json({
        success: false,
        message: "Property not found",
      });
    }

    if (property.availableFrom && checkIn < property.availableFrom) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(400).json({
        success: false,
        message: "checkIn is before the property availableFrom date",
      });
    }

    if (property.availableTo && checkOut > property.availableTo) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(400).json({
        success: false,
        message: "checkOut is after the property availableTo date",
      });
    }

    const conflicts = await RentalBooking.findConflicts(
      propertyId,
      checkIn,
      checkOut,
      client,
    );

    if (conflicts.length > 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(409).json({
        success: false,
        message: "The selected stay dates are already booked",
      });
    }

    const totalAmount =
      property.monthlyRent === null || property.monthlyRent === undefined
        ? null
        : Number(property.monthlyRent);

    const booking = await RentalBooking.create(
      {
        bookingCode: buildBookingCode(),
        propertyId,
        ownerId: property.ownerId,
        tenantId: req.user.id,
        tenantName: contactName,
        tenantEmail: contactEmail,
        checkIn,
        checkOut,
        guestCount,
        bookingStatus: "confirmed",
        paymentStatus: "paid",
        paymentMethod,
        paymentReference: paymentReference || null,
        cardLast4: cardLast4 || null,
        totalAmount,
        notes: req.body.notes || null,
      },
      client,
    );

    const serviceRequests = await RentalBookingServiceRequest.createMany(
      {
        rentalBookingId: booking.id,
        propertyId: booking.propertyId,
        tenantId: req.user.id,
        ownerId: property.ownerId,
        serviceCategoryIds: selectedServiceCategories.map((category) => category.id),
        tenantNotes: serviceNotes || null,
        locationText: property.locationText,
        latitude: property.latitude,
        longitude: property.longitude,
      },
      client,
    );

    await client.query("COMMIT");
    transactionStarted = false;

    booking.serviceRequests = serviceRequests;

    res.status(201).json({
      success: true,
      message: "Booking created successfully",
      data: { booking },
    });
  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK");
    }

    console.error("Create rental booking error:", error);
    res.status(500).json({
      success: false,
      message: "Error creating booking",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

module.exports = {
  createBooking,
  getMyBookings,
  getOwnerBookings,
  getPropertyAvailability,
};
