const Property = require("../models/Property");

const LOCATION_PRESETS = {
  colombo: { latitude: 6.9271, longitude: 79.8612 },
  kandy: { latitude: 7.2906, longitude: 80.6337 },
  galle: { latitude: 6.0535, longitude: 80.221 },
  negombo: { latitude: 7.2083, longitude: 79.8358 },
};
const MONTHLY_RENT_FIELDS = ["monthlyRent", "monthly_rent", "rentAmount", "salary"];
const AVAILABLE_FROM_FIELDS = [
  "availableFrom",
  "available_from",
  "availableStartDate",
  "availabilityStart",
];
const AVAILABLE_TO_FIELDS = [
  "availableTo",
  "available_to",
  "availableEndDate",
  "availabilityEnd",
];
const INVALID_DATE = Symbol("INVALID_DATE");

const normalizeStringArray = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/,|\n/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

const toPositiveInteger = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const toOptionalMoney = (value) => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Number(parsed.toFixed(2)) : NaN;
};

const toOptionalDateString = (value) => {
  if (value === undefined) {
    return undefined;
  }

  const normalizedValue = String(value ?? "").trim();

  if (!normalizedValue) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
    return INVALID_DATE;
  }

  const [year, month, day] = normalizedValue.split("-").map(Number);
  const parsedDate = new Date(`${normalizedValue}T00:00:00Z`);

  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.getUTCFullYear() !== year ||
    parsedDate.getUTCMonth() + 1 !== month ||
    parsedDate.getUTCDate() !== day
  ) {
    return INVALID_DATE;
  }

  return normalizedValue;
};

const getFirstProvidedField = (source, fieldNames) => {
  for (const fieldName of fieldNames) {
    if (Object.prototype.hasOwnProperty.call(source, fieldName)) {
      return source[fieldName];
    }
  }

  return undefined;
};

const validateAvailabilityRange = (availableFrom, availableTo) =>
  !availableFrom || !availableTo || availableTo >= availableFrom;

const resolveCoordinates = (locationText, latitude, longitude) => {
  const parsedLatitude = Number(latitude);
  const parsedLongitude = Number(longitude);

  if (Number.isFinite(parsedLatitude) && Number.isFinite(parsedLongitude)) {
    return {
      latitude: parsedLatitude,
      longitude: parsedLongitude,
    };
  }

  const normalizedLocation = String(locationText || "").toLowerCase();
  const matchedPreset = Object.entries(LOCATION_PRESETS).find(([key]) =>
    normalizedLocation.includes(key),
  );

  return matchedPreset ? matchedPreset[1] : LOCATION_PRESETS.colombo;
};

const buildPropertyCode = () =>
  `PRO-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;

const getMyProperties = async (req, res) => {
  try {
    const properties = await Property.findByOwner(req.user.id);

    res.json({
      success: true,
      data: { properties },
    });
  } catch (error) {
    console.error("Get my properties error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching properties",
      error: error.message,
    });
  }
};

const getActiveProperties = async (req, res) => {
  try {
    const properties = await Property.findActive();

    res.json({
      success: true,
      data: { properties },
    });
  } catch (error) {
    console.error("Get active properties error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching properties",
      error: error.message,
    });
  }
};

const createProperty = async (req, res) => {
  try {
    const {
      title,
      propertyType,
      listingType,
      bedrooms,
      bathrooms,
      amenities,
      locationText,
      latitude,
      longitude,
      galleryUrls,
      description,
    } = req.body;
    const monthlyRentInput = getFirstProvidedField(req.body, MONTHLY_RENT_FIELDS);
    const availableFromInput = getFirstProvidedField(
      req.body,
      AVAILABLE_FROM_FIELDS,
    );
    const availableToInput = getFirstProvidedField(req.body, AVAILABLE_TO_FIELDS);

    const parsedBedrooms = toPositiveInteger(bedrooms);
    const parsedBathrooms = toPositiveInteger(bathrooms);
    const parsedMonthlyRent = toOptionalMoney(monthlyRentInput);
    const parsedAvailableFrom = toOptionalDateString(availableFromInput);
    const parsedAvailableTo = toOptionalDateString(availableToInput);

    if (!title || !propertyType || !listingType || !locationText) {
      return res.status(400).json({
        success: false,
        message:
          "title, propertyType, listingType, and locationText are required",
      });
    }

    if (!parsedBedrooms || !parsedBathrooms) {
      return res.status(400).json({
        success: false,
        message: "bedrooms and bathrooms must be valid positive numbers",
      });
    }

    if (monthlyRentInput !== undefined && Number.isNaN(parsedMonthlyRent)) {
      return res.status(400).json({
        success: false,
        message: "monthlyRent/salary must be a valid non-negative number",
      });
    }

    if (parsedAvailableFrom === INVALID_DATE || parsedAvailableTo === INVALID_DATE) {
      return res.status(400).json({
        success: false,
        message: "availableFrom and availableTo must use the YYYY-MM-DD format",
      });
    }

    if (!validateAvailabilityRange(parsedAvailableFrom, parsedAvailableTo)) {
      return res.status(400).json({
        success: false,
        message: "availableTo must be on or after availableFrom",
      });
    }

    const coordinates = resolveCoordinates(locationText, latitude, longitude);

    const property = await Property.create({
      ownerId: req.user.id,
      propertyCode: buildPropertyCode(),
      title: String(title).trim(),
      propertyType: String(propertyType).trim(),
      listingType: String(listingType).trim(),
      monthlyRent: parsedMonthlyRent ?? null,
      availableFrom: parsedAvailableFrom ?? null,
      availableTo: parsedAvailableTo ?? null,
      bedrooms: parsedBedrooms,
      bathrooms: parsedBathrooms,
      amenities: normalizeStringArray(amenities),
      locationText: String(locationText).trim(),
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      galleryUrls: normalizeStringArray(galleryUrls),
      description: description ? String(description).trim() : null,
    });

    res.status(201).json({
      success: true,
      message: "Property created successfully",
      data: { property },
    });
  } catch (error) {
    console.error("Create property error:", error);
    res.status(500).json({
      success: false,
      message: "Error creating property",
      error: error.message,
    });
  }
};

const updateProperty = async (req, res) => {
  try {
    const propertyId = parseInt(req.params.id, 10);
    const existingProperty = await Property.findOwnedById(
      propertyId,
      req.user.id,
    );

    if (!existingProperty) {
      return res.status(404).json({
        success: false,
        message: "Property not found",
      });
    }

    const mergedTitle = String(req.body.title ?? existingProperty.title).trim();
    const mergedPropertyType = String(
      req.body.propertyType ?? existingProperty.propertyType,
    ).trim();
    const mergedListingType = String(
      req.body.listingType ?? existingProperty.listingType,
    ).trim();
    const mergedLocationText = String(
      req.body.locationText ?? existingProperty.locationText,
    ).trim();
    const monthlyRentInput = getFirstProvidedField(req.body, MONTHLY_RENT_FIELDS);
    const availableFromInput = getFirstProvidedField(
      req.body,
      AVAILABLE_FROM_FIELDS,
    );
    const availableToInput = getFirstProvidedField(req.body, AVAILABLE_TO_FIELDS);

    const parsedBedrooms = toPositiveInteger(req.body.bedrooms);
    const parsedBathrooms = toPositiveInteger(req.body.bathrooms);
    const parsedMonthlyRent = toOptionalMoney(monthlyRentInput);
    const parsedAvailableFrom = toOptionalDateString(availableFromInput);
    const parsedAvailableTo = toOptionalDateString(availableToInput);

    if (
      (req.body.bedrooms !== undefined && !parsedBedrooms) ||
      (req.body.bathrooms !== undefined && !parsedBathrooms)
    ) {
      return res.status(400).json({
        success: false,
        message: "bedrooms and bathrooms must be valid positive numbers",
      });
    }

    if (monthlyRentInput !== undefined && Number.isNaN(parsedMonthlyRent)) {
      return res.status(400).json({
        success: false,
        message: "monthlyRent/salary must be a valid non-negative number",
      });
    }

    if (parsedAvailableFrom === INVALID_DATE || parsedAvailableTo === INVALID_DATE) {
      return res.status(400).json({
        success: false,
        message: "availableFrom and availableTo must use the YYYY-MM-DD format",
      });
    }

    const mergedAvailableFrom =
      availableFromInput === undefined
        ? existingProperty.availableFrom
        : parsedAvailableFrom;
    const mergedAvailableTo =
      availableToInput === undefined ? existingProperty.availableTo : parsedAvailableTo;

    if (!validateAvailabilityRange(mergedAvailableFrom, mergedAvailableTo)) {
      return res.status(400).json({
        success: false,
        message: "availableTo must be on or after availableFrom",
      });
    }

    const coordinates = resolveCoordinates(
      mergedLocationText,
      req.body.latitude,
      req.body.longitude,
    );

    const property = await Property.update(propertyId, req.user.id, {
      title: mergedTitle,
      propertyType: mergedPropertyType,
      listingType: mergedListingType,
      monthlyRent:
        monthlyRentInput === undefined
          ? existingProperty.monthlyRent
          : parsedMonthlyRent,
      availableFrom: mergedAvailableFrom,
      availableTo: mergedAvailableTo,
      bedrooms: parsedBedrooms ?? existingProperty.bedrooms,
      bathrooms: parsedBathrooms ?? existingProperty.bathrooms,
      amenities:
        req.body.amenities !== undefined
          ? normalizeStringArray(req.body.amenities)
          : existingProperty.amenities,
      locationText: mergedLocationText,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      galleryUrls:
        req.body.galleryUrls !== undefined
          ? normalizeStringArray(req.body.galleryUrls)
          : existingProperty.galleryUrls,
      description:
        req.body.description !== undefined
          ? String(req.body.description).trim()
          : existingProperty.description,
    });

    res.json({
      success: true,
      message: "Property updated successfully",
      data: { property },
    });
  } catch (error) {
    console.error("Update property error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating property",
      error: error.message,
    });
  }
};

module.exports = {
  getActiveProperties,
  getMyProperties,
  createProperty,
  updateProperty,
};
