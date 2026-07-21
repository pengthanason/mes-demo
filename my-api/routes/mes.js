const router = require('express').Router();
const db     = require('../db');

// #52 FE-CONNECT-5: Station Status Live Widget — dev stub ใน my-api
// endpoint จริงอยู่บน backbone (5100) แต่ backbone ใช้ auth คนละแบบ (my-api token ใช้ไม่ได้)
// dev proxy จึงชี้ /api/mes → 5099 มาที่นี่ · คำนวณ WIP รายสถานีสดจาก production_scans
//   GET /api/mes/stations/monitor?route_code=<optional>&lookback_hours=<optional>
router.get('/stations/monitor', async (req, res) => {
  try {
    const { route_code } = req.query;
    const lookback = Math.min(Number(req.query.lookback_hours) || 720, 8760);   // default 30 วัน
    const vals = [lookback];
    let where = `scanned_at >= NOW() - make_interval(hours => $1)`;
    if (route_code) { vals.push(route_code); where += ` AND wo_id = $${vals.length}`; }
    // นับ "ต่อชิ้น (สถานะล่าสุดต่อ serial)" ทั้งหมด → In = Pass + Rework พอดี (ตัวเลข reconcile กัน)
    const { rows } = await db.query(
      `WITH latest AS (
         SELECT DISTINCT ON (station, serial) station, serial, result, wo_id, scanned_at
           FROM production_scans
          WHERE ${where}
          ORDER BY station, serial, scanned_at DESC
       )
       SELECT station AS station_name,
              MAX(wo_id) AS route_code,
              COUNT(*) AS units_total,
              SUM(CASE WHEN result='PASS' THEN 1 ELSE 0 END) AS units_pass,
              SUM(CASE WHEN result='FAIL' THEN 1 ELSE 0 END) AS units_fail,
              MAX(scanned_at) AS last_scan_at
         FROM latest
        GROUP BY station
        ORDER BY MAX(scanned_at) DESC`,
      vals
    );
    const data = rows.map(r => {
      const pass = Number(r.units_pass), fail = Number(r.units_fail), total = Number(r.units_total);
      return {
        route_code: r.route_code || '',
        station_name: r.station_name,
        units_in_station: total,        // ชิ้นที่สถานีนี้ (สถานะล่าสุด) = pass + fail
        units_ready_next: pass,
        units_rework_required: fail,
        units_completed: pass,
        scan_in_count: total,
        scan_out_pass_count: pass,
        scan_out_fail_count: fail,
        last_scan_at: r.last_scan_at,
      };
    });
    res.json({ status: 'success', data, request_id: `dev-${Date.now()}` });
  } catch (e) {
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

module.exports = router;
