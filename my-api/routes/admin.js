const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db     = require('../db');

// ── Users ──────────────────────────────────────────────────────────

router.get('/users', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, username, full_name, role, is_active, created_at FROM app_users ORDER BY created_at DESC'
    );
    res.json({ status: 'success', data: rows });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

router.post('/users', async (req, res) => {
  const { username, full_name, role, password } = req.body;
  if (!username || !full_name || !['ADMIN','MEMBER','VIEWER'].includes(role)) {
    return res.status(400).json({ status: 'error', message: 'username, full_name, role(ADMIN|MEMBER|VIEWER) required' });
  }
  if (!password || String(password).length < 4) {
    return res.status(400).json({ status: 'error', message: 'password ต้องยาวอย่างน้อย 4 ตัวอักษร' });
  }
  try {
    const hash = bcrypt.hashSync(String(password), 10);
    const { rows } = await db.query(
      `INSERT INTO app_users (username, full_name, role, password_hash)
       VALUES ($1,$2,$3,$4)
       RETURNING id, username, full_name, role, is_active, created_at`,
      [username.trim(), full_name.trim(), role, hash]
    );
    await db.query(
      `INSERT INTO audit_logs (actor, action, target_type, target_id, detail) VALUES ('admin','CREATE_USER','user',$1,$2)`,
      [String(rows[0].id), `สร้างผู้ใช้: ${username}`]
    );
    res.status(201).json({ status: 'success', data: rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ status: 'error', message: 'username นี้มีอยู่แล้ว' });
    res.status(500).json({ status: 'error', message: e.message });
  }
});

router.put('/users/:id', async (req, res) => {
  const { full_name, role, is_active, password } = req.body;
  try {
    const sets = [];
    const vals = [];
    if (full_name !== undefined)  { vals.push(full_name);  sets.push(`full_name=$${vals.length}`); }
    if (role !== undefined)        { vals.push(role);        sets.push(`role=$${vals.length}`); }
    if (is_active !== undefined)   { vals.push(is_active);   sets.push(`is_active=$${vals.length}`); }
    if (password) {
      if (String(password).length < 4) return res.status(400).json({ status: 'error', message: 'password ต้องยาวอย่างน้อย 4 ตัวอักษร' });
      vals.push(bcrypt.hashSync(String(password), 10)); sets.push(`password_hash=$${vals.length}`);
    }
    if (!sets.length) return res.status(400).json({ status: 'error', message: 'nothing to update' });
    sets.push(`updated_at=NOW()`);
    vals.push(req.params.id);
    const { rows, rowCount } = await db.query(
      `UPDATE app_users SET ${sets.join(', ')} WHERE id=$${vals.length} RETURNING id, username, full_name, role, is_active`,
      vals
    );
    if (!rowCount) return res.status(404).json({ status: 'error', message: 'user not found' });
    res.json({ status: 'success', data: rows[0] });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    const { rows, rowCount } = await db.query(
      'DELETE FROM app_users WHERE id=$1 RETURNING username', [req.params.id]
    );
    if (!rowCount) return res.status(404).json({ status: 'error', message: 'user not found' });
    await db.query(
      `INSERT INTO audit_logs (actor, action, target_type, target_id, detail) VALUES ('admin','DELETE_USER','user',$1,$2)`,
      [req.params.id, `ลบผู้ใช้: ${rows[0].username}`]
    );
    res.json({ status: 'success' });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// ── Audit Log ──────────────────────────────────────────────────────

router.get('/audit-log', async (req, res) => {
  const { actor, action } = req.query;
  const conds = [];
  const vals  = [];
  if (actor)  { vals.push(`%${actor}%`);  conds.push(`actor ILIKE $${vals.length}`); }
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
    res.status(500).json({ status: 'error', message: e.message });
  }
});

module.exports = router;
