const express = require('express');
const { withTransaction } = require('../../db');
const { sendValidationError, reqId, requireRoles, perRouteRateLimit } = require('../../common/http');
const { safeCreateNotifications } = require('../../common/notifications');
const productionController = require('../../controllers/production.controller');


const router = express.Router();

// Scan endpoints — 60 req/min per user.
const scanLimiter = perRouteRateLimit({ windowMs: 60000, max: 60 });

router.post('/api/production/start-unit', scanLimiter, requireRoles(['TECH', 'PD', 'ADMIN']), productionController.postStartUnit);
router.post('/api/production/scan-material', scanLimiter, requireRoles(['TECH', 'PD', 'ADMIN']), productionController.postScanMaterial);

router.post('/api/production/material-accept', requireRoles(['PD', 'ADMIN']), async (req, res) => {
    const reqIdNum = Number(req.body?.req_id);
    if (!Number.isInteger(reqIdNum) || reqIdNum <= 0) return sendValidationError(res, 'req_id must be positive integer');

    try {
        const payload = await withTransaction(async (client) => {
            const reqResult = await client.query('SELECT status, req_no FROM material_requisitions WHERE id=$1 FOR UPDATE', [reqIdNum]);
            if (!reqResult.rows.length) return { notFound: true };
            const requisition = reqResult.rows[0];

            if (requisition.status !== 'PENDING_PD') {
                return { conflict: `PD can only accept materials when status is PENDING_PD (current=${requisition.status})` };
            }

            await client.query(
                'UPDATE material_requisitions SET status=$1, updated_at=NOW() WHERE id=$2',
                ['ACTIVE_PD', reqIdNum]
            );

            return { req_no: requisition.req_no };
        });

        if (payload.notFound) return res.status(404).json({ status: 'error', code: 'REQ_NOT_FOUND', request_id: reqId(res) });
        if (payload.conflict) return res.status(409).json({ status: 'error', code: 'PD_ACCEPT_BLOCKED', message: payload.conflict, request_id: reqId(res) });

        await safeCreateNotifications([{
            notice_type: 'MATERIAL_PD_ACCEPTED',
            severity: 'INFO',
            audience_key: 'STORE',
            title: `Production Accepted Materials for ${payload.req_no}`,
            message: `PD has accepted the materials for Requisition ${payload.req_no} onto the line.`,
            entity_type: 'REQUISITION',
            entity_id: String(reqIdNum),
            created_by: req.user.id,
        }]);

        return res.json({ status: 'success', req_no: payload.req_no, req_status: 'ACTIVE_PD', request_id: reqId(res) });
    } catch (error) {
        return res.status(500).json({ status: 'error', code: 'PD_ACCEPT_FAILED', message: error.message, request_id: reqId(res) });
    }
});

router.post('/api/production/report-usage', requireRoles(['PD', 'ADMIN']), async (req, res) => {
    const reqIdNum = Number(req.body?.req_id);
    const items = req.body?.items; // Array of { part_no, qty_used, qty_scrap, qty_returned }

    if (!Number.isInteger(reqIdNum) || reqIdNum <= 0) return sendValidationError(res, 'req_id must be positive integer');
    if (!Array.isArray(items) || items.length === 0) return sendValidationError(res, 'items must be a non-empty array');

    try {
        const payload = await withTransaction(async (client) => {
            const reqResult = await client.query('SELECT status, req_no FROM material_requisitions WHERE id=$1 FOR UPDATE', [reqIdNum]);
            if (!reqResult.rows.length) return { notFound: true };
            const requisition = reqResult.rows[0];

            if (requisition.status !== 'ACTIVE_PD') {
                return { conflict: `PD can only report usage when status is ACTIVE_PD (current=${requisition.status})` };
            }

            for (const item of items) {
                if (!item.part_no) throw new Error('Missing part_no');

                // 1. Update req items table
                await client.query(
                    `UPDATE material_req_items 
           SET qty_used = $1, qty_scrap = $2, qty_returned = $3
           WHERE req_id = $4 AND part_no = $5`,
                    [item.qty_used || 0, item.qty_scrap || 0, item.qty_returned || 0, reqIdNum, item.part_no]
                );

                // 2. Insert into scrap log if there is any scrap
                if (item.qty_scrap > 0) {
                    await client.query(
                        `INSERT INTO material_scraps (req_id, part_no, qty_scrap, reason, reported_by)
             VALUES ($1, $2, $3, $4, $5)`,
                        [reqIdNum, item.part_no, item.qty_scrap, item.reason || 'EOL Scrap', req.user.id]
                    );
                }
            }

            // Mark the requisition ready for QA return inspection
            await client.query(
                `UPDATE material_requisitions SET status='PENDING_RETURN_QA', updated_at=NOW() WHERE id=$1`,
                [reqIdNum]
            );

            return { req_no: requisition.req_no };
        });

        if (payload.notFound) return res.status(404).json({ status: 'error', code: 'REQ_NOT_FOUND', request_id: reqId(res) });
        if (payload.conflict) return res.status(409).json({ status: 'error', code: 'PD_REPORT_BLOCKED', message: payload.conflict, request_id: reqId(res) });

        await safeCreateNotifications([{
            notice_type: 'MATERIAL_PD_FINISHED',
            severity: 'INFO',
            audience_key: 'QA',
            title: `Return Verification Needed for ${payload.req_no}`,
            message: `Production has finished with Requisition ${payload.req_no} and reported scrap/returns. Please verify before Store restock.`,
            entity_type: 'REQUISITION',
            entity_id: String(reqIdNum),
            created_by: req.user.id,
        }]);

        return res.json({ status: 'success', req_no: payload.req_no, req_status: 'PENDING_RETURN_QA', request_id: reqId(res) });
    } catch (error) {
        if (error.message.includes('Missing part_no')) {
            return res.status(400).json({ status: 'error', code: 'INVALID_USAGE_PAYLOAD', message: error.message, request_id: reqId(res) });
        }
        return res.status(500).json({ status: 'error', code: 'PD_REPORT_FAILED', message: error.message, request_id: reqId(res) });
    }
});

module.exports = router;

// GET /api/wo/:woId/kanban — WIP board per WO (stations + units)
router.get("/api/wo/:woId/kanban", requireRoles(["TECH","PD","PM","QC","QA","ADMIN"]), async (req, res) => {
  const woId = Number(req.params.woId);
  const { query } = require("../../db");

  try {
    const woRes = await query(
      "SELECT id, wo_number, part_no, status, qty_target, qty_started, qty_good FROM mes_core.work_orders WHERE id=$1",
      [woId]
    );
    if (!woRes.rows.length) return res.status(404).json({ status:"error", code:"WO_NOT_FOUND", request_id: reqId(res) });
    const wo = woRes.rows[0];

    // derive route from existing WIP or fall back to default active route
    const routeGuessRes = await query(
      "SELECT DISTINCT route_id FROM mes_core.wip_tracking WHERE wo_id=$1 LIMIT 1",
      [woId]
    );
    let routeId = routeGuessRes.rows[0]?.route_id ?? null;

    if (!routeId) {
      const defRes = await query(
        "SELECT id FROM mes_core.process_routes WHERE is_active=TRUE ORDER BY is_default DESC, id ASC LIMIT 1"
      );
      routeId = defRes.rows[0]?.id ?? null;
    }

    if (!routeId) {
      return res.json({ status:"ok", wo, route:null, columns:[], done:[], not_started:[], request_id: reqId(res) });
    }

    const [routeRes, stepsRes, wipsRes, puRes] = await Promise.all([
      query("SELECT id, route_code, route_name, enforce_sequence FROM mes_core.process_routes WHERE id=$1", [routeId]),
      query("SELECT step_order, station_name, is_required FROM mes_core.route_steps WHERE route_id=$1 ORDER BY step_order", [routeId]),
      query(
        "SELECT unit_sn, current_station_name, state, current_step_order, last_scan_in_at, last_scan_out_at FROM mes_core.wip_tracking WHERE wo_id=$1 ORDER BY current_step_order, unit_sn",
        [woId]
      ),
      query("SELECT sn, status FROM mes_core.production_units WHERE wo_id=$1", [woId]),
    ]);

    const route = routeRes.rows[0];
    const steps = stepsRes.rows;
    const wips = wipsRes.rows;
    const units = puRes.rows;

    const wipByStation = {};
    const done = [];
    const notStarted = [];

    for (const w of wips) {
      if (w.state === "COMPLETED") { done.push(w); continue; }
      const key = w.current_station_name;
      if (!wipByStation[key]) wipByStation[key] = [];
      wipByStation[key].push(w);
    }

    // units that started (production_units) but have no wip entry yet
    const wipSnSet = new Set(wips.map(w => w.unit_sn));
    for (const u of units) {
      if (!wipSnSet.has(u.sn)) notStarted.push({ unit_sn: u.sn, state: u.status });
    }

    const columns = steps.map(s => ({
      step_order: Number(s.step_order),
      station_name: s.station_name,
      is_required: Boolean(s.is_required),
      units: wipByStation[s.station_name] ?? [],
    }));

    return res.json({
      status: "ok",
      wo,
      route: { route_id: Number(route.id), route_code: route.route_code, route_name: route.route_name, enforce_sequence: Boolean(route.enforce_sequence) },
      columns,
      done,
      not_started: notStarted,
      request_id: reqId(res),
    });
  } catch (e) {
    return res.status(500).json({ status:"error", code:"KANBAN_FAILED", message: e.message, request_id: reqId(res) });
  }
});

