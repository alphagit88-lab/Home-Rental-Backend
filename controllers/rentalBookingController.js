const pool = require("../config/database");
const RentalBooking = require("../models/RentalBooking");
const RentalBookingMessage = require("../models/RentalBookingMessage");
const ServiceCategory = require("../models/ServiceCategory");
const RentalBookingReview = require("../models/RentalBookingReview");
const RentalBookingServiceRequest = require("../models/RentalBookingServiceRequest");

const DEPOSIT_PERCENTAGE = 0.2;
const DEPOSIT_WINDOW_HOURS = 24;

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

const addHours = (date, hours) => {
  const baseDate = date instanceof Date ? date : new Date(date);
  return new Date(baseDate.getTime() + hours * 60 * 60 * 1000);
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

const normalizePaymentPayload = (body = {}) => ({
  paymentMethod: String(body.paymentMethod || body.payment_method || "card").trim(),
  paymentReference: String(
    body.paymentReference || body.payment_reference || "",
  ).trim(),
  cardLast4: String(body.cardLast4 || body.card_last4 || "")
    .replace(/\D/g, "")
    .slice(-4),
});

const toMoneyCents = (value) => {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    return null;
  }

  return Math.max(0, Math.round(parsedValue * 100));
};

const centsToMoney = (value) => Number((value / 100).toFixed(2));

const buildPaymentPlan = (totalAmount) => {
  const totalCents = toMoneyCents(totalAmount);

  if (totalCents === null) {
    return null;
  }

  const depositCents = Math.round(totalCents * DEPOSIT_PERCENTAGE);
  const remainingCents = totalCents - depositCents;

  return {
    totalAmount: centsToMoney(totalCents),
    depositAmount: centsToMoney(depositCents),
    remainingAmount: centsToMoney(remainingCents),
  };
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

const attachBookingRelations = async (bookings, client = pool) => {
  await Promise.all([
    RentalBookingServiceRequest.attachToBookings(bookings, client),
    RentalBookingReview.attachToBookings(bookings, client),
  ]);

  return bookings;
};

const loadBookingWithRelations = async (bookingId, client = pool) => {
  const booking = await RentalBooking.findById(bookingId, client);

  if (!booking) {
    return null;
  }

  await attachBookingRelations([booking], client);
  return booking;
};

const canAccessBooking = (booking, user) =>
  Boolean(
    booking
      && user
      && (
        user.role === "admin"
        || parseInt(booking.tenantId, 10) === parseInt(user.id, 10)
        || parseInt(booking.ownerId, 10) === parseInt(user.id, 10)
      ),
  );

const getReviewRolesForUser = (booking, userId) => {
  if (parseInt(booking.tenantId, 10) === parseInt(userId, 10)) {
    return {
      reviewerRole: "tenant",
      revieweeRole: "owner",
      revieweeId: booking.ownerId,
    };
  }

  if (parseInt(booking.ownerId, 10) === parseInt(userId, 10)) {
    return {
      reviewerRole: "owner",
      revieweeRole: "tenant",
      revieweeId: booking.tenantId,
    };
  }

  return null;
};

const emitRentalEventToUser = (io, userId, eventName, payload) => {
  if (!io || !userId) {
    return;
  }

  io.to(`user_${userId}`).emit(eventName, payload);
  io.to(`supplier_${userId}`).emit(eventName, payload);
};

const emitBookingUpdated = (req, booking, eventName = "rental_booking_updated") => {
  const io = req.app.get("io");

  if (!io || !booking) {
    return;
  }

  emitRentalEventToUser(io, booking.tenantId, eventName, { booking });
  emitRentalEventToUser(io, booking.ownerId, eventName, { booking });
};

const emitBookingMessageCreated = (req, booking, message) => {
  const io = req.app.get("io");

  if (!io || !booking || !message) {
    return;
  }

  const payload = {
    bookingId: booking.id,
    message,
  };

  emitRentalEventToUser(
    io,
    booking.tenantId,
    "rental_booking_message_created",
    payload,
  );
  emitRentalEventToUser(
    io,
    booking.ownerId,
    "rental_booking_message_created",
    payload,
  );
};

const getMyBookings = async (req, res) => {
  try {
    const limit = toPositiveInteger(req.query.limit);

    await RentalBooking.syncLifecycle();

    const bookings = await RentalBooking.findByTenant(req.user.id, { limit });
    await attachBookingRelations(bookings);

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

    await RentalBooking.syncLifecycle();

    const bookings = await RentalBooking.findByOwner(req.user.id, {
      from,
      to,
      limit,
    });
    await attachBookingRelations(bookings);

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

    await RentalBooking.syncLifecycle();

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
    const preferredPayment = normalizePaymentPayload(req.body);
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

    await RentalBooking.syncLifecycle(client);

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

    if (property.monthlyRent === null || property.monthlyRent === undefined) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(400).json({
        success: false,
        message: "This property cannot be booked until monthly rent is configured",
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

    const paymentPlan = buildPaymentPlan(property.monthlyRent);

    if (!paymentPlan) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(400).json({
        success: false,
        message: "Property pricing is invalid",
      });
    }

    const isFullyPaidAtCreation = paymentPlan.totalAmount === 0;
    const paidAt = isFullyPaidAtCreation ? new Date() : null;

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
        bookingStatus: isFullyPaidAtCreation ? "confirmed" : "pending",
        paymentStatus: isFullyPaidAtCreation ? "paid" : "deposit_pending",
        paymentMethod: preferredPayment.paymentMethod || null,
        paymentReference: null,
        cardLast4: null,
        totalAmount: paymentPlan.totalAmount,
        depositAmount: paymentPlan.depositAmount,
        depositDueAt: isFullyPaidAtCreation
          ? null
          : addHours(new Date(), DEPOSIT_WINDOW_HOURS),
        depositPaidAt: paidAt,
        remainingAmount: paymentPlan.remainingAmount,
        remainingPaidAt: paidAt,
        notes: req.body.notes ? String(req.body.notes).trim() : null,
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
        initialStatus: isFullyPaidAtCreation
          ? "pending"
          : "awaiting_full_payment",
      },
      client,
    );

    await client.query("COMMIT");
    transactionStarted = false;

    booking.serviceRequests = serviceRequests;
    booking.reviews = [];

    res.status(201).json({
      success: true,
      message: isFullyPaidAtCreation
        ? "Booking created successfully"
        : `Booking created. Pay the 20% deposit within ${DEPOSIT_WINDOW_HOURS} hours to confirm it.`,
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

const payBookingDeposit = async (req, res) => {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    const bookingId = toPositiveInteger(req.params.id);
    const paymentPayload = normalizePaymentPayload(req.body);

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: "A valid booking id is required",
      });
    }

    await client.query("BEGIN");
    transactionStarted = true;

    await RentalBooking.syncLifecycle(client);
    await client.query(
      "SELECT id FROM rental_bookings WHERE id = $1 FOR UPDATE",
      [bookingId],
    );

    const booking = await RentalBooking.findById(bookingId, client);

    if (!booking) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    if (parseInt(booking.tenantId, 10) !== parseInt(req.user.id, 10)) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(403).json({
        success: false,
        message: "You can only pay the deposit for your own booking",
      });
    }

    if (booking.bookingStatus === "cancelled" || booking.paymentStatus === "expired") {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(409).json({
        success: false,
        message: "This booking is no longer active because the deposit window expired",
      });
    }

    if (booking.paymentStatus === "deposit_paid" || booking.paymentStatus === "paid") {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(400).json({
        success: false,
        message: "The deposit has already been paid for this booking",
      });
    }

    if (booking.paymentStatus !== "deposit_pending") {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(400).json({
        success: false,
        message: "This booking is not waiting for a deposit payment",
      });
    }

    const updatedBooking = await RentalBooking.update(
      bookingId,
      {
        bookingStatus: "confirmed",
        paymentStatus: Number(booking.remainingAmount) > 0 ? "deposit_paid" : "paid",
        paymentMethod: paymentPayload.paymentMethod || booking.paymentMethod,
        paymentReference: paymentPayload.paymentReference || null,
        cardLast4: paymentPayload.cardLast4 || null,
        depositPaidAt: new Date(),
        remainingPaidAt:
          Number(booking.remainingAmount) > 0 ? booking.remainingPaidAt : new Date(),
      },
      client,
    );

    if (updatedBooking.paymentStatus === "paid") {
      await RentalBookingServiceRequest.activateForBooking(bookingId, client);
    }

    await attachBookingRelations([updatedBooking], client);

    await client.query("COMMIT");
    transactionStarted = false;

    emitBookingUpdated(req, updatedBooking);

    res.json({
      success: true,
      message:
        updatedBooking.paymentStatus === "paid"
          ? "Booking paid in full successfully"
          : "Booking deposit paid successfully",
      data: { booking: updatedBooking },
    });
  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK");
    }

    console.error("Pay rental booking deposit error:", error);
    res.status(500).json({
      success: false,
      message: "Error paying booking deposit",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

const payBookingBalance = async (req, res) => {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    const bookingId = toPositiveInteger(req.params.id);
    const paymentPayload = normalizePaymentPayload(req.body);

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: "A valid booking id is required",
      });
    }

    await client.query("BEGIN");
    transactionStarted = true;

    await RentalBooking.syncLifecycle(client);
    await client.query(
      "SELECT id FROM rental_bookings WHERE id = $1 FOR UPDATE",
      [bookingId],
    );

    const booking = await RentalBooking.findById(bookingId, client);

    if (!booking) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    if (parseInt(booking.tenantId, 10) !== parseInt(req.user.id, 10)) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(403).json({
        success: false,
        message: "You can only pay the remaining amount for your own booking",
      });
    }

    if (booking.bookingStatus === "cancelled" || booking.paymentStatus === "expired") {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(409).json({
        success: false,
        message: "This booking is no longer active",
      });
    }

    if (booking.paymentStatus === "paid") {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(400).json({
        success: false,
        message: "This booking has already been paid in full",
      });
    }

    if (booking.paymentStatus !== "deposit_paid") {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(400).json({
        success: false,
        message: "Pay the 20% deposit first before settling the remaining amount",
      });
    }

    await RentalBooking.update(
      bookingId,
      {
        bookingStatus: "confirmed",
        paymentStatus: "paid",
        paymentMethod: paymentPayload.paymentMethod || booking.paymentMethod,
        paymentReference: paymentPayload.paymentReference || null,
        cardLast4: paymentPayload.cardLast4 || booking.cardLast4 || null,
        remainingPaidAt: new Date(),
      },
      client,
    );

    await RentalBookingServiceRequest.activateForBooking(bookingId, client);

    const updatedBooking = await loadBookingWithRelations(bookingId, client);

    await client.query("COMMIT");
    transactionStarted = false;

    emitBookingUpdated(req, updatedBooking);

    res.json({
      success: true,
      message:
        "Full payment received successfully. Service provider flow is now active for this booking.",
      data: { booking: updatedBooking },
    });
  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK");
    }

    console.error("Pay rental booking balance error:", error);
    res.status(500).json({
      success: false,
      message: "Error paying the remaining booking amount",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

const confirmBooking = async (req, res) => {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    const bookingId = toPositiveInteger(req.params.id);

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: "A valid booking id is required",
      });
    }

    await client.query("BEGIN");
    transactionStarted = true;

    await RentalBooking.syncLifecycle(client);
    await client.query(
      "SELECT id FROM rental_bookings WHERE id = $1 FOR UPDATE",
      [bookingId],
    );

    const booking = await RentalBooking.findById(bookingId, client);

    if (!booking) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    if (parseInt(booking.ownerId, 10) !== parseInt(req.user.id, 10)) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(403).json({
        success: false,
        message: "You can only confirm booking requests for your own properties",
      });
    }

    if (booking.bookingStatus === "cancelled" || booking.paymentStatus === "expired") {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(409).json({
        success: false,
        message: "This booking request is no longer active",
      });
    }

    if (booking.bookingStatus !== "pending") {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(400).json({
        success: false,
        message: "This booking request has already been processed",
      });
    }

    const updatedBooking = await RentalBooking.update(
      bookingId,
      { bookingStatus: "confirmed" },
      client,
    );

    await attachBookingRelations([updatedBooking], client);

    await client.query("COMMIT");
    transactionStarted = false;

    emitBookingUpdated(req, updatedBooking);

    res.json({
      success: true,
      message:
        "Booking request confirmed successfully. The tenant can now pay the 20% deposit.",
      data: { booking: updatedBooking },
    });
  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK");
    }

    console.error("Confirm rental booking error:", error);
    res.status(500).json({
      success: false,
      message: "Error confirming booking request",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

const getBookingMessages = async (req, res) => {
  const client = await pool.connect();

  try {
    const bookingId = toPositiveInteger(req.params.id);

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: "A valid booking id is required",
      });
    }

    await RentalBooking.syncLifecycle(client);

    const booking = await RentalBooking.findById(bookingId, client);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    if (!canAccessBooking(booking, req.user)) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to view messages for this booking",
      });
    }

    await RentalBookingMessage.markAsReadForUser(bookingId, req.user.id, client);
    const messages = await RentalBookingMessage.findByBookingId(bookingId, client);

    res.json({
      success: true,
      data: {
        bookingId,
        messages,
      },
    });
  } catch (error) {
    console.error("Get rental booking messages error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching booking messages",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

const sendBookingMessage = async (req, res) => {
  const client = await pool.connect();

  try {
    const bookingId = toPositiveInteger(req.params.id);
    const messageText = String(
      req.body.messageText || req.body.message_text || req.body.message || "",
    ).trim();

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: "A valid booking id is required",
      });
    }

    if (!messageText) {
      return res.status(400).json({
        success: false,
        message: "messageText is required",
      });
    }

    await RentalBooking.syncLifecycle(client);

    const booking = await RentalBooking.findById(bookingId, client);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    const participantRoles = getReviewRolesForUser(booking, req.user.id);

    if (!participantRoles) {
      return res.status(403).json({
        success: false,
        message: "Only the tenant or owner of this booking can send messages",
      });
    }

    const recipientId =
      participantRoles.reviewerRole === "tenant"
        ? booking.ownerId
        : booking.tenantId;

    const message = await RentalBookingMessage.create(
      {
        rentalBookingId: bookingId,
        senderId: req.user.id,
        recipientId,
        messageText,
      },
      client,
    );

    emitBookingMessageCreated(req, booking, message);

    res.status(201).json({
      success: true,
      message: "Booking message sent successfully",
      data: {
        bookingId,
        bookingMessage: message,
      },
    });
  } catch (error) {
    console.error("Send rental booking message error:", error);
    res.status(500).json({
      success: false,
      message: "Error sending booking message",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

const getBookingReviews = async (req, res) => {
  try {
    const bookingId = toPositiveInteger(req.params.id);

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: "A valid booking id is required",
      });
    }

    await RentalBooking.syncLifecycle();

    const booking = await RentalBooking.findById(bookingId);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    if (!canAccessBooking(booking, req.user)) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to view reviews for this booking",
      });
    }

    const reviews = await RentalBookingReview.findByBookingId(bookingId);

    res.json({
      success: true,
      data: {
        bookingId,
        reviews,
      },
    });
  } catch (error) {
    console.error("Get rental booking reviews error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching booking reviews",
      error: error.message,
    });
  }
};

const saveBookingReview = async (req, res) => {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    const bookingId = toPositiveInteger(req.params.id);
    const rating = toPositiveInteger(req.body.rating);
    const comment = req.body.comment ? String(req.body.comment).trim() : "";

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: "A valid booking id is required",
      });
    }

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "rating must be a number from 1 to 5",
      });
    }

    await client.query("BEGIN");
    transactionStarted = true;

    await RentalBooking.syncLifecycle(client);

    const booking = await RentalBooking.findById(bookingId, client);

    if (!booking) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    const reviewRoles = getReviewRolesForUser(booking, req.user.id);

    if (!reviewRoles) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(403).json({
        success: false,
        message: "Only the tenant or owner of this booking can leave a review",
      });
    }

    if (booking.bookingStatus === "cancelled") {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(400).json({
        success: false,
        message: "Cancelled bookings cannot be reviewed",
      });
    }

    if (booking.paymentStatus !== "paid" || booking.bookingStatus !== "completed") {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(400).json({
        success: false,
        message: "Reviews can only be added after a fully paid booking is completed",
      });
    }

    const review = await RentalBookingReview.upsert(
      {
        rentalBookingId: bookingId,
        reviewerId: req.user.id,
        revieweeId: reviewRoles.revieweeId,
        reviewerRole: reviewRoles.reviewerRole,
        revieweeRole: reviewRoles.revieweeRole,
        rating,
        comment: comment || null,
      },
      client,
    );

    await client.query("COMMIT");
    transactionStarted = false;

    res.json({
      success: true,
      message: "Booking review saved successfully",
      data: { review },
    });
  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK");
    }

    console.error("Save rental booking review error:", error);
    res.status(500).json({
      success: false,
      message: "Error saving booking review",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

module.exports = {
  confirmBooking,
  createBooking,
  getBookingMessages,
  getMyBookings,
  getOwnerBookings,
  getPropertyAvailability,
  getBookingReviews,
  payBookingDeposit,
  payBookingBalance,
  saveBookingReview,
  sendBookingMessage,
};
