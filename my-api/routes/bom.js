const router = require('express').Router();
const db     = require('../db');

// ── BOM ────────────────────────────────────────────────────────────────────
// ⚠️ ตาราง `boms` (หัว BOM) ถูกถอดออกจากระบบแล้ว — BOM ตัวจริงมาจากระบบภายนอก (MRP)
//    เหลือเก็บแต่ `bom_lines` (รายการชิ้นส่วน) โดยใช้ `bom_id` เป็น plain INTEGER
//    ที่อ้างถึง BOM ของระบบภายนอก (ไม่มี FK ในฐานข้อมูลนี้)
// → endpoint ที่ "สร้าง/อนุมัติ" BOM จึงตอบข้อความอธิบายแทน ไม่ error หน้าขาว
const EXTERNAL_MSG = 'BOM มาจากระบบภายนอก (MRP) — ระบบนี้ไม่ได้สร้าง/อนุมัติ BOM เอง';

// GET /api/bom/headers — รายการ BOM ที่มีรายการชิ้นส่วนอยู่ในระบบ
// เดิมอ่านจากตาราง boms · ตอนนี้ derive จาก bom_lines (group by bom_id)
router.get('/headers', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT bom_id,
              COUNT(*)::int  AS line_count,
              MIN(part_name) AS sample_part
         FROM bom_lines
        GROUP BY bom_id
        ORDER BY bom_id DESC`
    );
    res.json({ status: 'success', data: rows, note: EXTERNAL_MSG });
  } catch (e) {
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

// GET /api/bom/:bomId/review — ดูรายการชิ้นส่วนของ BOM นั้น
// ไม่มีหัว BOM ให้ดึงแล้ว → คืนแต่ lines (ถ้าไม่มี lines = ไม่มีข้อมูลในระบบนี้)
router.get('/:bomId/review', async (req, res) => {
  const bomId = Number(req.params.bomId);
  if (!Number.isInteger(bomId) || bomId <= 0) {
    return res.status(400).json({ status: 'error', message: 'bomId ต้องเป็นจำนวนเต็มมากกว่า 0' });
  }
  try {
    const lines = await db.query(
      `SELECT id AS line_id, part_no, part_name, qty_per, unit
         FROM bom_lines WHERE bom_id=$1 ORDER BY sort_order`,
      [bomId]
    );
    if (!lines.rows.length) {
      return res.status(404).json({ status: 'error', message: `ไม่พบรายการชิ้นส่วนของ BOM #${bomId} ในระบบนี้ (${EXTERNAL_MSG})` });
    }
    res.json({ status: 'success', data: { bom_id: bomId, external: true, lines: lines.rows }, note: EXTERNAL_MSG });
  } catch (e) {
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

// PUT /api/bom/:bomId/approve — ปิดไว้ (การอนุมัติ BOM อยู่ที่ระบบภายนอก)
router.put('/:bomId/approve', (req, res) => {
  res.status(400).json({ status: 'error', message: `อนุมัติ BOM ที่ระบบนี้ไม่ได้ — ${EXTERNAL_MSG}` });
});

// POST /api/bom — ปิดไว้ (การสร้าง BOM อยู่ที่ระบบภายนอก)
router.post('/', (req, res) => {
  res.status(400).json({ status: 'error', message: `สร้าง BOM ที่ระบบนี้ไม่ได้ — ${EXTERNAL_MSG}` });
});

module.exports = router;
