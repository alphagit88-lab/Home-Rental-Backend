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

const toPositiveInteger = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsedValue = parseInt(value, 10);
  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : null;
};

const validateRentalBookingDateQuery = (req, res, next) => {
  const from = req.query.from;
  const to = req.query.to;

  if (from && !toDateString(from)) {
    return res.status(400).json({
      success: false,
      message: "from must use YYYY-MM-DD format",
    });
  }

  if (to && !toDateString(to)) {
    return res.status(400).json({
      success: false,
      message: "to must use YYYY-MM-DD format",
    });
  }

  if (from && to && to <= from) {
    return res.status(400).json({
      success: false,
      message: "to must be after from",
    });
  }

  next();
};

const validateCreateRentalBooking = (req, res, next) => {
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
  const cardLast4 = String(req.body.cardLast4 || req.body.card_last4 || "")
    .replace(/\D/g, "")
    .slice(-4);

  if (!propertyId) {
    return res.status(400).json({
      success: false,
      message: "propertyId is required",
    });
  }

  if (!guestCount) {
    return res.status(400).json({
      success: false,
      message: "guestCount must be a valid positive number",
    });
  }

  if (!checkIn || !checkOut) {
    return res.status(400).json({
      success: false,
      message: "checkIn and checkOut must use YYYY-MM-DD format",
    });
  }

  if (checkOut <= checkIn) {
    return res.status(400).json({
      success: false,
      message: "checkOut must be after checkIn",
    });
  }

  if (!contactName) {
    return res.status(400).json({
      success: false,
      message: "contactName is required",
    });
  }

  if (!contactEmail || !contactEmail.includes("@")) {
    return res.status(400).json({
      success: false,
      message: "A valid contactEmail is required",
    });
  }

  if (cardLast4 && !/^\d{4}$/.test(cardLast4)) {
    return res.status(400).json({
      success: false,
      message: "cardLast4 must contain exactly 4 digits",
    });
  }

  next();
};

const validateRentalBookingPayment = (req, res, next) => {
  const paymentMethod = String(
    req.body.paymentMethod || req.body.payment_method || "",
  ).trim();
  const cardLast4 = String(req.body.cardLast4 || req.body.card_last4 || "")
    .replace(/\D/g, "")
    .slice(-4);

  if (!paymentMethod) {
    return res.status(400).json({
      success: false,
      message: "paymentMethod is required",
    });
  }

  if (cardLast4 && !/^\d{4}$/.test(cardLast4)) {
    return res.status(400).json({
      success: false,
      message: "cardLast4 must contain exactly 4 digits",
    });
  }

  next();
};

const validateRentalBookingReview = (req, res, next) => {
  const rating = toPositiveInteger(req.body.rating);
  const comment = req.body.comment === undefined ? "" : String(req.body.comment);

  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({
      success: false,
      message: "rating must be a number from 1 to 5",
    });
  }

  if (comment.length > 2000) {
    return res.status(400).json({
      success: false,
      message: "comment must be 2000 characters or fewer",
    });
  }

  next();
};

const validateRentalBookingMessage = (req, res, next) => {
  const messageText = String(
    req.body.messageText || req.body.message_text || req.body.message || "",
  ).trim();

  if (!messageText) {
    return res.status(400).json({
      success: false,
      message: "messageText is required",
    });
  }

  if (messageText.length > 2000) {
    return res.status(400).json({
      success: false,
      message: "messageText must be 2000 characters or fewer",
    });
  }

  next();
};

module.exports = {
  validateCreateRentalBooking,
  validateRentalBookingDateQuery,
  validateRentalBookingMessage,
  validateRentalBookingPayment,
  validateRentalBookingReview,
};
