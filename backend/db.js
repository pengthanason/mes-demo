const { Pool } = require('pg');

const schemaRaw = String(process.env.DB_SCHEMA || process.env.MES_DB_SCHEMA || '').trim();
const schemaSafe = /^[A-Za-z_][A-Za-z0-9_]*$/.test(schemaRaw) ? schemaRaw : '';

function parseConnectTimeoutMillis(rawValue) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 5000;
  }
  if (parsed < 1000) {
    // Backward compatibility with env values that were defined in seconds.
    return Math.round(parsed * 1000);
  }
  return Math.round(parsed);
}

const poolConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'productiondb',
  user: process.env.DB_USER || 'syntechdb',
  password: process.env.DB_PASSWORD || '',
  ssl: (process.env.DB_SSLMODE || 'prefer') === 'require' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: parseConnectTimeoutMillis(process.env.DB_CONNECT_TIMEOUT || '5000'),
  min: 2,
  max: 10,
  idleTimeoutMillis: 10000,
};

// Build connection-level options: always set statement_timeout, optionally add search_path.
const connOptions = ['-c statement_timeout=30000'];
if (schemaSafe) {
  // Apply schema isolation at connection level for integration/e2e test runs.
  connOptions.push(`-c search_path=${schemaSafe}`);
}
poolConfig.options = connOptions.join(' ');

const pool = new Pool(poolConfig);

// Prevent the process from crashing on unexpected idle-client errors.
pool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('Unexpected error on idle database client:', err.message || err);
});

async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_err) {
      // eslint-disable-next-line no-console
      console.warn('database rollback failed:', _err?.message || _err);
    }
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  withTransaction,
};
