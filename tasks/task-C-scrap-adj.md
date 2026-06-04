# Task C — Scrap ADJ Flow (QC FAIL → WMS Adjustment)

**ระดับ:** Intermediate | **เวลาที่คาดว่าใช้:** 1–2 สัปดาห์
**Stack:** Node.js / Express + React (Vite)
**Repo:** `Weradech/syntech_mes_draft`

---

## โจทย์

ตอนนี้เมื่อ QC บันทึกผล FAIL สำหรับ unit ที่ซ่อมไม่ได้ (scrap) ระบบ MES **ไม่ได้ส่งข้อมูลไปหัก stock ใน WMS**
ทำให้ยอด WMS คลาดเคลื่อน — WMS ยังคิดว่ามีวัตถุดิบนั้นอยู่

จงต่อ flow: `POST /api/qc/result (result=FAIL + scrapped=true)` → ส่ง ADJ ไป WMS เพื่อหัก stock

---

## Flow ที่ต้องการ

```
QC กด FAIL + mark scrap
        ↓
POST /api/qc/result  { unit_sn, wo_id, result: "FAIL", scrapped: true }
        ↓
ดึง BOM snapshot ของ WO → หา materials ที่ใช้ไปใน unit นี้
        ↓
wms_client.postADJ(items)  → หัก stock ใน WMS
        ↓
บันทึก mes_sync_log { direction: "MES→WMS", event_type: "SCRAP_ADJ" }
        ↓
ส่ง notification ไปหา PM
```

---

## Acceptance Criteria

### Backend

- [ ] `POST /api/qc/result` รับ field เพิ่ม: `scrapped: boolean` (optional, default false)
- [ ] เมื่อ `result = "FAIL"` AND `scrapped = true`:
  - ดึง BOM snapshot จาก `wo_bom_snapshot` ตาม `wo_id`
  - เรียก `wms_client.postADJ()` หัก qty ที่ใช้ไปใน unit นั้น
  - บันทึก `mes_sync_log` ด้วย `event_type = "SCRAP_ADJ"`
  - ส่ง notification ถึง PM ว่ามี scrap
- [ ] ถ้า WMS ตอบ error → log ลง `mes_sync_log` ด้วย `status = "ERROR"` (ไม่ให้ block QC record)
- [ ] ถ้า `scrapped = false` → ทำงานเหมือนเดิม (rework flow ปกติ)

### Frontend (Vite UI)

- [ ] หน้า QC result (/ui/#/qc หรือที่มีอยู่) เพิ่ม checkbox "ทำลาย (Scrap)"
- [ ] เมื่อ result = FAIL แสดง checkbox นั้น
- [ ] แสดง scrap count สะสมใน WO detail (read from `mes_sync_log` ที่มี `event_type=SCRAP_ADJ`)

---

## ไฟล์ที่ต้องแก้

```
backend/
  modules/07_qc_rework/qc_rework.routes.js  ← เพิ่ม scrap logic
  controllers/production.controller.js      ← postQcResult() method
  common/wms_client.js                      ← ดู postADJ() ที่มีอยู่แล้ว

frontend/src/
  pages/QcPage.tsx (หรือที่มีอยู่)          ← เพิ่ม scrap checkbox
```

---

## Code Reference

**wms_client.js methods ที่ใช้ได้:**
```js
wmsClient.postADJ(woRef, items, actor)
// items: [{ part_no, qty, location, remarks }]
// qty เป็น negative = หัก stock (ADJ_MINUS)
```

**mes_sync_log insert pattern (ดูตัวอย่างใน close.routes.js):**
```js
await db.query(`
  INSERT INTO mes_core.mes_sync_log
    (direction, event_type, wo_id, status, payload, created_at)
  VALUES ($1, $2, $3, $4, $5, NOW())
`, ['MES→WMS', 'SCRAP_ADJ', wo_id, 'OK', JSON.stringify(payload)])
```

---

## Definition of Done

- [ ] `POST /api/qc/result` ด้วย `{ scrapped: true }` → WMS stock ลดลง
- [ ] `mes_sync_log` มี record ใหม่ event_type = SCRAP_ADJ
- [ ] ถ้า WMS offline → QC record ยังบันทึกได้ แค่ sync_log status = ERROR
- [ ] checkbox บน UI แสดงและส่งค่าถูกต้อง
- [ ] ส่ง PR พร้อม screenshot UI + curl test