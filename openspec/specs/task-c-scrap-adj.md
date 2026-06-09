# Scrap ADJ Flow — QC FAIL to WMS Stock Adjustment

> Spec for Intern Task C · Author: Iris (Supervisor) · 2026-06-04
> Trainee: pengthanason

## Boundary

Handles: extending `POST /api/qc/result` so that a FAIL+scrapped unit triggers
a WMS stock adjustment (ADJ_MINUS), logs the sync event, and notifies PM.

Does NOT handle: rework flow (unchanged), Odoo write-back for scrap (out of
scope), physical destruction tracking, or multi-unit batch scrap.

## Context

When QC marks a unit as FAIL and the unit cannot be reworked (scrapped), the
materials consumed by that unit remain "available" in WMS indefinitely — WMS
never knows the stock was consumed and destroyed. This causes inventory drift.

The fix: wire the existing `wms_client.postADJ()` function (already built)
into the QC FAIL path when `scrapped=true`.

## Target Flow

```
QC selects FAIL + checks "Scrap" checkbox
      |
POST /api/qc/result { unit_sn, wo_id, result: "FAIL", scrapped: true }
      |
Look up wo_bom_snapshot for this wo_id
      |
Call wms_client.postADJ(items) — items built from BOM snapshot, qty negative
      |
INSERT mes_sync_log { direction:"MES->WMS", event_type:"SCRAP_ADJ", status:"OK"|"ERROR" }
      |
safeCreateNotifications to PM: "1 unit scrapped on WO-xxx"
      |
Return 200 (QC record always saved; WMS failure logged but does not block)
```

## API Change

`POST /api/qc/result` — new optional field:

```json
{
  "unit_sn": "SN-001",
  "wo_id": 123,
  "result": "FAIL",
  "scrapped": true,
  "note": "burnt component, cannot rework"
}
```

Response unchanged: `{ success: true, data: { unit_sn, result, wo_id } }`

## Acceptance Criteria

- [ ] `POST /api/qc/result` with `{ result:"FAIL", scrapped:true }` triggers WMS ADJ call
- [ ] WMS `postADJ` called with negative qty equal to BOM snapshot line quantities
- [ ] `mes_sync_log` gains a new row with `event_type="SCRAP_ADJ"` and `status="OK"`
- [ ] If WMS returns an error, `mes_sync_log` row has `status="ERROR"` and `error_msg` set
- [ ] QC result record is saved regardless of WMS outcome (WMS failure does not block)
- [ ] PM receives notification: `"Unit SN-xxx on WO yyy marked as scrap"`
- [ ] `scrapped=false` (default) leaves behaviour exactly as before (no regression)
- [ ] Frontend shows "Scrap" checkbox only when result is FAIL
- [ ] PR includes: curl test showing sync_log row + screenshot of UI checkbox

## Key Files

```
backend/modules/07_qc_rework/qc_rework.routes.js   (modify) add scrapped branch
backend/controllers/production.controller.js        (modify) postQcResult method
backend/common/wms_client.js                        (read only) use postADJ()
frontend/src/pages/ (QC page)                       (modify) add scrap checkbox
```

## DB Reference

```sql
-- wo_bom_snapshot — source for ADJ items
SELECT part_no, qty_per_unit, location
FROM mes_core.wo_bom_snapshot
WHERE wo_id = $1

-- mes_sync_log insert
INSERT INTO mes_core.mes_sync_log
  (direction, event_type, wo_id, status, payload, error_msg, created_at)
VALUES ('MES->WMS', 'SCRAP_ADJ', $wo_id, $status, $payload::jsonb, $error, NOW())
```

## Pattern Reference

See `modules/09_close/close.routes.js` for the pattern of:
- Fetching BOM snapshot before calling WMS
- Inserting into `mes_sync_log` after the call
- Using `safeCreateNotifications()` for PM notification
