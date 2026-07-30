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
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
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
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

router.get('/projects/:code/records', async (req, res) => {
  const { result } = req.query;
  // clamp limit — ?limit=abc → NaN → 500 · ?limit=-1 → 500 · ?limit=9999999 → ดึงหมดตาราง
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  try {
    const conds = ['project_code=$1'];
    const vals  = [req.params.code];
    if (result) { vals.push(result); conds.push(`result=$${vals.length}`); }
    const { rows } = await db.query(
      `SELECT id, project_code, serial, result, tested_at, voltage, current_ma, temp_c, fail_param, notes
       FROM jig_test_records WHERE ${conds.join(' AND ')}
       ORDER BY tested_at DESC LIMIT $${vals.length + 1}`,
      [...vals, limit]
    );
    res.json({ status: 'success', data: rows });
  } catch (e) {
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
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
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
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
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

// ── สร้างโปรเจกต์ Jig (กรอกมือ) ──
router.post('/projects', async (req, res) => {
  const { project_code, name, jig_id, test_type } = req.body;
  if (!project_code || !name) {
    return res.status(400).json({ status: 'error', message: 'project_code, name required' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO jig_projects (project_code, name, jig_id, test_type)
       VALUES ($1,$2,$3,$4)
       RETURNING id, project_code, name, jig_id, is_active, test_type`,
      [project_code.trim(), name.trim(), (jig_id || '').trim(), test_type === 'FCT' ? 'FCT' : 'ICT']
    );
    res.status(201).json({ status: 'success', data: rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ status: 'error', message: 'project_code นี้มีอยู่แล้ว' });
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

// ── บันทึกผลทดสอบ Jig (กรอกมือ) ──
router.post('/projects/:code/records', async (req, res) => {
  const { serial, result, voltage, current_ma, temp_c, fail_param, notes } = req.body;
  if (!serial || !['PASS', 'FAIL'].includes(result)) {
    return res.status(400).json({ status: 'error', message: 'serial, result(PASS|FAIL) required' });
  }
  // ⚠️ ต้องดัก NaN เอง: Number("3.3V") = NaN แล้ว pg ส่งเป็นสตริง 'NaN' ซึ่ง PostgreSQL numeric "รับ" เป็นค่าที่ถูกต้อง
  //    → ข้อมูลเสียถูกบันทึกเงียบๆ และทำให้ AVG()/MIN()/MAX() ของทั้งโปรเจกต์กลายเป็น NaN จากแถวเดียว
  //    range ต้องตรง precision ของคอลัมน์ ไม่งั้น numeric field overflow → 500
  const NUMS = { voltage: [voltage, 9999.999], current_ma: [current_ma, 99999.999], temp_c: [temp_c, 999.99] };
  const vals3 = {};
  for (const [name, [raw, max]] of Object.entries(NUMS)) {
    if (raw === '' || raw == null) { vals3[name] = null; continue; }
    const n = Number(raw);
    if (!Number.isFinite(n)) return res.status(400).json({ status: 'error', message: `${name} ต้องเป็นตัวเลข` });
    if (Math.abs(n) > max) return res.status(400).json({ status: 'error', message: `${name} ต้องอยู่ในช่วง -${max} ถึง ${max}` });
    vals3[name] = n;
  }
  let client;
  try {
    client = await db.connect();
    await client.query('BEGIN');
    const proj = await client.query('SELECT 1 FROM jig_projects WHERE project_code=$1', [req.params.code]);
    if (!proj.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ status: 'error', message: 'ไม่พบโปรเจกต์' });
    }
    const { rows } = await client.query(
      `INSERT INTO jig_test_records (project_code, serial, result, voltage, current_ma, temp_c, fail_param, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, project_code, serial, result, tested_at, voltage, current_ma, temp_c, fail_param, notes`,
      [req.params.code, serial.trim(), result,
       vals3.voltage, vals3.current_ma, vals3.temp_c,
       (fail_param || '') || null, (notes || '') || null]
    );
    // ป้อนเข้า traceability: ผลทดสอบ Jig = 1 จุดในไทม์ไลน์ของ serial (ต้องอยู่ transaction เดียวกัน
    // ไม่งั้นถ้าพังขั้นนี้ จะมีผลทดสอบแต่ไทม์ไลน์ traceability ขาดหาย)
    await client.query(
      `INSERT INTO production_scans (wo_id, serial, station, result, operator, note)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [req.params.code, serial.trim(), `JIG ${req.params.code}`, result, '', fail_param ? `Jig fail: ${fail_param}` : 'Jig test']
    );
    await client.query('COMMIT');
    res.status(201).json({ status: 'success', data: rows[0] });
  } catch (e) {
    if (client) { try { await client.query('ROLLBACK'); } catch (e2) { console.error('[rollback failed]', e2?.message); } }
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  } finally {
    if (client) client.release();
  }
});

// ── Retest: ถอดออกจากระบบแล้ว (ตาราง jig_retest_requests ถูกลบ) ──
//    ปุ่ม "Request Retest" ฝั่งหน้าเว็บถูกถอดตามไปด้วย
//    ถ้าจะเอาฟีเจอร์นี้กลับ ต้องสร้างตารางใหม่ + คืน endpoint ทั้ง 2 ตัว (GET retests / POST retest)

// ── ลบโปรเจกต์ Jig (ลบผลทดสอบของมันด้วย) ──
router.delete('/projects/:code', async (req, res) => {
  // ต้องเป็น transaction — ของเดิมยิง 3 query แยกกัน ถ้าพังหลังขั้นที่ 2
  // ผลทดสอบทั้งโปรเจกต์จะหายถาวรแต่ตัวโปรเจกต์ยังอยู่ กู้คืนไม่ได้
  let client;
  try {
    client = await db.connect();
    await client.query('BEGIN');
    await client.query('DELETE FROM jig_test_records WHERE project_code=$1', [req.params.code]);
    const { rowCount } = await client.query('DELETE FROM jig_projects WHERE project_code=$1', [req.params.code]);
    if (!rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ status: 'error', message: 'project not found' });
    }
    await client.query('COMMIT');
    res.json({ status: 'success' });
  } catch (e) {
    if (client) { try { await client.query('ROLLBACK'); } catch (e2) { console.error('[rollback failed]', e2?.message); } }
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  } finally {
    if (client) client.release();
  }
});

module.exports = router;
