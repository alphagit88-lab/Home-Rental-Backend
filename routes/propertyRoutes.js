const express = require("express");
const router = express.Router();
const {
  getActiveProperties,
  getMyProperties,
  createProperty,
  updateProperty,
} = require("../controllers/propertyController");
const { authenticate, verifyAppRole } = require("../middleware/authMiddleware");
const sharedRentalRoles = ["tenant", "owner", "service_provider"];

router.get("/", getActiveProperties);
router.get(
  "/my",
  authenticate,
  verifyAppRole(sharedRentalRoles),
  getMyProperties,
);
router.post(
  "/",
  authenticate,
  verifyAppRole(sharedRentalRoles),
  createProperty,
);
router.put(
  "/:id",
  authenticate,
  verifyAppRole(sharedRentalRoles),
  updateProperty,
);

module.exports = router;
