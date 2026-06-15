# FE-14 — Traceability (ติดตาม Unit/Serial ตลอด Flow) 🔍

**ระดับ:** กลาง–สูง | **น่าจะใช้เวลา:** 6–8 วัน

---

## ทำไมต้องทำงานนี้

เมื่อลูกค้า claim ว่าของมีปัญหา เราต้องตอบได้ว่า unit นี้ผ่านการทำอะไรมาบ้างตั้งแต่ต้น — scan ที่ station ไหน / ประกอบกับ part อะไร / ใส่กล่องไหน ถ้าไม่มีหน้านี้ต้องค้น log มือ ใช้เวลานาน

## น้องจะได้ฝึกอะไร

- **search + drill-down** — ค้น serial แล้วขยายดูรายละเอียด
- **timeline visualization** — แสดง event ตามเวลา
- **cross-module data** — รวมข้อมูลจากหลาย API มาแสดงในหน้าเดียว

## API ที่มีพร้อมใช้ (backend ✅)

```ts
// Jumbo Traceability (MES backbone)
GET /api/jumbo/trace/:serial         // timeline ของ serial นี้ตั้งแต่ต้น
GET /api/jumbo/serials               // list serials ทั้งหมด
GET /api/jumbo/assembly              // assembly records
GET /api/jumbo/packing/boxes         // packing/box records
GET /api/jumbo/packing/boxes/:boxId  // box detail + รายการ serial ในกล่อง
GET /api/jumbo/report/daily          // daily production report
GET /api/jumbo/export/csv            // export CSV
```

## ทำทีละขั้น

**ขั้น 1 — Search Bar**
หน้า `#/traceability` — ช่อง search กลางหน้า: พิมพ์หรือ scan serial number
→ กด search → ดึง `GET /api/jumbo/trace/:serial`

**ขั้น 2 — Serial Timeline**
แสดง timeline ของ serial นั้น:
```
[Assembly ✓] → [Packing ✓] → [Jig Test ✓] → [QC ✓] → [Shipped]
  10:23          11:05          11:40         13:20
```
- แต่ละ step: เวลา / operator / ผลลัพธ์ / หมายเหตุ

**ขั้น 3 — Box View**
หน้า `#/traceability/box/:boxId` — ดูว่ากล่องนี้มี serial อะไรบ้าง + status ของแต่ละตัว

**ขั้น 4 — Daily Report**
หน้า `#/traceability/report` — สรุปรายวัน: ผลิตกี่ชิ้น / pass กี่ / fail กี่ / export CSV

---

## เช็คตัวเองว่าใช่รึยัง

- [ ] Search serial → เจอ timeline ได้
- [ ] Timeline แสดง step ครบ + เวลาถูกต้อง
- [ ] ดู box contents ได้
- [ ] Daily report ดูได้ + ปุ่ม export CSV
- [ ] ถ้า serial ไม่เจอ → แสดง "ไม่พบ serial นี้" ชัดเจน
- [ ] mobile + error handling
- [ ] PR + screenshot

ทำเสร็จ = ตอบลูกค้าได้ทันทีว่า unit ผ่านอะไรมาบ้าง ไม่ต้องค้น log มือ 🎉
