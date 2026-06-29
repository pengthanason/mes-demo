const router = require('express').Router();
const db     = require('../db');

/* ── Work Centers (เครื่อง/สถานี — master data ที่ operation อ้างถึง) ── */
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, name, stations, efficiency, note, created_at FROM work_centers ORDER BY name ASC'
    );
    res.json({ status: 'success', data: rows });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

router.post('/', async (req, res) => {
  const { name, stations, efficiency, note } = req.body;
  if (!name || !String(name).trim()) {
    return res.status(400).json({ status: 'error', message: 'ต้องมีชื่อเครื่อง/สถานี' });
  }
  const st  = Math.max(1, Math.floor(Number(stations))   || 1);
  const eff = Math.min(1000, Math.max(1, Math.floor(Number(efficiency)) || 100));
  try {
    const { rows } = await db.query(
      `INSERT INTO work_centers (name, stations, efficiency, note) VALUES ($1,$2,$3,$4)
       RETURNING id, name, stations, efficiency, note, created_at`,
      [String(name).trim(), st, eff, note || '']
    );
    res.status(201).json({ status: 'success', data: rows[0] });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await db.query('DELETE FROM work_centers WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ status: 'error', message: 'not found' });
    res.json({ status: 'success' });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

module.exports = router;
