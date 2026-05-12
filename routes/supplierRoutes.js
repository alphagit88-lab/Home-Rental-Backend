const express = require('express');
const router = express.Router();
const supplierController = require('../controllers/supplierController');
const {
  verifyToken,
  verifyRole,
  verifyAdmin,
  verifyRoleOrAppRole,
} = require('../middleware/authMiddleware');
const sharedRentalRoles = ['tenant', 'owner', 'service_provider'];

// Get supplier availability
router.get('/availability', verifyToken, verifyRole(['supplier', 'admin']), supplierController.getAvailability);

// Update supplier availability
router.post('/availability', verifyToken, verifyRole(['supplier', 'admin']), supplierController.updateAvailability);

// Service Areas
router.get(
  '/service-areas',
  verifyToken,
  verifyRoleOrAppRole({roles: ['supplier'], appRoles: sharedRentalRoles}),
  supplierController.getServiceAreas,
);
router.post(
  '/service-areas',
  verifyToken,
  verifyRoleOrAppRole({roles: ['supplier'], appRoles: sharedRentalRoles}),
  supplierController.createServiceArea,
);
router.delete(
  '/service-areas/:id',
  verifyToken,
  verifyRoleOrAppRole({roles: ['supplier'], appRoles: sharedRentalRoles}),
  supplierController.deleteServiceArea,
);

// Bin Pricing Setup
router.get('/bin-sizes', verifyToken, verifyRole(['supplier', 'admin']), supplierController.getBinSizes);
router.get('/service-areas/:id/bins', verifyToken, verifyRole(['supplier', 'admin']), supplierController.getServiceAreaBins);
router.post('/service-area-bins/price', verifyToken, verifyRole(['supplier', 'admin']), supplierController.updateServiceAreaBinPrice);

// Driver Management
router.get('/drivers', verifyToken, verifyRole(['supplier', 'admin']), supplierController.getDrivers);
router.post('/drivers', verifyToken, verifyRole(['supplier', 'admin']), supplierController.addDriver);
router.post('/assign-driver', verifyToken, verifyRole(['supplier', 'admin']), supplierController.assignDriver);

module.exports = router;
