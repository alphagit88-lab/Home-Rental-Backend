const express = require("express");
const router = express.Router();

const {
  createBooking,
  getMyBookings,
  getOwnerBookings,
  getPropertyAvailability,
} = require("../controllers/rentalBookingController");

const {
  validateCreateRentalBooking,
  validateRentalBookingDateQuery,
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

module.exports = router;
