const pool = require('../config/database');
const bcrypt = require('bcryptjs');

class User {
  static async create({ name, phone, email, role, password, supplierType, supplierId }) {
    const hashedPassword = await bcrypt.hash(password, 10);
    const supplier_type = role === 'supplier' ? (supplierType || null) : null;
    const supplier_id = role === 'driver' ? (supplierId || null) : null;
    const query = `
      INSERT INTO users (name, phone, email, role, supplier_type, supplier_id, password_hash, push_token, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      RETURNING id, name, phone, email, role, supplier_type AS "supplierType", supplier_id AS "supplierId", push_token AS "pushToken", created_at, updated_at
    `;
    const values = [name, phone, email || null, role, supplier_type, supplier_id, hashedPassword, null];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async findByPhone(phone) {
    const query = `
      SELECT
        id,
        name,
        phone,
        email,
        role,
        supplier_type AS "supplierType",
        supplier_id AS "supplierId",
        password_hash,
        push_token AS "pushToken",
        created_at,
        updated_at
      FROM users
      WHERE phone = $1
    `;
    const result = await pool.query(query, [phone]);
    return result.rows[0];
  }

  static async findById(id) {
    const query = `
      SELECT 
        id, 
        name, 
        phone, 
        email, 
        role,
        supplier_type AS "supplierType",
        supplier_id AS "supplierId",
        push_token AS "pushToken",
        created_at, 
        updated_at 
      FROM users 
      WHERE id = $1
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  static async findAll() {
    const query = `
      SELECT 
        id, 
        name, 
        phone, 
        email, 
        role,
        supplier_type AS "supplierType",
        supplier_id AS "supplierId",
        created_at, 
        updated_at 
      FROM users 
      ORDER BY created_at DESC
    `;
    const result = await pool.query(query);
    return result.rows;
  }

  static async findBySupplierId(supplierId) {
    const query = `
      SELECT 
        id, 
        name, 
        phone, 
        email, 
        role,
        created_at, 
        updated_at 
      FROM users 
      WHERE supplier_id = $1 AND role = 'driver'
      ORDER BY name ASC
    `;
    const result = await pool.query(query, [supplierId]);
    return result.rows;
  }

  static async update(id, { name, email, role, supplierType, supplierId }) {
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (email !== undefined) {
      updates.push(`email = $${paramCount++}`);
      values.push(email || null);
    }
    if (role !== undefined) {
      updates.push(`role = $${paramCount++}`);
      values.push(role);
    }
    if (supplierType !== undefined) {
      updates.push(`supplier_type = $${paramCount++}`);
      values.push(supplierType || null);
    }
    if (supplierId !== undefined) {
      updates.push(`supplier_id = $${paramCount++}`);
      values.push(supplierId || null);
    }

    if (updates.length === 0) {
      return await this.findById(id);
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const query = `
      UPDATE users 
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, name, phone, email, role, supplier_type AS "supplierType", supplier_id AS "supplierId", push_token AS "pushToken", created_at, updated_at
    `;
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async updatePushToken(id, pushToken) {
    const query = 'UPDATE users SET push_token = $1, updated_at = NOW() WHERE id = $2 RETURNING id';
    const result = await pool.query(query, [pushToken, id]);
    return result.rows[0];
  }

  static async delete(id) {
    const query = 'DELETE FROM users WHERE id = $1 RETURNING id';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  static async verifyPassword(user, password) {
    return await bcrypt.compare(password, user.password_hash);
  }

  static async hashPassword(password) {
    return await bcrypt.hash(password, 10);
  }

  static async updatePassword(id, hashedPassword) {
    const query = 'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2';
    await pool.query(query, [hashedPassword, id]);
  }

  // Find suppliers who have available bins matching the requirements (single bin)
  static async findQualifiedSuppliers(binTypeId, binSizeId, latitude = null, longitude = null, locationText = null) {
    const values = [binTypeId, binSizeId];
    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);
    let locationCondition = '';
    
    if (!isNaN(lat) && !isNaN(lon)) {
      values.push(lat, lon);
      locationCondition = `AND (6371 * acos(cos(radians($3)) * cos(radians(sa.latitude)) * cos(radians(sa.longitude) - radians($4)) + sin(radians($3)) * sin(radians(sa.latitude)))) <= sa.area_radius_km`;
    } else if (locationText) {
      values.push(locationText);
      locationCondition = `AND $3 ILIKE '%' || sa.city || '%'`;
    }

    const query = `
      SELECT DISTINCT
        u.id,
        u.name,
        u.phone,
        u.email,
        u.push_token AS "pushToken",
        COUNT(pb.id) as available_bin_count
      FROM users u
      INNER JOIN physical_bins pb ON u.id = pb.supplier_id
      INNER JOIN service_areas sa ON u.id = sa.supplier_id
      INNER JOIN service_area_bins sab ON sa.id = sab.service_area_id
      WHERE u.role = 'supplier'
        AND pb.bin_type_id = $1
        AND pb.bin_size_id IS NOT DISTINCT FROM $2
        AND pb.status = 'available'
        AND sab.bin_type_id = $1
        AND sab.bin_size_id IS NOT DISTINCT FROM $2
        AND sab.is_active = TRUE
        AND sab.admin_final_price IS NOT NULL
        ${locationCondition}
      GROUP BY u.id, u.name, u.phone, u.email
      HAVING COUNT(pb.id) > 0
      ORDER BY available_bin_count DESC
    `;
    const result = await pool.query(query, values);
    return result.rows;
  }

  // orderItems should be an array of { bin_type_id, bin_size_id, quantity }
  static async findQualifiedSuppliersForMultipleBins(orderItems, latitude = null, longitude = null, locationText = null) {
    const binRequirements = orderItems.map((item) => {
      const typeId = parseInt(item.bin_type_id);
      const rawSizeId = item.bin_size_id;
      // Handle "null", null, or empty values safely
      const sizeId = (rawSizeId === null || rawSizeId === undefined || rawSizeId === 'null' || rawSizeId === '') 
        ? null 
        : parseInt(rawSizeId);
      
      return {
        bin_type_id: isNaN(typeId) ? null : typeId,
        bin_size_id: (sizeId !== null && isNaN(sizeId)) ? null : sizeId,
        quantity: parseInt(item.quantity) || 1,
      };
    }).filter(req => req.bin_type_id !== null);

    if (binRequirements.length === 0) {
      return [];
    }

    const values = [];
    let paramCount = 1;

    // 1. Matched Suppliers (Radius check with city fallback)
    let locationFilter = '';
    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);

    if (!isNaN(lat) && !isNaN(lon)) {
      values.push(lat, lon);
      locationFilter = `AND (6371 * acos(cos(radians($1)) * cos(radians(sa.latitude)) * cos(radians(sa.longitude) - radians($2)) + sin(radians($1)) * sin(radians(sa.latitude)))) <= sa.area_radius_km`;
      paramCount = 3;
    } else if (locationText) {
      values.push(locationText);
      locationFilter = `AND $1 ILIKE '%' || sa.city || '%'`;
      paramCount = 2;
    }

    // 2. Active Pricing check for each requirement
    const pricingConditions = binRequirements.map((req) => {
      const p1 = paramCount++;
      const p2 = paramCount++;
      values.push(req.bin_type_id, req.bin_size_id);
      return `(sab.bin_type_id = $${p1} AND sab.bin_size_id IS NOT DISTINCT FROM $${p2})`;
    });

    const query = `
      WITH matched_service_areas AS (
        SELECT sa.id, sa.supplier_id
        FROM service_areas sa
        WHERE 1=1 ${locationFilter}
      ),
      active_pricing AS (
        SELECT msa.supplier_id, sab.bin_type_id, sab.bin_size_id, sab.admin_final_price
        FROM matched_service_areas msa
        JOIN service_area_bins sab ON msa.id = sab.service_area_id
        WHERE sab.is_active = TRUE AND sab.admin_final_price IS NOT NULL
          AND (${pricingConditions.join(' OR ')})
      ),
      bin_requirements AS (
        ${binRequirements.map((r, i) => {
          const p1 = paramCount++;
          const p2 = paramCount++;
          const p3 = paramCount++;
          values.push(r.bin_type_id, r.bin_size_id, r.quantity);
          return `SELECT $${p1}::integer as bin_type_id, $${p2}::integer as bin_size_id, $${p3}::integer as required_quantity ${i === 0 ? '' : 'UNION ALL '}`;
        }).join('\n        ')}
      ),
      suppliers_with_all_pricing AS (
        SELECT supplier_id
        FROM active_pricing
        GROUP BY supplier_id
        HAVING COUNT(DISTINCT (bin_type_id, COALESCE(bin_size_id, -1))) = ${binRequirements.length}
      ),
      supplier_totals AS (
        SELECT ap.supplier_id, SUM(ap.admin_final_price * req.required_quantity) as total_price
        FROM active_pricing ap
        JOIN bin_requirements req ON ap.bin_type_id = req.bin_type_id AND ap.bin_size_id IS NOT DISTINCT FROM req.bin_size_id
        GROUP BY ap.supplier_id
      ),
      available_bins AS (
        SELECT pb.supplier_id, pb.bin_type_id, pb.bin_size_id, COUNT(*) as count
        FROM physical_bins pb
        JOIN suppliers_with_all_pricing swp ON pb.supplier_id = swp.supplier_id
        WHERE pb.status = 'available'
        GROUP BY pb.supplier_id, pb.bin_type_id, pb.bin_size_id
      ),
      suppliers_with_stock AS (
        SELECT ab.supplier_id
        FROM bin_requirements req
        JOIN available_bins ab ON req.bin_type_id = ab.bin_type_id AND req.bin_size_id IS NOT DISTINCT FROM ab.bin_size_id
        WHERE ab.count >= req.required_quantity
        GROUP BY ab.supplier_id
        HAVING COUNT(*) = ${binRequirements.length}
      )
      SELECT DISTINCT 
        u.id, 
        u.name, 
        u.phone, 
        u.email, 
        u.push_token AS "pushToken",
        st.total_price
      FROM users u
      JOIN suppliers_with_stock sws ON u.id = sws.supplier_id
      JOIN supplier_totals st ON u.id = st.supplier_id
      ORDER BY u.name
    `;

    const result = await pool.query(query, values);
    return result.rows;
  }

  // Find suppliers who cover the given location (for service requests without specific bins)
  static async findQualifiedSuppliersForService(latitude, longitude, locationText) {
    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);
    const values = [];
    let locationCondition = '';

    if (!isNaN(lat) && !isNaN(lon)) {
      values.push(lat, lon);
      locationCondition = `AND (6371 * acos(cos(radians($1)) * cos(radians(sa.latitude)) * cos(radians(sa.longitude) - radians($2)) + sin(radians($1)) * sin(radians(sa.latitude)))) <= sa.area_radius_km`;
    } else if (locationText) {
      values.push(locationText);
      locationCondition = `AND $1 ILIKE '%' || sa.city || '%'`;
    } else {
      return [];
    }

    const query = `
      SELECT DISTINCT
        u.id,
        u.name,
        u.phone,
        u.email,
        u.push_token AS "pushToken"
      FROM users u
      INNER JOIN service_areas sa ON u.id = sa.supplier_id
      WHERE u.role = 'supplier'
        ${locationCondition}
      ORDER BY u.name
    `;
    const result = await pool.query(query, values);
    return result.rows;
  }
}

module.exports = User;
