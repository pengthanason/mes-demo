# MES Dev Setup Guide

## 1. Clone repos

```bash
# Backend + Vite frontend (งานหลัก)
git clone https://github.com/Weradech/syntech_mes_draft.git
cd syntech_mes_draft

# Next.js Operator UI (ถ้าทำ Task A)
git clone https://github.com/Weradech/syntech_mes_web.git
```

## 2. Setup Backend

```bash
cd syntech_mes_draft/backend
cp .env.example .env   # ขอค่าจาก supervisor
npm install
npm run migrate:latest  # รัน DB migrations
npm run dev             # start dev server :5100
```

### .env ที่ต้องมี (ขอจาก supervisor)

```env
DATABASE_URL=postgresql://...
JIG_API_URL=http://172.16.10.87:3000
WMS_API_URL=http://172.16.10.87:8000
MRP_API_URL=http://172.16.10.87:8001
JWT_SECRET=...
MES_CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```

## 3. Setup Frontend (Vite)

```bash
cd syntech_mes_draft/frontend
npm install
npm run dev   # start dev server :5173
```

## 4. Setup Next.js Operator UI (Task A เท่านั้น)

```bash
cd syntech_mes_web
npm install
cp .env.local.example .env.local
npm run dev   # start dev server :3000
```

## 5. Test API ด้วย curl

```bash
# Health check
curl https://172.16.10.87/mes-api/api/mes/health

# Login (ขอ test credentials จาก supervisor)
curl -X POST https://172.16.10.87/mes-api/api/mes/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","pin":"0000"}'
```

## 6. Git Workflow

```bash
# สร้าง branch ใหม่จาก main เสมอ
git checkout main && git pull
git checkout -b feat/<task-name>

# Commit
git add .
git commit -m "feat: ..."

# Push และเปิด PR
git push origin feat/<task-name>
# เปิด PR บน GitHub → รอ review จาก supervisor
```

## Database Access (read-only dev)

ขอ DB credentials จาก supervisor สำหรับ dev environment
Schema หลัก: `mes_core`

```sql
-- ดู tables ทั้งหมด
\dt mes_core.*

-- tables ที่ใช้บ่อย
SELECT * FROM mes_core.work_orders LIMIT 5;
SELECT * FROM mes_core.mes_sync_log LIMIT 10;
SELECT * FROM mes_core.jig_test_results LIMIT 10;
```