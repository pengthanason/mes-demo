const express = require("express");
const routingController = require("../../controllers/routing.controller");
const { requireRoles, reqId, perRouteRateLimit } = require("../../common/http");
const { query } = require("../../db");
const jig = require("../../common/jig_client");

const router = express.Router();

// Scan endpoints — 60 req/min per user.
const scanLimiter = perRouteRateLimit({ windowMs: 60000, max: 60 });

// Existing routing scan endpoints
router.post("/api/routing/scan-in",  scanLimiter, requireRoles(["TECH","PD","QC","ADMIN"]), routingController.postRoutingScanIn);
router.post("/api/routing/scan-out", scanLimiter, requireRoles(["TECH","PD","QC","ADMIN"]), routingController.postRoutingScanOut);

function ok(res, data)         { return res.json({ status: "ok", data, request_id: reqId(res) }); }
function badReq(res, msg)      { return res.status(400).json({ status: "error", code: "VALIDATION_ERROR", message: msg, request_id: reqId(res) }); }
function internalErr(res, err) { console.error("[routing-jig]", err); return res.status(500).json({ status: "error", code: "INTERNAL_ERROR", message: err.message, request_id: reqId(res) }); }
function validType(t)          { return ["ICT","FCT"].includes(t); }

// POST /api/routing/jig/push  — push unit SN into jig-api queue
// Body: { unit_sn, wo_id, test_type? }
router.post("/api/routing/jig/push", requireRoles(["TECH","PD","QC","ADMIN"]), async (req, res) => {
  const unitSn   = String(req.body?.unit_sn   || "").trim();
  const woId     = Number(req.body?.wo_id);
  const testType = String(req.body?.test_type || "ICT").toUpperCase();
  if (!unitSn)                             return badReq(res, "unit_sn required");
  if (!Number.isInteger(woId) || woId < 1) return badReq(res, "wo_id must be positive integer");
  if (!validType(testType))                return badReq(res, "test_type must be ICT or FCT");
  try {
    const pushResult = await jig.createJob(unitSn);
    await query(
      `INSERT INTO jig_test_results (unit_sn,wo_id,test_type,job_status,pushed_at) VALUES ($1,$2,$3,WAITING,NOW())
       ON CONFLICT (unit_sn,test_type) DO UPDATE SET wo_id=EXCLUDED.wo_id,job_status=WAITING,pushed_at=NOW(),completed_at=NULL,synced_at=NULL`,
      [unitSn, woId, testType]
    );
    return ok(res, { unit_sn: unitSn, wo_id: woId, test_type: testType, jig_push: pushResult });
  } catch (err) { return internalErr(res, err); }
});

// GET /api/routing/jig/result/:unitSn  — get test result, sync from jig-api if still WAITING
// Query: ?test_type=ICT|FCT
router.get("/api/routing/jig/result/:unitSn", requireRoles(["TECH","PD","QC","QA","ADMIN"]), async (req, res) => {
  const unitSn   = String(req.params.unitSn || "").trim();
  const testType = String(req.query.test_type || "ICT").toUpperCase();
  if (!unitSn || !validType(testType)) return badReq(res, "invalid params");
  try {
    const cached = await query(`SELECT * FROM jig_test_results WHERE unit_sn=$1 AND test_type=$2`, [unitSn, testType]);
    const row    = cached.rows[0] || null;
    if (!row || row.job_status === "WAITING") {
      const live = await jig.getResult(unitSn);
      if (live) {
        const js    = String(live.job_status || "WAITING").toUpperCase();
        const rs    = live.result_status ? String(live.result_status).toUpperCase() : null;
        const isDone = ["COMPLETED","ERROR","INVALID_FORMAT"].includes(js);
        await query(
          `UPDATE jig_test_results SET job_status=$1,result_status=$2,jig_name=$3,fwver=$4,raw_payload=$5,synced_at=NOW(),completed_at=CASE WHEN $6 THEN NOW() ELSE completed_at END WHERE unit_sn=$7 AND test_type=$8`,
          [js, rs, live.jig_name||"", live.fwver||"", JSON.stringify(live), isDone, unitSn, testType]
        );
        const fresh = await query(`SELECT * FROM jig_test_results WHERE unit_sn=$1 AND test_type=$2`, [unitSn, testType]);
        return ok(res, { source: "jig-api", result: fresh.rows[0] || null });
      }
    }
    return ok(res, { source: "local", result: row });
  } catch (err) { return internalErr(res, err); }
});

// POST /api/routing/jig/sync/:unitSn  — force-sync from jig-api
// Body: { test_type? }
router.post("/api/routing/jig/sync/:unitSn", requireRoles(["TECH","PD","QC","ADMIN"]), async (req, res) => {
  const unitSn   = String(req.params.unitSn || "").trim();
  const testType = String(req.body?.test_type || "ICT").toUpperCase();
  if (!unitSn || !validType(testType)) return badReq(res, "invalid params");
  try {
    const live = await jig.getResult(unitSn);
    if (!live) return res.status(404).json({ status: "error", code: "NOT_FOUND", message: `No ${testType} result for ${unitSn} in jig-api`, request_id: reqId(res) });
    const js    = String(live.job_status || "WAITING").toUpperCase();
    const rs    = live.result_status ? String(live.result_status).toUpperCase() : null;
    const isDone = ["COMPLETED","ERROR","INVALID_FORMAT"].includes(js);
    await query(
      `INSERT INTO jig_test_results (unit_sn,test_type,job_status,result_status,jig_name,fwver,raw_payload,synced_at,completed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),CASE WHEN $8 THEN NOW() ELSE NULL END)
       ON CONFLICT (unit_sn,test_type) DO UPDATE SET job_status=$3,result_status=$4,jig_name=$5,fwver=$6,raw_payload=$7,synced_at=NOW(),completed_at=CASE WHEN $8 THEN NOW() ELSE jig_test_results.completed_at END`,
      [unitSn, testType, js, rs, live.jig_name||"", live.fwver||"", JSON.stringify(live), isDone]
    );
    const fresh = await query(`SELECT * FROM jig_test_results WHERE unit_sn=$1 AND test_type=$2`, [unitSn, testType]);
    return ok(res, { synced: true, result: fresh.rows[0] });
  } catch (err) { return internalErr(res, err); }
});

// POST /api/routing/jig/retest  — reset SN to WAITING in jig-api
// Body: { unit_sn, test_type? }
router.post("/api/routing/jig/retest", requireRoles(["TECH","QC","ADMIN"]), async (req, res) => {
  const unitSn   = String(req.body?.unit_sn   || "").trim();
  const testType = String(req.body?.test_type || "ICT").toUpperCase();
  if (!unitSn) return badReq(res, "unit_sn required");
  try {
    const result = await jig.retestJob(unitSn);
    if (result.ok) {
      await query(`UPDATE jig_test_results SET job_status=WAITING,result_status=NULL,completed_at=NULL,synced_at=NOW() WHERE unit_sn=$1 AND test_type=$2`, [unitSn, testType]);
    }
    return ok(res, { unit_sn: unitSn, test_type: testType, retest: result });
  } catch (err) { return internalErr(res, err); }
});

// GET /api/routing/jig/health  — check jig-api connectivity
router.get("/api/routing/jig/health", requireRoles(["TECH","PD","QC","QA","ADMIN"]), async (_req, res) => {
  const result = await jig.healthz();
  return res.status(result.ok ? 200 : 503).json({ status: result.ok ? "ok" : "error", jig_api: result, configured: jig.isConfigured(), request_id: reqId(res) });
});

module.exports = router;
