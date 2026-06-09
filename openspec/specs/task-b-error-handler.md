# Error Response Standardization

> Spec for Intern Task B · Author: Iris (Supervisor) · 2026-06-04
> Trainee: pengthanason

## Boundary

Handles: creating a unified error class hierarchy, a central Express error
handler middleware, helper functions `sendError()`/`sendSuccess()`, and
migrating 4 specific route modules to the new format.

Does NOT handle: migrating ALL 14 modules (scope limited to 4 for this task),
changing success response payload shape for existing callers.

## Context

Current MES Express API has at least 3 different error shapes in use across modules:

```
{ status: "error", code: "...", message: "..." }   -- modules 00, 07, 09
{ error: "...", detail: "..." }                     -- some 03/04 handlers
{ ok: false, message: "..." }                       -- older routes
```

Frontend must special-case each shape. A single canonical format eliminates
this and makes future error handling predictable.

## Target Error Format

```json
{
  "success": false,
  "error": {
    "code": "WO_NOT_FOUND",
    "message": "Work order 123 not found",
    "detail": null
  },
  "request_id": "abc-123"
}
```

Success response (additive — existing callers still work):

```json
{
  "success": true,
  "data": {},
  "request_id": "abc-123"
}
```

## Error Class Hierarchy

```
AppError(code, message, statusCode=500, detail=null)
  NotFoundError(resource)       -> 404 / "${resource} not found"
  ValidationError(msg, detail)  -> 400 / VALIDATION_ERROR
  ConflictError(msg)            -> 409 / CONFLICT
  ForbiddenError(msg)           -> 403 / FORBIDDEN
```

## Target Flow

1. Route handler throws `new NotFoundError("work_orders")` or calls `next(err)`
2. Express error middleware at end of `server.js` catches it
3. Middleware formats `AppError` subclasses to canonical JSON
4. Unknown errors become `{ code: "INTERNAL_ERROR" }` — no stack trace in response
5. `request_id` pulled from `res.locals.requestId` (set by existing `reqId()`)

## Acceptance Criteria

- [ ] `node --check backend/common/errors.js` passes with no syntax errors
- [ ] `GET /api/wo/99999` returns HTTP 404 with `{ success:false, error:{ code:"WO_NOT_FOUND" } }`
- [ ] `POST /api/store/issue` with missing body returns HTTP 400 `{ success:false, error:{ code:"VALIDATION_ERROR" } }`
- [ ] An unhandled throw returns HTTP 500 `{ success:false, error:{ code:"INTERNAL_ERROR" } }` — no stack trace
- [ ] All 4 target modules (`03_wo_release`, `04_kitting`, `07_qc_rework`, `09_close`) use new format
- [ ] No old format strings (`{ error: "..." }` or `{ ok: false }`) remain in those 4 files
- [ ] Existing npm tests still pass after change
- [ ] PR shows curl output before and after for each of the 4 modules

## Key Files

```
backend/common/errors.js          (new)    AppError + subclasses
backend/common/http.js            (extend) add sendError(), sendSuccess()
backend/server.js                 (modify) add error handler after all routes
backend/modules/03_wo_release/wo_release.routes.js  (migrate)
backend/modules/04_kitting/kitting.routes.js        (migrate)
backend/modules/07_qc_rework/qc_rework.routes.js    (migrate)
backend/modules/09_close/close.routes.js            (migrate)
```

## Pattern Reference

`backend/common/http.js` already has `sendValidationError()` and `reqId()`.
Extend these rather than replacing. Study existing `requireRoles()` middleware
in `common/http.js` as an example of Express middleware structure.
