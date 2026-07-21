const router = require('express').Router();
const db     = require('../db');

// #54 FE-CONNECT-7: Production Plan — Work Orders Overview
// dev stub ใน my-api — endpoint จริงอยู่บน backbone (mes_draft#5) แต่ยังรอ merge (proxy /api/planning → 5099)
// map จากตาราง work_orders จริง → shape ตาม contract
//   GET /api/planning/wo-overview?status=<optional>&limit=<default 100, max 500>
//   → { status:'success', work_orders:[...], summary_by_status:[{status,count}], request_id }
router.get('/wo-overview', async (req, res) => {
  try {
    const { status } = req.query;
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const vals = [];
    let where = '';
    if (status) { vals.push(status); where = `WHERE status = $${vals.length}`; }
    vals.push(limit);
    const { rows } = await db.query(
      `SELECT id, wo_no AS wo_number, product_name AS part_no,
              qty AS qty_target, COALESCE(actual_qty, qty_good) AS qty_started, qty_good,
              status, created_at AS opened_at,
              CASE WHEN status = 'DONE' THEN updated_at ELSE NULL END AS closed_at,
              ROUND((qty_good::numeric / NULLIF(qty, 0)) * 100, 1)::float AS yield_pct,
              created_at, updated_at
         FROM work_orders ${where}
        ORDER BY created_at DESC
        LIMIT $${vals.length}`,
      vals
    );
    const { rows: summary } = await db.query(
      `SELECT status, COUNT(*)::int AS count FROM work_orders GROUP BY status ORDER BY status`
    );
    res.json({ status: 'success', work_orders: rows, summary_by_status: summary, request_id: `dev-${Date.now()}` });
  } catch (e) {
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

module.exports = router;
