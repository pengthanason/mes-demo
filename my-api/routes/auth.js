const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db     = require('../db');
const { signToken, verifyToken, bearerFrom, TTL } = require('../auth-token');

// hash หลอกสำหรับเทียบเมื่อไม่พบ username — ให้เวลาตอบสนองใกล้เคียงกรณีรหัสผิด
// (ของเดิม short-circuit ทำให้ "ไม่มี username นี้" ตอบเร็วกว่าชัดเจน → เดาได้ว่ามีใครอยู่ในระบบ)
const DUMMY_HASH = '$2b$10$CwTycUXWue0Thq9StjUM0uJ8DvW4rF4y8Wc7lFVQ7hVfJZ7hJ0V9e';

// POST /api/auth/login — ตรวจ username/password กับ DB (รหัสเข้ารหัส bcrypt)
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ status: 'error', message: 'username และ password จำเป็น' });
  }
  try {
    const { rows } = await db.query(
      'SELECT id, username, full_name, role, is_active, password_hash, permissions FROM app_users WHERE username=$1',
      [String(username).trim()]
    );
    const u = rows[0];
    // ใช้ compare (async) ไม่ใช่ compareSync — sync บล็อก event loop ทั้งเซิร์ฟเวอร์ ยิงถล่ม login = DoS ง่าย
    // และเทียบเสมอแม้ไม่พบ user เพื่อไม่ให้ timing บอกได้ว่า username มีจริงไหม
    const ok = await bcrypt.compare(String(password), (u && u.password_hash) || DUMMY_HASH);
    if (!u || !ok) {
      return res.status(401).json({ status: 'error', message: 'username หรือ password ไม่ถูกต้อง' });
    }
    if (!u.is_active) {
      return res.status(403).json({ status: 'error', message: 'บัญชีนี้ถูกปิดใช้งาน' });
    }
    // log การเข้าระบบ
    await db.query(
      `INSERT INTO audit_logs (actor, action, target_type, target_id, detail) VALUES ($1,'LOGIN',NULL,NULL,'เข้าสู่ระบบสำเร็จ')`,
      [u.username]
    ).catch(() => {});
    // ออก token ให้ client แนบใน header Authorization: Bearer ทุก request ที่ไม่ใช่ login
    // JWT ลงลายเซ็น + มีวันหมดอายุ · เก็บแค่ id ไม่เก็บ role (role อ่านจาก DB ทุก request ใน authz.js)
    const token = signToken(u);
    const permissions = Array.isArray(u.permissions) ? u.permissions : [];
    res.json({ status: 'success', data: { id: u.id, username: u.username, fullName: u.full_name, role: u.role, permissions, token, expiresIn: TTL } });
  } catch (e) {
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

// GET /api/auth/me — ให้ frontend ตรวจสิทธิ์จริงกับ server ได้ (ไม่เชื่อ role ที่เก็บใน localStorage)
// public path จึงต้องตรวจ token เองที่นี่
router.get('/me', async (req, res) => {
  const token = bearerFrom(req);
  const payload = token ? verifyToken(token) : null;
  if (!payload || !payload.sub) {
    return res.status(401).json({ status: 'error', message: 'ต้องเข้าสู่ระบบก่อน' });
  }
  try {
    const { rows } = await db.query(
      'SELECT id, username, full_name, role, is_active, permissions FROM app_users WHERE id=$1',
      [Number(payload.sub)]
    );
    const u = rows[0];
    if (!u || !u.is_active) return res.status(401).json({ status: 'error', message: 'บัญชีนี้ใช้งานไม่ได้' });
    res.json({
      status: 'success',
      data: { id: u.id, username: u.username, fullName: u.full_name, role: u.role,
              permissions: Array.isArray(u.permissions) ? u.permissions : [] },
    });
  } catch (e) {
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

module.exports = router;
