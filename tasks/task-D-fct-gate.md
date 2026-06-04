# Task D — FCT Gate (Block Assembly if FCT Failed)

**ระดับ:** Advanced | **เวลาที่คาดว่าใช้:** 2–3 สัปดาห์
**Stack:** Node.js / Express + React (Vite)
**Repo:** `Weradech/syntech_mes_draft`

---

## โจทย์

ปัจจุบัน Jumbo module มี **ICT Gate** — ก่อนอนุญาต assembly ระบบเช็คว่า unit ผ่าน ICT แล้วหรือยัง
(ถ้า Jig-API ไม่ตอบ → warn แต่ยังผ่านได้ = graceful degrade)

**FCT (Functional Circuit Test)** ยังไม่มี gate เลย — unit ที่ fail FCT ยังสามารถเดินหน้า assembly ต่อได้

จงสร้าง FCT Gate ใน routing scan flow (M06) โดย pattern เดียวกับ ICT Gate

---

## Flow ที่ต้องการ

```
TECH scan unit SN เข้า station ที่ configure ว่าต้องการ FCT
        ↓
POST /api/routing/scan-in  { unit_sn, station_id, wo_id }
        ↓
ระบบเช็ค jig_test_results: FCT result ของ unit นี้ล่าสุดเป็นอะไร?
        ↓
PASS → อนุญาต scan-in ปกติ
FAIL → block พร้อม error { code: "FCT_GATE_FAILED", unit_sn, last_result }
ไม่มีผล / Jig-API ไม่ตอบ → warn log แต่อนุญาตผ่าน (graceful degrade)
```

---

## Acceptance Criteria

### Backend

- [ ] สร้าง config table หรือ env สำหรับระบุว่า station ไหน require FCT
  - Option A: `FCT_REQUIRED_STATIONS=R5,R6,R7` ใน .env
  - Option B: column `fct_required: boolean` ใน `mes_core.routes` table (ถามเรื่องนี้กับ supervisor ก่อน)
- [ ] `POST /api/routing/scan-in` เช็ค FCT gate ถ้า station require FCT
- [ ] ถ้า FCT FAIL → return 409 `{ code: "FCT_GATE_FAILED", unit_sn, tested_at, result_status }`
- [ ] ถ้า Jig-API timeout / ไม่มีผล → log warn แต่ return 200 (graceful degrade เหมือน ICT)
- [ ] บันทึก audit log ทุกครั้งที่มีการ block

### Frontend (Vite UI)

- [ ] เมื่อ scan-in ล้มเหลวด้วย FCT_GATE_FAILED → แสดง modal แดง บอก unit/เหตุผล
- [ ] แสดง FCT status badge ใน routing scan UI (PASS=เขียว, FAIL=แดง, ไม่มีผล=เทา)

---

## ไฟล์ที่ต้องแก้

```
backend/
  modules/06_production/routing.routes.js    ← เพิ่ม FCT gate ใน scan-in
  common/jig_client.js                       ← ดู getResult() ที่ใช้ query FCT
  (optional) migrations/20260605_fct_station_config.js

frontend/src/
  pages/ProductionPage.tsx (หรือที่มีอยู่)   ← เพิ่ม FCT modal + badge
```

---

## Code Reference

**ICT Gate ที่ทำไปแล้ว (ใช้เป็น pattern):**
```
backend/modules/13_jumbo/jumbo.routes.js
  → ดูส่วน "ICT gate" (graceful degrade pattern)
```

**jig_client.getResult() signature:**
```js
// returns: { result_status: "PASS"|"FAIL"|"PENDING", tested_at, raw_data }
// throws: ถ้า Jig-API ไม่ตอบ
const result = await jigClient.getResult(unit_sn, "FCT")
```

**Graceful degrade pattern (copy จาก ICT gate):**
```js
let fctStatus = null
try {
  fctStatus = await jigClient.getResult(unit_sn, "FCT")
} catch (err) {
  logger.warn({ unit_sn, err: err.message }, "FCT gate: jig-api unreachable, allowing through")
}
if (fctStatus && fctStatus.result_status === "FAIL") {
  return res.status(409).json({ code: "FCT_GATE_FAILED", unit_sn, ...fctStatus })
}
// continue normal flow
```

---

## Definition of Done

- [ ] unit ที่ FCT FAIL → scan-in ถูก block ด้วย 409
- [ ] unit ที่ FCT PASS → scan-in ผ่านปกติ
- [ ] ถ้า Jig-API ไม่ตอบ → scan-in ผ่านได้ (ดู log warn)
- [ ] Modal บน UI แสดงเมื่อ gate block
- [ ] เขียน test case อย่างน้อย 3 case: PASS / FAIL / Jig-API down
- [ ] ส่ง PR พร้อม test output