const router = require('express').Router();
const db     = require('../db');

// BOM headers/detail/create/approve ย้ายไปใช้ BOM ภายนอก (mrp.bom_lines)
// ระหว่างที่ยังไม่มี external API → ดึง distinct bom_id จาก bom_lines แทน

// GET /api/bom/headers
router.get('/headers', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT DISTINCT bom_id, MIN(part_no) AS sample_part
       FROM bom_lines GROUP BY bom_id ORDER BY bom_id`
    );
    res.json({ status: 'success', data: rows, note: 'BOM headers from external source — pending integration' });
  } catch (e) {
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

// GET /api/bom/:bomId/review
router.get('/:bomId/review', async (req, res) => {
  const bomId = Number(req.params.bomId);
  try {
    const lines = await db.query(
      `SELECT id AS line_id, part_no, part_name, qty_per, unit
       FROM bom_lines WHERE bom_id=$1 ORDER BY sort_order`,
      [bomId]
    );
    if (!lines.rows.length) return res.status(404).json({ status: 'error', message: 'BOM not found' });
    res.json({ status: 'success', data: { bom_id: bomId, lines: lines.rows } });
  } catch (e) {
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

// PUT /api/bom/:bomId/approve — pending external BOM integration
router.put('/:bomId/approve', (_req, res) => {
  res.status(503).json({ status: 'error', message: 'BOM approval moved to external system — pending integration' });
});

// POST /api/bom — pending external BOM integration
router.post('/', (_req, res) => {
  res.status(503).json({ status: 'error', message: 'BOM creation moved to external system — pending integration' });
});

module.exports = router;
