const { Pool } = require('pg');

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })
  : new Pool({
      host:     process.env.DB_HOST     || 'localhost',
      port:     Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME     || 'productiondb',
      user:     process.env.DB_USER     || 'syntechdb',
      password: process.env.DB_PASSWORD || 'syntech2026',
    });

pool.on('error', (err) => {
  console.error('[db] unexpected error:', err.message);
});

module.exports = pool;
