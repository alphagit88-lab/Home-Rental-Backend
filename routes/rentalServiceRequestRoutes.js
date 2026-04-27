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

router.get(
  "/provider/categories",
  authenticate,
  verifyAppRole(["service_provider"]),
  getProviderCategories,
);

router.put(
  "/provider/categories",
  authenticate,
  verifyAppRole(["service_provider"]),
  updateProviderCategories,
);

router.get(
  "/provider/nearby",
  authenticate,
  verifyAppRole(["service_provider"]),
  getProviderNearbyRequests,
);

router.get(
  "/provider/my",
  authenticate,
  verifyAppRole(["service_provider"]),
  getProviderAssignedRequests,
);

router.get(
  "/provider/map",
  authenticate,
  verifyAppRole(["service_provider"]),
  getProviderMapData,
);

router.post(
  "/:id/respond",
  authenticate,
  verifyAppRole(["service_provider"]),
  respondToRequest,
);

module.exports = router;
