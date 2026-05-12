const express = require("express");
const router = express.Router();

const {
  getProviderCategories,
  updateProviderCategories,
  getProviderNearbyRequests,
  getProviderAssignedRequests,
  getProviderMapData,
  respondToRequest,
} = require("../controllers/rentalServiceRequestController");

const { authenticate, verifyAppRole } = require("../middleware/authMiddleware");
const sharedRentalRoles = ["tenant", "owner", "service_provider"];

router.get(
  "/provider/categories",
  authenticate,
  verifyAppRole(sharedRentalRoles),
  getProviderCategories,
);

router.put(
  "/provider/categories",
  authenticate,
  verifyAppRole(sharedRentalRoles),
  updateProviderCategories,
);

router.get(
  "/provider/nearby",
  authenticate,
  verifyAppRole(sharedRentalRoles),
  getProviderNearbyRequests,
);

router.get(
  "/provider/my",
  authenticate,
  verifyAppRole(sharedRentalRoles),
  getProviderAssignedRequests,
);

router.get(
  "/provider/map",
  authenticate,
  verifyAppRole(sharedRentalRoles),
  getProviderMapData,
);

router.post(
  "/:id/respond",
  authenticate,
  verifyAppRole(sharedRentalRoles),
  respondToRequest,
);

module.exports = router;
