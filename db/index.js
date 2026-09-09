'use strict';

const { Pool } = require('pg');

let pool = null;
let memStore = null; // in-memory fallback

// ===== In-memory store (for local dev without DB) =====
class MemStore {
  constructor() { this.tables = {}; }
  _table(t) { if (!this.tables[t]) this.tables[t] = new Map(); return this.tables[t]; }
  insert(table, data) {
    const id = data.id || require('crypto').randomUUID();
    const row = { id, created_at: new Date(), updated_at: new Date(), ...data };
    this._table(table).set(id, row);
    return row;
  }
  update(table, id, data) {
    const row = this._table(table).get(id);
    if (!row) return null;
    Object.assign(row, data, { updated_at: new Date() });
    return row;
  }
  findById(table, id) { return this._table(table).get(id) || null; }
  findBy(table, field, value) {
    for (const row of this._table(table).values()) if (row[field] === value) return row;
    return null;
  }
  findMany(table, field, value, limit = 50) {
    const rows = [];
    for (const row of this._table(table).values()) { if (row[field] === value) { rows.push(row); if (rows.length >= limit) break; } }
    return rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }
  getAll(table, limit = 1000) {
    const rows = [...this._table(table).values()];
    return rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, limit);
  }
  remove(table, id) { this._table(table).delete(id); }
  count(table, field, value) {
    let c = 0;
    for (const row of this._table(table).values()) if (row[field] === value) c++;
    return c;
  }
}

function getMemStore() {
  if (!memStore) { memStore = new MemStore(); console.log('  Using in-memory store'); }
  return memStore;
}

function getPool() {
  if (pool) return pool;
  const connStr = process.env.DATABASE_URL;
  if (!connStr) return null;
  pool = new Pool({
    connectionString: connStr,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000,
  });
  pool.on('error', (err) => console.error('DB error:', err.message));
  return pool;
}

// ===== Unified query interface =====
async function query(text, params) {
  const p = getPool();
  if (!p) return { rows: [] };
  return p.query(text, params);
}

async function queryOne(text, params) {
  const result = await query(text, params);
  return result.rows[0] || null;
}

async function insert(table, data) {
  const p = getPool();
  if (!p) return getMemStore().insert(table, data);
  const keys = Object.keys(data);
  const values = Object.values(data);
  const placeholders = keys.map((_, i) => `$${i + 1}`);
  return queryOne(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${placeholders.join(',')}) RETURNING *`, values);
}

async function update(table, id, data) {
  const p = getPool();
  if (!p) return getMemStore().update(table, id, data);
  const keys = Object.keys(data);
  const values = Object.values(data);
  const setClause = keys.map((k, i) => `${k}=$${i + 1}`).join(',');
  values.push(id);
  return queryOne(`UPDATE ${table} SET ${setClause}, updated_at=NOW() WHERE id=$${keys.length + 1} RETURNING *`, values);
}

async function findById(table, id) {
  const p = getPool();
  if (!p) return getMemStore().findById(table, id);
  return queryOne(`SELECT * FROM ${table} WHERE id=$1`, [id]);
}

async function findBy(table, field, value) {
  const p = getPool();
  if (!p) return getMemStore().findBy(table, field, value);
  return queryOne(`SELECT * FROM ${table} WHERE ${field}=$1`, [value]);
}

async function findMany(table, field, value, limit = 50) {
  const p = getPool();
  if (!p) return getMemStore().findMany(table, field, value, limit);
  const result = await query(`SELECT * FROM ${table} WHERE ${field}=$1 ORDER BY created_at DESC LIMIT $2`, [value, limit]);
  return result.rows;
}

async function remove(table, id) {
  const p = getPool();
  if (!p) return getMemStore().remove(table, id);
  return query(`DELETE FROM ${table} WHERE id=$1`, [id]);
}

// List all rows (admin: list users, coupons, etc)
async function getAll(table, limit = 1000) {
  const p = getPool();
  if (!p) return getMemStore().getAll(table, limit);
  const result = await query(`SELECT * FROM ${table} ORDER BY created_at DESC LIMIT $1`, [limit]);
  return result.rows;
}

async function count(table, field, value) {
  const p = getPool();
  if (!p) return getMemStore().count(table, field, value);
  const result = await query(`SELECT COUNT(*)::int as count FROM ${table} WHERE ${field}=$1`, [value]);
  return result.rows[0]?.count || 0;
}

async function close() { if (pool) { await pool.end(); pool = null; } }

module.exports = { query, queryOne, insert, update, findById, findBy, findMany, remove, count, getAll, close };

