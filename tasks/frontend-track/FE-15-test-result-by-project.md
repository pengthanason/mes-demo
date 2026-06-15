# FE-15 — Test Result by Project (Jig Test Dashboard) 🧪

**ระดับ:** กลาง | **น่าจะใช้เวลา:** 5–6 วัน

---

## ทำไมต้องทำงานนี้

เวลาเปิด project ใหม่ เราสร้าง Jig test ใหม่ไปด้วย ผลทดสอบทุกชิ้นในสายการผลิตจะถูกส่งเข้า Jig-API — แต่ยังไม่มีหน้าดูรวมต่อ project PM/Engineer ต้องเข้าดู log ตรง ซึ่งยาก

> ⚠️ **หน้านี้เรียก Jig-API โดยตรง (port 3000) ไม่ใช่ MES backbone** — ต่างจาก task ก่อนหน้า เพราะ Jig-API เป็นระบบแยก รับผลจาก Jig device ที่หน้าไลน์

## น้องจะได้ฝึกอะไร

- **call API ต่าง base URL** — เรียน config `JIGAPI_URL` แยก
- **summary cards + chart** — pass rate, fail rate, trend
- **drill-down** — จาก summary → ดู records ราย unit

## API ที่มีพร้อมใช้ (Jig-API ✅)

```ts
// Base: http://<server>:3000  (หรือ /jig-api/ ผ่าน nginx)
GET /api/projects                              // list โปรเจกต์ทั้งหมด
GET /api/projects/:projectCode                 // project detail
GET /api/projects/:projectCode/records         // test records ทั้งหมด (pass/fail)
GET /api/projects/:projectCode/summary         // pass count / fail count / pass rate
GET /api/projects/:projectCode/timeseries      // ผล test เรียงตามเวลา (สำหรับ chart)
PUT /api/projects/:projectCode/records/:id     // แก้ผล (ADMIN)
```

## ทำทีละขั้น

**ขั้น 1 — Project List**
หน้า `#/jig-test` — card grid หรือตาราง project ทั้งหมด
- แต่ละ card: Project Code / ชื่อ / pass rate วันนี้ / สีตามผล (เขียว/แดง/เทา)

**ขั้น 2 — Project Dashboard**
หน้า `#/jig-test/:projectCode` — summary ของ project นี้:
- KPI cards: Total tested / Pass / Fail / Pass Rate %
- Line chart: pass rate ตามเวลา (จาก timeseries API)

**ขั้น 3 — Record Table**
ตาราง records ด้านล่าง: Serial / เวลา test / ผล PASS/FAIL / ค่าที่วัดได้
- filter: วันที่ / ผล PASS หรือ FAIL
- กด FAIL record → ดู detail ว่า parameter ไหนที่ fail

**ขั้น 4 — Retest Job**
ปุ่ม "สั่ง Retest" บน fail record → `POST /api/retest-job`
แสดงสถานะ job ที่สั่งไป

---

## เช็คตัวเองว่าใช่รึยัง

- [ ] Project list แสดงได้ + pass rate badge สีถูก
- [ ] Dashboard: KPI cards + line chart ต่อ project
- [ ] Record table: filter วันที่/ผลได้ + drill-down fail record
- [ ] เรียก Jig-API ถูก URL (ไม่ hardcode — ใช้ env var)
- [ ] Retest สั่งได้ + แสดงสถานะ
- [ ] PR + screenshot

ทำเสร็จ = Engineer ดูผล Jig test รวมต่อ project ได้ทันที ไม่ต้องเปิด log ตรง 🎉
