const router = require('express').Router();
const db     = require('../db');

// ── Cases ──────────────────────────────────────────────────────────

router.get('/cases', async (req, res) => {
  const { status } = req.query;
  try {
    const { rows } = await db.query(
      `SELECT c.*, COUNT(d.id)::int AS disposition_count
       FROM scm_cases c
       LEFT JOIN scm_dispositions d ON d.case_id = c.case_id
       ${status ? 'WHERE c.status=$1' : ''}
       GROUP BY c.id ORDER BY c.created_at DESC`,
      status ? [status] : []
    );
    res.json({ success: true, cases: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post('/cases', async (req, res) => {
  const { case_id, case_type, ref_po, ref_inv, part_no, due_date } = req.body;
  if (!case_type) return res.status(400).json({ success: false, message: 'case_type required' });
  try {
    const autoId = case_id || `SCM-${new Date().toISOString().slice(0,7).replace('-','')}-${Date.now().toString().slice(-4)}`;
    const { rows } = await db.query(
      `INSERT INTO scm_cases (case_id, case_type, ref_po, ref_inv, part_no, due_date)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [autoId, case_type.toUpperCase(), ref_po || '', ref_inv || '', part_no || '', due_date || null]
    );
    res.status(201).json({ success: true, case: rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.put('/cases/:caseId/resolve', async (req, res) => {
  const { resolution_note } = req.body;
  try {
    const { rows, rowCount } = await db.query(
      `UPDATE scm_cases SET status='CLOSED', resolution_note=$1, resolved_at=NOW(), updated_at=NOW()
       WHERE case_id=$2 AND status='OPEN'
       RETURNING *`,
      [resolution_note || '', req.params.caseId]
    );
    if (!rowCount) return res.status(404).json({ success: false, message: 'case not found or already closed' });
    res.json({ success: true, case: rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ── Dispositions ───────────────────────────────────────────────────

router.post('/dispositions', async (req, res) => {
  const { case_id, action, rma_no, return_qty } = req.body;
  if (!case_id || !action) return res.status(400).json({ success: false, message: 'case_id, action required' });
  try {
    const { rows } = await db.query(
      `INSERT INTO scm_dispositions (case_id, action, rma_no, return_qty)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [case_id, action.toUpperCase(), rma_no || '', Number(return_qty) || 0]
    );
    res.status(201).json({ success: true, disposition: rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ── Lot Split ──────────────────────────────────────────────────────

router.post('/lots/split', async (req, res) => {
  const { original_uid, ok_qty, ng_qty, reason } = req.body;
  if (!original_uid) return res.status(400).json({ success: false, message: 'original_uid required' });
  const okQ = Number(ok_qty) || 0;
  const ngQ = Number(ng_qty) || 0;
  try {
    const ts   = Date.now().toString().slice(-6);
    const okUid = `${original_uid}-OK-${ts}`;
    const ngUid = `${original_uid}-NG-${ts}`;
    const { rows } = await db.query(
      `INSERT INTO scm_lot_splits (original_uid, ok_uid, ng_uid, original_qty, ok_qty, ng_qty, reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [original_uid, okUid, ngUid, okQ + ngQ, okQ, ngQ, reason || '']
    );
    res.status(201).json({ success: true, split: rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
