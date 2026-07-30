const router = require('express').Router();
const db     = require('../db');

const INT4_MAX = 2147483647;
// ตรวจจำนวนเต็มก่อนยิงลง DB — คอลัมน์เป็น INTEGER + มี CHECK (qty > 0) ถ้าไม่ดักที่นี่จะกลายเป็น 500 ดิบ
// (เช่น qty=-5 ผ่าน truthy → CHECK violation · qty="1000 pcs" → invalid input syntax · qty=3e9 → out of range)
function intErr(name, v, { min = 0, allowNull = false } = {}) {
  if (v == null || v === '') return allowNull ? null : `${name} required`;
  const n = Number(v);
  if (!Number.isInteger(n)) return `${name} ต้องเป็นจำนวนเต็ม`;
  if (n < min) return `${name} ต้องไม่น้อยกว่า ${min}`;
  if (n > INT4_MAX) return `${name} มีค่ามากเกินไป`;
  return null;
}

// ออกเลข WO ถัดไปของเดือนนี้ — ใช้ MAX(suffix)+1 ไม่ใช่ COUNT (COUNT จะให้เลขซ้ำหลังมีการลบแถว)
// ใช้ NOW() ของ DB เป็นนาฬิกาแหล่งเดียว กัน yymm เพี้ยนข้ามเดือนจากการผสม UTC ของ Node กับ tz ของ DB
async function nextWoNo(runner) {
  const { rows } = await runner.query(
    `SELECT TO_CHAR(NOW(),'YYYYMM') AS yymm,
            COALESCE(MAX(NULLIF(split_part(wo_no,'-',3),'')::int), 0) + 1 AS next
       FROM work_orders
      WHERE wo_no LIKE 'WO-' || TO_CHAR(NOW(),'YYYYMM') || '-%'`
  );
  const { yymm, next } = rows[0];
  return `WO-${yymm}-${String(next).padStart(3, '0')}`;
}

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
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

// ── WO Board (lifecycle: Dashboard / Detail / FAI / Close) ─────────

const LIFECYCLE_STEPS = ['DRAFT','OPEN','READY','RUNNING','WAIT_FAI_QA','WAIT_FAI_MGR','CLOSED'];

const BOARD_FIELDS = `
  id, wo_no, product_name, customer, qty, due_date, current_step, station,
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
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

// POST /api/wo/board (สร้าง WO ใหม่ เช่น ปุ่ม Add Random WO)
router.post('/board', async (req, res) => {
  const { product_name, customer, qty, station, current_step = 'DRAFT', due_date } = req.body;
  if (!product_name || !qty) {
    return res.status(400).json({ status: 'error', message: 'product_name, qty required' });
  }
  if (!LIFECYCLE_STEPS.includes(current_step)) {
    return res.status(400).json({ status: 'error', message: `current_step must be one of ${LIFECYCLE_STEPS.join(', ')}` });
  }
  const qtyErr = intErr('qty', qty, { min: 1 });
  if (qtyErr) return res.status(400).json({ status: 'error', message: qtyErr });
  if (due_date && isNaN(Date.parse(due_date))) {
    return res.status(400).json({ status: 'error', message: 'due_date ไม่ใช่วันที่ที่ถูกต้อง' });
  }
  // retry เมื่อชน UNIQUE(wo_no) — 2 คนกด Create พร้อมกันจะได้เลขเดียวกัน ถ้าไม่ retry คนที่ 2 จะเจอ 500
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const woNo = await nextWoNo(db);
      const { rows } = await db.query(
        `INSERT INTO work_orders (wo_no, product_name, customer, qty, due_date, station, current_step, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING ${BOARD_FIELDS}`,
        [woNo, product_name, customer || null, Number(qty), due_date || null, station || null, current_step, stepToStatus(current_step)]
      );
      return res.status(201).json({ status: 'success', data: rows[0] });
    } catch (e) {
      if (e.code === '23505' && attempt < 5) continue;   // เลขชน → วนขอเลขใหม่
      console.error(e);
      return res.status(500).json({ status: 'error', message: 'Server error, please try again' });
    }
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
  // ตรวจชนิดข้อมูลก่อนเขียน — ไม่ดักที่นี่: qty_good="abc" → 500 · fai_passed="maybe" → boolean cast fail → 500
  for (const k of ['qty_good', 'actual_qty']) {
    if (k in patch) {
      const err = intErr(k, patch[k], { min: 0, allowNull: k === 'actual_qty' });
      if (err) return res.status(400).json({ status: 'error', message: err });
      if (patch[k] != null && patch[k] !== '') patch[k] = Number(patch[k]);
    }
  }
  if ('fai_passed' in patch && typeof patch.fai_passed !== 'boolean') {
    return res.status(400).json({ status: 'error', message: 'fai_passed ต้องเป็น true/false' });
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
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
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
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
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
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

// ── Pre-WO Requests ────────────────────────────────────────────────

// GET /api/wo/req/list
router.get('/req/list', async (req, res) => {
  try {
    const { rows } = await db.query(
      // ตาราง boms ถูกถอดออก (BOM มาจากระบบภายนอก) → ชื่อ BOM derive จาก bom_lines
      // LEFT JOIN: pre-WO ที่ยังไม่มี bom_lines ในระบบก็ยังแสดงได้ (ไม่หายจากรายการ)
      `SELECT r.id AS req_id, r.bom_id,
              COALESCE(l.bom_name, 'BOM #' || r.bom_id) AS bom_name,
              r.qty, r.due_date, r.status, r.wo_id, r.created_at
       FROM pre_wo_requests r
       LEFT JOIN (
         SELECT bom_id, MIN(part_name) AS bom_name FROM bom_lines GROUP BY bom_id
       ) l ON l.bom_id = r.bom_id
       ORDER BY r.created_at DESC`
    );
    res.json({ status: 'success', data: rows });
  } catch (e) {
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

// POST /api/wo/req
router.post('/req', async (req, res) => {
  const { bom_id, qty, due_date } = req.body;
  if (!bom_id || !qty || !due_date) {
    return res.status(400).json({ status: 'error', message: 'bom_id, qty, due_date required' });
  }
  // เดิมเช็คว่า bom_id มีในตาราง boms — ตอนนี้ boms ถูกถอดออก (BOM อยู่ระบบภายนอก)
  // จึงตรวจได้แค่ว่าเป็นจำนวนเต็มที่ใช้ได้ ส่วนความมีอยู่จริงของ BOM ให้ระบบภายนอกเป็นผู้ยืนยัน
  const bomIdErr = intErr('bom_id', bom_id, { min: 1 });
  if (bomIdErr) return res.status(400).json({ status: 'error', message: bomIdErr });
  try {
    const { rows } = await db.query(
      `INSERT INTO pre_wo_requests (bom_id, qty, due_date)
       VALUES ($1, $2, $3)
       RETURNING id AS req_id, bom_id, qty, due_date, status, created_at`,
      [bom_id, qty, due_date]
    );
    res.status(201).json({ status: 'success', data: rows[0] });
  } catch (e) {
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
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
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

// POST /api/wo/convert
router.post('/convert', async (req, res) => {
  const { req_id } = req.body;
  if (!req_id) return res.status(400).json({ status: 'error', message: 'req_id required' });

  let client;
  try {
    client = await db.connect();
    await client.query('BEGIN');

    // ชื่อสินค้าของ WO เดิมเอาจาก boms.name — ตอนนี้ derive จาก bom_lines (ไม่มีก็ใช้ 'BOM #id')
    // FOR UPDATE ต้องระบุ OF r เพราะมี subquery join อยู่ (ล็อกแค่แถว pre_wo_requests)
    const reqRes = await client.query(
      `SELECT r.*, COALESCE(l.bom_name, 'BOM #' || r.bom_id) AS bom_name
         FROM pre_wo_requests r
         LEFT JOIN (
           SELECT bom_id, MIN(part_name) AS bom_name FROM bom_lines GROUP BY bom_id
         ) l ON l.bom_id = r.bom_id
        WHERE r.id=$1 FOR UPDATE OF r`,
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

    // สร้าง WO number (MAX+1 · นาฬิกาเดียวจาก DB — ดู nextWoNo() ด้านบนไฟล์)
    const woNo = await nextWoNo(client);

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
    if (client) { try { await client.query('ROLLBACK'); } catch (e2) { console.error('[rollback failed]', e2?.message); } }
    if (e.code === '23505') return res.status(409).json({ status: 'error', message: 'เลข WO ชนกัน กรุณากดใหม่อีกครั้ง' });
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  } finally {
    if (client) client.release();
  }
});

module.exports = router;
