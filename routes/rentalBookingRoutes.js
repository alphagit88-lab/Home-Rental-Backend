const express = require("express");
const router = express.Router();

const {
  confirmBooking,
  createBooking,
  getBookingMessages,
  getMyBookings,
  getOwnerBookings,
  getPropertyAvailability,
  getBookingReviews,
  payBookingBalance,
  payBookingDeposit,
  saveBookingReview,
  sendBookingMessage,
} = require("../controllers/rentalBookingController");

const {
  validateCreateRentalBooking,
  validateRentalBookingDateQuery,
  validateRentalBookingMessage,
  validateRentalBookingPayment,
  validateRentalBookingReview,
} = require("../middleware/rentalBookingValidation");

const { authenticate, verifyAppRole } = require("../middleware/authMiddleware");
const sharedRentalRoles = ["tenant", "owner", "service_provider"];

router.get(
  "/property/:propertyId/availability",
  validateRentalBookingDateQuery,
  getPropertyAvailability,
);

router.get(
  "/my",
  authenticate,
  verifyAppRole(sharedRentalRoles),
  getMyBookings,
);

router.get(
  "/owner",
  authenticate,
  verifyAppRole(sharedRentalRoles),
  validateRentalBookingDateQuery,
  getOwnerBookings,
);

router.post(
  "/",
  authenticate,
  verifyAppRole(sharedRentalRoles),
  validateCreateRentalBooking,
  createBooking,
);

router.post(
  "/:id/pay-deposit",
  authenticate,
  verifyAppRole(sharedRentalRoles),
  validateRentalBookingPayment,
  payBookingDeposit,
);

router.post(
  "/:id/pay-balance",
  authenticate,
  verifyAppRole(sharedRentalRoles),
  validateRentalBookingPayment,
  payBookingBalance,
);

router.post(
  "/:id/confirm",
  authenticate,
  verifyAppRole(sharedRentalRoles),
  confirmBooking,
);

router.get(
  "/:id/messages",
  authenticate,
  getBookingMessages,
);

router.post(
  "/:id/messages",
  authenticate,
  validateRentalBookingMessage,
  sendBookingMessage,
);

router.get(
  "/:id/reviews",
  authenticate,
  getBookingReviews,
);

router.post(
  "/:id/reviews",
  authenticate,
  validateRentalBookingReview,
  saveBookingReview,
);

module.exports = router;
