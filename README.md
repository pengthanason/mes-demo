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

### backend/

| คำสั่ง | ทำอะไร |
| --- | --- |
| `npm run migrate:status` · `migrate:latest` · `migrate:rollback` | knex migrations |
| `npm run test:all` | e2e + jumbo + auth tests |

---

## Environment

- **Backend / my-api:** `backend/envs/.env.{dev,test,prod,webtest}` — **gitignored** (ห้าม commit · ดู `.env.example`)
- **Frontend:** `frontend/.env.{development,production}` (`VITE_JIGAPI_URL`, `VITE_DEMO_MODE`)
- **DB (default ใน compose):** db `productiondb` · user `syntechdb` · schema `mes_core` · port `5432`

> ⚠️ `pull`/`rebase` อาจลบไฟล์ `backend/envs/.env.*` (ถูก untrack) — **backup ก่อนทุกครั้ง**: `cp -a backend/envs backend/envs.bak`

---

## โครงสร้าง repo

```
syntech-intern-2026/
├── frontend/        Vite+React admin UI (Dashboard, PP Gantt, WO, Station…)
├── my-api/          Express data API (:5099) ให้ admin UI
├── backend/         MES backbone (:5100)
│   ├── modules/     00_auth … 13_jumbo (14 modules)
│   ├── migrations/  knex migrations
│   ├── schema.sql   full DB schema
│   └── envs/        .env.* (gitignored)
├── docs/            setup / api-reference / overview / mes_web_test answers
├── docker-compose.yml
├── STATUS.md        สถานะล่าสุด + ประวัติ session
├── MES_DESIGN.md    architecture + integration spec
└── daily-reports/   daily report ของ intern
```

---

## Git workflow

Remotes: `origin` (syntech-intern-2026) · `draft` (syntech_mes_draft) · `demo` (mes-demo)

- ทำงานบน branch **`develop`** · `git push` → `draft/develop`
- **ห้าม force push** (จะลบงานทีม) · diverged ให้ `rebase` ก่อน
- backup env ก่อน pull เสมอ (ดูหัวข้อ Environment)
- เปลี่ยนแปลงใหญ่ → เปิด **Pull Request** เข้า `main`

---

## เอกสารเพิ่มเติม

- [STATUS.md](STATUS.md) — สถานะล่าสุด + ประวัติ handoff
- [MES_DESIGN.md](MES_DESIGN.md) — architecture + integration
- [docs/mes-dev-setup.md](docs/mes-dev-setup.md) · [docs/mes-api-reference.md](docs/mes-api-reference.md) · [docs/mes-overview.md](docs/mes-overview.md)
- [backend/schema.sql](backend/schema.sql) — full DB schema

---
*Synergy Technology Co., Ltd. — Internal use only · Supervisor: Weradech K.*
