# FCT Gate — Block Routing Scan if FCT Failed

> Spec for Intern Task D · Author: Iris (Supervisor) · 2026-06-04
> Trainee: pengthanason

## Boundary

Handles: adding an FCT result gate to `POST /api/routing/scan-in` for stations
configured as FCT-required, blocking units that failed FCT, and graceful
degradation when Jig-API is unreachable.

Does NOT handle: modifying Jig-API itself (hardware bridge — do NOT touch),
FCT test execution, ICT gate in Jumbo (separate module), or FCT result storage
(already handled by `jig_client.getResult()`).

## Context

An ICT Gate already exists in the Jumbo module (`modules/13_jumbo/jumbo.routes.js`):
before allowing assembly, it queries `jig_test_results` via `jig_client.getResult()`
and blocks if ICT failed. If Jig-API is unreachable, it warns and allows through
(graceful degrade).

FCT has no equivalent gate in the routing scan flow (M06). A unit that failed
FCT can scan into any station unimpeded. This spec adds parity.

## Configuration

Before implementation, confirm with supervisor which stations require FCT.
Implement as environment variable to keep it simple:

```
FCT_REQUIRED_STATIONS=R05,R06,R07   (comma-separated station codes)
```

Parsed once at startup. If unset or empty, FCT gate is disabled for all stations.

## Target Flow

```
TECH scans unit SN at station
      |
POST /api/routing/scan-in { unit_sn, station_id, wo_id }
      |
Is this station in FCT_REQUIRED_STATIONS?
  No  --> proceed normally
  Yes --> query jig_client.getResult(unit_sn, "FCT")
            |
         Jig-API unreachable / timeout
            --> logger.warn + allow through (graceful degrade)
         result_status = "PASS" or no result found
            --> allow through
         result_status = "FAIL"
            --> HTTP 409 FCT_GATE_FAILED
                { code:"FCT_GATE_FAILED", unit_sn, result_status, tested_at }
```

## API Change

`POST /api/routing/scan-in` — new possible error response:

```json
{
  "success": false,
  "error": {
    "code": "FCT_GATE_FAILED",
    "message": "Unit SN-001 failed FCT — cannot proceed",
    "detail": { "unit_sn": "SN-001", "result_status": "FAIL", "tested_at": "..." }
  }
}
```

All other responses unchanged.

## Acceptance Criteria

- [ ] Station in `FCT_REQUIRED_STATIONS` + unit FCT=FAIL → HTTP 409 `FCT_GATE_FAILED`
- [ ] Station in `FCT_REQUIRED_STATIONS` + unit FCT=PASS → scan-in proceeds normally
- [ ] Station in `FCT_REQUIRED_STATIONS` + unit has no FCT record → scan-in proceeds (no block)
- [ ] Station in `FCT_REQUIRED_STATIONS` + Jig-API down → scan-in proceeds (graceful degrade) + warn log
- [ ] Station NOT in `FCT_REQUIRED_STATIONS` → FCT check skipped entirely
- [ ] `FCT_REQUIRED_STATIONS` unset or empty → all stations skip FCT check
- [ ] Frontend shows red modal when gate blocks: unit SN + "FCT failed" message
- [ ] Frontend shows FCT status badge on scan UI: PASS=green, FAIL=red, no result=grey
- [ ] 3 test cases written: PASS / FAIL / Jig-API down (can be manual curl tests)
- [ ] PR includes test output + screenshot of block modal

## Key Files

```
backend/modules/06_production/routing.routes.js  (modify) add FCT gate in scan-in
backend/common/jig_client.js                     (read only) use getResult()
.env / docker-compose.yml                        (modify) add FCT_REQUIRED_STATIONS
frontend/src/ (Production/routing scan page)     (modify) modal + FCT badge
```

## Pattern Reference

Copy the graceful-degrade pattern directly from ICT gate:

```javascript
// backend/modules/13_jumbo/jumbo.routes.js — find "ICT gate" section
let fctStatus = null
try {
  fctStatus = await jigClient.getResult(unit_sn, 'FCT')
} catch (err) {
  logger.warn({ unit_sn, err: err.message }, 'FCT gate: jig-api unreachable, allowing through')
}
if (fctStatus && fctStatus.result_status === 'FAIL') {
  return res.status(409).json({
    success: false,
    error: { code: 'FCT_GATE_FAILED', message: `Unit ${unit_sn} failed FCT`, detail: fctStatus }
  })
}
```

## Important: Do NOT modify Jig-API

`/home/ball/jig-api/` is a hardware bridge connected to ESP32 firmware on the
factory floor. Changing its API will break physical test stations.
All FCT gate logic must live in `syntech_mes_draft/backend/` only.
