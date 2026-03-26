const pool = require("../config/database");

const SELECT_FIELDS = `
  SELECT
    id,
    owner_id AS "ownerId",
    property_code AS "propertyCode",
    title,
    property_type AS "propertyType",
    listing_type AS "listingType",
    monthly_rent AS "monthlyRent",
    available_from AS "availableFrom",
    available_to AS "availableTo",
    bedrooms,
    bathrooms,
    COALESCE(amenities, '[]'::jsonb) AS amenities,
    location_text AS "locationText",
    latitude,
    longitude,
    COALESCE(gallery_urls, '[]'::jsonb) AS "galleryUrls",
    description,
    is_active AS "isActive",
    created_at AS "createdAt",
    updated_at AS "updatedAt"
  FROM rental_properties
`;

class Property {
  static async findActive() {
    const query = `
      ${SELECT_FIELDS}
      WHERE is_active = TRUE
      ORDER BY created_at DESC
    `;
    const result = await pool.query(query);
    return result.rows;
  }

  static async findByOwner(ownerId) {
    const query = `
      ${SELECT_FIELDS}
      WHERE owner_id = $1 AND is_active = TRUE
      ORDER BY created_at DESC
    `;
    const result = await pool.query(query, [ownerId]);
    return result.rows;
  }

  static async findOwnedById(id, ownerId) {
    const query = `
      ${SELECT_FIELDS}
      WHERE id = $1 AND owner_id = $2 AND is_active = TRUE
      LIMIT 1
    `;
    const result = await pool.query(query, [id, ownerId]);
    return result.rows[0];
  }

  static async create(data) {
    const query = `
      INSERT INTO rental_properties (
        owner_id,
        property_code,
        title,
        property_type,
        listing_type,
        monthly_rent,
        available_from,
        available_to,
        bedrooms,
        bathrooms,
        amenities,
        location_text,
        latitude,
        longitude,
        gallery_urls,
        description,
        is_active,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, TRUE, NOW(), NOW())
      RETURNING
        id,
        owner_id AS "ownerId",
        property_code AS "propertyCode",
        title,
        property_type AS "propertyType",
        listing_type AS "listingType",
        monthly_rent AS "monthlyRent",
        available_from AS "availableFrom",
        available_to AS "availableTo",
        bedrooms,
        bathrooms,
        COALESCE(amenities, '[]'::jsonb) AS amenities,
        location_text AS "locationText",
        latitude,
        longitude,
        COALESCE(gallery_urls, '[]'::jsonb) AS "galleryUrls",
        description,
        is_active AS "isActive",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `;

    const values = [
      data.ownerId,
      data.propertyCode,
      data.title,
      data.propertyType,
      data.listingType,
      data.monthlyRent ?? null,
      data.availableFrom ?? null,
      data.availableTo ?? null,
      data.bedrooms,
      data.bathrooms,
      JSON.stringify(data.amenities || []),
      data.locationText,
      data.latitude,
      data.longitude,
      JSON.stringify(data.galleryUrls || []),
      data.description || null,
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async update(id, ownerId, updates) {
    const columnMap = {
      title: "title",
      propertyType: "property_type",
      listingType: "listing_type",
      monthlyRent: "monthly_rent",
      availableFrom: "available_from",
      availableTo: "available_to",
      bedrooms: "bedrooms",
      bathrooms: "bathrooms",
      amenities: "amenities",
      locationText: "location_text",
      latitude: "latitude",
      longitude: "longitude",
      galleryUrls: "gallery_urls",
      description: "description",
    };

    const updateFields = [];
    const values = [];
    let paramCount = 1;

    Object.entries(columnMap).forEach(([key, column]) => {
      if (updates[key] !== undefined) {
        updateFields.push(`${column} = $${paramCount++}`);

        if (key === "amenities" || key === "galleryUrls") {
          values.push(JSON.stringify(updates[key]));
        } else {
          values.push(updates[key]);
        }
      }
    });

    if (updateFields.length === 0) {
      return this.findOwnedById(id, ownerId);
    }

    values.push(id);
    values.push(ownerId);

    const query = `
      UPDATE rental_properties
      SET ${updateFields.join(", ")}, updated_at = NOW()
      WHERE id = $${paramCount++} AND owner_id = $${paramCount}
      RETURNING
        id,
        owner_id AS "ownerId",
        property_code AS "propertyCode",
        title,
        property_type AS "propertyType",
        listing_type AS "listingType",
        monthly_rent AS "monthlyRent",
        available_from AS "availableFrom",
        available_to AS "availableTo",
        bedrooms,
        bathrooms,
        COALESCE(amenities, '[]'::jsonb) AS amenities,
        location_text AS "locationText",
        latitude,
        longitude,
        COALESCE(gallery_urls, '[]'::jsonb) AS "galleryUrls",
        description,
        is_active AS "isActive",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `;

    const result = await pool.query(query, values);
    return result.rows[0];
  }
}

module.exports = Property;
