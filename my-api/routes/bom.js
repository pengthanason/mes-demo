const router = require('express').Router();
const db     = require('../db');

// GET /api/bom/headers
router.get('/headers', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id AS bom_id, name, version, approved, approved_at, created_at
       FROM boms ORDER BY created_at DESC`
    );
    res.json({ status: 'success', data: rows });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// GET /api/bom/:bomId/review
router.get('/:bomId/review', async (req, res) => {
  const bomId = Number(req.params.bomId);
  try {
    const bom = await db.query(
      `SELECT id AS bom_id, name, version, approved, approved_at FROM boms WHERE id=$1`,
      [bomId]
    );
    if (!bom.rows.length) return res.status(404).json({ status: 'error', message: 'BOM not found' });

    const lines = await db.query(
      `SELECT id AS line_id, part_no, part_name, qty_per, unit
       FROM bom_lines WHERE bom_id=$1 ORDER BY sort_order`,
      [bomId]
    );
    res.json({ status: 'success', data: { ...bom.rows[0], lines: lines.rows } });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// PUT /api/bom/:bomId/approve
router.put('/:bomId/approve', async (req, res) => {
  const bomId = Number(req.params.bomId);
  try {
    const { rows } = await db.query(
      `UPDATE boms SET approved=true, approved_at=NOW()
       WHERE id=$1 RETURNING id AS bom_id, name, version, approved, approved_at`,
      [bomId]
    );
    if (!rows.length) return res.status(404).json({ status: 'error', message: 'BOM not found' });
    res.json({ status: 'success', data: rows[0] });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// POST /api/bom (สร้าง BOM ใหม่)
router.post('/', async (req, res) => {
  const { name, version = '1.0', lines = [] } = req.body;
  if (!name) return res.status(400).json({ status: 'error', message: 'name is required' });

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const bom = await client.query(
      `INSERT INTO boms (name, version) VALUES ($1, $2) RETURNING id AS bom_id, name, version, approved`,
      [name, version]
    );
    const bomId = bom.rows[0].bom_id;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      await client.query(
        `INSERT INTO bom_lines (bom_id, part_no, part_name, qty_per, unit, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [bomId, l.part_no, l.part_name, l.qty_per, l.unit || 'pcs', i + 1]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ status: 'success', data: bom.rows[0] });
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23505') return res.status(409).json({ status: 'error', message: 'BOM ชื่อ+version นี้มีอยู่แล้ว' });
    res.status(500).json({ status: 'error', message: e.message });
  } finally {
    client.release();
  }
});

module.exports = router;
