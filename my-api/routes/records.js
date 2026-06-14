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
    res.status(500).json({ status: 'error', message: e.message });
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
  try {
    const { rows } = await db.query(
      `INSERT INTO oba_records (wo_id, lot_no, sample_qty, result, defect_note)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, wo_id, lot_no, sample_qty, result, defect_note, created_at`,
      [wo_id, lot_no, sample_qty, result, defect_note || null]
    );
    res.status(201).json({ status: 'success', data: rows[0] });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
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
    res.status(500).json({ status: 'error', message: e.message });
  }
});

router.post('/qc', async (req, res) => {
  const { sn, status, error } = req.body;
  if (!sn || !['PASS', 'FAIL'].includes(status)) {
    return res.status(400).json({ status: 'error', message: 'sn, status(PASS|FAIL) required' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO qc_records (sn, status, error)
       VALUES ($1,$2,$3)
       RETURNING id, sn, status, error, created_at`,
      [sn, status, error || null]
    );
    res.status(201).json({ status: 'success', data: rows[0] });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// ── QC Result (FE-10: qty-based, linked to WO) ──────────────────────

router.get('/qc/results', async (req, res) => {
  try {
    const { wo_id } = req.query;
    const { rows } = await db.query(
      `SELECT qr.id, qr.wo_id, qr.lot_no, qr.qty_checked, qr.qty_pass, qr.qty_fail,
              qr.overall, qr.defect_desc, qr.created_at,
              tv.id AS verify_id, tv.verdict, tv.verified_by, tv.created_at AS verified_at
       FROM qc_results qr
       LEFT JOIN transfer_verifications tv ON tv.qc_result_id = qr.id
       ${wo_id ? 'WHERE qr.wo_id = $1' : ''}
       ORDER BY qr.created_at DESC`,
      wo_id ? [wo_id] : []
    );
    res.json({ status: 'success', data: rows });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

router.post('/qc/result', async (req, res) => {
  const { wo_id, lot_no, qty_checked, qty_pass, qty_fail, overall, defect_desc } = req.body;
  if (!wo_id || !lot_no || !qty_checked || !['PASS','FAIL','PARTIAL'].includes(overall)) {
    return res.status(400).json({ status: 'error', message: 'wo_id, lot_no, qty_checked, overall(PASS|FAIL|PARTIAL) required' });
  }
  if ((overall === 'FAIL' || overall === 'PARTIAL') && !String(defect_desc || '').trim()) {
    return res.status(400).json({ status: 'error', message: 'defect_desc required when overall is FAIL or PARTIAL' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO qc_results (wo_id, lot_no, qty_checked, qty_pass, qty_fail, overall, defect_desc)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, wo_id, lot_no, qty_checked, qty_pass, qty_fail, overall, defect_desc, created_at`,
      [wo_id, lot_no, Number(qty_checked), Number(qty_pass) || 0, Number(qty_fail) || 0, overall, defect_desc || null]
    );
    res.status(201).json({ status: 'success', data: rows[0] });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
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
    res.status(500).json({ status: 'error', message: e.message });
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
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// ── Routing History ────────────────────────────────────────────────

router.get('/routing/list', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, serial, sequence, result, total_sec, created_at
       FROM routing_records ORDER BY created_at DESC`
    );
    res.json({ status: 'success', data: rows });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

router.post('/routing', async (req, res) => {
  const { serial, sequence, result, total_sec } = req.body;
  if (!serial || !sequence || !result) {
    return res.status(400).json({ status: 'error', message: 'serial, sequence, result required' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO routing_records (serial, sequence, result, total_sec)
       VALUES ($1,$2,$3,$4)
       RETURNING id, serial, sequence, result, total_sec, created_at`,
      [serial, sequence, result, Number(total_sec) || 0]
    );
    res.status(201).json({ status: 'success', data: rows[0] });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

router.delete('/routing/:id', async (req, res) => {
  try {
    const { rowCount } = await db.query('DELETE FROM routing_records WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ status: 'error', message: 'record not found' });
    res.json({ status: 'success' });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

module.exports = router;
