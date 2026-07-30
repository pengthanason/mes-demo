const { Pool } = require('pg');

const IS_PROD = process.env.NODE_ENV === 'production';

// fail-fast บน prod: ถ้าไม่ตั้ง env ของ DB เลย ของเดิมจะเงียบๆ ไป fallback localhost + รหัสที่ hardcode
// → query พังทุกตัวแต่ /api/health ยังตอบ ok = LB เห็นเขียวทั้งที่แอปใช้งานไม่ได้ (debug ยากมาก)
if (IS_PROD && !process.env.DATABASE_URL && !process.env.DB_HOST) {
  throw new Error('[db] ต้องตั้ง DATABASE_URL หรือ DB_HOST เมื่อ NODE_ENV=production');
}
if (IS_PROD && !process.env.DATABASE_URL && !process.env.DB_PASSWORD) {
  throw new Error('[db] ต้องตั้ง DB_PASSWORD เมื่อ NODE_ENV=production (ห้ามใช้ค่า default)');
}

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      // DB_SSL_STRICT=true = ตรวจ certificate จริง (ควรเปิดบน prod ถ้า provider มี CA ให้)
      // ค่า default ยังผ่อนไว้เพื่อความเข้ากันได้กับ Neon/Render ที่ใช้ self-signed
      ssl: process.env.DB_SSL_STRICT === 'true' ? true : { rejectUnauthorized: false },
    })
  : new Pool({
      host:     process.env.DB_HOST     || 'localhost',
      port:     Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME     || 'productiondb',
      user:     process.env.DB_USER     || 'syntechdb',
      // ไม่มี default บน prod (ถูกกันด้วย fail-fast ด้านบน) — ค่านี้ใช้เฉพาะ dev บนเครื่องตัวเอง
      password: process.env.DB_PASSWORD || 'syntech2026',
    });

pool.on('error', (err) => {
  console.error('[db] unexpected error:', err.message);
});

module.exports = pool;
