# FE-13 — Admin Panel (User & Role Management) ⚙️

**ระดับ:** ง่าย–กลาง | **น่าจะใช้เวลา:** 3–5 วัน

---

## ทำไมต้องทำงานนี้

ตอนนี้ถ้าจะเพิ่ม user หรือเปลี่ยน role ต้องแก้ database โดยตรง งานนี้ทำให้ Admin มีหน้าจัดการ user ได้เองโดยไม่ต้องขอ developer

## น้องจะได้ฝึกอะไร

- **CRUD ครบวงจร** — List / Create / Update / Delete
- **role-based access** — หน้านี้เห็นได้เฉพาะ ADMIN
- **confirmation dialog** — action ที่ย้อนไม่ได้ต้อง confirm ก่อน

## API ที่มีพร้อมใช้ (backend ✅)

```ts
GET    /api/auth/users           // รายการ user ทั้งหมด
POST   /api/auth/users           // สร้าง user ใหม่
PUT    /api/auth/users/:id       // แก้ไข user (role / สถานะ)
DELETE /api/auth/users/:id       // ลบ user
GET    /api/admin/audit-log      // ดู audit log (ใครทำอะไรเมื่อไหร่)
```

## ทำทีละขั้น

**ขั้น 1 — User List**
หน้า `#/admin/users` — ตาราง: ชื่อ / username / role / สถานะ (active/inactive)
- ADMIN เท่านั้นถึงเข้าได้ (ถ้า role ไม่ใช่ ADMIN → redirect กลับ)

**ขั้น 2 — สร้าง User ใหม่**
modal form: username, ชื่อ, role (dropdown: PM/STORE/QC/QA/TECH/PD/ADMIN), password เริ่มต้น
→ `POST /api/auth/users`

**ขั้น 3 — แก้ไข Role / สถานะ**
กดแถว → edit modal: เปลี่ยน role / toggle active-inactive
→ `PUT /api/auth/users/:id`

**ขั้น 4 — ลบ User**
ปุ่มลบ → **confirmation dialog** "ยืนยันลบ username นี้?" → `DELETE /api/auth/users/:id`

**ขั้น 5 — Audit Log**
หน้า `#/admin/audit-log` — ตาราง: เวลา / user / action / target
- filter ตาม user หรือ action type

---

## เช็คตัวเองว่าใช่รึยัง

- [ ] User list แสดงได้ + non-ADMIN เข้าไม่ได้
- [ ] สร้าง user ใหม่ได้ + assign role ได้
- [ ] แก้ role + toggle active/inactive ได้
- [ ] ลบ user มี confirmation dialog ก่อน
- [ ] ดู audit log ได้ + filter ได้
- [ ] PR + screenshot

ทำเสร็จ = Admin จัดการ user ได้เองไม่ต้องพึ่ง developer 🎉
