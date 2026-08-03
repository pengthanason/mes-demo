const router = require('express').Router();
const db     = require('../db');

// ── BOM ────────────────────────────────────────────────────────────────────
// ⚠️ ตาราง `boms` (หัว BOM) ถูกถอดออกจากระบบแล้ว — เจ้าของ BOM คือ MRP
//    เหลือเก็บแต่ `bom_lines` (รายการชิ้นส่วน) โดยใช้ `bom_id` เป็น plain INTEGER
//    ที่อ้างถึง BOM ของ MRP (ไม่มี FK ในฐานข้อมูลนี้)
//
// สถานะจริงตอนนี้ (อย่าเขียนให้เกินความจริง):
//   - ยัง **ไม่มี** API เชื่อม MRP — endpoint อ่านข้อมูลด้านล่างอ่านจาก `bom_lines`
//     ในฐานข้อมูลนี้ ซึ่งเป็นสำเนาที่นำเข้ามา (mirror) ไม่ใช่ดึงสดจาก MRP
//   - endpoint ที่ "สร้าง/อนุมัติ" BOM ปิดแล้ว เพราะระบบนี้ไม่ใช่เจ้าของข้อมูล
//   - เมื่อมี MRP API แล้วให้เปลี่ยนตรงนี้ให้ยิงออกไปจริง แล้วลบคำว่า mirror ออก
const EXTERNAL_MSG = 'BOM data comes from an external system (MRP) — this system does not create/approve BOMs itself';
// แหล่งข้อมูลจริงของ endpoint อ่าน — บอก client ตรงๆ ว่ายังเป็นสำเนาใน DB นี้
const READ_SOURCE = 'local_bom_lines_mirror';

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
    res.json({ status: 'success', data: rows, source: READ_SOURCE, note: EXTERNAL_MSG });
  } catch (e) {
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

// GET /api/bom/:bomId/review — ดูรายการชิ้นส่วนของ BOM นั้น
// ไม่มีหัว BOM ให้ดึงแล้ว → คืนแต่ lines (ถ้าไม่มี lines = ไม่มีข้อมูลในระบบนี้)
router.get('/:bomId/review', async (req, res) => {
  const bomId = Number(req.params.bomId);
  if (!Number.isInteger(bomId) || bomId <= 0) {
    return res.status(400).json({ status: 'error', message: 'bomId must be an integer greater than 0' });
  }
  try {
    const lines = await db.query(
      `SELECT id AS line_id, part_no, part_name, qty_per, unit,
              line_no, level, component_type, customer_pn, mfg_pn, brand,
              avl_os_flag, ref_designators, price_thb, price_usd, total_thb
         FROM bom_lines WHERE bom_id=$1 ORDER BY sort_order`,
      [bomId]
    );
    if (!lines.rows.length) {
      return res.status(404).json({ status: 'error', message: `No parts list found for BOM #${bomId} in this system (${EXTERNAL_MSG})` });
    }
    res.json({ status: 'success', data: { bom_id: bomId, lines: lines.rows }, source: READ_SOURCE, note: EXTERNAL_MSG });
  } catch (e) {
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

// PUT /api/bom/:bomId/approve — ปิดไว้ (การอนุมัติ BOM อยู่ที่ระบบภายนอก)
router.put('/:bomId/approve', (req, res) => {
  res.status(400).json({ status: 'error', message: `Cannot approve BOM in this system — ${EXTERNAL_MSG}` });
});

// POST /api/bom — ปิดไว้ (การสร้าง BOM อยู่ที่ระบบภายนอก)
router.post('/', (req, res) => {
  res.status(400).json({ status: 'error', message: `Cannot create BOM in this system — ${EXTERNAL_MSG}` });
});

module.exports = router;
