# SYNTECH MES Backbone (Station 2)

Node.js + Express + PostgreSQL backbone สำหรับ workflow MES 9 ขั้น + notification flow โดยไม่ทับระบบ WMS เดิม

## Included Deliverables
1. `mes_backbone/schema.sql`
2. `mes_backbone/server.js`
3. `mes_backbone/utils/validator.js`
4. `mes_backbone/controllers/production.controller.js`

## Module Folders (Step-by-Step)
1. `mes_backbone/modules/01_planning/`
2. `mes_backbone/modules/02_incoming/`
3. `mes_backbone/modules/03_wo_release/`
4. `mes_backbone/modules/04_kitting/`
5. `mes_backbone/modules/05_fai_machine/`
6. `mes_backbone/modules/06_production/`
7. `mes_backbone/modules/07_qc_rework/`
8. `mes_backbone/modules/08_qa_oba/`
9. `mes_backbone/modules/09_close/`
10. `mes_backbone/modules/10_notifications/`
11. Shared helpers:
- `mes_backbone/common/http.js`
- `mes_backbone/common/numbering.js`
- `mes_backbone/common/notifications.js`

## Quick Start
1. ติดตั้ง dependencies
```bash
cd mes_backbone
npm install
```
2. ตั้งค่า environment
```bash
# ตัวเลือก A: เริ่มจาก template กลาง
cp .env.example .env

# ตัวเลือก B: ใช้ profile ตาม environment
cp envs/.env.dev .env
# หรือ
cp envs/.env.test .env
# หรือ
cp envs/.env.prod .env
```
ถ้าจะยิงจากหน้า React dev server (`:5101`) ไป MES (`:5100`) โดยตรง ให้ตั้ง `MES_CORS_ORIGINS` เป็น allowlist ที่ชัดเจน
3. เตรียมฐานข้อมูล
```bash
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f schema.sql
```
3.1 (N+1 scaffold) เตรียม migration tooling (Knex)
```bash
# install once
npm install --save-dev knex

# status / apply / rollback
npm run migrate:status
npm run migrate:latest
npm run migrate:rollback
```
ดูรายละเอียดที่ `mes_backbone/migrations/README.md`
4. รันเซิร์ฟเวอร์
```bash
npm start
```

4.1 สร้าง/อัปเดต UI bundle ที่ backbone เสิร์ฟจาก `/ui`
```bash
cd ../frontend
npm run build
```
หมายเหตุ:
- build จะ sync ไฟล์ไปที่ `backend/public/ui` อัตโนมัติ
- ตอนพัฒนาใช้ Vite dev server ที่ `:5101` และ proxy `/api` ไปที่ `:5100`

5. รัน integration/e2e test (DB flow จริง)
```bash
docker compose -f ../docker-compose.test-db.yml up -d
npm run test:e2e
```
หมายเหตุ:
- test runner จะ preload ค่าใน `envs/.env.test` ก่อน เพื่อแยกจาก `.env` runtime
- test DB default คือ `127.0.0.1:15432` (`mes_test` / `syntechdb` / `change_me`)
- test จะสร้าง schema แยกชั่วคราวผ่าน `DB_SCHEMA` และลบทิ้งอัตโนมัติเมื่อจบ
- ใช้ connection ตาม `DB_*` ใน env ปัจจุบัน

6. รัน test ชุดย่อยเพิ่มเติม
```bash
npm run test:smoke
npm run test:pm-scm
npm run test:jumbo:routes
npm run test:jumbo:static
npm run test:all
```

7. ตรวจ Ops endpoints
```bash
curl http://127.0.0.1:5100/api/mes/health
curl http://127.0.0.1:5100/api/mes/ready
curl http://127.0.0.1:5100/api/mes/metrics
curl http://127.0.0.1:5100/api/mes/routes/catalog
```
หมายเหตุ:
- `/api/mes/ready` ตรวจ DB reachability + env guard (`MES_ENV`, `MES_PROD_DB_HOST`, `MES_PROD_DB_NAME`)
- ถ้า `MES_ENV=prod` ระบบบังคับ `MES_AUTH_MODE=jwt` มิฉะนั้น `/api/mes/ready` ตอบ `not_ready`
- `/api/mes/metrics` แสดง uptime + request counters
- `/api/mes/routes/catalog` คืน route master + step/station catalog ที่หน้า Module 06 ใช้อ่าน station จริงจาก DB

8. Auth mode (GAP-04 phase 1)
- `MES_AUTH_MODE=header` : ใช้ header role แบบเดิม (`X-User-Role`, `X-User-Id`)
- `MES_AUTH_MODE=hybrid` : รองรับทั้ง JWT (`Authorization: Bearer ...`) และ header fallback
- `MES_AUTH_MODE=jwt` : บังคับ JWT สำหรับ protected endpoints
- `MES_READY_STRICT=true` : เพิ่ม strict readiness gate (บังคับ non-wildcard CORS + `DB_SSLMODE=require` + `MES_AUTH_MODE=jwt`)
- ถ้าใช้ `hybrid` หรือ `jwt` ต้องตั้ง `MES_JWT_SECRET` ความยาวอย่างน้อย 32 ตัวอักษร
- Session policy (recommended):
  - `MES_MAX_CONCURRENT_SESSIONS=3` (จำกัด active session ต่อ user)
  - `MES_SESSION_INACTIVITY_SEC=1800` (session timeout เมื่อไม่มี activity เกิน 30 นาที)
- Auth API:
  - `POST /api/mes/auth/login`
  - `POST /api/mes/auth/refresh`
  - `POST /api/mes/auth/logout`
  - `GET /api/mes/auth/me`

9. Notification flow API (GAP-02)
- `GET /api/notifications/inbox`
- `POST /api/notifications/:notificationId/ack`
- `POST /api/notifications/publish`

10. Routing station notes
- `POST /api/routing/scan-in` รองรับ `route_code` เพิ่มเติมสำหรับ initial scan เพื่อระบุ route ให้ชัดเมื่อมีหลาย route ใช้ station ซ้ำกัน
- `POST /api/routing/scan-out` รองรับ `route_code` เช่นกัน และจะ reject ถ้า route ที่ส่งมาไม่ตรงกับ route ที่ unit ถูก bind อยู่
- แนะนำให้ UI โหลด station จาก `GET /api/mes/routes/catalog` แทน hardcode station list

## Notes
1. สถานะนี้คือ Backbone API layer สำหรับ Station 2 (ยังไม่ใช่ UI สมบูรณ์ทุกหน้า)
2. ถ้า `MES_AUTH_MODE=header` หรือ `hybrid` สามารถใช้ header ชุดนี้เพื่อ role gate:
- `X-User-Id: <numeric>`
- `X-User-Role: PM|STORE|QC|QA|TECH|PD|ADMIN`
3. FAI gate ใช้ dual-key (`QA` และ `PD/ADMIN`) และบล็อก `RUN_START` ถ้า WO ยังไม่ `RUNNING`
