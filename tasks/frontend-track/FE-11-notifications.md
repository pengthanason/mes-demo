# FE-11 — Notification Center 🔔

**ระดับ:** ง่าย–กลาง | **น่าจะใช้เวลา:** 3–4 วัน

---

## ทำไมต้องทำงานนี้

ระบบส่ง event ต่างๆ ตลอดเวลา (WO ใหม่ / QC FAIL / rework เสร็จ) แต่ยังไม่มีหน้าดู notification — operator ไม่รู้ว่ามีงานรอตัวเองอยู่

## น้องจะได้ฝึกอะไร

- **polling หรือ SSE** — รับข้อมูลใหม่จาก server แบบ real-time
- **unread badge** — นับ unread ที่ icon
- **mark as read** — กดแล้ว state เปลี่ยน

## API ที่มีพร้อมใช้ (backend ✅)

```ts
GET  /api/notifications        // รายการ notifications ของ user นี้
POST /api/notifications/:id/read  // mark as read
GET  /api/notifications/unread-count  // จำนวน unread (สำหรับ badge)
```

## ทำทีละขั้น

**ขั้น 1 — Notification Bell (ทุกหน้า)**
- Icon 🔔 ที่ navbar ขวาบน
- แสดง unread count badge (เช่น "3")
- กดเปิด dropdown รายการ 5 อัน ล่าสุด

**ขั้น 2 — Notification List Page**
หน้า `#/notifications` — รายการทั้งหมด:
- แบ่ง UNREAD / ALL
- แต่ละรายการ: icon type / ข้อความ / เวลา
- กดแล้ว mark as read + ไป link ที่เกี่ยวข้อง (เช่น กด WO notification → ไปหน้า WO นั้น)

**ขั้น 3 — Auto-refresh**
- poll unread count ทุก 30 วินาที (ไม่ต้อง reload หน้า)
- badge อัปเดตเองเมื่อมีของใหม่

---

## เช็คตัวเองว่าใช่รึยัง

- [ ] Bell icon มี unread badge
- [ ] Dropdown แสดง 5 รายการล่าสุดได้
- [ ] หน้า notification list ดูทั้งหมดได้ + filter unread/all
- [ ] กดแล้ว mark as read + badge ลด
- [ ] auto-refresh unread count ทุก 30s
- [ ] PR + screenshot

ทำเสร็จ = operator รู้ทันทีว่ามีงานรอตัวเอง ไม่พลาด 🎉
