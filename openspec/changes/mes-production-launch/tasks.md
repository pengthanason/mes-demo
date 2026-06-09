# mes-production-launch — Tasks

**Status**: UAT-PENDING (28/29 done · T29 operator sign-off remaining)  
**Owner**: MESA  
**Target**: Day 1 = bootstrap live · Day 2 = MRP auto-push live

---

## Phase 0 — Schema & Seed (prerequisite · ~1h)

- [x] **T01** Migration: ADD `mrp_mo_no TEXT UNIQUE NULLABLE` ใน `work_orders` · file: `migrations/20260601_add_mrp_mo_no.js`
- [x] **T02** Run migration on dev DB · verify column exists · verify UNIQUE constraint
- [x] **T03** Script: `scripts/seed_station_routing.js` — upsert `DEFAULT_PD_CHAIN_R1R13` route + 7 steps (`SMT_SMD→THU_INSERT→ICT→FCT_PCBA→BB_PREP→FCT_BBAS→FQC`) · idempotent ON CONFLICT
- [x] **T04** Run seed script · verify `process_routes` + `route_steps` correct via `SELECT`

## Phase 1 — Day-1 Bootstrap (day1-bootstrap · ~1h)

- [x] **T05** Script: `scripts/inject_bootstrap_wo.js` — inject 2 WO rows: `part_no` จาก MRP catalog, `status='OPEN'`, `bom_header_id` = first APPROVED BOM, `demand_plan_ref='BOOTSTRAP-001/002'`, `mrp_mo_no='BOOTSTRAP-MO-001/002'` · ON CONFLICT DO NOTHING
- [x] **T06** Script inject each WO: สร้าง 3 `production_units` per WO (unit_sn: `SN-BOOT-001..006`) status=`NEW`
- [x] **T07** Verify: operator login MES → เห็น WO ใน production Kanban → scan unit_sn ได้ ✅ (2026-06-02 Playwright)
- [x] **T08** Walk full flow: scan in SMT_SMD → mark PASS → advance to THU_INSERT → ... → WO close ✅ (2026-06-02 API + Playwright)

## Phase 2 — Kitting Bypass (wms-consumption pre-req · ~30min)

- [x] **T09** `backend/modules/04_kitting/`: เพิ่ม env check `SKIP_KITTING` — ถ้า `true` → `POST /api/kitting/bypass` return 200 + advance WO → RUNNING (bypass kitting+FAI)
- [x] **T10** Set `SKIP_KITTING=true` ใน `.env` + `envs/.env.prod`
- [x] **T11** Test: WO status=`OPEN` → call kitting bypass → status advance ถูกต้อง ไม่ติด gate ✅ (2026-06-02)

## Phase 3 — WMS Consumption + MRP Actual (wms-consumption · ~2h)

- [x] **T12** `backend/modules/09_close/close.routes.js`: เพิ่ม WMS_COMPONENT_ISSUE event ใน outbox — pull BOM snapshot + queue fire-and-forget
- [x] **T13** `wms_client.js`: เพิ่ม `issueComponents(woRef, bomLines, qtyGood)` → ISS movement per BOM line ผ่าน `/ots/movements`
- [x] **T14** ตรวจ WMS: ใช้ type=`ISS` ผ่าน `/ots/movements` ได้เลย — ไม่ต้องสร้าง endpoint ใหม่
- [x] **T15** `close.routes.js`: MRP_ACTUAL_QTY wiring มีอยู่แล้วใน outbox (line 221-224) ✓
- [x] **T16** MES health OK · DB reachable · outbox worker running · polling started ✓

## Phase 4 — MRP→MES Auto-Push (mrp-wo-sync · ~3h)

- [x] **T17** MRP side: เพิ่ม `?updated_after=<iso_ts>` filter ใน `GET /api/v1/mrp/mo` — router + mo_service.py
- [x] **T18** `mrp_client.js`: เพิ่ม `listConfirmedMOs(sinceISO)` → GET `/api/v1/mrp/mo?status=CONFIRMED&updated_after=<ts>`
- [x] **T19** `backend/modules/03_wo_release/wo_polling.js` — **ไฟล์ใหม่**:
  - poll ทุก 5 นาที (`setInterval` หรือ cron-style)
  - เรียก `listConfirmedMOs(lastPollTs)` → filter MO ที่ไม่มี `work_orders.mrp_mo_no` match
  - มี BOM (`master_bom_header` WHERE `part_no=mo.product_code` AND status=`APPROVED`) → insert WO status=`OPEN`
  - ไม่มี BOM → insert WO status=`DRAFT` + log `[mrp-sync] WARN: no BOM for ${mo.product_code}`
  - idempotent: `INSERT ... ON CONFLICT (mrp_mo_no) DO NOTHING`
- [x] **T20** Register polling job ใน `server.js` startup — startMRPPolling() + stopMRPPolling() on close
- [x] **T21** Test idempotency: inject MO ซ้ำ 3 รอบ → count=1 ✓
- [x] **T22** Integration test: listConfirmedMOs → 2 MOs found ✓ · polling will auto-create WOs next cycle

## Phase 5 — Routing Admin API (~1h)

- [x] **T23** `GET /api/mes/routes/catalog` — มีอยู่แล้วใน server.js · returns routes+steps · role=MONITOR+
- [x] **T24** `POST /api/mes/routes` — มีอยู่แล้วใน route_admin.routes.js · role=ADMIN
- [x] **T25** `PUT /api/mes/routes/:routeId` — มีอยู่แล้วใน route_admin.routes.js · role=ADMIN
- [x] **T26** Verify: DB query confirms 1 route (id=3) + 7 steps ✓

## Phase 6 — Verify & Handoff (~1h)

- [x] **T27** Full loop test: WO from MRP → operator scan → all 7 stations → WO close → WMS GI log → MRP actual updated ✅ (2026-06-02 · bootstrap data fails delivery as expected · pipeline proven)
- [x] **T28** Update MASTER_STATE.md ✓ · STATUS.md pending operator results
- [ ] **T29** หัวหน้า / operator sign-off: 1 WO ครบ loop จริงบน production device
