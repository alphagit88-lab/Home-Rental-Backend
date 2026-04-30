const HomeRentalAdmin = require("../models/HomeRentalAdmin");

const toPositiveInteger = (value, fallback = 100) => {
  const parsedValue = parseInt(value, 10);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    return fallback;
  }

  return Math.min(parsedValue, 200);
};

const toBoolean = (value) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return value.toLowerCase() === "true";
  }

  return null;
};

const getDashboard = async (req, res) => {
  try {
    const overview = await HomeRentalAdmin.getDashboard();

    res.json({
      success: true,
      data: { overview },
    });
  } catch (error) {
    console.error("Get home rental admin dashboard error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching home rental dashboard",
      error: error.message,
    });
  }
};

const getAccounts = async (req, res) => {
  try {
    const accounts = await HomeRentalAdmin.getAccounts({
      role: req.query.role ? String(req.query.role).trim() : undefined,
      search: req.query.search ? String(req.query.search).trim() : undefined,
      limit: toPositiveInteger(req.query.limit, 100),
    });

    res.json({
      success: true,
      data: { accounts },
    });
  } catch (error) {
    console.error("Get home rental admin accounts error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching home rental accounts",
      error: error.message,
    });
  }
};

const getProperties = async (req, res) => {
  try {
    const properties = await HomeRentalAdmin.getProperties({
      status: req.query.status ? String(req.query.status).trim() : undefined,
      search: req.query.search ? String(req.query.search).trim() : undefined,
      limit: toPositiveInteger(req.query.limit, 100),
    });

    res.json({
      success: true,
      data: { properties },
    });
  } catch (error) {
    console.error("Get home rental admin properties error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching rental properties",
      error: error.message,
    });
  }
};

const updatePropertyStatus = async (req, res) => {
  try {
    const propertyId = parseInt(req.params.id, 10);
    const isActive = toBoolean(req.body.isActive);

    if (!Number.isInteger(propertyId) || propertyId <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid property id is required",
      });
    }

    if (isActive === null) {
      return res.status(400).json({
        success: false,
        message: "isActive must be provided as true or false",
      });
    }

    const property = await HomeRentalAdmin.updatePropertyStatus(propertyId, isActive);

    if (!property) {
      return res.status(404).json({
        success: false,
        message: "Property not found",
      });
    }

    res.json({
      success: true,
      message: `Property ${isActive ? "activated" : "deactivated"} successfully`,
      data: { property },
    });
  } catch (error) {
    console.error("Update home rental property status error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating property status",
      error: error.message,
    });
  }
};

const getBookings = async (req, res) => {
  try {
    const bookings = await HomeRentalAdmin.getBookings({
      bookingStatus: req.query.bookingStatus
        ? String(req.query.bookingStatus).trim()
        : undefined,
      paymentStatus: req.query.paymentStatus
        ? String(req.query.paymentStatus).trim()
        : undefined,
      search: req.query.search ? String(req.query.search).trim() : undefined,
      limit: toPositiveInteger(req.query.limit, 100),
    });

    res.json({
      success: true,
      data: { bookings },
    });
  } catch (error) {
    console.error("Get home rental admin bookings error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching rental bookings",
      error: error.message,
    });
  }
};

const getServiceRequests = async (req, res) => {
  try {
    const requests = await HomeRentalAdmin.getServiceRequests({
      status: req.query.status ? String(req.query.status).trim() : undefined,
      search: req.query.search ? String(req.query.search).trim() : undefined,
      limit: toPositiveInteger(req.query.limit, 100),
    });

    res.json({
      success: true,
      data: { requests },
    });
  } catch (error) {
    console.error("Get home rental admin service requests error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching rental service requests",
      error: error.message,
    });
  }
};

module.exports = {
  getDashboard,
  getAccounts,
  getProperties,
  updatePropertyStatus,
  getBookings,
  getServiceRequests,
};
