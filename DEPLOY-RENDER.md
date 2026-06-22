# Deploy: Render + Neon (ฟรี + ข้อมูลไม่หาย)

สถาปัตยกรรม: **1 Docker image** = หน้าเว็บ (โหมดจริง) + my-api เสิร์ฟรวมกัน URL เดียว
ฐานข้อมูล Postgres อยู่ที่ **Neon** (ฟรี ถาวร)

```
เบราว์เซอร์  →  Render Web Service (my-api + เว็บ)  →  Neon (Postgres)
```

---

## ขั้นที่ 1 — สร้าง Database ที่ Neon
1. ไป https://neon.tech → Sign up (ล็อกอินด้วย Google ได้)
2. **Create Project** → ตั้งชื่อ (เช่น `mes`) → เลือก region ใกล้ๆ (Singapore)
3. หน้า Dashboard → **Connection string** → ก๊อปแบบ **"Pooled connection"**
   - หน้าตา: `postgresql://user:pass@ep-xxx-pooler.ap-southeast-1.aws.neon.tech/dbname?sslmode=require`
   - **เก็บไว้** เดี๋ยวเอาไปใส่ Render

> ตารางทั้งหมดสร้างเองอัตโนมัติตอนรันครั้งแรก (migrations.js) — ไม่ต้องสร้างมือ

---

## ขั้นที่ 2 — Push โค้ดขึ้น Git
ไฟล์ใหม่ที่ต้องมีใน repo (เค้าเตรียมให้แล้ว):
- `Dockerfile` (ที่ root)
- `.dockerignore`
- `my-api/server.js` (แก้ให้เสิร์ฟหน้าเว็บแล้ว)

push ขึ้น remote **demo** ตามปกติ (อย่าลืม commit ไฟล์ใหม่พวกนี้ด้วย)

---

## ขั้นที่ 3 — สร้าง Web Service ที่ Render
1. ไป https://render.com → **New +** → **Web Service**
2. เชื่อม GitHub repo (`mes-demo`)
3. ตั้งค่า:
   | ช่อง | ค่า |
   |---|---|
   | **Language / Runtime** | **Docker** |
   | **Root Directory** | (เว้นว่าง) |
   | **Dockerfile Path** | `./Dockerfile` |
   | **Instance Type** | **Free** |
   | **Name** | ตั้งชื่อลิงก์ → `ชื่อนี้.onrender.com` |
4. **Environment Variables** (กด Add):
   | Key | Value |
   |---|---|
   | `DATABASE_URL` | (connection string จาก Neon ขั้นที่ 1) |
   | `SEED_DEMO` | `true` = ใส่ข้อมูลตัวอย่างให้ดูก่อน / `false` = กระดานเปล่า |
5. (ไม่ต้องตั้ง `PORT` — Render จัดให้เอง, server.js อ่าน `process.env.PORT`)
6. **Create Web Service** → รอ build ~3-5 นาที

เสร็จแล้วเปิด `https://ชื่อที่ตั้ง.onrender.com` → ใส่ข้อมูล รีเฟรช/ปิดเปิด **ข้อมูลไม่หาย** ✅

---

## ⚠️ เรื่องที่ต้องรู้
- **ครั้งแรกช้า ~30 วิ** ถ้าไม่มีคนใช้ 15 นาที Render จะ "หลับ" (ฟรีเป็นงี้) — ข้อมูลไม่หายนะ แค่ตื่นช้า
- **รหัสผ่านเริ่มต้น** = ชื่อผู้ใช้ (admin/admin, member1/member1, viewer1/viewer1)
  → URL นี้เปิดสาธารณะ **ควรเข้าไปเปลี่ยนรหัส admin ทันที** หลัง deploy
- Neon ฟรี: DB จะ auto-suspend ตอนไม่ใช้ แต่ตื่นเองตอนเรียก **ข้อมูลอยู่ถาวร**
- ทดสอบ API: เปิด `https://...onrender.com/api/health` → ควรเห็น `{"status":"ok"}`

---

## เปลี่ยน demo (Vercel/MSW) → ของจริง?
ไม่ต้องแตะ Vercel — อันนั้นเป็น demo โชว์หน้าตา (ข้อมูลหาย) ปล่อยไว้ได้
ตัว Render นี้คือ "ของจริง" ที่ข้อมูลอยู่ถาวร แยกกันคนละตัว
