const express = require("express");
const router = express.Router();

const {
  createBooking,
  getMyBookings,
  getOwnerBookings,
  getPropertyAvailability,
  getBookingReviews,
  payBookingBalance,
  payBookingDeposit,
  saveBookingReview,
} = require("../controllers/rentalBookingController");

const {
  validateCreateRentalBooking,
  validateRentalBookingDateQuery,
  validateRentalBookingPayment,
  validateRentalBookingReview,
} = require("../middleware/rentalBookingValidation");

const { authenticate, verifyAppRole } = require("../middleware/authMiddleware");

router.get(
  "/property/:propertyId/availability",
  validateRentalBookingDateQuery,
  getPropertyAvailability,
);

router.get(
  "/my",
  authenticate,
  verifyAppRole(["tenant"]),
  getMyBookings,
);

router.get(
  "/owner",
  authenticate,
  verifyAppRole(["owner"]),
  validateRentalBookingDateQuery,
  getOwnerBookings,
);

router.post(
  "/",
  authenticate,
  verifyAppRole(["tenant"]),
  validateCreateRentalBooking,
  createBooking,
);

router.post(
  "/:id/pay-deposit",
  authenticate,
  verifyAppRole(["tenant"]),
  validateRentalBookingPayment,
  payBookingDeposit,
);

router.post(
  "/:id/pay-balance",
  authenticate,
  verifyAppRole(["tenant"]),
  validateRentalBookingPayment,
  payBookingBalance,
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
