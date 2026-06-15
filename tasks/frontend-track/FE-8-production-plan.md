# FE-8 — Production Plan Dashboard (PM View) 📋

**ระดับ:** กลาง | **น่าจะใช้เวลา:** 5–7 วัน

---

## ทำไมต้องทำงานนี้

ตอนนี้ operator กดทำงานได้แล้ว (FE-7) แต่ **PM ยังไม่มีหน้าวางแผน** ก่อนจะมี WO ได้ ต้องมีคนสร้าง Pre-WO request ก่อน → approve BOM → ถึงปล่อย WO ลงไลน์ได้ งานนี้คือหน้า "ห้องควบคุม" ของ PM

## น้องจะได้ฝึกอะไร

- ทำ **table + filter + pagination** ที่ดึงข้อมูลจาก backend จริง
- **approval flow** — ปุ่มกดต้องเปลี่ยน state และ reload
- **role-based UI** — PM เห็น action ที่ operator ไม่เห็น

## API ที่มีพร้อมใช้ (backend ✅)

```ts
GET  /api/wo/list          // รายการ WO ทั้งหมด + status
GET  /api/wo/:woId         // รายละเอียด WO
POST /api/wo/req           // สร้าง Pre-WO request
GET  /api/wo/req/list      // รายการ Pre-WO requests
POST /api/wo/convert       // convert Pre-WO → WO จริง (PM/ADMIN)
GET  /api/bom/headers      // รายการ BOM
GET  /api/bom/:bomId/review // review BOM รายละเอียด
PUT  /api/bom/:bomId/approve // approve BOM (PM/ADMIN)
```

## ทำทีละขั้น

**ขั้น 1 — WO List (หน้าหลัก)**
หน้า `#/production-plan` — ตาราง WO ทั้งหมด แสดง: WO No. / ชื่อ product / qty / status / วันที่

- filter ตาม status (PENDING / IN_PROGRESS / DONE)
- กดแถวดู detail

**ขั้น 2 — Pre-WO Request Form**
ปุ่ม "สร้าง WO ใหม่" → form: เลือก BOM, ใส่ qty, วันที่ต้องการ → `POST /api/wo/req`

**ขั้น 3 — BOM Review & Approve**
หน้า `#/bom/:bomId` — ตาราง BOM line items + ปุ่ม Approve (PM เท่านั้น)
- ถ้า approved แล้ว ปุ่มเป็น disabled + แสดง "Approved ✓"

**ขั้น 4 — Convert Pre-WO → WO**
Pre-WO ที่ approved BOM แล้ว → ปุ่ม "ปล่อย WO ลงไลน์" → `POST /api/wo/convert`

**ขั้น 5 — mobile-first + error handling**

---

## เช็คตัวเองว่าใช่รึยัง

- [ ] ตาราง WO แสดงได้ + filter status ได้
- [ ] สร้าง Pre-WO request ได้
- [ ] BOM review ดูรายการได้ + Approve ได้ (PM)
- [ ] Convert Pre-WO → WO ได้
- [ ] ใช้ `lib/operatorApi.ts` หรือ `lib/planningApi.ts` ที่รวม fetch ไว้
- [ ] mobile 360px + error/loading state ทุกปุ่ม
- [ ] PR + screenshot

ทำเสร็จ = PM วางแผน WO ได้ครบวงจรโดยไม่ต้องแตะ backend โดยตรง 🎉
