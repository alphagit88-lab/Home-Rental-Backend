const express = require("express");
const router = express.Router();
const {
  getActiveProperties,
  getMyProperties,
  createProperty,
  updateProperty,
} = require("../controllers/propertyController");
const { authenticate, verifyAppRole } = require("../middleware/authMiddleware");

router.get("/", getActiveProperties);
router.get(
  "/my",
  authenticate,
  verifyAppRole(["owner"]),
  getMyProperties,
);
router.post(
  "/",
  authenticate,
  verifyAppRole(["owner"]),
  createProperty,
);
router.put(
  "/:id",
  authenticate,
  verifyAppRole(["owner"]),
  updateProperty,
);

module.exports = router;
