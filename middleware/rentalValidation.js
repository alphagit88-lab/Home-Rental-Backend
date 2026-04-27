const { body, validationResult } = require("express-validator");

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: errors.array(),
    });
  }

  next();
};

const validateRentalSignup = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required")
    .isLength({ min: 2, max: 100 })
    .withMessage("Name must be between 2 and 100 characters"),

  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Invalid email format")
    .normalizeEmail(),

  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters long"),

  body("role")
    .trim()
    .notEmpty()
    .withMessage("Role is required")
    .isIn(["tenant", "owner", "service_provider"])
    .withMessage("Invalid role. Use tenant, owner, or service_provider."),

  handleValidationErrors,
];

const validateRentalLogin = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Invalid email format")
    .normalizeEmail(),

  body("password").notEmpty().withMessage("Password is required"),

  handleValidationErrors,
];

const validateRentalProfileUpdate = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required")
    .isLength({ min: 2, max: 100 })
    .withMessage("Name must be between 2 and 100 characters"),

  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Invalid email format")
    .normalizeEmail(),

  body("currentPassword").custom((value, { req }) => {
    if (req.body.newPassword && !value) {
      throw new Error("Current password is required to change password");
    }
    return true;
  }),

  body("newPassword").custom((value, { req }) => {
    if (req.body.currentPassword && !value) {
      throw new Error("New password is required");
    }

    if (value && String(value).length < 6) {
      throw new Error("New password must be at least 6 characters long");
    }

    return true;
  }),

  handleValidationErrors,
];

module.exports = {
  validateRentalSignup,
  validateRentalLogin,
  validateRentalProfileUpdate,
};
