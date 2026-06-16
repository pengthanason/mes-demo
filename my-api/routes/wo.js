const router = require('express').Router();
const db     = require('../db');

// ── Work Orders ────────────────────────────────────────────────────

// GET /api/wo/list
router.get('/list', async (req, res) => {
  try {
    const { status } = req.query;
    let q = `SELECT id AS wo_id, wo_no, product_name, qty, status, due_date, created_at
             FROM work_orders`;
    const params = [];
    if (status) { q += ` WHERE status=$1`; params.push(status); }
    q += ` ORDER BY created_at DESC`;
    const { rows } = await db.query(q, params);
    res.json({ status: 'success', data: rows });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// ── WO Board (lifecycle: Dashboard / Detail / FAI / Close) ─────────

const LIFECYCLE_STEPS = ['DRAFT','OPEN','READY','RUNNING','WAIT_FAI_QA','WAIT_FAI_MGR','CLOSED'];

const BOARD_FIELDS = `
  id, wo_no, product_name, customer, qty, current_step, station,
  qty_good, actual_qty, fai_inspector, fai_approver, fai_passed,
  created_at, updated_at`;

// status (มุมมอง PM ใน FE-8) sync ตาม current_step
function stepToStatus(step) {
  if (step === 'CLOSED') return 'DONE';
  if (['RUNNING', 'WAIT_FAI_QA', 'WAIT_FAI_MGR'].includes(step)) return 'IN_PROGRESS';
  return 'PENDING';
}

// GET /api/wo/board
router.get('/board', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT ${BOARD_FIELDS} FROM work_orders ORDER BY created_at DESC`
    );
    res.json({ status: 'success', data: rows });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// POST /api/wo/board (สร้าง WO ใหม่ เช่น ปุ่ม Add Random WO)
router.post('/board', async (req, res) => {
  const { product_name, customer, qty, station, current_step = 'DRAFT' } = req.body;
  if (!product_name || !qty) {
    return res.status(400).json({ status: 'error', message: 'product_name, qty required' });
  }
  if (!LIFECYCLE_STEPS.includes(current_step)) {
    return res.status(400).json({ status: 'error', message: `current_step must be one of ${LIFECYCLE_STEPS.join(', ')}` });
  }
  try {
    const yymm = new Date().toISOString().slice(0, 7).replace('-', '');
    const { rows: seqRows } = await db.query(
      `SELECT COUNT(*)+1 AS next FROM work_orders WHERE wo_no LIKE 'WO-' || $1 || '-%'`,
      [yymm]
    );
    const woNo = `WO-${yymm}-${String(seqRows[0].next).padStart(3, '0')}`;
    const { rows } = await db.query(
      `INSERT INTO work_orders (wo_no, product_name, customer, qty, station, current_step, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING ${BOARD_FIELDS}`,
      [woNo, product_name, customer || null, qty, station || null, current_step, stepToStatus(current_step)]
    );
    res.status(201).json({ status: 'success', data: rows[0] });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// PATCH /api/wo/board/:woNo (advance step / FAI / close — partial update)
router.patch('/board/:woNo', async (req, res) => {
  const allowed = ['current_step', 'qty_good', 'actual_qty', 'fai_inspector', 'fai_approver', 'fai_passed'];
  const patch = {};
  for (const key of allowed) {
    if (key in req.body) patch[key] = req.body[key];
  }
  if (!Object.keys(patch).length) {
    return res.status(400).json({ status: 'error', message: 'no updatable fields' });
  }
  if (patch.current_step && !LIFECYCLE_STEPS.includes(patch.current_step)) {
    return res.status(400).json({ status: 'error', message: `current_step must be one of ${LIFECYCLE_STEPS.join(', ')}` });
  }
  if (patch.current_step) patch.status = stepToStatus(patch.current_step);

  const keys = Object.keys(patch);
  const sets = keys.map((k, i) => `${k}=$${i + 1}`).join(', ');
  try {
    const { rows } = await db.query(
      `UPDATE work_orders SET ${sets}, updated_at=NOW()
       WHERE wo_no=$${keys.length + 1}
       RETURNING ${BOARD_FIELDS}`,
      [...keys.map(k => patch[k]), req.params.woNo]
    );
    if (!rows.length) return res.status(404).json({ status: 'error', message: 'WO not found' });
    res.json({ status: 'success', data: rows[0] });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// GET /api/wo/:woNo/lots — lot ที่เคยใช้กับ WO นี้ (จาก qc_results + oba_records)
router.get('/:woNo/lots', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT DISTINCT lot_no FROM (
         SELECT lot_no FROM kitting_issues WHERE wo_id=$1
         UNION SELECT lot_no FROM qc_results  WHERE wo_id=$1
         UNION SELECT lot_no FROM oba_records WHERE wo_id=$1
       ) t WHERE COALESCE(lot_no,'') <> '' ORDER BY lot_no`,
      [req.params.woNo]
    );
    res.json({ status: 'success', data: rows.map(r => r.lot_no) });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// GET /api/wo/:woId
router.get('/:woId', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id AS wo_id, wo_no, product_name, qty, status, due_date, created_at
       FROM work_orders WHERE id=$1`,
      [req.params.woId]
    );
    if (!rows.length) return res.status(404).json({ status: 'error', message: 'WO not found' });
    res.json({ status: 'success', data: rows[0] });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// ── Pre-WO Requests ────────────────────────────────────────────────

// GET /api/wo/req/list
router.get('/req/list', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT r.id AS req_id, r.bom_id, b.name AS bom_name,
              r.qty, r.due_date, r.status, r.wo_id, r.created_at
       FROM pre_wo_requests r
       JOIN boms b ON b.id = r.bom_id
       ORDER BY r.created_at DESC`
    );
    res.json({ status: 'success', data: rows });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// POST /api/wo/req
router.post('/req', async (req, res) => {
  const { bom_id, qty, due_date } = req.body;
  if (!bom_id || !qty || !due_date) {
    return res.status(400).json({ status: 'error', message: 'bom_id, qty, due_date required' });
  }
  try {
    const bom = await db.query('SELECT id FROM boms WHERE id=$1', [bom_id]);
    if (!bom.rows.length) return res.status(404).json({ status: 'error', message: 'BOM not found' });

    const { rows } = await db.query(
      `INSERT INTO pre_wo_requests (bom_id, qty, due_date)
       VALUES ($1, $2, $3)
       RETURNING id AS req_id, bom_id, qty, due_date, status, created_at`,
      [bom_id, qty, due_date]
    );
    res.status(201).json({ status: 'success', data: rows[0] });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// PATCH /api/wo/req/:reqId/approve
router.patch('/req/:reqId/approve', async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE pre_wo_requests SET status='APPROVED', updated_at=NOW()
       WHERE id=$1 AND status='PENDING'
       RETURNING id AS req_id, status`,
      [req.params.reqId]
    );
    if (!rows.length) return res.status(409).json({ status: 'error', message: 'ไม่พบ request หรือ status ไม่ใช่ PENDING' });
    res.json({ status: 'success', data: rows[0] });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// POST /api/wo/convert
router.post('/convert', async (req, res) => {
  const { req_id } = req.body;
  if (!req_id) return res.status(400).json({ status: 'error', message: 'req_id required' });

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const reqRes = await client.query(
      `SELECT r.*, b.name AS bom_name FROM pre_wo_requests r
       JOIN boms b ON b.id=r.bom_id
       WHERE r.id=$1 FOR UPDATE`,
      [req_id]
    );
    if (!reqRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ status: 'error', message: 'Pre-WO not found' });
    }
    const preWo = reqRes.rows[0];
    if (preWo.status !== 'APPROVED') {
      await client.query('ROLLBACK');
      return res.status(409).json({ status: 'error', message: 'Pre-WO ต้อง APPROVED ก่อน convert' });
    }

    // สร้าง WO number
    const { rows: seqRows } = await client.query(
      `SELECT COUNT(*)+1 AS next FROM work_orders
       WHERE wo_no LIKE 'WO-' || TO_CHAR(NOW(),'YYYYMM') || '-%'`
    );
    const seq = String(seqRows[0].next).padStart(3, '0');
    const yymm = new Date().toISOString().slice(0, 7).replace('-', '');
    const woNo = `WO-${yymm}-${seq}`;

    const woRes = await client.query(
      `INSERT INTO work_orders (wo_no, product_name, qty, status, due_date)
       VALUES ($1, $2, $3, 'PENDING', $4)
       RETURNING id AS wo_id, wo_no, product_name, qty, status, due_date, created_at`,
      [woNo, preWo.bom_name, preWo.qty, preWo.due_date]
    );
    const newWo = woRes.rows[0];

    await client.query(
      `UPDATE pre_wo_requests SET status='CONVERTED', wo_id=$1, updated_at=NOW() WHERE id=$2`,
      [newWo.wo_id, req_id]
    );

    await client.query('COMMIT');
    res.json({ status: 'success', data: newWo });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ status: 'error', message: e.message });
  } finally {
    client.release();
  }
});

module.exports = router;
