# Module 02 Incoming

Source of truth for the active runtime IQC/Incoming flow lives here together with:
- `backend/schema.sql`
- `backend/tests/e2e.dbflow.test.js`

## Business meaning

This module currently covers 2 linked business flows:

1. UID-level incoming gate
- Store receives incoming material as a UID record.
- QA approves or rejects that UID before it can be counted as usable stock.

2. WO-level incoming checklist
- For each Pre-WO, the system builds a checklist from the BOM snapshot.
- Store checks each checklist line against approved UID stock.
- QA checks each checklist line after Store validation.
- WO release is blocked until the checklist reaches `QA_APPROVED`.

## Runtime state machine

### UID flow
- `PENDING`
- `APPROVED`
- `REJECTED`
- `SPLIT`

### WO incoming checklist flow
- `PENDING_STORE`
- `STORE_VALIDATED`
- `QA_APPROVED`

## Active endpoints

### UID flow
- `POST /api/store/receive`
- `POST /api/qa/approve`
- `GET /api/store/uids`

### Pre-WO incoming checklist flow
- `GET /api/incoming/pre-wo/:woId`
- `POST /api/incoming/pre-wo/store-check`
- `POST /api/incoming/pre-wo/validate-store`
- `POST /api/incoming/pre-wo/qa-check`
- `POST /api/incoming/pre-wo/approve-qa`

## Key business rules

### UID approval
- A received UID starts as `PENDING`.
- QA changes the UID to `APPROVED` or `REJECTED`.

### Store checklist check
- Store checks one BOM line at a time.
- The system sums `inventory_uids.qty_on_hand` where:
  - `inventory_uids.part_no = wo_bom_snapshot.part_no`
  - `inventory_uids.status = 'APPROVED'`
- If approved quantity is lower than required quantity, the line is blocked.

### Store validate checklist
- Every checklist line must be checked by Store.
- Every checklist line must have enough approved quantity.
- Then the review moves to `STORE_VALIDATED`.

### QA checklist check
- QA cannot check a line until the review is `STORE_VALIDATED`.
- QA cannot check a line unless Store already checked that line.

### QA approve checklist
- Every line must be Store-checked.
- Every line must be QA-checked.
- Every line must still have enough approved quantity.
- Then the review moves to `QA_APPROVED`.

### WO convert gate
- Module 03 reads `wo_incoming_reviews.status`.
- WO convert is blocked until status is `QA_APPROVED`.

## Cross-module integration matrix

### Module 01 Planning + BOM
- `work_orders` is created upstream with `part_no`, `qty_target`, `bom_header_id`, and required `demand_plan_ref`.
- This module does not create the WO; it consumes WO context created by Module 01.

### Module 03 WO Release
- Reads `wo_incoming_reviews.status`.
- Blocks convert until `QA_APPROVED`.
- Rebuilds `wo_bom_snapshot`, which is the material list used by later checklist, issue, and traceability gates.
- Creates WMS production order after successful convert.

### Module 04 Kitting
- Consumes `inventory_uids`.
- UID must already be `APPROVED`.
- UID part must exist in `wo_bom_snapshot`.
- After issue, Module 04 can trigger WMS GI.

### Module 06 Production / Traceability
- Material scan consumes `inventory_uids`.
- UID must already be `APPROVED`.
- Material scan decrements `inventory_uids.qty_on_hand`.
- Material scan validates the scanned part against `wo_bom_snapshot`.

### Module 09 Close
- No direct read from this module.
- Depends indirectly on material and WO correctness established upstream.
- Sends FG GR to WMS and actual quantity update to MRP at close time.

### Module 10 Notifications
- This module publishes role-targeted operational notifications for:
  - UID QA approved
  - UID QA rejected
  - incoming checklist store validated
  - incoming checklist QA approved

### Module 12 SCM split lot
- Reuses the same `inventory_uids` table.
- Splits an original UID into child UIDs with `APPROVED` and `REJECTED` statuses.
- Marks the original UID as `SPLIT`.

## WMS and MRP alignment

### What is aligned today
- WMS is treated as warehouse stock system-of-record for GI/GR at downstream stages:
  - Module 03 creates WMS production order
  - Module 04 posts GI to WMS
  - Module 09 posts GR and marks WMS production order DONE
- MRP is treated as demand actuals system-of-record at close time:
  - Module 09 updates `actual_qty` through MRP

### Important runtime reality
- Module 02 does not call WMS or MRP directly in active code.
- Module 02 currently works on MES-local floor stock gates:
  - `inventory_uids`
  - `wo_incoming_reviews`
  - `wo_bom_snapshot`
- So Module 02 is not a transport/integration module; it is a business gate that controls whether downstream WMS/MRP-linked modules may proceed.

### Current gaps versus target architecture
- No direct WMS stock check is performed inside Module 02 runtime code.
- No direct MRP BOM fetch is performed inside Module 02 runtime code.
- The active checklist logic uses `wo_bom_snapshot` first, with fallback to local BOM detail, not MRP BOM API.
- Therefore the current runtime model is:
  - WMS/MRP integration starts after or around WO convert / kitting / close
  - Module 02 remains an MES-local approval and readiness gate

## Verification path

Use these tests when validating this module:
- `approveIncomingChecklistForWo(...)` in `backend/tests/e2e.dbflow.test.js`
- `createReadyWoFromBom(...)` in `backend/tests/e2e.dbflow.test.js`
- `module03 gate: convert blocks when incoming checklist is not QA approved`

## Important note about draft IQC files

Do not treat these as runtime source of truth unless the app is explicitly migrated to them:
- `backend/controllers/iqc.controller.js`
- `backend/controllers/incoming.controller.js`
- `backend/controllers/store.controller.js`
- `backend/sql/01_incoming_schema.sql`

Those files model a different flow (`PENDING_IQC -> AVAILABLE/QUARANTINE`) and are not mounted by `backend/server.js`.
