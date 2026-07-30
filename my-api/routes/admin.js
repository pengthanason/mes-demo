const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db     = require('../db');

// ── Users ──────────────────────────────────────────────────────────

router.get('/users', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, username, full_name, role, is_active, permissions, created_at FROM app_users ORDER BY created_at DESC'
    );
    res.json({ status: 'success', data: rows });
  } catch (e) {
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

router.post('/users', async (req, res) => {
  const { username, full_name, role, password, permissions } = req.body;
  if (!username || !full_name || !['ADMIN','MEMBER','VIEWER'].includes(role)) {
    return res.status(400).json({ status: 'error', message: 'username, full_name, role(ADMIN|MEMBER|VIEWER) required' });
  }
  if (!password || String(password).length < 8) {
    return res.status(400).json({ status: 'error', message: 'password ต้องยาวอย่างน้อย 8 ตัวอักษร' });
  }
  const perms = Array.isArray(permissions) ? permissions.filter(p => typeof p === 'string') : [];
  try {
    const hash = bcrypt.hashSync(String(password), 10);
    const { rows } = await db.query(
      `INSERT INTO app_users (username, full_name, role, password_hash, permissions)
       VALUES ($1,$2,$3,$4,$5::jsonb)
       RETURNING id, username, full_name, role, is_active, permissions, created_at`,
      [username.trim(), full_name.trim(), role, hash, JSON.stringify(perms)]
    );
    // actor = คนที่กดจริง (จาก req.user ที่ verify แล้ว) — ของเดิม hardcode 'admin' ทำให้สืบไม่ได้ว่าใครสร้าง
    await db.query(
      `INSERT INTO audit_logs (actor, action, target_type, target_id, detail) VALUES ($3,'CREATE_USER','user',$1,$2)`,
      [String(rows[0].id), `สร้างผู้ใช้: ${username}`, (req.user && req.user.username) || 'system']
    );
    res.status(201).json({ status: 'success', data: rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ status: 'error', message: 'username นี้มีอยู่แล้ว' });
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

router.put('/users/:id', async (req, res) => {
  const { full_name, role, is_active, password, permissions } = req.body;
  // validate เหมือน POST — ของเดิม PUT ไม่เช็กเลย: role='SUPERADMIN' → CHECK violation → 500,
  // is_active='no' → boolean cast fail → 500, full_name='' → ผ่าน NOT NULL ได้ user ชื่อว่าง
  if (role !== undefined && !['ADMIN', 'MEMBER', 'VIEWER'].includes(role)) {
    return res.status(400).json({ status: 'error', message: 'role ต้องเป็น ADMIN | MEMBER | VIEWER' });
  }
  if (is_active !== undefined && typeof is_active !== 'boolean') {
    return res.status(400).json({ status: 'error', message: 'is_active ต้องเป็น true/false' });
  }
  if (full_name !== undefined) {
    const fn = String(full_name).trim();
    if (!fn)             return res.status(400).json({ status: 'error', message: 'full_name ห้ามว่าง' });
    if (fn.length > 200) return res.status(400).json({ status: 'error', message: 'full_name ยาวเกิน 200 ตัวอักษร' });
  }
  try {
    const sets = [];
    const vals = [];
    if (full_name !== undefined)  { vals.push(String(full_name).trim()); sets.push(`full_name=$${vals.length}`); }
    if (role !== undefined)        { vals.push(role);        sets.push(`role=$${vals.length}`); }
    if (is_active !== undefined)   { vals.push(is_active);   sets.push(`is_active=$${vals.length}`); }
    if (Array.isArray(permissions)) { vals.push(JSON.stringify(permissions.filter(p => typeof p === 'string'))); sets.push(`permissions=$${vals.length}::jsonb`); }
    if (password) {
      if (String(password).length < 8) return res.status(400).json({ status: 'error', message: 'password ต้องยาวอย่างน้อย 8 ตัวอักษร' });
      vals.push(bcrypt.hashSync(String(password), 10)); sets.push(`password_hash=$${vals.length}`);
    }
    if (!sets.length) return res.status(400).json({ status: 'error', message: 'nothing to update' });
    sets.push(`updated_at=NOW()`);
    vals.push(req.params.id);
    const { rows, rowCount } = await db.query(
      `UPDATE app_users SET ${sets.join(', ')} WHERE id=$${vals.length} RETURNING id, username, full_name, role, is_active, permissions`,
      vals
    );
    if (!rowCount) return res.status(404).json({ status: 'error', message: 'user not found' });
    res.json({ status: 'success', data: rows[0] });
  } catch (e) {
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    const { rows, rowCount } = await db.query(
      'DELETE FROM app_users WHERE id=$1 RETURNING username', [req.params.id]
    );
    if (!rowCount) return res.status(404).json({ status: 'error', message: 'user not found' });
    await db.query(
      `INSERT INTO audit_logs (actor, action, target_type, target_id, detail) VALUES ($3,'DELETE_USER','user',$1,$2)`,
      [req.params.id, `ลบผู้ใช้: ${rows[0].username}`, (req.user && req.user.username) || 'system']
    );
    res.json({ status: 'success' });
  } catch (e) {
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

// ── Audit Log ──────────────────────────────────────────────────────

router.get('/audit-log', async (req, res) => {
  const { actor, action } = req.query;
  const conds = [];
  const vals  = [];
  // ค้นด้วยชื่อผู้ใช้ → เจอทั้งตอนที่เขาเป็นผู้ทำ (actor) และตอนถูกอ้างถึง (detail เช่น "สร้างผู้ใช้: somchai")
  if (actor)  { vals.push(`%${actor}%`);  conds.push(`(actor ILIKE $${vals.length} OR detail ILIKE $${vals.length})`); }
  if (action) { vals.push(`%${action}%`); conds.push(`action ILIKE $${vals.length}`); }
  try {
    const { rows } = await db.query(
      `SELECT id, actor, action, target_type, target_id, detail, created_at
       FROM audit_logs ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''}
       ORDER BY created_at DESC LIMIT 200`,
      vals
    );
    res.json({ status: 'success', data: rows });
  } catch (e) {
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

module.exports = router;
