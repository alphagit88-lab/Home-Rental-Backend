const express = require('express');
const router = express.Router();
const {
  createAdmin,
  createUser,
  getAllAdmins,
  getUsersByRole,
  updateAdmin,
  updateUser,
  deleteAdmin,
  deleteUser,
  getBinPriceRanges,
  getAllBinSubmissions,
  updateBinFinalPrice,
} = require('../controllers/adminController');
const {
  getDashboard,
  getAccounts,
  getProperties,
  updatePropertyStatus,
  getBookings,
  getServiceRequests,
} = require("../controllers/homeRentalAdminController");
const { authenticate, requireAdmin } = require('../middleware/authMiddleware');

// All admin routes require authentication and admin role
router.use(authenticate);
router.use(requireAdmin);

router.post('/', createAdmin);
router.post('/users', createUser);
router.get('/', getAllAdmins);
router.get('/users/:role', getUsersByRole);
router.get("/rental/dashboard", getDashboard);
router.get("/rental/accounts", getAccounts);
router.get("/rental/properties", getProperties);
router.put("/rental/properties/:id/status", updatePropertyStatus);
router.get("/rental/bookings", getBookings);
router.get("/rental/service-requests", getServiceRequests);
router.put('/:id', updateAdmin);
router.put('/users/:id', updateUser);
router.delete('/:id', deleteAdmin);
router.delete('/users/:id', deleteUser);

// Bin Pricing Routes
router.get('/bin-pricing/ranges', getBinPriceRanges);
router.get('/bin-pricing/submissions', getAllBinSubmissions);
router.put('/bin-pricing/submissions/:id', updateBinFinalPrice);

module.exports = router;
