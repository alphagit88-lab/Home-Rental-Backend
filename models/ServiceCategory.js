const pool = require('../config/database');

class ServiceCategory {
  static async findAll(filters = {}) {
    let query = 'SELECT * FROM service_categories WHERE is_active = true';
    const values = [];

    if (filters.name) {
      query += ' AND name ILIKE $1';
      values.push(`%${filters.name}%`);
    }

    query += ' ORDER BY name ASC';
    const result = await pool.query(query, values);
    return result.rows;
  }

  static async findById(id) {
    const query = 'SELECT * FROM service_categories WHERE id = $1';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  static async findByIds(ids = []) {
    const normalizedIds = [...new Set(
      ids
        .map((id) => parseInt(id, 10))
        .filter((id) => Number.isInteger(id) && id > 0)
    )];

    if (normalizedIds.length === 0) {
      return [];
    }

    const query = `
      SELECT *
      FROM service_categories
      WHERE is_active = true
        AND id = ANY($1::int[])
      ORDER BY name ASC
    `;
    const result = await pool.query(query, [normalizedIds]);
    return result.rows;
  }

  static async create({ name, description }) {
    const query = `
      INSERT INTO service_categories (name, description, created_at, updated_at)
      VALUES ($1, $2, NOW(), NOW())
      RETURNING *
    `;
    const result = await pool.query(query, [name, description]);
    return result.rows[0];
  }

  static async update(id, { name, description, is_active }) {
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(description);
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      values.push(is_active);
    }

    if (updates.length === 0) return this.findById(id);

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const query = `
      UPDATE service_categories 
      SET ${updates.join(', ')} 
      WHERE id = $${paramCount} 
      RETURNING *
    `;
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async delete(id) {
    const query = 'DELETE FROM service_categories WHERE id = $1 RETURNING id';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }
}

module.exports = ServiceCategory;
