# Syntech MES -- Status & Handoff
> อัปเดต: **2026-04-24** Session 89-CTO | Server: 172.16.10.87 | Container: syntech_mes_draft-mes_backbone-1

## 2026-04-24 Session 89-CTO (Cross-Squad Data Flow Validation) — CLAUDY orchestrate 4 squads

- **Trigger**: หัวหน้าสั่ง "ห่วง MES...ทุกคนไปทำงานด้วยกัน ข้อมูลมันต้อง Flow"
- **Squad dispatch**: INFRA (DB+SSL) · MESA (H10+H11) · WALAI (WMS verify) · MANA (MRP verify) — parallel
- **Critical Blockers ปิด 3/3**:
  - B1: `wms_client.js:128` — `movement_type` → `type` (WMS expect `type` field, ทุก GI/GR เคย 422)
  - B2: MRP password `mrp@syntech` อยู่ใน blacklist → `mes_mrp_svc_2026!` (MRP .env + MES docker-compose)
  - B3: `mrp_client.js:108` — `page_size=200` → `limit=200` (MRP router ใช้ `limit`)
- **Bug fixes**:
  - H10: `db.js:26-28` pool `min:2, max:10, idleTimeout:10s` (ลดจาก max:20, idle:30s)
  - H11: `server.js:687-712` auth rate limiter `/api/auth/login` + `/api/auth/refresh` = 10 req/min per IP
- **Deploy**: rebuild backbone image `d1706095f373` + restart MRP → all 3 services healthy
- **Smoke 7/7**: MRP healthz OK · WMS healthz OK · Jig 3027 records · listBoms 5 · getBom 35 lines · createProdOrder OK · postGI ผ่าน validation
- **Odoo Integration**:
  - PD02 auth OK UID=17 via XML-RPC
  - Pull Items: 2,298 updated จาก Odoo
  - Pull Suppliers: 720 updated จาก Odoo
  - `ODOO_SYNC_ENABLED=true` + `DRY_RUN=true` (log only, ยังไม่ write Odoo จริง)
- **Data Flow สถานะ**: MES→WMS ✅ · MES→MRP ✅ · MES→Jig ✅ · WMS→Odoo ✅ DRY_RUN · Odoo→WMS ✅ pulled
- **ยังเปิด**: GR REC Odoo writeback · SSL/auth strict · WH-RD picking types · Customer/Location/Analytic pull · Pull API endpoint

## 2026-04-24 Session 86 (MES HTTPS reverse proxy) — Next.js via `https://172.16.10.87/mes-api/web/`

- **Trigger**: หัวหน้าบอก "ไปทดสอบดีๆ ก่อน ไม่เห็นเปิดได้" — client-side browser ของหัวหน้าเปิด port 3005 ไม่ได้ (น่าจะ firewall block non-443 ports หรือ HTTPS-only policy)
- **Diagnosis**: server-side ทุก smoke 200 (internal + external :3005 + HSTS header ไม่มี) = client/network issue
- **Solution**: reverse proxy Next.js ผ่าน MES backbone → ใช้ nginx /mes-api/ path เดียวกับ /mes-api/ui/ ที่ใช้ได้แล้ว = HTTPS port 443 + cert
- **Changes 4 files**:
  - [backend/server.js](backend/server.js) — built-in `http` proxy `/web/*` → `:3005`, prepend `/mes-api/web` prefix before forwarding, trailing-slash normalized, x-forwarded headers, 502 on error
  - `syntech_mes_web/next.config.mjs` — `basePath: '/mes-api/web'`
  - `syntech_mes_web/lib/api.ts` — smart base: `pathname.startsWith('/mes-api/')` → `/mes-api/api`, else `/api`
  - `syntech_mes_web/app/page.tsx` — Jumbo tile href → `/mes-api/web/jumbo/index.html` (bypass Next.js trailing-slash redirect for static dir)
- **Rebuild**: backend + mes_web images (~25s total downtime)
- **Smoke 12/12 green via HTTPS external**:
  - `/mes-api/web` + `/mes-api/web/` = 200
  - `/login` `/kitting` `/production` `/qc` `/incoming` = 200
  - `/jumbo/index.html` = 200 (+ css/js/vendor 200)
  - `/_next/static/css/*.css` = 200 (asset paths emitted via basePath)
  - `/mes-api/api/mes/health` = 200
  - `/mes-api/ui/` = 200 (Vite regression)
  - `/jumbo/` = 200 (legacy regression)
- **Dual access**:
  - **HTTPS canonical** (firewall-friendly): `https://172.16.10.87/mes-api/web/`
  - **Direct LAN**: `http://172.16.10.87:3005/mes-api/web/` (basePath เดียวกัน)
- **Arch**: nginx:443 → backbone:5100 (API + /ui/ Vite + /jumbo/ legacy + /web/* proxy) → mes_web:3005 (Next.js basePath=/mes-api/web)

## 2026-04-24 Session 86 (MES op UI) — Operator UI 1 → 4 pages + AuthGuard

- **Trigger**: หัวหน้าสั่ง "วางแผนมาทำเลย" หลังสรุปงาน MES ที่เหลือ
- **Components**:
  - `components/auth-guard.tsx` — session check + redirect /login + pre-expiry refresh (<2 min) + /me validate
  - `components/operator-shell.tsx` — shared header (back + code + role badge + title)
- **Pages built** (3 new + 1 refactor):
  - `/kitting` (M04) — WO ID → GET /wo/{id} (wo + bom_snapshot) → UID scan → POST /store/issue · issued list 10
  - `/production` (M06) — tabs Start Unit / Routing · WO+SN+Station R1-R13 dropdown · POST /production/start-unit หรือ /routing/scan-{in,out}
  - `/qc` (M07) — SN input + PASS/FAIL large buttons → POST /qc/result
  - `/incoming` (M02) — refactor ใช้ AuthGuard + OperatorShell pattern
- **Landing tiles**: flip M04/M06/M07/Auth → live · 7 tiles (6 live + M09 coming)
- **Build**: local 9 static pages typecheck clean · docker image `6e6e0ba020fd` healthy 34s
- **Smoke 10/10 green**:
  - `/` `/login` `/incoming` `/kitting` `/production` `/qc` = 200
  - `/jumbo/` 308 → `/jumbo/index.html` 200
  - `/api/mes/health` 200
  - External `http://172.16.10.87:3005/` = 200
- **MES coverage**:
  - Backend: 14/14 modules LIVE
  - Next.js operator UI: **5 pages + Jumbo** (M00 Auth + M02 + M04 + M06 + M07 + M13)
  - M09 Close: placeholder
  - M01/03/05/08/10/11/12: Vite `/ui/` interim (PM/SCM/tester)
- **Access URLs**:
  - **Next.js operator** (new): http://172.16.10.87:3005/ + /kitting + /production + /qc + /incoming + /login + /jumbo/
  - **Vite admin**: https://172.16.10.87/mes-api/ui/
  - **Jumbo legacy**: https://172.16.10.87/jumbo/ (still works)

## 2026-04-24 Session 86 (MES-UI + Jumbo) — Jumbo รวมเข้า Next.js · MES = 1 app

- **Trigger**: หัวหน้าสั่ง "เอา Jumbo มารวมกัน ซะ เพราะ Jumbo คือ 1 Project"
- **Audit**: Jumbo = 5 files / 6.5MB — index.html + css/style.css + js/app.js + vendor/sweetalert2 + vendor/qrcode · API base รองรับ relative `['','/mes-api']` · asset refs relative → mount ที่ไหนก็ใช้งานได้
- **Integration**:
  - `cp -r` 5 files → `/home/ball/syntech_mes_web/public/jumbo/` (Next.js auto-serves `public/`)
  - `app/page.tsx` +Jumbo tile M13 (external=true → `<a>` ไม่ใช่ `<Link>`) · landing grid 7 tiles · badge live
- **Rebuild**: image `82826f8d2d43` · recreate healthy 30s
- **Smoke 8/8 green**:
  - landing 200 (มี "Jumbo Station" + M13 + /jumbo/)
  - /jumbo/ 308 → /jumbo/index.html 200
  - assets 200: /jumbo/css/style.css · /jumbo/js/app.js · /jumbo/vendor/qrcode.min.js
  - /api/mes/health 200 JSON (same-origin = Jumbo API calls work end-to-end)
  - external :3005/jumbo/ 308 (LAN accessible)
- **Backend /jumbo/ legacy mount**: left intact in `backend/server.js` for backward-compat (station tablets with cached `https://172.16.10.87/jumbo/` bookmark keep working)
- **Access URLs**:
  - **Primary (new)**: http://172.16.10.87:3005/ (landing) · http://172.16.10.87:3005/jumbo/
  - **Legacy Jumbo**: https://172.16.10.87/jumbo/ (still works via MES backbone)
  - **Vite admin/tester**: https://172.16.10.87/mes-api/ui/

## 2026-04-24 Session 86 (MES-UI deploy) — Next.js `syntech_mes_web` LIVE at :3005

- **Trigger**: หัวหน้าสั่ง "ถ้า Deploy แยกได้แล้วให้ทำเลย"
- **Pre-check**: port 3005 free (scanned via `ss -tlnp`)
- **Artifacts**:
  - `/home/ball/syntech_mes_web/docker-compose.yml` — standalone service, `network_mode: host`, healthcheck
  - Dockerfile += `apk add wget` + `ENV HOSTNAME=0.0.0.0`
- **Build**: `docker compose build mes_web` (87s, image `823aad269ecd`)
- **Up**: healthy in 21s
- **Smoke (internal)**:
  - `http://127.0.0.1:3005/` = 200 (title "Syntech MES | Shop Floor")
  - `/login` = 200
  - `/incoming` = 200
  - `/api/mes/health` = 200 with valid JSON (Next.js rewrite → MES backbone works)
- **External**: `http://172.16.10.87:3005/` = 200 (port 3005 open on LAN)
- **Nginx HTTPS**: `/mes-web/` currently falls back to portal — need IT to add `proxy_pass http://127.0.0.1:3005/` for HTTPS access (root required)
- **Containers now**:
  - `syntech_mes_draft-mes_backbone-1` (5100) — Express API + `/ui/` Vite SPA + `/jumbo/`
  - `syntech_mes_web` (3005) — Next.js operator UI
- **Access URLs**:
  - **http://172.16.10.87:3005/** — Next.js operator UI (landing / login / incoming M02 pilot)
  - **https://172.16.10.87/mes-api/ui/** — Vite admin/tester UI

## 2026-04-24 Session 86 (MES-UI) — Vite UI LIVE at /ui/ + Next.js scaffold ready

- **Trigger**: หัวหน้าถาม "UI MES เรามีแล้วหรอ พร้อมหรือยัง" → audit พบ React+Vite orphan หลายจุด → หัวหน้าตอบ "ก+ค" (interim fix + Next.js scaffold)
- **(ก) Vite+React at `/home/ball/syntech_mes_draft/frontend/` — LIVE**:
  - Fixed App.jsx (HashRouter + 8 routes + named imports)
  - Added stubs: `BomEditorPage.tsx`, `WebCheckPage.tsx`, `lib/api.ts`, `lib/format.ts`
  - Installed `react-router-dom@6`, `@tanstack/react-query@5`, `typescript`
  - Vite build → dist 267KB (gz 80KB, 1412 modules)
  - `backend/server.js` +`/ui` express.static + SPA fallback + cache-control
  - `docker cp` + `docker compose restart mes_backbone` (~8s downtime, no image rebuild)
  - **Access URLs**:
    - Internal: `http://127.0.0.1:5100/ui/`
    - External: `https://172.16.10.87/mes-api/ui/` (hash routes: `#/mes-backbone`, `#/pm-core-flow`, `#/scm-cases`, `#/bom-editor`, `#/web-check`, `#/qc-board`, `#/mes-auth`)
  - **Smoke 8/8**: health 200 · /ui/ 200 · assets 200 · SPA fallback 200 · external 200 · jumbo regression 200
- **(ค) Next.js scaffold at `/home/ball/syntech_mes_web/` — build-ready, not deployed**:
  - 13 files: package.json · next.config.mjs · tsconfig · postcss · app/globals.css · app/layout.tsx · app/page.tsx · app/login/page.tsx · app/incoming/page.tsx · lib/api.ts · lib/operator-identity.ts · Dockerfile · README
  - Next 15 + React 18 + Tailwind v4 + Sonner + Zod
  - Pilot M02 Incoming scan page (autofocus + recent list + POST /api/store/receive)
  - `npm run build` → 6 static pages, First Load JS 102-118KB, typecheck clean
  - Storage keys `syntech.mes.*` (distinct from WMS `syntech.wms.*`)
- **Strategy**: Vite `/ui/` = dev/admin/tester/PM/SCM flows (now) · Next.js web = operator shop floor (future, mobile-first 360px scan-first) · Vite sunset when Next.js covers operator modules M02/04/06/07/09

## 2026-04-24 Session 85e — Migration backlog cleared (5/5 pending applied · no downtime)
- **Trigger**: หัวหน้าสั่ง "เข้าไปลุยงานใน MES ให้ที ซิ"
- **Pre-state**: `migrate:status` → 4 Completed / 5 Pending ค้างตั้งแต่ 04-10 → 04-21
- **Pending files applied (Batch 2)**:
  1. `20260410_outbox_columns.js` — `mes_sync_log.attempts` + `max_attempts` (idempotent IF NOT EXISTS; columns already present from manual apply — knex record now aligned)
  2. `20260410_add_audit_log.js` — CREATE TABLE `audit_log` + 3 indexes (entity / actor / created_at DESC)
  3. `20260410_add_integration_indexes.js` — work_orders 3 partial indexes (wms_prod_order_id / mrp_bom_no / mrp_demand_ref WHERE NOT NULL)
  4. `20260416_unit_material_link_lot.js` — **rewritten** (was using pool pattern + ขาด exports.down → knex validator reject) · ADD lot_no TEXT + 2 indexes + backfill 7/7 rows จาก inventory_uids
  5. `20260421_jig_test_results_indexes.js` — 3 indexes (unit_sn / result_status partial / sn_result composite)
- **Fix detail**: rewrote `20260416_unit_material_link_lot.js` เป็น knex style (exports.up/down · raw SQL · คง backfill `UPDATE uml SET lot_no = iu.lot_no FROM inventory_uids iu WHERE uml.material_uid = iu.uid AND iu.lot_no IS NOT NULL AND uml.lot_no IS NULL`). `docker cp` เข้า container แล้ว run (ไม่ rebuild image)
- **Schema verified**: `audit_log` table exists · `unit_material_links.lot_no` backfilled 7/7 · work_orders partial indexes 3/3 · jig_test_results indexes 3/3 · mes_sync_log.attempts confirmed
- **Smoke**: `/api/mes/health` 200 · jig-api 3027 records (3014/13 pass/fail) · outbox worker polling 10s no error · `/api/mes/ready` 503 = **pre-existing** MES_AUTH_MODE=hybrid + DB_SSLMODE=prefer ใน prod+strict (ไม่เกี่ยว migration)
- **Impact on audit bugs (from 2026-04-10 full audit)**:
  - H9 "Missing indexes on integration columns" → **CLOSED**
  - "Missing audit trail for status changes" infrastructure → **READY** (audit_log table + `common/audit.js` + recall.routes.js wired อยู่แล้ว)
  - C1 Outbox pattern → knex migration record aligned
- **ไม่ restart container · ไม่ rebuild image** (host file ตรงกับ container · next image rebuild migrate:latest will be no-op idempotent)
- **Still OPEN**: H10 connection pool (db.js:18-33) · H11 rate limit · audit_log caller expansion ไป WO status / approval / deduction flow

## 2026-04-17 Session Note (no MES change)
- WMS UAT prep for 2026-04-20 — MES not affected this session
- MES backbone :5100 healthy, outbox 0 PENDING / 0 FAILED
- WMS/MRP integration endpoints verified from MES side — all OK
---

---

## ระบบตอนนี้ (ทุกอย่าง LIVE)

| Service | Port | สถานะ | หมายเหตุ |
|---|---|---|---|
| MES Backbone (Node.js/Express) | 5100 | Running | schema: mes_core, network_mode: host |
| jig-api (Node.js/forever) | 3000 | Connected | ok:true, 3027 records |
| WMS | 8000 | Connected | v2.0.0, ok:true |
| MRP | 8001 | Connected | ok:true |
| PostgreSQL | 5432 | Running | db: productiondb |

---

## Full Codebase Audit (2026-04-10) — Session 39

> Full report: `/home/ball/docs/reports/BUG_REPORT_AND_ROADMAP_2026-04-10.md`

### Bugs Found: 17 (4 Critical, 5 High, 5 Medium, 3 Low)

**Critical:**
| ID | Bug | File | Status |
|----|-----|------|--------|
| C1 | WO Close fire-and-forget sync (WMS GR + MRP actual_qty) | `modules/09_close/close.routes.js:199-231` | ✅ DONE 2026-04-10 — Outbox pattern |
| C2 | SQL injection risk in Jumbo (dynamic WHERE) | `modules/13_jumbo/jumbo.routes.js` | ✅ DONE 2026-04-10 — Static parameterized SQL |
| C3 | Jumbo nuke endpoint no auth check | `modules/13_jumbo/jumbo.routes.js` | ✅ DONE — Already had requireRoles |
| C12 | Race condition in inventory deduction | `controllers/production.controller.js` | ✅ DONE 2026-04-10 — Atomic UPDATE WHERE |

**High:**
| ID | Bug | File | Status |
|----|-----|------|--------|
| H8 | JWT cache not cleared on 401 | `common/wms_client.js:56-67`, `mrp_client.js:56-66` | OPEN |
| H9 | Missing indexes on integration columns | `migrations/20260408_add_integration_columns.js` | OPEN |
| H10 | Connection pool not configured | `db.js:18-33` | ✅ DONE 2026-04-24 — pool min:2/max:10/idle:10s |
| H11 | No per-operation rate limiting | `server.js` | ✅ DONE 2026-04-24 — auth 10 req/min + global 100 req/min |
| -- | Missing audit trail for status changes | Multiple | OPEN |

**Medium:**
| ID | Bug | Status |
|----|-----|--------|
| M1 | PM Flow missing role authorization | OPEN |
| M2 | Incoming checklist state machine incomplete | OPEN |
| M3 | Production SN ON CONFLICT DO NOTHING | OPEN |
| M4 | Inconsistent error response format | OPEN |
| M5 | Missing notification error handling | OPEN |

### MES Fix Schedule
| Phase | Timeline | Tasks |
|-------|----------|-------|
| P0 (Hotfix) | Apr W2 | C1 outbox pattern, C2 SQL fix, C3 auth, C12 atomic deduction, H8 JWT cache |
| P1 (Security) | Apr W3-4 | H11 rate limiting, audit_log table |
| P2 (Chain) | May W1-2 | mrp_demand_ref REQUIRED ✅ P2-1 done 2026-04-10 |
| P4 (Traceability) | Jun | H9 indexes, Lot-SN link, Recall API |

---

## Jumbo Access Note (2026-04-09)

### URL ที่ต้องใช้จริง
- Jumbo web entrypoint: `https://172.16.10.87/jumbo/`
- MES API via nginx: `https://172.16.10.87/mes-api/api/...`

### อย่าใช้ URL นี้จากเครื่องลูกข่าย
- `http://172.16.10.87:5100/jumbo/` ใช้งานได้เฉพาะในเครื่อง server/localhost backend path เท่านั้น
- จากเครื่องภายนอกพอร์ต `5100` ถูก network policy/firewall บล็อก ทำให้ `ERR_CONNECTION_TIMED_OUT`

### สิ่งที่ตรวจแล้ว
- จาก server เอง: `http://127.0.0.1:5100/jumbo/` และ `http://172.16.10.87:5100/jumbo/` ตอบ `200`
- จากเครื่องภายนอก: `22/80/443/8000` เข้าได้, `5100/8081` เข้าไม่ได้
- ผ่าน nginx: `https://172.16.10.87/jumbo/` และ `https://172.16.10.87/mes-api/api/mes/health` ตอบ `200`

### หมายเหตุ certificate
- HTTPS ของเครื่องนี้ใช้ cert ภายในองค์กร/CA ภายใน
- ถ้าเครื่องลูกข่ายยังไม่ trust root CA จะเจอหน้าเตือน certificate ครั้งแรก

### Jumbo hotfix ล่าสุด
- `backend/projects/jumbo/js/app.js`
  - แก้ API base ให้รองรับทั้ง direct backend และ nginx `/mes-api`
  - แก้ export CSV ให้ส่ง auth header จริง
  - ตัด inline handlers และ escape HTML ตอน render list/history
- `backend/modules/13_jumbo/jumbo.routes.js`
  - แก้ `created_by` / `scanned_by` ให้ใช้ `req.user.id` (numeric) ไม่ใช่ username string
- `backend/projects/jumbo/index.html`
  - เปลี่ยนไปใช้ local vendor assets แทน CDN
  - bump asset version query string
- `backend/server.js`
  - เพิ่ม no-store headers ให้ static `/jumbo` ฝั่ง Express
- `backend/tests/jumbo.routes.test.js`
  - regression test numeric user id paths
- `backend/tests/jumbo.static.test.js`
  - regression test local vendor assets + no-store cache headers

---

## Backend Modules

| Module | สถานะ | หมายเหตุ |
|---|---|---|
| 00_auth | Live | JWT + hybrid |
| 01_planning | Live | Pre-WO, CSV import |
| 02_incoming | Live | UID register, QA approve |
| 03_wo_release | Live | WO convert + auto createProdOrder→WMS |
| 04_kitting | Live | GI→WMS fire-and-forget |
| 05_fai_machine | Live | FAI dual-key |
| 06_production | Live | routing scan + jig endpoints (5 new) |
| 07_qc_rework | Live | QC result, rework |
| 08_qa_oba | Live | OBA |
| 09_close | Live | dual approve + GR→WMS + DONE + actualQty→MRP |
| 10_notifications | Live | inbox, ack |
| 11_pm_flow | Live | PM project lifecycle |
| 12_scm_cases | Live | SCM case + disposition |
| 13_jumbo | Live | ICT auto-push + ICT gate (graceful) |

---

## การเปลี่ยนแปลงทั้งหมด (Wave 1 + Wave 2 + Wave 3)

### Wave 1 -- jig-api Integration (2026-04-08)
**ไฟล์ใหม่:**
- `backend/common/jig_client.js` -- HTTP client เรียก jig-api
  - isConfigured(), healthz(), createJob(), getResult(), bulkStatus(), retestJob()
  - healthz() ใช้ GET /api/records-summary (ไม่ใช่ /healthz)
- `backend/migrations/20260408_add_jig_test_tracking.js` -- ตาราง jig_test_results

**ไฟล์ที่แก้:**
- `backend/modules/06_production/routing.routes.js` -- เพิ่ม 5 jig endpoints
- `backend/modules/13_jumbo/jumbo.routes.js` -- auto-push ICT + ICT gate (graceful) + jig-status
- `backend/package.json` -- เพิ่ม knex: ^3.1.0

**API ใหม่ (wave 1):**
```
POST /api/routing/jig/push            body: { unit_sn, wo_id, test_type? }
GET  /api/routing/jig/result/:unitSn  query: ?test_type=ICT|FCT
POST /api/routing/jig/sync/:unitSn    body: { test_type? }
POST /api/routing/jig/retest          body: { unit_sn, test_type? }
GET  /api/routing/jig/health
GET  /api/jumbo/jig-status?serials=SN1,SN2,...
```

### Wave 2 -- WMS + MRP Integration (2026-04-08)
**ไฟล์ใหม่:**
- `backend/common/wms_client.js` -- HTTP client WMS, auto-JWT via WMS_SERVICE_USER/PIN
  - isConfigured() → WMS_API_URL มีค่า (ไม่ต้องใช้ token แยก)
  - service account defaults: mes_service / mes@syntech2026
  - postGI, postGR, postADJ, createProdOrder, updateProdOrder, getStock, getAllStock
- `backend/common/mrp_client.js` -- HTTP client MRP, auto-JWT via MRP_API_USER/PASSWORD
  - isConfigured() → MRP_API_URL มีค่า
  - service account defaults: admin / mrp@syntech
  - getBom, listBoms, checkStock, updateActualQty
- `backend/migrations/20260408_add_integration_columns.js`
  - ALTER work_orders: ADD mrp_bom_no, mrp_bom_rev, wms_prod_order_id, mrp_demand_ref
  - ALTER wo_bom_snapshot: ADD mrp_bom_no, mrp_line_no
  - CREATE TABLE mes_sync_log

**ไฟล์ที่แก้:**
- `backend/modules/03_wo_release/wo_release.routes.js` -- WO Convert → createProdOrder→WMS
- `backend/modules/04_kitting/kitting.routes.js` -- store issue → postGI→WMS
- `backend/modules/09_close/close.routes.js` -- close → postGR + updateProdOrder(DONE) + updateActualQty→MRP

### Wave 3 -- Migration + Network Fix (2026-04-09)
**ไฟล์ที่แก้:**
- `backend/knexfile.js` -- เพิ่ม searchPath: [mes_core, public] + schemaName: mes_core (migration ต้องรู้ schema)
- `docker-compose.yml` -- เปลี่ยนเป็น network_mode: host (แก้ปัญหา Docker bridge ไม่ถึง host services)
  - ลบ ports:, extra_hosts: ออก (ไม่จำเป็นใน host mode)
  - เปลี่ยน default URLs เป็น 127.0.0.1
- `backend/common/jig_client.js` -- แก้ healthz() ให้เรียก /api/records-summary (เดิมเรียก /healthz ไม่มีจริง)
- `backend/modules/13_jumbo/jumbo.routes.js` -- แก้ ICT gate: ถ้า jig-api ไม่ตอบ (statusMap empty) ให้ warn+อนุญาต assembly แทนการ block

**Migrations รันแล้ว (4/4 batch 1):**
1. 202602270001_baseline_placeholder -- placeholder
2. 202604010001_jumbo_traceability -- jumbo tables
3. 20260408_add_integration_columns -- work_orders + mes_sync_log
4. 20260408_add_jig_test_tracking -- jig_test_results

---

## ระบบ Integration -- สถานะปัจจุบัน

| Integration | สถานะ | หมายเหตุ |
|---|---|---|
| MES → jig-api | LIVE | healthz ok, createJob/bulkStatus ทำงาน |
| MES → WMS | LIVE | healthz ok, service account auto-login |
| MES → MRP | LIVE | healthz ok, service account auto-login |
| Service accounts | ต้องสร้าง | mes_service ใน WMS, admin ใน MRP (ถ้ายังไม่มี) |

**Pattern ที่ใช้:**
- **fire-and-forget**: setImmediate(async()=>{...}) -- ไม่ block API response
- **graceful degradation**: isConfigured() guard + empty map → warn log
- **auto-JWT**: wms/mrp client auto-login ตอน token หมดอายุ (cache 7h)
- **local cache**: jig_test_results ลด polling jig-api ซ้ำ

---

## Config ปัจจุบัน (docker-compose.yml + .env)

```
network_mode: host  (สำคัญ: ทำให้ connect ถึง host services ได้)

JIG_API_URL=http://127.0.0.1:3000
JIG_API_KEY=<see .env — do not commit secrets>
WMS_API_URL=http://127.0.0.1:8000
WMS_API_TOKEN=                    (ไม่จำเป็น -- ใช้ service account)
MRP_API_URL=http://127.0.0.1:8001
MRP_API_TOKEN=                    (ไม่จำเป็น -- ใช้ service account)
```

---

## Session 2026-04-09 Wave 3 -- MRP BOM Integration ✅

### สิ่งที่ทำ (wave 3)
- แก้ `mrp_client.js` — path ตรงกับ MRP API จริง + unwrap `.data` + updateActualQty no-op
- เพิ่ม `GET /api/wo/boms` — PM เลือก BOM จาก MRP โดยตรง
- `POST /api/wo/convert` รองรับ `mrp_bom_no`:
  - Pre-tx: getBom() + validate ACTIVE + ตรวจ lines
  - In-tx: snapshot จาก MRP lines; work_orders.mrp_bom_no/rev set; bom_header_id=NULL
  - backward compat: bom_header_id flow ยังใช้ได้
- ตั้ง credentials ใน `.env` + `docker-compose.yml`: WMS_API_TOKEN, WMS_SERVICE_USER/PIN, MRP_API_USER/PASSWORD
- Smoke test: GET /api/wo/boms ✅, convert BOM-2026-012 → snapshot 6 lines ✅

### Next Wave
| Priority | งาน | รายละเอียด |
|---|---|---|
| MED | mes_sync_log | เพิ่ม log record ทุก cross-system call (table มีแล้ว) |
| MED | Admin UI: sync monitor | หน้าดู mes_sync_log + jig_test_results |
| LOW | ADJ flow | scrap → wms.postADJ() |
| LOW | FCT gate | FCT หลัง assembly (คล้าย ICT gate) |
| NOTE | updateActualQty | MRP ยังไม่มี endpoint — implement เมื่อ MRP พร้อม |

---

## คำสั่งสำคัญ

```bash
# Public access via nginx
curl -k https://172.16.10.87/jumbo/
curl -k https://172.16.10.87/mes-api/api/mes/health

# Backend direct (ใช้ใน server/localhost เท่านั้น)
curl http://127.0.0.1:5100/api/mes/health
curl http://127.0.0.1:5100/api/mes/ready

# Migration
docker exec syntech_mes_draft-mes_backbone-1 npm run migrate:status
docker exec syntech_mes_draft-mes_backbone-1 npm run migrate:latest

# Rebuild
cd /home/ball/syntech_mes_draft
docker compose build mes_backbone && docker compose up -d mes_backbone

# Logs
docker compose logs -f mes_backbone

# Jig health (ต้อง auth -- JWT required)
# Test jig from container:
docker exec syntech_mes_draft-mes_backbone-1 node -e "const j=require('./common/jig_client'); j.healthz().then(console.log);"
```

---

## หมายเหตุ Network

- MES ใช้ network_mode: host ทำให้ bind port 5100 โดยตรงบน host
- ไม่ต้องทำ port mapping (ไม่มี ports: ใน docker-compose.yml อีกต่อไป)
- Connect ถึง jig-api (3000), WMS (8000), MRP (8001) ผ่าน 127.0.0.1
- Docker bridge networking ไม่สามารถ reach host processes ผ่าน HTTP ได้ (TCP connect แต่ HTTP timeout)

---

## สถาปัตยกรรม -- ข้อห้าม

- **jig-api**: ห้าม modify API -- hardware bridge ESP32 firmware deployed แล้ว
- **mes-test-bridge** (/home/ball/mes-test-bridge): deprecated -- ถูกแทนด้วย jig_client.js
- MES orchestrate jig-api ผ่าน jig_client.js เท่านั้น

---

## Reference
- MES_DESIGN.md -- architecture + full integration spec
- backend/schema.sql -- full DB schema
- /home/ball/jig-api/Doc/ -- jig-api spec + integration flow
- /home/ball/syntech_wms_idea/STATUS.md -- WMS status

---

## 2026-04-21 Session 69 Team 1 — MES Security P0 (code-only, no deploy)

ปิด 3 finding จาก deep-review (`docs/reports/deep_system_review_2026-04-21.md`):

1. **JWT cache 401 invalidation + re-login + retry**
   - `backend/common/wms_client.js:57-99` — `_getJwt(forceRefresh)` + `req()` เคลียร์ cache, บังคับ re-login หนึ่งครั้ง, retry original request หนึ่งครั้ง; ถ้ายัง 401 จะ propagate response ให้ caller
   - `backend/common/mrp_client.js:56-88` — แก้ pattern เดียวกัน
   - เปลี่ยนจากของเดิมที่ "clear cache แต่ไม่ retry" → "clear + force re-login + retry"

2. **CORS explicit allowlist + prod fail-fast**
   - `docker-compose.yml:16-18` — default เปลี่ยนจาก `http://127.0.0.1:5100,http://localhost:5100` เป็นค่าว่าง `""` (deny-by-default)
   - `backend/server.js:39-42` — อ่าน `MES_CORS_ORIGINS` โดยไม่ default เป็น `*`
   - `backend/server.js:70-125` — เพิ่ม `enforceCorsPolicy()`: prod ถ้า `*` → throw ปฏิเสธ start; dev ถ้า `*` → warn + downgrade เป็น deny-all; empty → warn + deny-all
   - `backend/server.js:220-238` — middleware ใช้ strict `allowed.has(origin)` อย่างเดียว
   - `backend/server.js:180-190` — readiness check ใช้ `hasWildcard` + `empty` ทดแทน `allowAll`
   - Verified 4 scenarios (dev-empty/dev-\*/prod-\*/dev-allowlist) ผ่าน

3. **jig_test_results indexes (bulkStatus speedup)**
   - `backend/migrations/20260421_jig_test_results_indexes.js` (NEW) — idempotent `CREATE INDEX IF NOT EXISTS` 3 indexes:
     * `idx_jig_test_results_unit_sn` (point lookup)
     * `idx_jig_test_results_result_status` partial WHERE NOT NULL
     * `idx_jig_test_results_sn_result` composite
   - ใช้ column ชื่อ `unit_sn` (match migration 20260408) ไม่ใช่ `sn` ตามที่ task spec เขียน, ไม่มี `mes_core.` prefix เพราะ table เดิมไม่ได้ใช้ schema-qualified name
   - migration ยังไม่ run (code-only, รอ knex migrate:latest รอบถัดไป)

**Verification**: `node --check` ผ่านทุกไฟล์ · yaml lint compose OK · server.js startup 4 scenarios ผ่าน · ไม่ deploy, ไม่ restart container
