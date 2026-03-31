const pool = require('../config/database');

class ServiceRequest {
  static async create(data) {
    const {
      request_id,
      customer_id,
      service_category,
      bin_type_id,
      bin_size_id,
      location,
      start_date,
      end_date,
      attachment_url,
      estimated_price,
      payment_method = 'online',
      contact_number,
      contact_email,
      instructions,
      latitude,
      longitude,
      selected_services, // Add this
    } = data;

    const query = `
      INSERT INTO service_requests (
        request_id,
        customer_id,
        service_category,
        bin_type_id,
        bin_size_id,
        location,
        start_date,
        end_date,
        attachment_url,
        estimated_price,
        payment_method,
        contact_number,
        contact_email,
        instructions,
        status,
        latitude,
        longitude,
        selected_services,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'pending', $15, $16, $17, NOW(), NOW())
      RETURNING *
    `;

    const values = [
      request_id,
      customer_id,
      service_category,
      bin_type_id || null,
      bin_size_id || null,
      location,
      start_date,
      end_date,
      attachment_url || null,
      estimated_price || null,
      payment_method,
      contact_number || null,
      contact_email || null,
      instructions || null,
      latitude || null,
      longitude || null,
      selected_services ? JSON.stringify(selected_services) : null,
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async findById(id) {
    const query = `
      SELECT 
        sr.*,
        bt.name AS bin_type_name,
        bs.size AS bin_size,
        bs.capacity_cubic_meters,
        c.name AS customer_name,
        c.phone AS customer_phone,
        s.name AS supplier_name,
        s.phone AS supplier_phone,
        d.name AS driver_name,
        d.phone AS driver_phone,
        d.push_token AS driver_push_token,
        c.push_token AS customer_push_token,
        s.push_token AS supplier_push_token,
        pb.bin_code,
        COALESCE(sr.invoice_id, i.invoice_id) AS invoice_id,
        b.bill_id,
        (SELECT STRING_AGG(name, ', ') 
         FROM service_categories 
         WHERE id = ANY(ARRAY(SELECT jsonb_array_elements_text(sr.selected_services)::int))
        ) AS service_names,
        (SELECT COUNT(*) 
         FROM jsonb_array_elements(sr.selected_services)
        ) AS selected_services_count
      FROM service_requests sr
      LEFT JOIN bin_types bt ON sr.bin_type_id = bt.id
      LEFT JOIN bin_sizes bs ON sr.bin_size_id = bs.id
      LEFT JOIN users c ON sr.customer_id = c.id
      LEFT JOIN users s ON sr.supplier_id = s.id
      LEFT JOIN users d ON sr.driver_id = d.id
      LEFT JOIN physical_bins pb ON sr.bin_id = pb.id
      LEFT JOIN invoices i ON sr.id = i.service_request_id
      LEFT JOIN bills b ON sr.id = b.service_request_id
      WHERE sr.id = $1
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  static async findByRequestId(requestId) {
    const query = `
      SELECT 
        sr.*,
        bt.name AS bin_type_name,
        bs.size AS bin_size,
        c.name AS customer_name,
        s.name AS supplier_name,
        d.name AS driver_name,
        d.phone AS driver_phone,
        d.push_token AS driver_push_token,
        c.push_token AS customer_push_token,
        s.push_token AS supplier_push_token,
        pb.bin_code,
        COALESCE(sr.invoice_id, i.invoice_id) AS invoice_id,
        b.bill_id,
        (SELECT STRING_AGG(name, ', ') 
         FROM service_categories 
         WHERE id = ANY(ARRAY(SELECT jsonb_array_elements_text(sr.selected_services)::int))
        ) AS service_names,
        (SELECT COUNT(*) 
         FROM jsonb_array_elements(sr.selected_services)
        ) AS selected_services_count
      FROM service_requests sr
      LEFT JOIN bin_types bt ON sr.bin_type_id = bt.id
      LEFT JOIN bin_sizes bs ON sr.bin_size_id = bs.id
      LEFT JOIN users c ON sr.customer_id = c.id
      LEFT JOIN users s ON sr.supplier_id = s.id
      LEFT JOIN users d ON sr.driver_id = d.id
      LEFT JOIN physical_bins pb ON sr.bin_id = pb.id
      LEFT JOIN invoices i ON sr.id = i.service_request_id
      LEFT JOIN bills b ON sr.id = b.service_request_id
      WHERE sr.request_id = $1
    `;
    const result = await pool.query(query, [requestId]);
    return result.rows[0];
  }

  static async findByCustomer(customerId, filters = {}) {
    let query = `
      SELECT 
        sr.*,
        bt.name AS bin_type_name,
        bs.size AS bin_size,
        pb.bin_code,
        COALESCE(sr.invoice_id, i.invoice_id) AS invoice_id,
        (SELECT COUNT(*) FROM order_items oi WHERE oi.service_request_id = sr.id) AS order_items_count,
        (SELECT STRING_AGG(name, ', ') 
         FROM service_categories 
         WHERE id = ANY(ARRAY(SELECT jsonb_array_elements_text(sr.selected_services)::int))
        ) AS service_names,
        (SELECT COUNT(*) 
         FROM jsonb_array_elements(sr.selected_services)
        ) AS selected_services_count
      FROM service_requests sr
      LEFT JOIN bin_types bt ON sr.bin_type_id = bt.id
      LEFT JOIN bin_sizes bs ON sr.bin_size_id = bs.id
      LEFT JOIN physical_bins pb ON sr.bin_id = pb.id
      LEFT JOIN invoices i ON sr.id = i.service_request_id
      WHERE sr.customer_id = $1
    `;
    const values = [customerId];
    let paramCount = 2;

    if (filters.status) {
      query += ` AND sr.status = $${paramCount++}`;
      values.push(filters.status);
    }

    query += ` ORDER BY sr.created_at DESC`;

    if (filters.limit) {
      query += ` LIMIT $${paramCount++}`;
      values.push(filters.limit);
    }

    const result = await pool.query(query, values);
    const requests = result.rows;

    // Fetch items for each request
    for (let i = 0; i < requests.length; i++) {
      const items = await pool.query(`
        SELECT oi.*, bt.name as bin_type_name, bs.size as bin_size
        FROM order_items oi
        LEFT JOIN bin_types bt ON oi.bin_type_id = bt.id
        LEFT JOIN bin_sizes bs ON oi.bin_size_id = bs.id
        WHERE oi.service_request_id = $1
      `, [requests[i].id]);
      requests[i].items = items.rows;
    }

    return requests;
  }

  static async findBySupplier(supplierId, filters = {}) {
    let query = `
      SELECT 
        sr.*,
        bt.name AS bin_type_name,
        bs.size AS bin_size,
        c.name AS customer_name,
        c.phone AS customer_phone,
        d.name AS driver_name,
        d.phone AS driver_phone,
        d.push_token AS driver_push_token,
        pb.bin_code,
        COALESCE(sr.invoice_id, i.invoice_id) AS invoice_id,
        (SELECT COUNT(*) FROM order_items oi WHERE oi.service_request_id = sr.id) AS order_items_count,
        (SELECT STRING_AGG(name, ', ') 
         FROM service_categories 
         WHERE id = ANY(ARRAY(SELECT jsonb_array_elements_text(sr.selected_services)::int))
        ) AS service_names,
        (SELECT COUNT(*) 
         FROM jsonb_array_elements(sr.selected_services)
        ) AS selected_services_count
      FROM service_requests sr
      LEFT JOIN bin_types bt ON sr.bin_type_id = bt.id
      LEFT JOIN bin_sizes bs ON sr.bin_size_id = bs.id
      LEFT JOIN users c ON sr.customer_id = c.id
      LEFT JOIN users d ON sr.driver_id = d.id
      LEFT JOIN physical_bins pb ON sr.bin_id = pb.id
      LEFT JOIN invoices i ON sr.id = i.service_request_id
      WHERE sr.supplier_id = $1
    `;
    const values = [supplierId];
    let paramCount = 2;

    if (filters.status) {
      query += ` AND sr.status = $${paramCount++}`;
      values.push(filters.status);
    }

    query += ` ORDER BY sr.created_at DESC`;

    if (filters.limit) {
      query += ` LIMIT $${paramCount++}`;
      values.push(filters.limit);
    }

    const result = await pool.query(query, values);
    const requests = result.rows;

    // Fetch items for each request
    for (let i = 0; i < requests.length; i++) {
      const items = await pool.query(`
        SELECT oi.*, bt.name as bin_type_name, bs.size as bin_size
        FROM order_items oi
        LEFT JOIN bin_types bt ON oi.bin_type_id = bt.id
        LEFT JOIN bin_sizes bs ON oi.bin_size_id = bs.id
        WHERE oi.service_request_id = $1
      `, [requests[i].id]);
      requests[i].items = items.rows;
    }

    return requests;
  }

  static async findPendingForSuppliers(supplierId) {
    let query = `
      SELECT 
        sr.*,
        bt.name AS bin_type_name,
        bs.size AS bin_size,
        c.name AS customer_name,
        c.phone AS customer_phone,
        d.name AS driver_name,
        d.phone AS driver_phone,
        d.push_token AS driver_push_token,
        pb.bin_code,
        (SELECT COUNT(*) FROM order_items oi WHERE oi.service_request_id = sr.id) AS order_items_count,
        (SELECT STRING_AGG(name, ', ') 
         FROM service_categories 
         WHERE id = ANY(ARRAY(SELECT jsonb_array_elements_text(sr.selected_services)::int))
        ) AS service_names,
        (SELECT COUNT(*) 
         FROM jsonb_array_elements(sr.selected_services)
        ) AS selected_services_count
      FROM service_requests sr
      LEFT JOIN bin_types bt ON sr.bin_type_id = bt.id
      LEFT JOIN bin_sizes bs ON sr.bin_size_id = bs.id
      LEFT JOIN users c ON sr.customer_id = c.id
      LEFT JOIN users d ON sr.driver_id = d.id
      LEFT JOIN physical_bins pb ON sr.bin_id = pb.id
      WHERE sr.status = 'pending' AND sr.supplier_id IS NULL
    `;

    const values = [];

    if (supplierId) {
      values.push(supplierId);
      // Filter by service area coverage
      // Check if sr.location contains any of the supplier's service area cities (case-insensitive)
      query += `
        AND EXISTS (
            SELECT 1 FROM service_areas sa
            WHERE sa.supplier_id = $1
            AND (
                (sr.latitude IS NOT NULL AND sr.longitude IS NOT NULL AND sa.latitude IS NOT NULL AND sa.longitude IS NOT NULL 
                 AND (6371 * acos(cos(radians(sr.latitude)) * cos(radians(sa.latitude)) * cos(radians(sa.longitude) - radians(sr.longitude)) + sin(radians(sr.latitude)) * sin(radians(sa.latitude)))) <= sa.area_radius_km)
                OR ((sr.latitude IS NULL OR sr.longitude IS NULL OR sa.latitude IS NULL OR sa.longitude IS NULL) AND sr.location ILIKE '%' || sa.city || '%')
            )
        )
      `;
    }

    query += ` ORDER BY sr.created_at DESC`;

    const result = await pool.query(query, values);
    const requests = result.rows;

    // Fetch items for each request
    for (let i = 0; i < requests.length; i++) {
      const items = await pool.query(`
        SELECT oi.*, bt.name as bin_type_name, bs.size as bin_size
        FROM order_items oi
        LEFT JOIN bin_types bt ON oi.bin_type_id = bt.id
        LEFT JOIN bin_sizes bs ON oi.bin_size_id = bs.id
        WHERE oi.service_request_id = $1
      `, [requests[i].id]);
      requests[i].items = items.rows;
    }

    return requests;
  }

  static async update(id, updates) {
    const allowedUpdates = [
      'supplier_id',
      'status',
      'payment_status',
      'bin_id',
      'payment_method',
      'invoice_id',
      'contact_number',
      'contact_email',
      'instructions',
      'attachment_url',
      'delivery_photo_url'
    ];
    const updateFields = [];
    const values = [];
    let paramCount = 1;

    Object.keys(updates).forEach((key) => {
      if (allowedUpdates.includes(key)) {
        updateFields.push(`${key} = $${paramCount++}`);
        values.push(updates[key]);
      }
    });

    if (updateFields.length === 0) {
      return await this.findById(id);
    }

    updateFields.push(`updated_at = NOW()`);
    values.push(id);

    const query = `
      UPDATE service_requests
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async assignSupplier(requestId, supplierId) {
    const query = `
      UPDATE service_requests
      SET supplier_id = $1, status = 'confirmed', updated_at = NOW()
      WHERE request_id = $2 AND status = 'pending'
      RETURNING *
    `;
    const result = await pool.query(query, [supplierId, requestId]);
    return result.rows[0];
  }

  static async assignDriver(requestId, driverId) {
    const query = `
      UPDATE service_requests
      SET driver_id = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;
    const result = await pool.query(query, [driverId, requestId]);
    return result.rows[0];
  }

  static async findAll(filters = {}) {
    let query = `
      SELECT 
        sr.*,
        bt.name AS bin_type_name,
        bs.size AS bin_size,
        c.name AS customer_name,
        c.phone AS customer_phone,
        s.name AS supplier_name,
        s.phone AS supplier_phone,
        d.name AS driver_name,
        d.phone AS driver_phone,
        d.push_token AS driver_push_token,
        COALESCE(sr.invoice_id, i.invoice_id) AS invoice_id,
        b.bill_id,
        (SELECT COUNT(*) FROM order_items oi WHERE oi.service_request_id = sr.id) AS order_items_count,
        (SELECT STRING_AGG(name, ', ') 
         FROM service_categories 
         WHERE id = ANY(ARRAY(SELECT jsonb_array_elements_text(sr.selected_services)::int))
        ) AS service_names,
        (SELECT COUNT(*) 
         FROM jsonb_array_elements(sr.selected_services)
        ) AS selected_services_count
      FROM service_requests sr
      LEFT JOIN bin_types bt ON sr.bin_type_id = bt.id
      LEFT JOIN bin_sizes bs ON sr.bin_size_id = bs.id
      LEFT JOIN users c ON sr.customer_id = c.id
      LEFT JOIN users s ON sr.supplier_id = s.id
      LEFT JOIN users d ON sr.driver_id = d.id
      LEFT JOIN invoices i ON sr.id = i.service_request_id
      LEFT JOIN bills b ON sr.id = b.service_request_id
      WHERE 1=1
    `;
    const values = [];
    let paramCount = 1;

    if (filters.status) {
      query += ` AND sr.status = $${paramCount++}`;
      values.push(filters.status);
    }

    if (filters.customer_id) {
      query += ` AND sr.customer_id = $${paramCount++}`;
      values.push(filters.customer_id);
    }

    if (filters.supplier_id) {
      query += ` AND sr.supplier_id = $${paramCount++}`;
      values.push(filters.supplier_id);
    }

    if (filters.driver_id) {
      query += ` AND sr.driver_id = $${paramCount++}`;
      values.push(filters.driver_id);
    }

    query += ` ORDER BY sr.created_at DESC`;

    if (filters.limit) {
      query += ` LIMIT $${paramCount++}`;
      values.push(filters.limit);
    }

    const result = await pool.query(query, values);
    return result.rows;
  }
}

module.exports = ServiceRequest;
