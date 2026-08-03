const db = require('./db');
const { verifyToken, bearerFrom } = require('./auth-token');

// ── route prefix → permission key (ตรงกับ frontend lib/permissions.ts) ──────
// ⚠️ ต้องครอบ "ทุก" prefix ที่ mount ใน server.js — prefix ที่ไม่อยู่ในตารางนี้จะถูก "ปฏิเสธ" (default deny)
//    ของเดิม prefix ที่ไม่ได้กำกับจะปล่อยผ่าน ทำให้ /api/report /api/production /api/oba /api/qc ฯลฯ
//    เปิดโล่งให้ทุก role ลบ/เขียนได้ รวมถึง VIEWER
// readPerm = สิทธิ์ที่ "อ่าน" (GET) ก็พอ — เช่นหน้า Dashboard ที่ VIEWER เปิดได้ ต้องดึงข้อมูล PP มาแสดงด้วย
// ถ้าไม่มีตัวนี้ VIEWER จะเห็นหน้า Dashboard เป็นหน้าว่างเพราะ API ตอบ 403
const ROUTE_PERM = [
  { prefix: '/api/pp',            perm: 'production_plan', readPerm: 'dashboard' },
  { prefix: '/api/workflow',      perm: 'production_plan' },
  { prefix: '/api/planning',      perm: 'production_plan', readPerm: 'dashboard' },
  { prefix: '/api/wo',            perm: 'work_orders',     readPerm: 'dashboard' },
  { prefix: '/api/bom',           perm: 'work_orders' },
  { prefix: '/api/report',        perm: 'work_orders' },
  { prefix: '/api/production',    perm: 'work_orders' },
  { prefix: '/api/routing',       perm: 'work_orders' },
  { prefix: '/api/jig',           perm: 'jig_test' },
  { prefix: '/api/jumbo',         perm: 'jig_test' },   // traceability
  { prefix: '/api/mes',           perm: 'dashboard' },  // station monitor
  { prefix: '/api/cr',            perm: 'cr' },
  { prefix: '/api/qc',            perm: 'qc' },
  { prefix: '/api/rework',        perm: 'qc' },
  { prefix: '/api/oba',           perm: 'oba' },
  { prefix: '/api/inventory',     perm: 'incoming' },
  { prefix: '/api/notifications', perm: 'notifications' },
  { prefix: '/api/admin',         perm: 'admin' },
  { prefix: '/api/backup',        perm: 'settings' },   // ปุ่ม Backup อยู่ในหน้า Settings → ใช้ perm เดียวกัน
];

// path ที่เข้าได้โดยไม่ต้องล็อกอิน (มีเท่านี้เท่านั้น)
const PUBLIC_PATHS = [/^\/api\/auth(\/|$)/, /^\/api\/health(\/|$)/];

// ค่าเริ่มต้นตาม role (ตรงกับ ROLE_DEFAULT_PERMS ฝั่ง frontend) — ใช้เมื่อผู้ใช้ยังไม่กำหนดสิทธิ์เอง
// 'settings' = หน้า Settings (มีปุ่ม Backup ดาวน์โหลดข้อมูลทั้งระบบ) — ให้ MEMBER ได้
// (แต่ไฟล์ของ MEMBER จะไม่มีตาราง users — ตัดออกใน routes/backup.js)
// VIEWER ไม่ได้ เพราะดูอย่างเดียวไม่ควรดึงข้อมูลทั้งก้อนออกนอกระบบ
const ROLE_DEFAULTS = {
  ADMIN:  null, // = ทุกหน้า
  // ไม่มี 'scm' แล้ว — โมดูล SCM Cases ถอดออกจากรีโป 2026-07-27 (ดู STATUS.md)
  MEMBER: ['dashboard', 'production_plan', 'incoming', 'work_orders', 'jig_test', 'oba', 'cr', 'qc', 'equipment', 'notifications', 'settings'],
  VIEWER: ['dashboard', 'cr', 'qc', 'jig_test', 'equipment', 'notifications'],
};

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * ด่านเดียวคุมทั้ง API — fail-CLOSED (ตรงข้ามกับของเดิมที่ fail-open ทุกทาง)
 *   ไม่มี token / ปลอม / หมดอายุ            → 401
 *   ผู้ใช้ถูกปิดใช้งาน / ไม่พบใน DB          → 401
 *   route ไม่ได้กำกับ permission             → 403 (default deny)
 *   ล็อกอินแล้วแต่ไม่มีสิทธิ์หน้านั้น        → 403
 *   VIEWER พยายามเขียน (POST/PUT/PATCH/DELETE) → 403
 * role/permissions อ่านจาก DB ทุกครั้ง ไม่เชื่อค่าที่มาใน token
 */
async function authz(req, res, next) {
  const p = req.path;
  if (req.method === 'OPTIONS') return next();
  if (!p.startsWith('/api')) return next();                       // ไฟล์ static ของหน้าเว็บ
  if (PUBLIC_PATHS.some(re => re.test(p))) return next();

  const token = bearerFrom(req);
  if (!token) {
    return res.status(401).json({ status: 'error', message: 'Please sign in first' });
  }
  const payload = verifyToken(token);
  if (!payload || !payload.sub) {
    return res.status(401).json({ status: 'error', message: 'Session expired or invalid token — please sign in again' });
  }

  let u;
  try {
    const { rows } = await db.query(
      'SELECT id, username, full_name, role, is_active, permissions FROM users WHERE id = $1',
      [Number(payload.sub)]
    );
    u = rows[0];
  } catch (e) {
    // DB ล่ม = ยืนยันสิทธิ์ไม่ได้ → ต้องปฏิเสธ ห้ามปล่อยผ่าน
    console.error('[authz] db error:', e.message);
    return res.status(503).json({ status: 'error', message: 'Authorization system unavailable, please try again' });
  }
  if (!u || !u.is_active) {
    return res.status(401).json({ status: 'error', message: 'This account is disabled — please sign in again' });
  }

  const role = String(u.role || '').toUpperCase();
  // ให้ route handler / activityLog ใช้ต่อได้ (actor ที่เชื่อถือได้ ไม่ใช่ค่าที่ client ส่งมา)
  req.user = { id: u.id, username: u.username, fullName: u.full_name, role, permissions: u.permissions };

  const isWrite = !READ_METHODS.has(req.method);
  // VIEWER = ดูอย่างเดียว ห้ามเขียนทุกกรณี (แม้จะมี permission ของหน้านั้น)
  if (role === 'VIEWER' && isWrite) {
    return res.status(403).json({ status: 'error', message: 'Viewer accounts are read-only and cannot make changes' });
  }
  if (role === 'ADMIN') return next();                            // admin (ยืนยันจาก DB แล้ว) ผ่านทุกอย่าง

  const rule = ROUTE_PERM.find(r => p === r.prefix || p.startsWith(r.prefix + '/'));
  if (!rule) {
    console.warn('[authz] denied path with no permission mapping:', req.method, p);
    return res.status(403).json({ status: 'error', message: 'You do not have permission to access this' });
  }
  const perms = Array.isArray(u.permissions) ? u.permissions : [];
  const eff = perms.length ? perms : (ROLE_DEFAULTS[role] || []);
  if (eff.includes(rule.perm)) return next();
  // GET: ยอมรับ readPerm ด้วย (เช่นหน้า Dashboard ของ VIEWER ต้องอ่านข้อมูล PP/WO ได้)
  if (!isWrite && rule.readPerm && eff.includes(rule.readPerm)) return next();
  return res.status(403).json({ status: 'error', message: `You do not have permission to access this (${rule.perm})` });
}

module.exports = authz;
module.exports.ROUTE_PERM = ROUTE_PERM;
