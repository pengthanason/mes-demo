# FE-9 — 4M Change Request (เปิด CR + ติดตาม Gate) 🔄

**ระดับ:** กลาง–สูง | **น่าจะใช้เวลา:** 6–8 วัน

---

## ทำไมต้องทำงานนี้

โรงงานมีการเปลี่ยนแปลง Man / Machine / Material / Method อยู่เสมอ — ทุกครั้งต้องมีเอกสาร **Change Request (CR)** ผ่านกระบวนการ gate review ก่อนเริ่มใช้จริง ถ้าไม่มีหน้านี้ PM ต้องใช้ Excel แทน ซึ่งหายและตามไม่ได้

## น้องจะได้ฝึกอะไร

- **multi-step form** — กรอกข้อมูลหลายขั้น → submit ครั้งเดียว
- **state machine UI** — CR มี state: DRAFT → G1_REVIEW → G2_APPROVED → ACTIVE ต้องแสดงให้เห็นชัด
- เข้าใจ **4M Change** ในบริบทโรงงานจริง (Man/Machine/Material/Method)

## API ที่มีพร้อมใช้ (backend ✅)

```ts
GET  /api/pm/leads              // รายการ CR ทั้งหมด
GET  /api/pm/leads/:leadId      // รายละเอียด CR
POST /api/pm/leads              // เปิด CR ใหม่
POST /api/pm/cr                 // บันทึก Change Request detail
PUT  /api/pm/leads/:id/gate-g1  // PM อนุมัติ G1
PUT  /api/pm/leads/:id/gate-g2  // PM อนุมัติ G2
PUT  /api/pm/leads/:id/gate-g3  // PM ปิด/active
```

## ทำทีละขั้น

**ขั้น 1 — CR List**
หน้า `#/4m-change` — ตาราง CR ทั้งหมด แสดง: CR No. / ประเภท 4M / รายละเอียดสั้น / state badge / วันที่

- filter ตาม state + ประเภท (Man/Machine/Material/Method)

**ขั้น 2 — เปิด CR ใหม่**
ปุ่ม "เปิด CR ใหม่" → form:
- เลือก ประเภท 4M (Man / Machine / Material / Method)
- ใส่ WO/Product ที่เกี่ยวข้อง
- อธิบายการเปลี่ยนแปลง (what changed + why)
- ผลกระทบที่คาดว่าจะเกิด

**ขั้น 3 — CR Detail + Gate Timeline**
หน้า `#/4m-change/:crId` — แสดง CR detail + timeline gate:

```
[DRAFT] → [G1: Engineering Review] → [G2: QA Approved] → [G3: ACTIVE]
   ●              ○                          ○                  ○
```

- แต่ละ gate: PM กดปุ่ม approve + ใส่หมายเหตุ
- ถ้า gate ยังไม่ถึง → ปุ่มเป็น disabled

**ขั้น 4 — state badge + color**
แต่ละ state สีต่างกันชัดเจน: DRAFT=เทา / REVIEW=เหลือง / APPROVED=เขียว / ACTIVE=น้ำเงิน

---

## เช็คตัวเองว่าใช่รึยัง

- [ ] ตาราง CR + filter ประเภท/state ได้
- [ ] เปิด CR ใหม่พร้อมเลือก 4M type ได้
- [ ] CR detail แสดง gate timeline ได้
- [ ] PM กด approve แต่ละ gate ได้ + state อัปเดต
- [ ] state badge สีครบ 4 state
- [ ] mobile + error handling
- [ ] PR + screenshot

ทำเสร็จ = PM เปิดและติดตาม 4M Change ได้ครบวงจร ไม่ต้องใช้ Excel 🎉
