const db = require('./db');

// route prefix → permission key (ตรงกับ frontend lib/permissions.ts)
const ROUTE_PERM = [
  { prefix: '/api/pp',            perm: 'production_plan' },
  { prefix: '/api/workflow',      perm: 'production_plan' },
  { prefix: '/api/wo',            perm: 'work_orders' },
  { prefix: '/api/bom',           perm: 'work_orders' },
  { prefix: '/api/jig',           perm: 'jig_test' },
  { prefix: '/api/cr',            perm: 'cr' },
  { prefix: '/api/scm',           perm: 'scm' },
  { prefix: '/api/rework',        perm: 'qc' },
  { prefix: '/api/inventory',     perm: 'incoming' },
  { prefix: '/api/notifications', perm: 'notifications' },
  { prefix: '/api/admin',         perm: 'admin' },
];

// ค่าเริ่มต้นตาม role (ตรงกับ ROLE_DEFAULT_PERMS ฝั่ง frontend) — ใช้เมื่อผู้ใช้ยังไม่กำหนดสิทธิ์เอง
const ROLE_DEFAULTS = {
  ADMIN:  null, // = ทุกหน้า
  MEMBER: ['dashboard', 'production_plan', 'incoming', 'work_orders', 'jig_test', 'oba', 'cr', 'scm', 'qc', 'equipment', 'notifications'],
  VIEWER: ['dashboard', 'cr', 'qc', 'jig_test', 'equipment', 'notifications'],
};

// บังคับสิทธิ์รายหน้า — ออกแบบให้ "ไม่มีทางล็อกตัวเอง":
//   ไม่มี token / ถอดไม่ได้ / ไม่พบ user / DB error / route ไม่ได้กำกับ → ปล่อยผ่าน (คงพฤติกรรมเดิม)
//   ADMIN → ผ่านทุกอย่าง · ผู้ใช้ล็อกอินแล้วแต่ไม่มีสิทธิ์หน้านั้น → 403
async function authz(req, res, next) {
  try {
    if (req.method === 'OPTIONS') return next();
    const p = req.path;
    if (!p.startsWith('/api') || p.startsWith('/api/auth') || p === '/api/health') return next();
    const rule = ROUTE_PERM.find(r => p === r.prefix || p.startsWith(r.prefix + '/'));
    if (!rule) return next();                                  // route ไม่ได้กำกับ → ผ่าน
    const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
    if (!m) return next();                                     // ไม่มี token → ผ่าน (กันของเดิมพัง)
    let username = '', role = '';
    try { [username, role] = Buffer.from(m[1], 'base64').toString('utf8').split(':'); } catch { return next(); }
    if (String(role).toUpperCase() === 'ADMIN') return next(); // admin ผ่านหมด (แม้ DB ยังไม่ตอบ)
    const { rows } = await db.query('SELECT role, permissions FROM app_users WHERE username=$1', [username]);
    const u = rows[0];
    if (!u) return next();                                     // ไม่พบ user → ผ่าน
    if (String(u.role).toUpperCase() === 'ADMIN') return next();
    const perms = Array.isArray(u.permissions) ? u.permissions : [];
    const eff = perms.length ? perms : (ROLE_DEFAULTS[String(u.role).toUpperCase()] || []);
    if (eff.includes(rule.perm)) return next();
    return res.status(403).json({ status: 'error', message: `ไม่มีสิทธิ์เข้าถึงส่วนนี้ (${rule.perm})` });
  } catch {
    return next();                                             // error ใดๆ → ผ่าน (ไม่ล็อกเอาต์)
  }
}

module.exports = authz;
