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

const { authenticate, verifyRole } = require("../middleware/authMiddleware");

router.get(
  "/property/:propertyId/availability",
  validateRentalBookingDateQuery,
  getPropertyAvailability,
);

router.get(
  "/my",
  authenticate,
  verifyRole(["customer", "admin"]),
  getMyBookings,
);

router.get(
  "/owner",
  authenticate,
  verifyRole(["supplier", "admin"]),
  validateRentalBookingDateQuery,
  getOwnerBookings,
);

router.post(
  "/",
  authenticate,
  verifyRole(["customer", "admin"]),
  validateCreateRentalBooking,
  createBooking,
);

module.exports = router;
