const pool = require("../config/database");

class RentalServiceProviderCategory {
  static async findByProviderId(providerId, client = pool) {
    const result = await client.query(
      `
        SELECT
          sc.id,
          sc.name,
          sc.description,
          sc.is_active AS "isActive"
        FROM rental_service_provider_categories rspc
        JOIN service_categories sc
          ON sc.id = rspc.service_category_id
        WHERE rspc.provider_id = $1
        ORDER BY sc.name ASC
      `,
      [providerId],
    );

    return result.rows;
  }

  static async replaceForProvider(providerId, serviceCategoryIds = [], client = pool) {
    const normalizedIds = [...new Set(
      serviceCategoryIds
        .map((id) => parseInt(id, 10))
        .filter((id) => Number.isInteger(id) && id > 0),
    )];

    await client.query(
      `
        DELETE FROM rental_service_provider_categories
        WHERE provider_id = $1
          AND NOT (service_category_id = ANY($2::int[]))
      `,
      [providerId, normalizedIds.length > 0 ? normalizedIds : [0]],
    );

    if (normalizedIds.length > 0) {
      await client.query(
        `
          INSERT INTO rental_service_provider_categories (
            provider_id,
            service_category_id,
            created_at,
            updated_at
          )
          SELECT
            $1,
            category_id,
            NOW(),
            NOW()
          FROM UNNEST($2::int[]) AS category_id
          ON CONFLICT (provider_id, service_category_id) DO UPDATE
          SET updated_at = NOW()
        `,
        [providerId, normalizedIds],
      );
    }

    return this.findByProviderId(providerId, client);
  }
}

module.exports = RentalServiceProviderCategory;
