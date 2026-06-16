const router = require('express').Router();
const db     = require('../db');

// Traceability อ่านจากข้อมูลการสแกนจริง (production_scans / production_units)

// รายชื่อ serial ที่มีในระบบ (ไว้ทำ datalist แนะนำ)
router.get('/serials', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT DISTINCT serial FROM production_scans ORDER BY serial DESC LIMIT 200`
    );
    res.json({ status: 'success', data: rows.map(r => r.serial) });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// timeline ของ serial หนึ่งชิ้น — สร้างจากทุก scan ของชิ้นนั้น เรียงตามเวลา
router.get('/trace/:serial', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT wo_id, station, result, operator, note, scanned_at
       FROM production_scans WHERE serial = $1 ORDER BY scanned_at ASC`,
      [req.params.serial]
    );
    if (!rows.length) return res.status(404).json({ status: 'error', message: `Serial "${req.params.serial}" ไม่พบในระบบ` });
    const wo = rows[rows.length - 1].wo_id;
    res.json({
      status: 'success',
      data: {
        serial: req.params.serial,
        product: '—',
        wo,
        box: null,
        steps: rows.map(r => ({
          step: r.station,
          status: r.result,
          station: r.station,
          operator: r.operator || '',
          at: r.scanned_at,
          note: r.note || '',
        })),
      },
    });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// (ยังไม่มีระบบ packing/box จริง → คืนว่างไปก่อน)
router.get('/packing/boxes', (req, res) => {
  res.json({ status: 'success', data: [] });
});
router.get('/packing/boxes/:boxId', (req, res) => {
  res.status(404).json({ status: 'error', message: 'ยังไม่มีระบบ box ในเวอร์ชันนี้' });
});

// รายงานรายวัน สร้างจาก production_scans
router.get('/report/daily', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT TO_CHAR(scanned_at, 'YYYY-MM-DD') AS date,
              COUNT(*)::int AS total,
              SUM(CASE WHEN result='PASS' THEN 1 ELSE 0 END)::int AS pass,
              SUM(CASE WHEN result='FAIL' THEN 1 ELSE 0 END)::int AS fail,
              ROUND(SUM(CASE WHEN result='PASS' THEN 1 ELSE 0 END)::numeric /
                    NULLIF(COUNT(*),0) * 100, 1)::float AS pass_rate
       FROM production_scans
       GROUP BY TO_CHAR(scanned_at, 'YYYY-MM-DD') ORDER BY date DESC LIMIT 30`
    );
    res.json({ status: 'success', data: rows });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

module.exports = router;
