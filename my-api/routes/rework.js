const router = require('express').Router();
const db     = require('../db');

router.get('/list', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT rw.*, qr.lot_no, qr.overall AS qc_overall
       FROM rework_tickets rw
       JOIN qc_results qr ON qr.id = rw.qc_result_id
       ORDER BY rw.created_at DESC`
    );
    res.json({ status: 'success', data: rows });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

router.post('/repair', async (req, res) => {
  const { qc_result_id, defect_type, assigned_to, due_date } = req.body;
  if (!qc_result_id || !String(defect_type || '').trim()) {
    return res.status(400).json({ status: 'error', message: 'qc_result_id, defect_type required' });
  }
  try {
    const check = await db.query('SELECT id, wo_id FROM qc_results WHERE id=$1', [qc_result_id]);
    if (!check.rows.length) return res.status(404).json({ status: 'error', message: 'ไม่พบ QC result' });
    const wo_id = check.rows[0].wo_id;
    const { rows } = await db.query(
      `INSERT INTO rework_tickets (qc_result_id, wo_id, defect_type, assigned_to, due_date)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, qc_result_id, wo_id, defect_type, assigned_to, due_date, status, created_at`,
      [qc_result_id, wo_id, defect_type.trim(), assigned_to || '', due_date || null]
    );
    res.status(201).json({ status: 'success', data: rows[0] });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

router.patch('/:id/status', async (req, res) => {
  const { status } = req.body;
  if (!['OPEN','IN_PROGRESS','DONE'].includes(status)) {
    return res.status(400).json({ status: 'error', message: 'status must be OPEN|IN_PROGRESS|DONE' });
  }
  try {
    const { rows, rowCount } = await db.query(
      `UPDATE rework_tickets SET status=$1, updated_at=NOW() WHERE id=$2
       RETURNING id, qc_result_id, wo_id, defect_type, assigned_to, due_date, status, updated_at`,
      [status, req.params.id]
    );
    if (!rowCount) return res.status(404).json({ status: 'error', message: 'ticket not found' });
    res.json({ status: 'success', data: rows[0] });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

module.exports = router;
