const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const path      = require('path');
const fs        = require('fs');
const migrate   = require('./migrations');

const app     = express();
const PORT    = process.env.PORT || 5099;
const IS_PROD = process.env.NODE_ENV === 'production';

// หลัง nginx/reverse proxy req.ip จะเป็น IP ของ proxy เดียวกันทุก request (ไม่ใช่ IP ผู้ใช้จริง)
// → rate limiter (login 10 ครั้ง/15 นาที) กลายเป็นโควตารวมของทั้งออฟฟิศ ใครพิมพ์รหัสผิดคนอื่นล็อกอินไม่ได้
// ตั้ง 1 (เชื่อ proxy ชั้นแรกสุดเท่านั้น) — ห้ามใช้ true (เชื่อทุกชั้น ปลอมค่า X-Forwarded-For ได้)
app.set('trust proxy', 1);

// กันแอปตายจาก error ที่ไม่ได้ catch (เช่น DB หลุดชั่วคราว) — log แล้วไปต่อ ไม่ crash
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err?.message || err));
process.on('uncaughtException',  (err) => console.error('[uncaughtException]',  err?.message || err));

// ── Security headers ───────────────────────────────────────────────
// CSP ปิดไว้เพราะหน้าเว็บ (SPA) โหลดฟอนต์จาก Google Fonts + ใช้ inline style เยอะ
// ถ้าจะเปิด CSP ต้อง self-host ฟอนต์ก่อน ไม่งั้นหน้าเว็บพัง
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

// ── CORS ───────────────────────────────────────────────────────────
// ของเดิม cors() = Access-Control-Allow-Origin: * → เว็บภายนอกเรียก API ได้หมด
// deploy แบบ single-service (เสิร์ฟหน้าเว็บจาก ./public) เป็น same-origin จึงไม่ต้องตั้ง CORS_ORIGINS เลย
const CORS_ORIGINS = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
if (CORS_ORIGINS.length) {
  app.use(cors({ origin: CORS_ORIGINS, credentials: true }));
} else if (!IS_PROD) {
  app.use(cors());          // dev บนเครื่องตัวเอง (Vite :5101 ยิงมา :5099) — สะดวกไว้ก่อน
} else {
  console.log('[cors] ไม่ได้ตั้ง CORS_ORIGINS → รับเฉพาะ same-origin (ปลอดภัยสุด)');
}

app.use(express.json({ limit: '8mb' }));   // เผื่อรูปสินค้า (data URL) — default 100kb เล็กไป

// ── Rate limit ─────────────────────────────────────────────────────
// ตั้งค่าได้ทาง env — ตั้ง 0 = ปิดตัวนั้น (ใช้ตอน UAT ที่ผู้ทดสอบหลายคนออกจาก IP เดียวกัน
// แล้วโดนล็อกทั้งกลุ่ม) · ค่า default ยังเป็นค่าที่ปลอดภัยเหมือนเดิม
//
// ⚠️ อย่าปล่อยปิดไว้ตอนขึ้นใช้จริง — เปิดกลับด้วยการลบ 2 env นี้ออก (หรือตั้งค่า > 0)
//    ยิ่งตอนนี้ยังไม่ได้ตั้ง trust proxy ทำให้ทุกคนหลัง nginx นับเป็น IP เดียว
//    limiter จึงเป็นดาบสองคม: กัน brute force ได้ แต่คนเดียวก็ล็อกคนทั้งบริษัทได้เหมือนกัน
const LOGIN_RATE_MAX = Number(process.env.LOGIN_RATE_LIMIT_MAX ?? 10);
const API_RATE_MAX = Number(process.env.API_RATE_LIMIT_MAX ?? 600);

// login: กัน brute force รหัสผ่าน (ของเดิมยิงได้ไม่จำกัด)
if (LOGIN_RATE_MAX > 0) {
  app.use('/api/auth/login', rateLimit({
    windowMs: 15 * 60 * 1000, max: LOGIN_RATE_MAX,
    standardHeaders: true, legacyHeaders: false,
    message: { status: 'error', message: 'พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอ 15 นาที' },
  }));
} else {
  console.warn('[rate-limit] ⚠️ ปิด limiter ของ /api/auth/login (LOGIN_RATE_LIMIT_MAX=0) — เปิดกลับก่อนขึ้นใช้จริง');
}

// ทั้ง API: กันยิงถล่มทำ DoS (ปกติผู้ใช้จริงไม่ถึง)
if (API_RATE_MAX > 0) {
  app.use('/api', rateLimit({
    windowMs: 60 * 1000, max: API_RATE_MAX,
    standardHeaders: true, legacyHeaders: false,
    message: { status: 'error', message: 'มีการเรียกใช้บ่อยเกินไป กรุณารอสักครู่' },
  }));
} else {
  console.warn('[rate-limit] ⚠️ ปิด limiter ของ /api ทั้งหมด (API_RATE_LIMIT_MAX=0) — เปิดกลับก่อนขึ้นใช้จริง');
}

// ── Health ─────────────────────────────────────────────────────────
// liveness: แอปยังรันอยู่ไหม (ไม่แตะ DB — ใช้ให้ LB ไม่ restart ตอน DB สะดุด)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', service: 'my-api' });
});
// readiness: พร้อมรับ traffic จริงไหม — ต้องต่อ DB ได้ ถ้าไม่ได้ตอบ 503
// (ของเดิมมีแค่ /api/health ที่ตอบ ok ตายตัว → DB ล่มแต่ LB เห็นเขียว ผู้ใช้เจอ error ทั้งเว็บ)
app.get('/api/health/ready', async (req, res) => {
  try {
    await require('./db').query('SELECT 1');
    res.json({ status: 'ok', db: 'reachable' });
  } catch (e) {
    res.status(503).json({ status: 'error', db: 'unreachable', message: e.message });
  }
});

// ── ยืนยันตัวตน + บังคับสิทธิ์ (fail-closed) ──
// ไม่มี token/ปลอม/หมดอายุ = 401 · route ที่ไม่ได้กำกับ permission = 403 · VIEWER เขียนไม่ได้
// role อ่านจาก DB ทุก request (ไม่เชื่อค่าใน token) — ดูรายละเอียดใน authz.js
app.use(require('./authz'));
// ── บันทึกทุกการกระทำ (create/update/delete) ลง Activity อัตโนมัติ ──
app.use(require('./activityLog'));

// ── Routes ─────────────────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/bom',           require('./routes/bom'));
app.use('/api/wo',            require('./routes/wo'));
app.use('/api/report',        require('./routes/report'));
app.use('/api/cr',            require('./routes/cr'));
app.use('/api/rework',        require('./routes/rework'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/admin',         require('./routes/admin'));
app.use('/api/backup',        require('./routes/backup'));
app.use('/api/jumbo',         require('./routes/trace'));
app.use('/api/routing',       require('./routes/routing'));
app.use('/api/mes',           require('./routes/mes'));
app.use('/api/planning',      require('./routes/planning'));
app.use('/api/jig',           require('./routes/jig'));
app.use('/api/inventory',     require('./routes/inventory'));
app.use('/api/production',     require('./routes/production'));
app.use('/api/pp',             require('./routes/productionPlan'));
app.use('/api/workflow',       require('./routes/workflow'));
app.use('/api',               require('./routes/records'));

// ── Static frontend (single-service deploy: เสิร์ฟหน้าเว็บจาก /public) ─
// ตอน build ด้วย Dockerfile รวม จะก๊อป frontend/dist มาไว้ที่ ./public
const PUBLIC_DIR = path.join(__dirname, 'public');
if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR));
  // SPA fallback: ทุก GET ที่ไม่ใช่ /api → ส่ง index.html (รองรับ HashRouter)
  app.get(/.*/, (req, res, next) => {
    // เทียบด้วย path ที่ normalize แล้ว — กฎเดียวกับ authz.js
    // (Express routing ไม่สนตัวพิมพ์ ถ้าเทียบ path ดิบ /API/... จะหลุดมาที่ SPA fallback แทนที่จะไป API)
    if (req.path.toLowerCase().startsWith('/api')) return next();
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });
}

// ── 404 ────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ status: 'error', message: `No route: ${req.method} ${req.path}` });
});

// ── Error handler (ต้องอยู่ท้ายสุด และต้องมี 4 อาร์กิวเมนต์ Express จึงจะรู้ว่าเป็น error middleware) ──
// จำเป็นเพราะ: (1) Express 4 ไม่ forward async rejection ให้เอง → ถ้า throw หลุด try request จะ "ค้าง" ไม่มี response
//              (2) default handler ของ Express แนบ stack trace ลง response เมื่อ NODE_ENV ไม่ใช่ production → ข้อมูลภายในรั่ว
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', req.method, req.path, '-', err?.message || err);
  if (res.headersSent) return;
  const isBadJson = err?.type === 'entity.parse.failed';
  const tooLarge  = err?.type === 'entity.too.large';
  if (isBadJson) return res.status(400).json({ status: 'error', message: 'Invalid JSON format' });
  if (tooLarge)  return res.status(413).json({ status: 'error', message: 'The submitted data is too large' });
  res.status(500).json({ status: 'error', message: 'Server error, please try again' });
});

// ── Start ──────────────────────────────────────────────────────────
// listen ก่อนเลย เพื่อให้ Render เจอ port ทันที (ไม่ flap เป็น no-server)
// แล้วค่อยรัน migrate เบื้องหลัง + retry ถ้า DB ยังไม่ตื่น (Neon auto-suspend)
async function runMigrateWithRetry(tries = 5, delayMs = 4000) {
  for (let i = 1; i <= tries; i++) {
    try {
      await migrate();
      console.log('[start] migrations done');
      return;
    } catch (e) {
      console.error(`[migrate] attempt ${i}/${tries} failed:`, e.message);
      if (i < tries) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  console.error('[migrate] ยอมแพ้ — เซิร์ฟเวอร์ยังรันอยู่ จะ migrate ใหม่รอบ deploy หน้า');
}

app.listen(PORT, () => {
  console.log(`\n  my-api running at http://localhost:${PORT}`);
  console.log(`  Health: http://localhost:${PORT}/api/health\n`);
  runMigrateWithRetry();
});
