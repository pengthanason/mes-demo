const router = require('express').Router();
const db     = require('../db');

/* ── Presets (ลำดับกระบวนการที่บันทึกไว้) ── */
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, name, customer, model, steps, created_at FROM workflows ORDER BY created_at DESC'
    );
    res.json({ status: 'success', data: rows });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

router.post('/', async (req, res) => {
  const { name, customer, model, steps } = req.body;
  if (!Array.isArray(steps) || steps.length === 0) {
    return res.status(400).json({ status: 'error', message: 'ต้องมีขั้นตอน (steps) อย่างน้อย 1' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO workflows (name, customer, model, steps) VALUES ($1,$2,$3,$4)
       RETURNING id, name, customer, model, steps, created_at`,
      [name || '', customer || '', model || '', JSON.stringify(steps)]
    );
    res.status(201).json({ status: 'success', data: rows[0] });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await db.query('DELETE FROM workflows WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ status: 'error', message: 'not found' });
    res.json({ status: 'success' });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

/* ── Results (บันทึกผลเดินสายผลิต: Serial + PASS/FAIL + cycle time) ── */
router.get('/results', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, serial, customer, model, sequence, result, total_sec, created_at FROM workflow_results ORDER BY created_at DESC'
    );
    res.json({ status: 'success', data: rows });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

router.post('/results', async (req, res) => {
  const { serial, customer, model, sequence, result, total_sec } = req.body;
  if (!serial || !String(serial).trim()) {
    return res.status(400).json({ status: 'error', message: 'ต้องมี Serial Number' });
  }
  const r = (result === 'FAIL') ? 'FAIL' : 'PASS';
  try {
    const { rows } = await db.query(
      `INSERT INTO workflow_results (serial, customer, model, sequence, result, total_sec)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, serial, customer, model, sequence, result, total_sec, created_at`,
      [String(serial).trim(), customer || '', model || '', sequence || '', r, Number(total_sec) || 0]
    );
    res.status(201).json({ status: 'success', data: rows[0] });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

router.delete('/results/:id', async (req, res) => {
  try {
    const { rowCount } = await db.query('DELETE FROM workflow_results WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ status: 'error', message: 'not found' });
    res.json({ status: 'success' });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

module.exports = router;
