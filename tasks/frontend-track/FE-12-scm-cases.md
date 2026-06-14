# FE-12 — SCM Cases (Recall / Lot Split / Disposition) 📦

**ระดับ:** กลาง–สูง | **น่าจะใช้เวลา:** 5–7 วัน

---

## ทำไมต้องทำงานนี้

เมื่อของมีปัญหาในสายการผลิต SCM ต้องเปิด case เพื่อจัดการ — recall lot กลับมาตรวจ, split lot ออกเป็นส่วน, หรือตัดสิน disposition (ซ่อม/ทิ้ง/ใช้ได้ตามเดิม) ถ้าไม่มีหน้านี้ทุกอย่างทำผ่าน email ตามไม่ได้

## น้องจะได้ฝึกอะไร

- **case management UI** — เปิด/ปิด/ติดตาม case
- **lot operations** — split lot เป็น 2 กลุ่ม
- เข้าใจ **disposition workflow** ในโรงงานจริง

## API ที่มีพร้อมใช้ (backend ✅)

```ts
GET  /api/scm/cases                  // รายการ case ทั้งหมด
POST /api/scm/cases                  // เปิด case ใหม่
PUT  /api/scm/cases/:caseId/resolve  // ปิด case + ผลลัพธ์
POST /api/scm/lots/split             // split lot A → B + C
POST /api/scm/dispositions           // บันทึก disposition decision
```

## ทำทีละขั้น

**ขั้น 1 — Case List**
หน้า `#/scm-cases` — ตาราง case: Case No. / WO/Lot / ประเภท / status / วันที่เปิด
- filter: OPEN / RESOLVED

**ขั้น 2 — เปิด Case ใหม่**
form: เลือก WO/Lot, ระบุปัญหา, ประเภท (Quality / Quantity / Damage), แนบหมายเหตุ
→ `POST /api/scm/cases`

**ขั้น 3 — Lot Split**
หน้า `#/scm/lot-split` — เลือก lot, ระบุ qty ที่จะแยก, เหตุผล
→ `POST /api/scm/lots/split` → แสดง lot ใหม่ 2 ใบที่ได้

**ขั้น 4 — Disposition**
ใน case detail: ปุ่ม "ตัดสิน Disposition" → เลือก USE_AS_IS / REWORK / SCRAP + หมายเหตุ
→ `POST /api/scm/dispositions`

**ขั้น 5 — Resolve Case**
ปุ่ม "ปิด Case" → กรอกผลลัพธ์สุดท้าย → `PUT /api/scm/cases/:id/resolve`

---

## เช็คตัวเองว่าใช่รึยัง

- [ ] ตาราง case + filter OPEN/RESOLVED
- [ ] เปิด case ใหม่ได้
- [ ] Split lot ได้ + แสดง lot ใหม่ 2 ใบ
- [ ] บันทึก disposition ได้ (USE_AS_IS / REWORK / SCRAP)
- [ ] ปิด case พร้อมผลลัพธ์ได้
- [ ] mobile + error handling
- [ ] PR + screenshot

ทำเสร็จ = SCM จัดการ lot มีปัญหาได้ครบวงจร มีบันทึก ตามได้ 🎉
