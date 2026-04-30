const ServiceCategory = require("../models/ServiceCategory");
const RentalBooking = require("../models/RentalBooking");
const RentalBookingServiceRequest = require("../models/RentalBookingServiceRequest");
const RentalServiceProviderCategory = require("../models/RentalServiceProviderCategory");
const ServiceArea = require("../models/ServiceArea");

const toPositiveInteger = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsedValue = parseInt(value, 10);
  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : null;
};

const parseCategoryIds = (...candidateValues) => {
  const rawValue = candidateValues.find(
    (value) => value !== undefined && value !== null && value !== "",
  );

  if (rawValue === undefined) {
    return [];
  }

  let parsedValues = rawValue;

  if (typeof parsedValues === "string") {
    const trimmedValue = parsedValues.trim();

    if (!trimmedValue) {
      return [];
    }

    if (trimmedValue.startsWith("[")) {
      try {
        parsedValues = JSON.parse(trimmedValue);
      } catch (error) {
        parsedValues = trimmedValue.split(",");
      }
    } else {
      parsedValues = trimmedValue.split(",");
    }
  }

  if (!Array.isArray(parsedValues)) {
    parsedValues = [parsedValues];
  }

  return [...new Set(
    parsedValues
      .map((value) => parseInt(value, 10))
      .filter((value) => Number.isInteger(value) && value > 0),
  )];
};

const toMapMarker = (request, bucket) => ({
  id: request.id,
  bucket,
  status: request.requestStatus,
  latitude: request.latitude,
  longitude: request.longitude,
  locationText: request.locationText,
  propertyTitle: request.propertyTitle,
  bookingCode: request.bookingCode,
  serviceCategoryId: request.serviceCategoryId,
  serviceCategoryName: request.serviceCategoryName,
  tenantName: request.tenantName,
  ownerName: request.ownerName,
  distanceKm: request.distanceKm ?? null,
});

const toServiceAreaMarker = (serviceArea) => ({
  id: serviceArea.id,
  bucket: "provider_service_area",
  latitude: serviceArea.latitude === null ? null : Number(serviceArea.latitude),
  longitude: serviceArea.longitude === null ? null : Number(serviceArea.longitude),
  country: serviceArea.country,
  city: serviceArea.city,
  areaRadiusKm:
    serviceArea.area_radius_km === null || serviceArea.area_radius_km === undefined
      ? null
      : Number(serviceArea.area_radius_km),
});

const getProviderCategories = async (req, res) => {
  try {
    const categories = await RentalServiceProviderCategory.findByProviderId(
      req.user.id,
    );

    res.json({
      success: true,
      data: { categories },
    });
  } catch (error) {
    console.error("Get provider categories error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching provider categories",
      error: error.message,
    });
  }
};

const updateProviderCategories = async (req, res) => {
  try {
    const serviceCategoryIds = parseCategoryIds(
      req.body.serviceCategoryIds,
      req.body.service_category_ids,
      req.body.selectedServiceIds,
      req.body.selected_service_ids,
    );

    const categories = await ServiceCategory.findByIds(serviceCategoryIds);

    if (categories.length !== serviceCategoryIds.length) {
      return res.status(400).json({
        success: false,
        message: "One or more service categories are invalid or inactive",
      });
    }

    const updatedCategories = await RentalServiceProviderCategory.replaceForProvider(
      req.user.id,
      serviceCategoryIds,
    );

    res.json({
      success: true,
      message: "Provider categories updated successfully",
      data: { categories: updatedCategories },
    });
  } catch (error) {
    console.error("Update provider categories error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating provider categories",
      error: error.message,
    });
  }
};

const getProviderNearbyRequests = async (req, res) => {
  try {
    const limit = toPositiveInteger(req.query.limit) || 100;

    await RentalBooking.syncLifecycle();

    const requests = await RentalBookingServiceRequest.findNearbyForProvider(
      req.user.id,
      { limit },
    );

    res.json({
      success: true,
      data: {
        requests,
        markers: requests.map((request) => toMapMarker(request, "nearby")),
      },
    });
  } catch (error) {
    console.error("Get provider nearby requests error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching nearby requests",
      error: error.message,
    });
  }
};

const getProviderAssignedRequests = async (req, res) => {
  try {
    const limit = toPositiveInteger(req.query.limit) || 100;
    const status = req.query.status ? String(req.query.status).trim() : undefined;

    await RentalBooking.syncLifecycle();

    const requests = await RentalBookingServiceRequest.findAssignedToProvider(
      req.user.id,
      { status, limit },
    );

    res.json({
      success: true,
      data: {
        requests,
        markers: requests.map((request) => toMapMarker(request, "assigned")),
      },
    });
  } catch (error) {
    console.error("Get provider assigned requests error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching assigned requests",
      error: error.message,
    });
  }
};

const getProviderMapData = async (req, res) => {
  try {
    const limit = toPositiveInteger(req.query.limit) || 100;

    await RentalBooking.syncLifecycle();

    const [nearbyRequests, assignedRequests, serviceAreas] = await Promise.all([
      RentalBookingServiceRequest.findNearbyForProvider(req.user.id, { limit }),
      RentalBookingServiceRequest.findAssignedToProvider(req.user.id, { limit }),
      ServiceArea.findBySupplierId(req.user.id),
    ]);
    const serviceAreaMarkers = serviceAreas
      .filter((serviceArea) => serviceArea.latitude !== null && serviceArea.longitude !== null)
      .map(toServiceAreaMarker);

    res.json({
      success: true,
      data: {
        nearbyRequests,
        assignedRequests,
        serviceAreas,
        serviceAreaMarkers,
        markers: [
          ...serviceAreaMarkers,
          ...nearbyRequests.map((request) => toMapMarker(request, "nearby")),
          ...assignedRequests.map((request) => toMapMarker(request, "assigned")),
        ],
      },
    });
  } catch (error) {
    console.error("Get provider map data error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching provider map data",
      error: error.message,
    });
  }
};

const respondToRequest = async (req, res) => {
  try {
    const requestId = toPositiveInteger(req.params.id);
    const action = String(req.body.action || "").trim().toLowerCase();
    const responseNotes = String(
      req.body.responseNotes || req.body.response_notes || "",
    ).trim();

    if (!requestId) {
      return res.status(400).json({
        success: false,
        message: "A valid request id is required",
      });
    }

    if (!["accept", "reject"].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "action must be either accept or reject",
      });
    }

    await RentalBooking.syncLifecycle();

    const result = await RentalBookingServiceRequest.respond({
      requestId,
      providerId: req.user.id,
      action,
      responseNotes: responseNotes || null,
    });

    const io = req.app.get("io");
    if (io && action === "accept") {
      io.to(`user_${result.request.tenantId}`).emit("rental_service_request_updated", {
        request: result.request,
        action,
      });
      io.to(`supplier_${result.request.ownerId}`).emit("rental_service_request_updated", {
        request: result.request,
        action,
      });
      io.to(`supplier_${req.user.id}`).emit("rental_service_request_updated", {
        request: result.request,
        action,
      });
    }

    res.json({
      success: true,
      message:
        action === "accept"
          ? "Tenant service request accepted successfully"
          : "Tenant service request rejected successfully",
      data: result,
    });
  } catch (error) {
    const statusCode =
      error.statusCode || (error.message === "Service request not found" ? 404 : 500);

    console.error("Respond to provider request error:", error);
    res.status(statusCode).json({
      success: false,
      message:
        statusCode === 500
          ? "Error responding to tenant service request"
          : error.message,
      error: statusCode === 500 ? error.message : undefined,
    });
  }
};

module.exports = {
  getProviderCategories,
  updateProviderCategories,
  getProviderNearbyRequests,
  getProviderAssignedRequests,
  getProviderMapData,
  respondToRequest,
};
