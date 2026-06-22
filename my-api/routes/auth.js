const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db     = require('../db');

// POST /api/auth/login — ตรวจ username/password กับ DB (รหัสเข้ารหัส bcrypt)
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ status: 'error', message: 'username และ password จำเป็น' });
  }
  try {
    const { rows } = await db.query(
      'SELECT id, username, full_name, role, is_active, password_hash FROM app_users WHERE username=$1',
      [String(username).trim()]
    );
    const u = rows[0];
    if (!u || !bcrypt.compareSync(password, u.password_hash || '')) {
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
    const token = Buffer.from(`${u.username}:${u.role}:${Date.now()}`).toString('base64');
    res.json({ status: 'success', data: { id: u.id, username: u.username, fullName: u.full_name, role: u.role, token } });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

module.exports = router;
