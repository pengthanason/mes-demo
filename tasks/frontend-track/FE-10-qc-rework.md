# FE-10 — QC Result & Rework Ticket 🔍

**ระดับ:** กลาง | **น่าจะใช้เวลา:** 4–6 วัน

---

## ทำไมต้องทำงานนี้

หลังผลิตเสร็จ QC ต้องบันทึกผลตรวจ — ถ้า FAIL ต้องเปิด rework ticket ให้ช่างซ่อม ถ้าไม่มีหน้านี้ QC ต้องโทรบอกปากเปล่า ไม่มีบันทึก ตามยาก

## น้องจะได้ฝึกอะไร

- **conditional form** — ฟอร์มเปลี่ยนตาม PASS/FAIL
- **linked records** — QC result → สร้าง rework ticket อัตโนมัติ
- เข้าใจ **QC flow** ในโรงงานจริง

## API ที่มีพร้อมใช้ (backend ✅)

```ts
POST /api/qc/result           // บันทึกผล QC (PASS/FAIL + หมายเหตุ)
POST /api/rework/repair       // เปิด rework ticket
POST /api/qc/transfer-verify  // QA verify ก่อนส่งมอบ
```

## ทำทีละขั้น

**ขั้น 1 — QC Result Form**
หน้า `#/qc/:woId` — ฟอร์มบันทึกผล QC:
- เลือก WO/lot
- จำนวนที่ตรวจ / จำนวน PASS / จำนวน FAIL
- ผล overall: PASS / FAIL / PARTIAL
- ถ้า FAIL หรือ PARTIAL → **บังคับใส่ defect description**
- กด Submit → `POST /api/qc/result`

**ขั้น 2 — Auto-open Rework (ถ้า FAIL)**
หลัง submit QC FAIL → ถามว่า "เปิด rework ticket เลยไหม?" → ถ้าใช่ → form เปิด rework:
- ระบุ defect type
- assign ช่างซ่อม
- กำหนดวันแก้เสร็จ
- `POST /api/rework/repair`

**ขั้น 3 — Transfer Verify**
หน้า `#/qa-verify/:reqId` — QA verify ก่อนส่งของออก:
- แสดงข้อมูล WO + QC result
- ปุ่ม APPROVE / REJECT + หมายเหตุ
- `POST /api/qc/transfer-verify`

**ขั้น 4 — mobile + error handling**

---

## เช็คตัวเองว่าใช่รึยัง

- [ ] บันทึกผล QC PASS/FAIL ได้
- [ ] ถ้า FAIL: บังคับใส่ defect description
- [ ] เปิด rework ticket ต่อจาก QC FAIL ได้ (ไม่ต้องกรอกซ้ำ)
- [ ] QA transfer-verify ได้
- [ ] PR + screenshot

ทำเสร็จ = QC บันทึกผลได้จริง + rework ตามได้ครบ ไม่ใช้กระดาษ 🎉
