# Sync Monitor — Admin Visibility UI

> Spec for Intern Task A · Author: Iris (Supervisor) · 2026-06-04
> Trainee: pengthanason

## Boundary

Handles: read-only admin page showing `mes_sync_log` (cross-system sync events)
and `jig_test_results` (ICT/FCT test outcomes) with filter + auto-refresh.

Does NOT handle: modifying sync records, retrying failed syncs, writing any
data to the DB, or exposing credentials.

## Context

`mes_sync_log` records every cross-system call (MES→WMS GI, MES→MRP WO, etc.)
but currently has no UI. Admins must query the DB directly to debug failures.

`jig_test_results` caches ICT/FCT pass/fail from Jig-API but is also invisible
in the UI today.

## Target Flow

1. Admin/PM navigates to Vite UI → `#/sync-monitor`
2. Two tabs: **Sync Log** and **Jig Results**
3. Filter bar: date range picker + status dropdown + direction/test_type dropdown
4. Table renders with colour-coded badges (OK=green, ERROR=red, PENDING=yellow)
5. Auto-refresh every 30 s (toggle button to pause)
6. Pagination: 50 rows per page with total count display

## API (new endpoints to build)

```
GET /api/admin/sync-log
  query: direction?, status?, wo_id?, from?, to?, page?, limit?
  roles: PM, ADMIN
  response: { success: true, data: SyncLogRow[], total: number }

GET /api/admin/jig-results
  query: test_type?, result_status?, wo_id?, unit_sn?, from?, to?, page?, limit?
  roles: PM, ADMIN
  response: { success: true, data: JigResultRow[], total: number }
```

## Acceptance Criteria

- [ ] `GET /api/admin/sync-log` returns 200 with data array (may be empty)
- [ ] `GET /api/admin/jig-results` returns 200 with data array
- [ ] Unauthenticated request returns 401
- [ ] TECH role request returns 403 (PM/ADMIN only)
- [ ] Filter `status=ERROR` returns only ERROR rows
- [ ] Filter `from=2026-06-01` excludes records before that date
- [ ] Page `#/sync-monitor` loads without console errors
- [ ] Badge colours match: OK=green, ERROR=red, PENDING/null=grey
- [ ] Auto-refresh fires every 30 s (verify with DevTools network tab)
- [ ] Pause button stops refresh; resume button restarts it
- [ ] PR includes screenshot of both tabs populated with real data

## Key Files (to create/modify)

```
backend/modules/15_admin/admin.routes.js   (new) GET endpoints
backend/server.js                          (modify) register new router
frontend/src/pages/SyncMonitorPage.tsx     (new) main page with 2 tabs
frontend/src/components/SyncLogTable.tsx   (new) tab 1 table component
frontend/src/components/JigResultTable.tsx (new) tab 2 table component
frontend/src/App.jsx                       (modify) add route #/sync-monitor
```

## DB Schema Reference

```sql
-- mes_core.mes_sync_log
id            BIGSERIAL PRIMARY KEY
direction     TEXT      -- 'MES->WMS' | 'MES->MRP' | 'MRP->MES'
event_type    TEXT      -- 'WO_CREATE' | 'KITTING_GI' | 'WO_CLOSE_GR' | 'SCRAP_ADJ'
wo_id         BIGINT
status        TEXT      -- 'OK' | 'ERROR' | 'PENDING'
payload       JSONB
error_msg     TEXT
created_at    TIMESTAMPTZ
attempts      INT
max_attempts  INT

-- mes_core.jig_test_results
id            BIGSERIAL PRIMARY KEY
unit_sn       TEXT
wo_id         BIGINT
test_type     TEXT      -- 'ICT' | 'FCT'
result_status TEXT      -- 'PASS' | 'FAIL' | 'PENDING'
lot_no        TEXT
tested_at     TIMESTAMPTZ
synced_at     TIMESTAMPTZ
raw_data      JSONB
```

## Pattern Reference

See `modules/10_notifications/notifications.routes.js` for route structure.
See existing Vite pages in `frontend/src/pages/` for component patterns.
Use `requireRoles(['PM', 'ADMIN'])` guard from `common/http.js`.
