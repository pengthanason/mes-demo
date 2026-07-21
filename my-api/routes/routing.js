const router = require('express').Router();
const db     = require('../db');

// #50 FE-CONNECT-3: Routing / Scan History
// dev stub ใน my-api — endpoint จริงอยู่บน backbone (mes_draft#5, port 5100) แต่ยังรอ merge
// proxy dev ส่ง /api/routing → my-api(5099) จึงต่อไว้ที่นี่เพื่อให้หน้า Traceability ทดสอบบน 5101 ได้จริง
// อ่านจาก production_scans (แหล่งเดียวกับ /api/jumbo/trace) แล้ว map เป็น event shape ตาม contract ของ issue
//   GET /api/routing/history/:unitSn → { status:'ok', data:{ unit_sn, events:[...] }, request_id }
router.get('/history/:unitSn', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT wo_id, station, result, operator, note, scanned_at
         FROM production_scans WHERE serial = $1 ORDER BY scanned_at ASC`,
      [req.params.unitSn]
    );
    if (!rows.length) return res.status(404).json({ status: 'error', message: `Serial "${req.params.unitSn}" not found` });
    const events = [];
    let id = 0;
    rows.forEach((r, i) => {
      const base = { wo_id: r.wo_id, route_id: null, route_code: r.wo_id, station_name: r.station, scanned_by_username: r.operator || '', note: r.note || null };
      // 1 scan (มีผลแล้ว) → แสดง SCAN_IN (ยังไม่มีผล) นำหน้า แล้ว SCAN_OUT (พร้อมผล PASS/FAIL) → timeline เข้า/ออกสถานี
      events.push({ id: ++id, ...base, step_order: i + 1, action: 'SCAN_IN',  status: null,     result_state: 'IN_PROGRESS', scanned_at: r.scanned_at });
      events.push({ id: ++id, ...base, step_order: i + 1, action: 'SCAN_OUT', status: r.result, result_state: r.result === 'PASS' ? 'DONE' : 'NG', scanned_at: r.scanned_at });
    });
    res.json({ status: 'ok', data: { unit_sn: req.params.unitSn, events }, request_id: `dev-${Date.now()}` });
  } catch (e) {
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

module.exports = router;
