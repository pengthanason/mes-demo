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

// ── Schema isolation ────────────────────────────────────────────────
// productiondb เป็นฐานกลางที่ใช้ร่วมกันหลายระบบ: public = WMS/OTS (70 ตาราง รวม users ของเขาเอง)
// · mes_core = MES backbone · mrp / bom / rfq = ระบบอื่น
// ถ้า my-api ไม่ระบุ schema มันจะลงที่ public แล้วไปชนของคนอื่น — โดยเฉพาะตาราง `users`
// ที่ migrations.js จะ ALTER ADD COLUMN ใส่แบบถาวร (ALTER ไม่ได้อยู่ใต้ SEED_DEMO)
//
// กติกา: my-api เป็นเจ้าของ schema ตัวเองเท่านั้น (default `mes_app`)
const DB_SCHEMA = (process.env.DB_SCHEMA || 'mes_app').trim();
if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(DB_SCHEMA)) {
  throw new Error(`[db] DB_SCHEMA ไม่ถูกต้อง: ${DB_SCHEMA} (ต้องเป็นชื่อ identifier ล้วน)`);
}
// กันพลาดชั้นสุดท้าย: ห้ามลง public ของฐานกลางเด็ดขาด แม้จะตั้ง env มาเองก็ตาม
// (เคสจริงที่กันอยู่: เผลอ `node server.js` โดยมี DB_HOST ชี้ฐานกลางค้างอยู่ในเชลล์)
const SHARED_DBS = ['productiondb'];
const dbName = process.env.DB_NAME || (process.env.DATABASE_URL ? '' : 'productiondb');
if (DB_SCHEMA === 'public' && SHARED_DBS.includes(dbName)) {
  throw new Error(
    `[db] ปฏิเสธการต่อ ${dbName} ด้วย schema public — ฐานนี้ใช้ร่วมกับ WMS/MRP\n` +
    `      ตั้ง DB_SCHEMA=mes_app (หรือ schema ของ my-api เอง) ก่อนเริ่มระบบ`
  );
}

// ตั้ง search_path ที่ระดับ connection option — ทุก connection ที่ pool เปิด (รวมตัวที่เปิดใหม่
// หลัง reconnect) ได้ค่านี้ตั้งแต่ handshake · ไม่ยิง query ซ้อนใน event 'connect'
// ซึ่ง pg เตือน deprecated และแข่งกับ query แรกของ caller ได้
const searchPathOption = `-c search_path="${DB_SCHEMA}"`;

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      options: searchPathOption,
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
      options:  searchPathOption,
    });

pool.on('error', (err) => {
  console.error('[db] unexpected error:', err.message);
});

// สร้าง schema ครั้งเดียวตอน start (ไม่ใช่ทุก connection) — ต้องใช้ connection ที่ไม่ผูก search_path
// เพราะ search_path ที่ชี้ไป schema ที่ยังไม่มี จะทำให้ CREATE TABLE ตกไป default schema
let schemaReady = null;
function ensureSchema() {
  if (!schemaReady) {
    schemaReady = pool.query(`CREATE SCHEMA IF NOT EXISTS "${DB_SCHEMA}"`)
      .then(() => console.log(`[db] schema "${DB_SCHEMA}" พร้อมใช้งาน`))
      .catch((e) => {
        schemaReady = null;                       // ให้ลองใหม่รอบหน้าได้ ไม่ค้าง promise ที่ล้มแล้ว
        console.error(`[db] สร้าง schema "${DB_SCHEMA}" ไม่สำเร็จ:`, e.message);
        throw e;
      });
  }
  return schemaReady;
}

console.log(`[db] schema = ${DB_SCHEMA}${dbName ? ` · database = ${dbName}` : ''}`);

module.exports = pool;
module.exports.DB_SCHEMA = DB_SCHEMA;
module.exports.ensureSchema = ensureSchema;
