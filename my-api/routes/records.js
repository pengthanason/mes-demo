const router = require('express').Router();
const db     = require('../db');

// ── OBA (Out-of-Box Audit) ─────────────────────────────────────────

router.get('/oba/list', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, wo_id, lot_no, sample_qty, result, defect_note, created_at
       FROM oba_records ORDER BY created_at DESC`
    );
    res.json({ status: 'success', data: rows });
  } catch (e) {
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

router.post('/oba', async (req, res) => {
  const { wo_id, lot_no, sample_qty, result, defect_note } = req.body;
  if (!wo_id || !lot_no || !sample_qty || !['PASS', 'FAIL'].includes(result)) {
    return res.status(400).json({ status: 'error', message: 'wo_id, lot_no, sample_qty, result(PASS|FAIL) required' });
  }
  if (result === 'FAIL' && !String(defect_note || '').trim()) {
    return res.status(400).json({ status: 'error', message: 'defect_note required when result is FAIL' });
  }
  // DB มี CHECK (sample_qty > 0) + คอลัมน์ INTEGER — ถ้าไม่ดัก: -3 ผ่าน truthy → CHECK violation → 500 ดิบ
  const sq = Number(sample_qty);
  if (!Number.isInteger(sq) || sq <= 0 || sq > 2147483647) {
    return res.status(400).json({ status: 'error', message: 'sample_qty ต้องเป็นจำนวนเต็มมากกว่า 0' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO oba_records (wo_id, lot_no, sample_qty, result, defect_note)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, wo_id, lot_no, sample_qty, result, defect_note, created_at`,
      [wo_id, lot_no, sq, result, defect_note || null]
    );
    res.status(201).json({ status: 'success', data: rows[0] });
  } catch (e) {
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

// ── QC ─────────────────────────────────────────────────────────────

router.get('/qc/list', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, sn, status, error, created_at FROM qc_records ORDER BY created_at DESC`
    );
    res.json({ status: 'success', data: rows });
  } catch (e) {
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

// #51 FE-CONNECT-4: QC history — dev stub (endpoint จริงบน backbone mes_draft#5)
// snapshot "สถานะล่าสุดต่อชิ้น" จาก qc_records (DISTINCT ON sn) map เป็น shape ของ contract
//   GET /api/qc/history?wo_id=<optional>&limit=<default 100, max 500> → { status:'success', results:[...], request_id }
router.get('/qc/history', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const { rows } = await db.query(
      `SELECT sn, status, created_at FROM (
         SELECT DISTINCT ON (sn) sn, status, created_at
           FROM qc_records ORDER BY sn, created_at DESC
       ) t ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    // qc_records ไม่มี wo/part/station → เติมเท่าที่ได้ · FAIL → 'NG' ให้ตรง contract (PASS/NG/REPAIRED)
    const results = rows.map(r => ({
      sn: r.sn,
      wo_id: '', wo_number: '',
      part_no: '',
      status: r.status === 'FAIL' ? 'NG' : r.status,
      current_station: '',
      updated_at: r.created_at,
    }));
    res.json({ status: 'success', results, request_id: `dev-${Date.now()}` });
  } catch (e) {
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

router.post('/qc', async (req, res) => {
  const { sn, status, error, scrapped } = req.body;
  if (!sn || !['PASS', 'FAIL'].includes(status)) {
    return res.status(400).json({ status: 'error', message: 'sn, status(PASS|FAIL) required' });
  }
  // 2 insert ต้องอยู่ transaction เดียว — ถ้าพังขั้นที่ 2 จะมีผล QC แต่ไทม์ไลน์ traceability ของ serial ขาดหาย
  let client;
  try {
    client = await db.connect();
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO qc_records (sn, status, error)
       VALUES ($1,$2,$3)
       RETURNING id, sn, status, error, created_at`,
      [sn, status, error || null]
    );
    const noteText = scrapped ? `QC Scrap (WMS ADJ): ${error || 'scrapped'}` : (error ? `QC fail: ${error}` : 'QC scan');
    await client.query(
      `INSERT INTO production_scans (wo_id, serial, station, result, operator, note)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      ['QC', sn, scrapped ? 'SCRAPPED' : 'QC', status, '', noteText]
    );
    await client.query('COMMIT');
    res.status(201).json({ status: 'success', data: { ...rows[0], scrapped: Boolean(scrapped) } });
  } catch (e) {
    if (client) { try { await client.query('ROLLBACK'); } catch (e2) { console.error('[rollback failed]', e2?.message); } }
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  } finally {
    if (client) client.release();
  }
});

// ── QC Result (FE-10: qty-based, linked to WO) ──────────────────────

router.get('/qc/results', async (req, res) => {
  try {
    const { wo_id } = req.query;
    const { rows } = await db.query(
      `SELECT qr.id, qr.wo_id, qr.lot_no, qr.qty_checked, qr.qty_pass, qr.qty_fail,
              qr.overall, qr.defect_desc, qr.remark, qr.created_at,
              tv.id AS verify_id, tv.verdict, tv.verified_by, tv.created_at AS verified_at
       FROM qc_results qr
       LEFT JOIN transfer_verifications tv ON tv.qc_result_id = qr.id
       ${wo_id ? 'WHERE qr.wo_id = $1' : ''}
       ORDER BY qr.created_at DESC`,
      wo_id ? [wo_id] : []
    );
    res.json({ status: 'success', data: rows });
  } catch (e) {
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

router.post('/qc/result', async (req, res) => {
  const { wo_id, lot_no, qty_checked, qty_pass, qty_fail, overall, defect_desc, remark } = req.body;
  if (!wo_id || !lot_no || !qty_checked || !['PASS','FAIL','PARTIAL'].includes(overall)) {
    return res.status(400).json({ status: 'error', message: 'wo_id, lot_no, qty_checked, overall(PASS|FAIL|PARTIAL) required' });
  }
  if ((overall === 'FAIL' || overall === 'PARTIAL') && !String(defect_desc || '').trim()) {
    return res.status(400).json({ status: 'error', message: 'defect_desc required when overall is FAIL or PARTIAL' });
  }
  // ── ตรวจความสอดคล้องของจำนวน ให้ตรงกับ DB CHECK (qty_pass+qty_fail = qty_checked, ทั้งคู่ >= 0) ──
  // prod (database_schema.sql) มี CHECK พวกนี้ → ถ้าไม่ดักที่นี่ จะเป็น 500 (constraint violation) บน prod
  // ดักแล้วตอบ 400 ที่สื่อความหมาย + กันข้อมูลจำนวนเพี้ยนตั้งแต่ก่อนบันทึก (dev/prod พฤติกรรมตรงกัน)
  const checkedN = Number(qty_checked), passN = Number(qty_pass) || 0, failN = Number(qty_fail) || 0;
  if (!Number.isInteger(checkedN) || checkedN <= 0) {
    return res.status(400).json({ status: 'error', message: 'qty_checked ต้องเป็นจำนวนเต็มมากกว่า 0' });
  }
  // เพดาน int4 — ถ้าไม่ดัก 2147483648 จะผ่าน Number.isInteger แล้วไป 500 'integer out of range' ที่ DB
  if (checkedN > 2147483647 || passN > 2147483647 || failN > 2147483647) {
    return res.status(400).json({ status: 'error', message: 'จำนวนมีค่ามากเกินไป' });
  }
  if (passN < 0 || failN < 0) {
    return res.status(400).json({ status: 'error', message: 'qty_pass / qty_fail ต้องไม่ติดลบ' });
  }
  if (passN + failN !== checkedN) {
    return res.status(400).json({ status: 'error', message: `จำนวนไม่สอดคล้อง: qty_pass (${passN}) + qty_fail (${failN}) ต้องเท่ากับ qty_checked (${checkedN})` });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO qc_results (wo_id, lot_no, qty_checked, qty_pass, qty_fail, overall, defect_desc, remark)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, wo_id, lot_no, qty_checked, qty_pass, qty_fail, overall, defect_desc, remark, created_at`,
      [wo_id, lot_no, checkedN, passN, failN, overall, defect_desc || null, remark || null]
    );
    res.status(201).json({ status: 'success', data: rows[0] });
  } catch (e) {
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

// ── Transfer Verify (QA sign-off before delivery) ──────────────────

router.get('/qc/transfer-verify/:qcResultId', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT tv.*, qr.wo_id, qr.lot_no, qr.qty_checked, qr.qty_pass, qr.qty_fail, qr.overall, qr.defect_desc, qr.created_at AS qc_created_at
       FROM transfer_verifications tv
       JOIN qc_results qr ON qr.id = tv.qc_result_id
       WHERE tv.qc_result_id = $1
       ORDER BY tv.created_at DESC LIMIT 1`,
      [req.params.qcResultId]
    );
    if (!rows.length) return res.status(404).json({ status: 'error', message: 'ยังไม่มี transfer verify สำหรับ QC result นี้' });
    res.json({ status: 'success', data: rows[0] });
  } catch (e) {
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

router.post('/qc/transfer-verify', async (req, res) => {
  const { qc_result_id, verdict, note, verified_by } = req.body;
  if (!qc_result_id || !['APPROVED','REJECTED'].includes(verdict)) {
    return res.status(400).json({ status: 'error', message: 'qc_result_id, verdict(APPROVED|REJECTED) required' });
  }
  try {
    // ตรวจว่า qc_result มีอยู่จริง
    const check = await db.query('SELECT id, wo_id FROM qc_results WHERE id=$1', [qc_result_id]);
    if (!check.rows.length) return res.status(404).json({ status: 'error', message: 'ไม่พบ QC result' });
    const wo_id = check.rows[0].wo_id;
    const { rows } = await db.query(
      `INSERT INTO transfer_verifications (qc_result_id, wo_id, verdict, note, verified_by)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, qc_result_id, wo_id, verdict, note, verified_by, created_at`,
      [qc_result_id, wo_id, verdict, note || null, verified_by || '']
    );
    res.status(201).json({ status: 'success', data: rows[0] });
  } catch (e) {
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

// ── Routing History ────────────────────────────────────────────────

router.get('/routing/list', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, wo_id, serial, sequence, result, total_sec, created_at
       FROM routing_records ORDER BY created_at DESC`
    );
    res.json({ status: 'success', data: rows });
  } catch (e) {
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

router.post('/routing', async (req, res) => {
  const { serial, sequence, result, total_sec, wo_id } = req.body;
  if (!serial || !sequence || !result) {
    return res.status(400).json({ status: 'error', message: 'serial, sequence, result required' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO routing_records (serial, sequence, result, total_sec, wo_id)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, wo_id, serial, sequence, result, total_sec, created_at`,
      [serial, sequence, result, Number(total_sec) || 0, wo_id || '']
    );
    res.status(201).json({ status: 'success', data: rows[0] });
  } catch (e) {
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

router.delete('/routing/:id', async (req, res) => {
  try {
    const { rowCount } = await db.query('DELETE FROM routing_records WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ status: 'error', message: 'record not found' });
    res.json({ status: 'success' });
  } catch (e) {
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

module.exports = router;
