const express = require("express");
const router = express.Router();
const {
  getActiveProperties,
  getMyProperties,
  createProperty,
  updateProperty,
} = require("../controllers/propertyController");
const { authenticate, verifyRole } = require("../middleware/authMiddleware");

router.get("/", getActiveProperties);
router.get(
  "/my",
  authenticate,
  verifyRole(["supplier", "admin"]),
  getMyProperties,
);
router.post(
  "/",
  authenticate,
  verifyRole(["supplier", "admin"]),
  createProperty,
);
router.put(
  "/:id",
  authenticate,
  verifyRole(["supplier", "admin"]),
  updateProperty,
);

module.exports = router;
