const toInt = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

// Mirror DB_SCHEMA / MES_DB_SCHEMA env so migrations run in the same schema
// as the application (default: mes_core).
const schemaRaw = String(process.env.DB_SCHEMA || process.env.MES_DB_SCHEMA || 'mes_core').trim();
const schemaSafe = /^[A-Za-z_][A-Za-z0-9_]*$/.test(schemaRaw) ? schemaRaw : 'mes_core';

const baseConfig = {
  client: 'pg',
  connection: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: toInt(process.env.DB_PORT, 15432),
    database: process.env.DB_NAME || 'productiondb',
    user: process.env.DB_USER || 'syntechdb',
    password: process.env.DB_PASSWORD || 'change_me',
    ssl: (process.env.DB_SSLMODE || 'prefer') === 'require' ? { rejectUnauthorized: false } : false,
  },
  // Ensure migrations resolve table references within the correct schema.
  searchPath: [schemaSafe, 'public'],
  migrations: {
    directory: './migrations',
    tableName: 'knex_migrations',
    schemaName: schemaSafe,
  },
};

module.exports = {
  development: baseConfig,
  staging: baseConfig,
  production: baseConfig,
};
