# MES Design — Integration Architecture
> เวอร์ชัน: 2026-03-30 | ระบบ: syntech_mes_draft

---

## ภาพรวม

```
┌─────────────────────────────────────────────────────────────────┐
│                     SYNTECH PLATFORM                            │
│                                                                 │
│  ┌──────────────┐    BOM (source of truth)    ┌─────────────┐  │
│  │     MRP      │ ◀────────────────────────── │    MES      │  │
│  │  (port 8001) │                             │ (port 5100) │  │
│  │              │ ──stock check────────────▶  │             │  │
│  │  BOM CRUD    │ ──BOM snapshot ──────────▶  │  9-step WF  │  │
│  └──────────────┘                             └─────────────┘  │
│         │                                            │          │
│         │ demand_plan_ref                            │ GI/GR    │
│         ▼                                            ▼          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   WMS (port 8000)                        │  │
│  │   Stock (source of truth) — GR / IQC / GI / ADJ         │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Source of Truth

| ข้อมูล | ระบบที่เป็นเจ้าของ | ระบบอื่นทำอะไร |
|--------|-----------------|----------------|
| **BOM** | MRP | MES อ่านผ่าน API + snapshot ตอน WO convert |
| **Stock (warehouse)** | WMS | MES เรียก GI เมื่อ kitting done, GR เมื่อ WO close |
| **WO / Production execution** | MES | WMS รับ notification (production_order_id) |
| **Demand / MPS** | MRP | MES รับ demand_plan_ref เพื่อ traceability |
| **Users (MES roles)** | MES | แยกจาก WMS users |

---

## Schema Changes ที่ต้องทำใน MES

### ลบออก (ซ้ำกับ MRP)
```sql
-- DROP: MES ใช้ MRP BOM แทน
DROP TABLE IF EXISTS master_bom_detail;
DROP TABLE IF EXISTS master_bom_header;
DROP TYPE  IF EXISTS bom_status;
```

### แก้ work_orders
```sql
-- เปลี่ยน bom_header_id (FK ไป local BOM ที่จะลบ)
-- → mrp_bom_no (reference ไปยัง MRP bom_no)
ALTER TABLE work_orders
    DROP COLUMN IF EXISTS bom_header_id,
    ADD COLUMN mrp_bom_no       TEXT,          -- e.g. "BOM-2026-001"
    ADD COLUMN mrp_bom_rev      TEXT,          -- revision snapshot at WO time
    ADD COLUMN wms_prod_order_id TEXT,         -- WMS production_order.id
    ADD COLUMN mrp_demand_ref   TEXT;          -- MRP demand_plan.plan_no
```

### แก้ wo_bom_snapshot
```sql
-- เพิ่ม mrp_bom_line_id เพื่อ traceability กลับไป MRP
ALTER TABLE wo_bom_snapshot
    DROP COLUMN IF EXISTS source_bom_id,
    DROP COLUMN IF EXISTS source_detail_id,
    ADD COLUMN mrp_bom_no       TEXT,
    ADD COLUMN mrp_line_no      INTEGER;       -- BOM line_no ใน MRP
```

### เพิ่ม sync log
```sql
CREATE TABLE IF NOT EXISTS mes_sync_log (
    id          BIGSERIAL PRIMARY KEY,
    direction   TEXT NOT NULL,                 -- 'MES→WMS' | 'MES→MRP' | 'MRP→MES'
    event_type  TEXT NOT NULL,                 -- 'WO_CREATE' | 'KITTING_GI' | 'WO_CLOSE_GR' | 'SCRAP_ADJ'
    wo_id       BIGINT REFERENCES work_orders(id) ON DELETE SET NULL,
    payload     JSONB NOT NULL DEFAULT '{}',
    status      TEXT NOT NULL DEFAULT 'PENDING', -- PENDING | OK | FAILED
    error_msg   TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    CONSTRAINT chk_sync_direction CHECK (direction IN ('MES→WMS','MES→MRP','MRP→MES')),
    CONSTRAINT chk_sync_status CHECK (status IN ('PENDING','OK','FAILED'))
);
```

---

## Integration Points (API Calls)

### MES → MRP

| เมื่อไหร่ | MES calls | ผลที่ต้องการ |
|----------|-----------|------------|
| PM สร้าง Pre-WO | `GET /bom/headers?status=ACTIVE` | list BOM ให้ PM เลือก |
| WO Convert | `GET /bom/{mrp_bom_no}` | ดึง BOM lines → สร้าง `wo_bom_snapshot` |
| WO Close (CLOSED) | `PATCH /demand/{plan_no}/actual_qty` | อัปเดต actual qty ที่ผลิตได้จริง |

### MES → WMS

| เมื่อไหร่ | MES calls | ผลที่ต้องการ |
|----------|-----------|------------|
| WO Convert | `POST /ots/production-orders` | สร้าง WMS production_order → เก็บ `wms_prod_order_id` |
| ก่อน Convert (stock check) | `GET /v2/inventory/balance?part_no=...` | ตรวจ stock ของ BOM components ทุกตัว |
| Kitting ACTIVE_PD | `POST /ots/movements` (type=ISS) | GI วัตถุดิบออกจาก WMS warehouse |
| WO Close (CLOSED) | `POST /ots/movements` (type=GR) | รับ FG เข้า WMS (qty_good) |
| Material Scrap | `POST /ots/movements` (type=ADJ) | ADJ ลด stock WMS สำหรับของเสีย |
| WO Close (CLOSED) | `PATCH /ots/production-orders/{id}` | update status → DONE |

### WMS/MRP → MES (Inbound)

| เมื่อไหร่ | ใครส่ง | MES รับ |
|----------|--------|---------|
| Stock change | WMS webhook | invalidate cache / notify |
| (future) | MRP | demand update |

---

## 9-Step Workflow + Integration

```
[01] PLANNING ─────────────────────────────────────────────────────
  PM: POST /api/planning/pre-wo { part_no, qty_target, mrp_bom_no? }
  PM: GET /bom/headers (MRP API) → เลือก BOM
  → work_orders.status = DRAFT

  🔗 MRP: GET /bom/{mrp_bom_no} เพื่อตรวจ BOM มีอยู่และ ACTIVE
  🔗 WMS: GET /v2/inventory/balance (per BOM component) → แสดง shortage warning

[02] INCOMING ──────────────────────────────────────────────────────
  STORE: ตรวจรับวัตถุดิบที่ส่งมาจาก WMS floor
  STORE: POST /api/store/receive { part_no, qty_on_hand, lot_no, note? }
         → สร้าง inventory_uids (status=PENDING)
  QA:    POST /api/qa/approve { uid, status: APPROVED|REJECTED }
         → inventory_uids.status = APPROVED | REJECTED

  PM/STORE/QA: GET /api/incoming/pre-wo/:woId
               → โหลด incoming checklist จาก BOM snapshot
  STORE: POST /api/incoming/pre-wo/store-check { wo_id, line_no }
         → เช็กทีละ line ว่า approved qty ของ part_no พอหรือไม่
  STORE: POST /api/incoming/pre-wo/validate-store { wo_id }
         → wo_incoming_reviews.status = STORE_VALIDATED
  QA:    POST /api/incoming/pre-wo/qa-check { wo_id, line_no }
         → QA เช็ก checklist ทีละ line
  QA:    POST /api/incoming/pre-wo/approve-qa { wo_id }
         → wo_incoming_reviews.status = QA_APPROVED

  📌 หมายเหตุ: UIDs ใน MES floor มาจาก WMS GI (step kitting)
               หรือ physical receiving ที่ floor โดยตรง
  📌 Current source of truth: runtime flow นี้อิง `backend/modules/02_incoming/incoming.routes.js`
               ไม่ใช่ draft IQC controller/schema ที่ยังไม่ถูก mount
  📌 WMS/MRP alignment (runtime ปัจจุบัน):
               Module 02 ยังไม่ call WMS/MRP ตรง ๆ แต่เป็น gate ต้นน้ำให้
               Module 03/04/09 ซึ่งเป็นจุดยิง WMS/MRP integration หลัก

[03] WO RELEASE ────────────────────────────────────────────────────
  PM: POST /api/wo/convert { wo_id, mrp_bom_no }
      Gate: wo_incoming_reviews.status = QA_APPROVED
      Gate: BOM status = ACTIVE (call MRP to verify)

  MES Actions:
  1. GET MRP /bom/{mrp_bom_no} → ดึง lines ทั้งหมด
  2. INSERT wo_bom_snapshot (freeze BOM ณ วันที่ release)
  3. Generate wo_number (6 digits auto)
  4. work_orders.status = DRAFT → OPEN

  🔗 WMS: POST /ots/production-orders { product_sku, target_qty, demand_plan_ref }
          → เก็บ wms_prod_order_id ใน work_orders

  Notify: STORE (prepare kitting), PD (prepare routing)

[04] KITTING ───────────────────────────────────────────────────────
  PM:    POST /api/wo/req { wo_id, items[] }      → สร้าง material_requisition
  STORE: POST /api/kitting/transfer { req_id, part_no, qty }
         → qty_transferred += qty
         → เมื่อทุก item ครบ: req_status = PENDING_QC
  QC:    POST /api/kitting/qc-verify { req_id }   → PENDING_QC → PENDING_PD
  PD:    POST /api/kitting/pd-accept { req_id }   → PENDING_PD → ACTIVE_PD
         → work_orders.status = READY

  🔗 WMS: POST /ots/movements (type=ISS, per component)
          → GI วัตถุดิบออก WMS warehouse
          → บันทึก mes_sync_log (direction='MES→WMS', event='KITTING_GI')

[05] FAI + MACHINE ─────────────────────────────────────────────────
  TECH: POST /api/fai/request { wo_id, note }
        → fai_logs: status = REQUESTED
        → work_orders.status = WAIT_FAI

  QA:   POST /api/fai/approve-qa { wo_id, note }
        → fai_logs: status = QA_APPROVED
        → work_orders.status = WAIT_FAI_QA
        Gate: QA ≠ MGR (dual-key)

  PD/MGR: POST /api/fai/approve-mgr { wo_id, note }
          → fai_logs: status = MANAGER_APPROVED
          → work_orders.status = RUNNING

  TECH: POST /api/machine/event { wo_id, event_type: SETUP_START }
        → machine_events บันทึก event timeline

[06] PRODUCTION (WIP Tracking) ─────────────────────────────────────
  Route: DEFAULT_PD_CHAIN_R1R13 (13 stations)
  R1_SMT_SETUP → R2_IPQC_1_PCBA → R3_INSERT_MANUAL → ...
  → R13_REWORK (ถ้า fail)

  TECH: POST /api/routing/scan { unit_sn, wo_id, station, action: SCAN_IN|SCAN_OUT, status: PASS|FAIL }
        → wip_tracking (current_step_order, state)
        → wip_tracking_events (full audit trail)

  ถ้า FAIL → state = REWORK_REQUIRED → ไป R13_REWORK
  ถ้าผ่านทุก station → state = COMPLETED

[07] QC / REWORK ───────────────────────────────────────────────────
  QC: POST /api/qc/result { unit_sn, station, result: PASS|FAIL, defect_code?, note }
      → production_units.status = PASS | NG
      → ถ้า NG → route to R13_REWORK

  TECH (Rework): POST /api/routing/scan { unit_sn, station: R13_REWORK, ... }
                 → production_units.status = REPAIRED → กลับ flow

[08] QA / OBA ──────────────────────────────────────────────────────
  QA: POST /api/qa/oba-result { wo_id, sample_sn[], result: PASS|FAIL }
      → ถ้าทุก sample PASS → work_orders สามารถ close ได้
      → ถ้า FAIL → แจ้ง PD สำหรับ corrective action

[09] CLOSE ─────────────────────────────────────────────────────────
  PM:  POST /api/wo/close { wo_id } → บันทึก PM approval
  PD:  POST /api/wo/close { wo_id } → บันทึก PD approval
       เมื่อทั้งคู่ approve → work_orders.status = CLOSED
       คำนวณ yield_pct = qty_good / qty_started × 100

  🔗 WMS: POST /ots/movements (type=GR, qty=qty_good)  → FG เข้า WMS
          PATCH /ots/production-orders/{wms_prod_order_id} { status: DONE }
  🔗 MRP: PATCH /demand/{mrp_demand_ref}/actual { actual_qty: qty_good }
  🔗 บันทึก mes_sync_log

  STORE: POST /api/store/delivery/prepare { wo_id }
         POST /api/store/delivery/dispatch { wo_id }
         → wo_delivery_orders: PREPARED → DISPATCHED
```

---

## Module 11 — PM Core Flow (ไม่ sync กับ WMS/MRP โดยตรง)

```
pm_projects: LEAD_RECEIVED → REQ_INTAKE → READINESS_GATE_PENDING
           → FEASIBILITY → QUOTE_PACKAGE_BUILD → SENT_TO_CUSTOMER
           → FOLLOW_UP → WAIT_PO → WON_YES_PO / LOST_NO_PO
           → CONTRACTING → PR_IN_PROGRESS → PAYMENT_PROCESS → CLOSED

ตาราง: pm_projects, pm_cr_logs (Change Request), pm_quotes, pm_po_logs, pm_contracts
```

**Link กับ MES WO:** เมื่อ project CONTRACTING → PM สร้าง Pre-WO → กลายเป็น WO ใน flow หลัก

---

## Module 12 — SCM Cases (Supplier Issues)

```
scm_cases.case_type:
  DOC_PENDING | NO_PO | INV_PO_MISMATCH | QTY_SHORT | QTY_OVER
  WRONG_ITEM | DAMAGED | NG_QA

scm_disposition_action:
  RTV (Return to Vendor) | REPLACEMENT | USE_AS_IS | SCRAP | REWORK

Flow: OPEN → (investigation) → CLOSED
      ถ้า RTV/REPLACEMENT → scm_supplier_dispositions (track RMA)
      ถ้า NG_QA + SPLIT → scm_split_lots (OK vs NG UIDs)
```

**🔗 WMS sync:** ถ้า disposition = SCRAP → POST /ots/movements (type=ADJ, qty=-scrap_qty)

---

## New Files ที่ต้องสร้าง

```
backend/
├── common/
│   ├── wms_client.js       ← HTTP client เรียก WMS API (GI, GR, ADJ, prod_order)
│   └── mrp_client.js       ← HTTP client เรียก MRP API (BOM query, demand update)
├── migrations/
│   └── 202603300002_bom_removal_and_integration_columns.js
└── modules/
    └── 00_sync/
        └── sync.routes.js  ← POST /api/mes/webhook/stock-change (รับจาก WMS)
```

---

## Environment Variables ที่ต้องเพิ่ม

```env
# WMS
WMS_API_URL=http://172.16.10.87:8000
WMS_API_TOKEN=<service token>

# MRP
MRP_API_URL=http://172.16.10.87:8001
MRP_API_TOKEN=<service token>

# MES Auth
MES_JWT_SECRET=<32+ chars>
MES_AUTH_MODE=jwt            # prod = jwt
MES_ENV=prod

# DB
DB_HOST=172.16.10.87
DB_PORT=5432
DB_NAME=productiondb
DB_USER=syntechdb
DB_PASS=$ynergy
DB_SCHEMA=mes                # แยก schema ไม่ชนกับ WMS (public)
```

---

## WO Status Flow (สมบูรณ์)

```
DRAFT ──[convert]──▶ OPEN ──[kitting done]──▶ READY ──[FAI request]──▶ WAIT_FAI
                                                                             │
                                           ┌─────────────────────────────────┘
                                           │
                                     WAIT_FAI_QA ──[mgr approve]──▶ RUNNING
                                                                        │
                                                              [machine STOP / all units done]
                                                                        │
                                                                     CLOSED  ◀── PM + PD approve
```

---

## Migration Plan

| ลำดับ | Migration | ไฟล์ |
|-------|-----------|------|
| M1 | Drop BOM tables, add integration columns to work_orders | `202603300002_...js` |
| M2 | Add mes_sync_log table | (รวมใน M1) |
| M3 | Update wo_bom_snapshot columns | (รวมใน M1) |
| M4 | Add DB_SCHEMA=mes isolation | knexfile.js update |

---

## Development Priority

| Phase | งาน | พร้อมเมื่อ |
|-------|-----|-----------|
| **Phase 1** | M1 migration + wms_client.js + mrp_client.js | สัปดาห์นี้ |
| **Phase 2** | ทดสอบ WO Convert flow (03) + BOM pull จาก MRP | หลัง Phase 1 |
| **Phase 3** | Kitting GI (04) + WO Close GR (09) | หลัง Phase 2 |
| **Phase 4** | Frontend (React pages per module) | หลัง Phase 3 |
| **Phase 5** | PM Flow (11) + SCM Cases (12) | Phase สุดท้าย |
