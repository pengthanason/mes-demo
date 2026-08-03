# Syntech MES — Manufacturing Execution System

ระบบ MES (Manufacturing Execution System) ภายในของ **Synergy Technology Co., Ltd.** (โปรเจกต์ intern 2026)
ครอบคลุม production planning, work orders, kitting, production/routing scan, QC/rework, OBA,
notifications และ Jumbo traceability — มี React admin dashboard และเชื่อมต่อ jig-api / WMS / MRP

> SCM Cases (module 12) ถอดออกจากรีโปเมื่อ 2026-07-27 — ดูเหตุผลใน [STATUS.md](STATUS.md#scm-cases-ถูกถอดออก-2026-07-27)

---

## Architecture — ส่วนประกอบ

| ส่วน | Stack | Port | หน้าที่ |
| --- | --- | --- | --- |
| `frontend/` | Vite + React 18 + TS | 5101 | Admin / PM / tester UI (Dashboard, PP Gantt, Work Orders, Station monitor…) |
| `my-api/` | Express + `pg` | 5099 | Data API ให้ admin UI (WO/OBA/QC/PP/planning/station/workflow…) |
| `backend/` | Express + knex · 14 modules | 5100 | MES backbone เต็ม (auth, integrations, MQTT, Jumbo) |
| `postgres` | PostgreSQL 16 | 5432 | DB `productiondb` (schema `mes_core`) |

**Dev data flow:** Browser → Vite `:5101` → proxy → my-api `:5099` → PostgreSQL `:5432`
(บาง route backbone-only จะ proxy ไป `:5100`) · **Prod:** frontend build → เสิร์ฟที่ `/ui/` โดย backbone

---

## วิธีรัน (เหมือนกันทุกเครื่อง)

ต้องมี: **Docker Desktop** + **Node 20+**

**1) Backend ทั้งหมด** (DB + backbone + my-api) — รันที่ root ของโปรเจกต์:

```bash
docker compose up -d --build
```

ได้ครบ 3 service: postgres `:5432`, backbone `:5100`, my-api `:5099` (รัน `docker compose ps` เช็ก healthy)

**2) Frontend:**

```bash
cd frontend
npm install
npm run dev
```

เปิด `http://localhost:5101` · login (demo): `admin` / `member1` / `viewer1`

> แก้โค้ด backend ใน Docker: `docker cp` + `docker compose restart <service>` (ไฟล์ js/static ไม่ต้อง rebuild)

---

## Scripts ที่ใช้บ่อย

### frontend/

| คำสั่ง | ทำอะไร |
| --- | --- |
| `npm run dev` | dev server :5101 |
| `npm run build` | build → `dist/` (sync ไป `backend/public/ui` อัตโนมัติ) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Vitest (unit + Testing Library) |

### my-api/

| คำสั่ง | ทำอะไร |
| --- | --- |
| `npm run dev` | dev server :5099 (`node --watch`) — รันใน Docker ปกติ, ใช้อันนี้เวลารันนอก container |
| `npm start` | รันแบบ prod (ไม่ watch) |

---

## Environment

- **Backend / my-api:** `backend/envs/.env.{dev,test,prod,webtest}` — **gitignored** (ห้าม commit · ดู `.env.example`)
- **Frontend:** `frontend/.env.{development,production}` (`VITE_JIGAPI_URL`, `VITE_DEMO_MODE`)
- **DB (default ใน compose):** db `productiondb` · user `syntechdb` · port `5432` — **my-api ใช้ schema `public`** (26 ตาราง: users, work_orders, pp_projects, bom_lines …) ส่วน `backend` ใช้ schema `mes_core` แยกกันคนละ schema ในดาต้าเบสเดียวกัน (ห้ามสลับ ไม่งั้นตารางชนกัน)

> ⚠️ `pull`/`rebase` อาจลบไฟล์ `backend/envs/.env.*` (ถูก untrack) — **backup ก่อนทุกครั้ง**: `cp -a backend/envs backend/envs.bak`

---

## โครงสร้าง repo

```
syntech-intern-2026/
├── frontend/        Vite+React admin UI (Dashboard, PP Gantt, WO, Station…)
├── my-api/          Express data API (:5099) ให้ admin UI
│   ├── migrations.js         schema migration (additive, รันตอน boot)
│   ├── database_schema.sql   เอกสาร schema อ้างอิง (go-live)
│   └── routes/                wo.js, productionPlan.js, bom.js, admin.js …
├── backend/         MES backbone (:5100) — คนละแอป คนละ DB แยกทีมดูแล
├── docs/            setup / api-reference / overview / mes_web_test answers
├── docker-compose.yml
├── STATUS.md        สถานะล่าสุด + ประวัติ session
├── MES_DESIGN.md    architecture + integration spec
└── daily-reports/   daily report ของ intern
```

---

## เอกสารเพิ่มเติม

- [STATUS.md](STATUS.md) — สถานะล่าสุด + ประวัติ handoff
- [MES_DESIGN.md](MES_DESIGN.md) — architecture + integration
- [docs/mes-dev-setup.md](docs/mes-dev-setup.md) · [docs/mes-api-reference.md](docs/mes-api-reference.md) · [docs/mes-overview.md](docs/mes-overview.md)
- [my-api/database_schema.sql](my-api/database_schema.sql) — DB schema ของ `my-api` (เว็บเรา)

---
*Synergy Technology Co., Ltd. — Internal use only · Supervisor: Weradech K.*
