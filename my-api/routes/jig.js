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

module.exports = router;
