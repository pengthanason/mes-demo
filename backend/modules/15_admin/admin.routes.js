const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { query } = require('../../db');

function requireAdminOrPM(req, res, next) {
  // SECURITY 2026-07-24 (Claudy): removed x-user-role header fallback — in jwt auth mode an
  // unauthenticated request could forge X-User-Role:ADMIN and gain full user-admin CRUD.
  // Trust ONLY the authenticated req.user set by attachAuthContext.
  const role = String(req.user?.role || '').toUpperCase();
  if (role === 'PM' || role === 'ADMIN') {
    return next();
  }
  return res.status(403).json({ 
    status: 'error', 
    code: 'FORBIDDEN', 
    message: 'Access denied. PM or ADMIN role required.' 
  });
}

const VALID_ROLES = new Set(['ADMIN', 'PM', 'STORE', 'QA', 'PD', 'TECH', 'QC']);

router.get('/api/admin/users', requireAdminOrPM, async (req, res) => {
  try {
    const { role, search, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const conditions = [];
    const params = [];
    let pIdx = 1;

    if (role && VALID_ROLES.has(role.toUpperCase())) {
      conditions.push(`role = $${pIdx++}::mes_core.user_role`);
      params.push(role.toUpperCase());
    }
    if (search) {
      conditions.push(`username ILIKE $${pIdx++}`);
      params.push(`%${search.trim()}%`);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const countResult = await query(`SELECT COUNT(*) as total FROM mes_core.users ${whereClause}`, params);
    const total = parseInt(countResult.rows[0]?.total || 0, 10);

    const dataResult = await query(
      `SELECT id, username, role, created_at, updated_at FROM mes_core.users ${whereClause} ORDER BY id ASC LIMIT $${pIdx++} OFFSET $${pIdx++}`,
      [...params, parseInt(limit, 10), offset]
    );

    return res.json({ status: 'success', data: dataResult.rows, total });
  } catch (error) {
    console.error('Error fetching users:', error);
    return res.status(500).json({ status: 'error', code: 'SERVER_ERROR', detail: error.message });
  }
});

router.post('/api/admin/users', requireAdminOrPM, async (req, res) => {
  try {
    const { username, password, role } = req.body || {};
    const uName = String(username || '').trim().toLowerCase();
    const uRole = String(role || '').trim().toUpperCase();
    const uPass = String(password || '');

    if (!uName || uName.length < 3) {
      return res.status(400).json({ status: 'error', code: 'INVALID_INPUT', message: 'Username must be at least 3 characters long' });
    }
    if (!uPass || uPass.length < 6) {
      return res.status(400).json({ status: 'error', code: 'INVALID_INPUT', message: 'Password must be at least 6 characters long' });
    }
    if (!VALID_ROLES.has(uRole)) {
      return res.status(400).json({ status: 'error', code: 'INVALID_ROLE', message: `Role must be one of: ${Array.from(VALID_ROLES).join(', ')}` });
    }

    const passHash = await bcrypt.hash(uPass, 10);
    const result = await query(
      `INSERT INTO mes_core.users (username, password_hash, role) VALUES ($1, $2, $3::mes_core.user_role) RETURNING id, username, role, created_at`,
      [uName, passHash, uRole]
    );

    return res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ status: 'error', code: 'DUPLICATE_USERNAME', message: 'Username is already taken' });
    }
    console.error('Error creating user:', error);
    return res.status(500).json({ status: 'error', code: 'SERVER_ERROR', detail: error.message });
  }
});

router.put('/api/admin/users/:id', requireAdminOrPM, async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (!userId || userId <= 0) {
      return res.status(400).json({ status: 'error', code: 'INVALID_ID', message: 'Invalid user ID' });
    }

    const { role, username } = req.body || {};
    const updates = [];
    const params = [];
    let pIdx = 1;

    if (role) {
      const uRole = String(role).trim().toUpperCase();
      if (!VALID_ROLES.has(uRole)) {
        return res.status(400).json({ status: 'error', code: 'INVALID_ROLE', message: `Invalid role: ${role}` });
      }
      updates.push(`role = $${pIdx++}::mes_core.user_role`);
      params.push(uRole);
    }
    if (username) {
      const uName = String(username).trim().toLowerCase();
      if (uName.length < 3) {
        return res.status(400).json({ status: 'error', code: 'INVALID_INPUT', message: 'Username too short' });
      }
      updates.push(`username = $${pIdx++}`);
      params.push(uName);
    }

    if (updates.length === 0) {
      return res.status(400).json({ status: 'error', code: 'NO_UPDATES', message: 'No fields to update' });
    }

    params.push(userId);
    const result = await query(
      `UPDATE mes_core.users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${pIdx} RETURNING id, username, role, updated_at`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', code: 'NOT_FOUND', message: 'User not found' });
    }

    return res.json({ status: 'success', data: result.rows[0] });
  } catch (error) {
    console.error('Error updating user:', error);
    return res.status(500).json({ status: 'error', code: 'SERVER_ERROR', detail: error.message });
  }
});

router.post('/api/admin/users/:id/reset-password', requireAdminOrPM, async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const { password } = req.body || {};
    const uPass = String(password || '');

    if (!userId || userId <= 0) {
      return res.status(400).json({ status: 'error', code: 'INVALID_ID', message: 'Invalid user ID' });
    }
    if (!uPass || uPass.length < 6) {
      return res.status(400).json({ status: 'error', code: 'INVALID_INPUT', message: 'Password must be at least 6 characters long' });
    }

    const passHash = await bcrypt.hash(uPass, 10);
    const result = await query(
      `UPDATE mes_core.users SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING id, username, role`,
      [passHash, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', code: 'NOT_FOUND', message: 'User not found' });
    }

    return res.json({ status: 'success', message: 'Password reset successfully', data: result.rows[0] });
  } catch (error) {
    console.error('Error resetting password:', error);
    return res.status(500).json({ status: 'error', code: 'SERVER_ERROR', detail: error.message });
  }
});

router.delete('/api/admin/users/:id', requireAdminOrPM, async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (!userId || userId <= 0) {
      return res.status(400).json({ status: 'error', code: 'INVALID_ID', message: 'Invalid user ID' });
    }

    const checkUser = await query(`SELECT username FROM mes_core.users WHERE id = $1`, [userId]);
    if (!checkUser.rows.length) {
      return res.status(404).json({ status: 'error', code: 'NOT_FOUND', message: 'User not found' });
    }

    if (checkUser.rows[0].username === 'admin' || checkUser.rows[0].username === 'admin_web') {
      return res.status(403).json({ status: 'error', code: 'FORBIDDEN', message: 'Cannot delete primary admin account' });
    }

    await query(`DELETE FROM mes_core.users WHERE id = $1`, [userId]);
    return res.json({ status: 'success', message: `User ${userId} deleted successfully` });
  } catch (error) {
    console.error('Error deleting user:', error);
    return res.status(500).json({ status: 'error', code: 'SERVER_ERROR', detail: error.message });
  }
});

module.exports = router;
