const router = require('express').Router();
const db     = require('../db');

const FIELDS = `id, code, customer, status, stage, qty,
  TO_CHAR(delivery, 'YYYY-MM-DD') AS delivery, is_completed, created_at`;

// GET /api/report/list
router.get('/list', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT ${FIELDS} FROM production_reports ORDER BY created_at DESC`
    );
    res.json({ status: 'success', data: rows });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// POST /api/report (สร้างแถวเปล่าให้พิมพ์ต่อ)
router.post('/', async (req, res) => {
  try {
    const { rows } = await db.query(
      `INSERT INTO production_reports DEFAULT VALUES RETURNING ${FIELDS}`
    );
    res.status(201).json({ status: 'success', data: rows[0] });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// PATCH /api/report/:id
router.patch('/:id', async (req, res) => {
  const allowed = ['code', 'customer', 'status', 'stage', 'qty', 'delivery', 'is_completed'];
  const patch = {};
  for (const key of allowed) {
    if (key in req.body) patch[key] = req.body[key];
  }
  if (!Object.keys(patch).length) {
    return res.status(400).json({ status: 'error', message: 'no updatable fields' });
  }
  if ('delivery' in patch && !patch.delivery) patch.delivery = null;

  const keys = Object.keys(patch);
  const sets = keys.map((k, i) => `${k}=$${i + 1}`).join(', ');
  try {
    const { rows } = await db.query(
      `UPDATE production_reports SET ${sets}, updated_at=NOW()
       WHERE id=$${keys.length + 1} RETURNING ${FIELDS}`,
      [...keys.map(k => patch[k]), req.params.id]
    );
    if (!rows.length) return res.status(404).json({ status: 'error', message: 'report not found' });
    res.json({ status: 'success', data: rows[0] });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// DELETE /api/report/:id
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await db.query('DELETE FROM production_reports WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ status: 'error', message: 'report not found' });
    res.json({ status: 'success' });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

module.exports = router;
