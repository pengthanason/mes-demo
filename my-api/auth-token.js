// ออก/ตรวจ token — JWT ลงลายเซ็น (แทน base64 เปล่าแบบเดิมที่ปลอมได้ใน 1 บรรทัด)
//
// หลักการสำคัญ 2 ข้อ:
//   1) token เก็บแค่ `sub` (id ของผู้ใช้) — ไม่เก็บ role
//      เพราะ role ที่มาจาก client เชื่อไม่ได้ ต้องอ่านจาก DB ทุก request (ดู authz.js)
//   2) มี exp (หมดอายุ) — ของเดิมไม่มีวันหมดอายุ ขโมยไปแล้วใช้ได้ตลอดชีพ
const jwt = require('jsonwebtoken');

const IS_PROD = process.env.NODE_ENV === 'production';
const TTL     = process.env.JWT_TTL || '8h';

// prod ต้องตั้ง JWT_SECRET เอง — ห้าม fallback เป็นค่าที่รู้กันทั้ง repo (ไม่งั้นปลอม token ได้เหมือนเดิม)
const SECRET = process.env.JWT_SECRET || (IS_PROD ? null : 'dev-only-insecure-secret-do-not-use-in-prod');
if (!SECRET) {
  throw new Error('[auth] ต้องตั้ง JWT_SECRET เมื่อ NODE_ENV=production (สุ่มด้วย: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))")');
}
if (!IS_PROD && !process.env.JWT_SECRET) {
  console.warn('[auth] ⚠️ ใช้ JWT_SECRET สำหรับ dev เท่านั้น — ตั้ง env JWT_SECRET ก่อนขึ้น prod');
}

function signToken(user) {
  return jwt.sign({ sub: String(user.id) }, SECRET, { expiresIn: TTL });
}

// คืน payload ถ้า token ถูกต้อง · คืน null ถ้าไม่มี/ปลอม/หมดอายุ
function verifyToken(token) {
  try { return jwt.verify(token, SECRET); } catch { return null; }
}

function bearerFrom(req) {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
  return m ? m[1].trim() : null;
}

module.exports = { signToken, verifyToken, bearerFrom, TTL };
