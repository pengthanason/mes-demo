const router = require('express').Router();
const db     = require('../db');

router.get('/projects', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT p.*,
        COUNT(r.id)::int AS total,
        SUM(CASE WHEN r.result='PASS' THEN 1 ELSE 0 END)::int AS pass_count,
        SUM(CASE WHEN r.result='FAIL' THEN 1 ELSE 0 END)::int AS fail_count,
        ROUND(SUM(CASE WHEN r.result='PASS' THEN 1 ELSE 0 END)::numeric /
              NULLIF(COUNT(r.id),0) * 100, 1) AS pass_rate
       FROM jig_projects p
       LEFT JOIN jig_test_records r ON r.project_code = p.project_code
       GROUP BY p.id ORDER BY p.project_code`
    );
    res.json({ status: 'success', data: rows });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

router.get('/projects/:code', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT p.*,
        COUNT(r.id)::int AS total,
        SUM(CASE WHEN r.result='PASS' THEN 1 ELSE 0 END)::int AS pass_count,
        SUM(CASE WHEN r.result='FAIL' THEN 1 ELSE 0 END)::int AS fail_count,
        ROUND(SUM(CASE WHEN r.result='PASS' THEN 1 ELSE 0 END)::numeric /
              NULLIF(COUNT(r.id),0) * 100, 1) AS pass_rate
       FROM jig_projects p
       LEFT JOIN jig_test_records r ON r.project_code = p.project_code
       WHERE p.project_code=$1
       GROUP BY p.id`,
      [req.params.code]
    );
    if (!rows.length) return res.status(404).json({ status: 'error', message: 'project not found' });
    res.json({ status: 'success', data: rows[0] });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

router.get('/projects/:code/records', async (req, res) => {
  const { result, limit = 100 } = req.query;
  try {
    const conds = ['project_code=$1'];
    const vals  = [req.params.code];
    if (result) { vals.push(result); conds.push(`result=$${vals.length}`); }
    const { rows } = await db.query(
      `SELECT id, project_code, serial, result, tested_at, voltage, current_ma, temp_c, fail_param, notes
       FROM jig_test_records WHERE ${conds.join(' AND ')}
       ORDER BY tested_at DESC LIMIT $${vals.length + 1}`,
      [...vals, Number(limit)]
    );
    res.json({ status: 'success', data: rows });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

router.get('/projects/:code/summary', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT
        COUNT(*)::int AS total,
        SUM(CASE WHEN result='PASS' THEN 1 ELSE 0 END)::int AS pass_count,
        SUM(CASE WHEN result='FAIL' THEN 1 ELSE 0 END)::int AS fail_count,
        ROUND(SUM(CASE WHEN result='PASS' THEN 1 ELSE 0 END)::numeric /
              NULLIF(COUNT(*),0) * 100, 1) AS pass_rate
       FROM jig_test_records WHERE project_code=$1`,
      [req.params.code]
    );
    res.json({ status: 'success', data: rows[0] });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

router.get('/projects/:code/timeseries', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT
        DATE(tested_at) AS date,
        COUNT(*)::int AS total,
        SUM(CASE WHEN result='PASS' THEN 1 ELSE 0 END)::int AS pass_count,
        SUM(CASE WHEN result='FAIL' THEN 1 ELSE 0 END)::int AS fail_count,
        ROUND(SUM(CASE WHEN result='PASS' THEN 1 ELSE 0 END)::numeric /
              NULLIF(COUNT(*),0) * 100, 1) AS pass_rate
       FROM jig_test_records
       WHERE project_code=$1 AND tested_at >= NOW() - INTERVAL '30 days'
       GROUP BY DATE(tested_at) ORDER BY date`,
      [req.params.code]
    );
    res.json({ status: 'success', data: rows });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// ── สร้างโปรเจกต์ Jig (กรอกมือ) ──
router.post('/projects', async (req, res) => {
  const { project_code, name, jig_id } = req.body;
  if (!project_code || !name) {
    return res.status(400).json({ status: 'error', message: 'project_code, name required' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO jig_projects (project_code, name, jig_id)
       VALUES ($1,$2,$3)
       RETURNING id, project_code, name, jig_id, is_active`,
      [project_code.trim(), name.trim(), (jig_id || '').trim()]
    );
    res.status(201).json({ status: 'success', data: rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ status: 'error', message: 'project_code นี้มีอยู่แล้ว' });
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// ── บันทึกผลทดสอบ Jig (กรอกมือ) ──
router.post('/projects/:code/records', async (req, res) => {
  const { serial, result, voltage, current_ma, temp_c, fail_param, notes } = req.body;
  if (!serial || !['PASS', 'FAIL'].includes(result)) {
    return res.status(400).json({ status: 'error', message: 'serial, result(PASS|FAIL) required' });
  }
  try {
    const proj = await db.query('SELECT 1 FROM jig_projects WHERE project_code=$1', [req.params.code]);
    if (!proj.rows.length) return res.status(404).json({ status: 'error', message: 'ไม่พบโปรเจกต์' });
    const { rows } = await db.query(
      `INSERT INTO jig_test_records (project_code, serial, result, voltage, current_ma, temp_c, fail_param, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, project_code, serial, result, tested_at, voltage, current_ma, temp_c, fail_param, notes`,
      [req.params.code, serial.trim(), result,
       voltage === '' || voltage == null ? null : Number(voltage),
       current_ma === '' || current_ma == null ? null : Number(current_ma),
       temp_c === '' || temp_c == null ? null : Number(temp_c),
       (fail_param || '') || null, (notes || '') || null]
    );
    // ป้อนเข้า traceability: ผลทดสอบ Jig = 1 จุดในไทม์ไลน์ของ serial
    await db.query(
      `INSERT INTO production_scans (wo_id, serial, station, result, operator, note)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [req.params.code, serial.trim(), `JIG ${req.params.code}`, result, '', fail_param ? `Jig fail: ${fail_param}` : 'Jig test']
    );
    res.status(201).json({ status: 'success', data: rows[0] });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// ── Retest (สั่งทดสอบซ้ำชิ้นที่ FAIL) ──
router.get('/projects/:code/retests', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, project_code, serial, status, requested_by, requested_at
       FROM jig_retest_requests WHERE project_code=$1
       ORDER BY requested_at DESC`,
      [req.params.code]
    );
    res.json({ status: 'success', data: rows });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// ── ลบโปรเจกต์ Jig (ลบผลทดสอบ + retest ของมันด้วย) ──
router.delete('/projects/:code', async (req, res) => {
  try {
    await db.query('DELETE FROM jig_retest_requests WHERE project_code=$1', [req.params.code]);
    await db.query('DELETE FROM jig_test_records WHERE project_code=$1', [req.params.code]);
    const { rowCount } = await db.query('DELETE FROM jig_projects WHERE project_code=$1', [req.params.code]);
    if (!rowCount) return res.status(404).json({ status: 'error', message: 'project not found' });
    res.json({ status: 'success' });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

router.post('/projects/:code/retest', async (req, res) => {
  const { serial, requested_by } = req.body;
  if (!serial) return res.status(400).json({ status: 'error', message: 'serial required' });
  try {
    const { rows } = await db.query(
      `INSERT INTO jig_retest_requests (project_code, serial, requested_by)
       VALUES ($1,$2,$3)
       RETURNING id, project_code, serial, status, requested_by, requested_at`,
      [req.params.code, serial, requested_by || '']
    );
    res.status(201).json({ status: 'success', data: rows[0] });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

module.exports = router;
