const express = require('express');
const router = express.Router();
const { query } = require('../../db'); // อ้างอิงไปยัง db.js หลักของโปรเจกต์

// Middleware ตรวจสอบ Role (อนุญาตเฉพาะ PM และ ADMIN)
function requireAdminOrPM(req, res, next) {
  // รองรับทั้งระบบ JWT (req.user) และ Header Fallback (X-User-Role) ตามที่ระบุใน README
  const role = req.user?.role || req.headers['x-user-role'];
  
  if (role === 'PM' || role === 'ADMIN') {
    return next();
  }
  
  return res.status(403).json({ 
    status: 'error', 
    code: 'FORBIDDEN', 
    message: 'Access denied. PM or ADMIN role required.' 
  });
}

// apply middleware กับทุกเส้นในนี้
router.use(requireAdminOrPM);

/**
 * GET /api/admin/sync-log
 * Query params: direction, status, wo_id, from, to, limit, page
 */
router.get('/sync-log', async (req, res) => {
  try {
    const { direction, status, wo_id, from, to, limit = 50, page = 1 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const conditions = [];
    const params = [];
    let pIdx = 1;

    // ใส่ Filters ตามเงื่อนไขที่มีการส่งมา
    if (direction) {
      conditions.push(`direction = $${pIdx++}`);
      params.push(direction);
    }
    if (status) {
      conditions.push(`status = $${pIdx++}`);
      params.push(status);
    }
    if (wo_id) {
      conditions.push(`wo_id = $${pIdx++}`);
      params.push(wo_id);
    }
    if (from) {
      conditions.push(`created_at >= $${pIdx++}`);
      params.push(from);
    }
    if (to) {
      conditions.push(`created_at <= $${pIdx++}`);
      params.push(to);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const countResult = await query(`SELECT COUNT(*) as total FROM mes_core.mes_sync_log ${whereClause}`, params);
    const total = parseInt(countResult.rows[0]?.total || 0, 10);

    const dataResult = await query(
      `SELECT * FROM mes_core.mes_sync_log ${whereClause} ORDER BY created_at DESC LIMIT $${pIdx++} OFFSET $${pIdx++}`,
      [...params, parseInt(limit), offset]
    );

    return res.json({ data: dataResult.rows, total });
  } catch (error) {
    console.error('Error fetching sync log:', error);
    return res.status(500).json({ error: 'Internal Server Error', detail: error.message });
  }
});

/**
 * GET /api/admin/jig-results
 * Query params: test_type, result_status, wo_id, unit_sn, from, to, limit, page
 */
router.get('/jig-results', async (req, res) => {
  try {
    const { test_type, result_status, wo_id, unit_sn, from, to, limit = 50, page = 1 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const conditions = [];
    const params = [];
    let pIdx = 1;

    if (test_type) {
      conditions.push(`test_type = $${pIdx++}`);
      params.push(test_type);
    }
    if (result_status) {
      conditions.push(`result_status = $${pIdx++}`);
      params.push(result_status);
    }
    if (wo_id) {
      conditions.push(`wo_id = $${pIdx++}`);
      params.push(wo_id);
    }
    if (unit_sn) {
      conditions.push(`unit_sn ILIKE $${pIdx++}`);
      params.push(`%${unit_sn}%`);
    }
    if (from) {
      conditions.push(`tested_at >= $${pIdx++}`);
      params.push(from);
    }
    if (to) {
      conditions.push(`tested_at <= $${pIdx++}`);
      params.push(to);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const countResult = await query(`SELECT COUNT(*) as total FROM mes_core.jig_test_results ${whereClause}`, params);
    const total = parseInt(countResult.rows[0]?.total || 0, 10);

    const dataResult = await query(
      `SELECT * FROM mes_core.jig_test_results ${whereClause} ORDER BY tested_at DESC LIMIT $${pIdx++} OFFSET $${pIdx++}`,
      [...params, parseInt(limit), offset]
    );

    return res.json({ data: dataResult.rows, total });
  } catch (error) {
    console.error('Error fetching jig results:', error);
    return res.status(500).json({ error: 'Internal Server Error', detail: error.message });
  }
});

module.exports = router;