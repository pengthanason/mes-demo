# Deploy ขึ้น Production

สถาปัตยกรรม: **1 Docker image** = หน้าเว็บ + my-api เสิร์ฟรวมกัน URL เดียว (same-origin ไม่ต้องตั้ง CORS)

```
เบราว์เซอร์  →  my-api (:5099 · เสิร์ฟหน้าเว็บจาก /public)  →  PostgreSQL
```

---

# 🔑 ค่า env ที่ต้องใส่ (ก๊อปได้เลย)

| Key | Value | ถ้าไม่ใส่จะเป็นอะไร |
|---|---|---|
| `NODE_ENV` | `production` | stack trace รั่วออกหน้าเว็บ |
| `JWT_SECRET` | ค่าที่สุ่มไว้ (ดูด้านล่าง) | **แอปไม่สตาร์ท** (ตั้งใจให้พัง) |
| `DATABASE_URL` | connection string ของ DB จริง | **แอปไม่สตาร์ท** |
| `SEED_DEMO` | `false` | ได้บัญชี `admin/admin`, `member1/member1` อัตโนมัติ = ใครก็เข้าได้ |

**สุ่ม `JWT_SECRET` ใหม่สำหรับ prod** (ห้ามใช้ตัวเดียวกับ dev):
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
> ค่านี้เปลี่ยนทีหลัง = ทุกคนถูกเด้งออก → ตั้งครั้งเดียวแล้วเก็บให้ดี · **ห้าม commit**

ไม่บังคับ: `JWT_TTL` (default `8h`) · `CORS_ORIGINS` (เว้นว่าง = same-origin ปลอดภัยสุด) · `PORT` (platform จัดให้)

---

# แบบ A — Render + Neon (คลาวด์ ฟรี)

### 1. สร้าง DB ที่ Neon
1. https://neon.tech → Sign up (Google ได้)
2. **Create Project** → ชื่อ `mes` → region **Singapore**
3. **Connection string** → ก๊อปแบบ **Pooled connection** เก็บไว้
   - หน้าตา: `postgresql://user:pass@ep-xxx-pooler.ap-southeast-1.aws.neon.tech/dbname?sslmode=require`

### 2. สร้างตาราง + admin คนแรก ⚠️ ห้ามข้าม
```bash
psql "<connection string จากขั้น 1>" -f my-api/database_schema.sql
```
ไฟล์เดียวได้ครบ 3 อย่าง: ตาราง 26 ตัว + index 21 ตัว + user `admin`

> **ทำไมห้ามข้าม:** ตั้ง `SEED_DEMO=false` แล้วแอปจะไม่สร้าง user ให้เลย → ไม่มีใครล็อกอินได้

### 3. Push โค้ดขึ้น Git
ตรวจว่ามีไฟล์: `Dockerfile` (root), `.dockerignore`, `my-api/` ทั้งโฟลเดอร์
> `.env` จะไม่ติดไปด้วย (gitignore กันแล้ว) — ค่า secret ไปใส่ที่ Render ในขั้นถัดไป

### 4. สร้าง Web Service
1. https://render.com → **New +** → **Web Service** → เชื่อม GitHub repo
2. ตั้งค่า:

| ช่อง | ค่า |
|---|---|
| Language / Runtime | **Docker** |
| Root Directory | (เว้นว่าง) |
| Dockerfile Path | `./Dockerfile` |
| Instance Type | Free |
| Name | ชื่อลิงก์ → `ชื่อนี้.onrender.com` ⚠️ **ห้ามมีคำ `mes-demo`** |

> ⚠️ ถ้าชื่อมีคำ `mes-demo` หน้าเว็บจะเข้าโหมดข้อมูลปลอมอัตโนมัติ (โค้ดเช็คจากชื่อโฮสต์)

3. **Environment** → **Add Environment Variable** ใส่ 4 ตัวจากตารางข้างบน
4. **Create Web Service** → รอ build ~3-5 นาที

---

# แบบ B — เซิร์ฟเวอร์บริษัท (Docker)

### 1. สร้างตาราง + admin
```bash
psql -U <user> -d productiondb -f my-api/database_schema.sql
```

### 2. สร้างไฟล์ `.env` ไว้ข้างๆ (ห้าม commit)
```
NODE_ENV=production
JWT_SECRET=<ค่าที่สุ่ม>
DATABASE_URL=postgres://user:pass@host:5432/productiondb
SEED_DEMO=false
```

### 3. build + run
```bash
docker build -t mes-app .
docker run -d --name mes-app --env-file .env -p 5099:5099 --restart unless-stopped mes-app
```

---

# ✅ เช็คหลัง deploy (ทำตามลำดับ)

```bash
# 1) แอปขึ้นไหม
curl https://<host>/api/health          # → {"status":"ok",...}

# 2) ต่อ DB ได้ไหม  ← ตัวสำคัญ
curl https://<host>/api/health/ready    # → {"status":"ok","db":"reachable"}
                                        #   ถ้าได้ 503 = DB ต่อไม่ได้ เช็ค DATABASE_URL

# 3) auth ทำงานไหม (ต้องได้ 401)
curl -o /dev/null -w "%{http_code}\n" https://<host>/api/admin/users   # → 401
```

**4) ดู log ตอน start** ต้องเห็น:
```
[migrate] all tables ready
[start] migrations done
```
- ถ้าเห็น `[migrate] attempt n/5 failed` → ยังไม่ได้รัน `database_schema.sql` (ขั้นที่ 2)
- ถ้าเห็น warning เรื่อง `JWT_SECRET` dev → ยังไม่ได้ตั้ง `JWT_SECRET`

**5) เปิดเว็บ → ล็อกอิน `admin` / `admin` → เปลี่ยนรหัสทันที** (Admin Panel → แก้ผู้ใช้)

**6) สร้าง user จริงให้ทีม** แล้วกำหนดสิทธิ์ (ADMIN / MEMBER / VIEWER)

---

# ⚠️ เรื่องที่ต้องรู้

- **รหัส admin เริ่มต้น = `admin`** → เปลี่ยนทันทีหลังล็อกอินครั้งแรก (ระบบยังไม่บังคับให้เปลี่ยน)
- **Render ฟรีจะ "หลับ"** ถ้าไม่มีคนใช้ 15 นาที → ครั้งแรกช้า ~30 วิ (ข้อมูลไม่หาย)
- **Neon ฟรี** auto-suspend ตอนไม่ใช้ แต่ตื่นเองตอนเรียก — ข้อมูลอยู่ถาวร
- **token อายุ 8 ชม.** → หมดแล้วต้องล็อกอินใหม่ (ปรับด้วย `JWT_TTL`)
- **VIEWER แก้ข้อมูลไม่ได้** ทุกกรณี (อ่านอย่างเดียว) — ถ้าต้องแก้ ให้เปลี่ยน role เป็น MEMBER
- **ยังไม่มีระบบ backup** → ตั้ง `pg_dump` ตามรอบเอง แล้วลอง restore 1 ครั้งก่อนเปิดใช้จริง
```bash
pg_dump "<connection string>" > backup-$(date +%F).sql
```

---

# หมายเหตุ: Vercel demo คนละตัว
Vercel = demo โชว์หน้าตา (ข้อมูลหาย รีเฟรชแล้วรีเซ็ต) ปล่อยไว้ได้ ไม่ต้องแตะ
ตัว prod นี้คือของจริงที่ข้อมูลอยู่ถาวร แยกกันคนละระบบ
