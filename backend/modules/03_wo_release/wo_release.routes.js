const express = require('express');
const { query, withTransaction } = require('../../db');
const {
  sendValidationError,
  reqId,
  requireRoles,
} = require('../../common/http');
const { normalizeCode } = require('../../utils/validator');
const { generateWoNumberInTx, generateReqNumberInTx } = require('../../common/numbering');
const { safeCreateNotifications } = require('../../common/notifications');
const wms = require('../../common/wms_client');
const mrp = require('../../common/mrp_client');

const router = express.Router();

// GET /api/wo/boms — list active BOMs from MRP (proxy)
router.get('/api/wo/boms', requireRoles(['PM', 'ADMIN']), async (req, res) => {
  if (!mrp.isConfigured()) {
    return res.status(503).json({ status: 'error', code: 'MRP_NOT_CONFIGURED', request_id: reqId(res) });
  }
  try {
    const boms = await mrp.listBoms();
    return res.json({ status: 'success', boms, request_id: reqId(res) });
  } catch (e) {
    return res.status(500).json({ status: 'error', code: 'BOM_LIST_FAILED', message: e.message, request_id: reqId(res) });
  }
});

router.post('/api/wo/convert', requireRoles(['PM', 'ADMIN']), async (req, res) => {
  const woId = Number(req.body?.wo_id);
  const requestedBomHeaderId = req.body?.bom_header_id == null ? null : Number(req.body.bom_header_id);
  const mrpBomNo = req.body?.mrp_bom_no ? String(req.body.mrp_bom_no).trim() : null;
  const requesterRole = normalizeCode(req.user?.role);
  const requesterId = Number(req.user?.id);
  if (!Number.isInteger(woId) || woId <= 0) return sendValidationError(res, 'wo_id must be positive integer');
  if (requestedBomHeaderId != null && (!Number.isInteger(requestedBomHeaderId) || requestedBomHeaderId <= 0)) {
    return sendValidationError(res, 'bom_header_id must be positive integer');
  }

  // If mrp_bom_no provided: fetch BOM from MRP BEFORE the DB transaction
  let mrpBomData = null;
  if (mrpBomNo) {
    if (!mrp.isConfigured()) {
      return res.status(503).json({ status: 'error', code: 'MRP_NOT_CONFIGURED',
        message: 'MRP integration is not configured on this server', request_id: reqId(res) });
    }
    try {
      mrpBomData = await mrp.getBom(mrpBomNo);
    } catch (e) {
      return res.status(503).json({ status: 'error', code: 'MRP_UNREACHABLE',
        message: `Cannot reach MRP: ${e.message}`, request_id: reqId(res) });
    }
    if (!mrpBomData) {
      return res.status(409).json({ status: 'error', code: 'WO_CONVERT_BLOCKED',
        message: `BOM ${mrpBomNo} not found in MRP`, request_id: reqId(res) });
    }
    if (mrpBomData.status !== 'ACTIVE') {
      return res.status(409).json({ status: 'error', code: 'WO_CONVERT_BLOCKED',
        message: `BOM ${mrpBomNo} must be ACTIVE (current=${mrpBomData.status})`, request_id: reqId(res) });
    }
    if (!Array.isArray(mrpBomData.lines) || mrpBomData.lines.length === 0) {
      return res.status(409).json({ status: 'error', code: 'WO_CONVERT_BLOCKED',
        message: `BOM ${mrpBomNo} has no lines`, request_id: reqId(res) });
    }
  }

  try {
    const payload = await withTransaction(async (client) => {
      const woResult = await client.query('SELECT * FROM work_orders WHERE id=$1 FOR UPDATE', [woId]);
      if (!woResult.rows.length) return { notFound: true };
      const wo = woResult.rows[0];

      if (requesterRole !== 'ADMIN') {
        const ownerId = Number(wo.created_by || 0);
        if (!Number.isInteger(requesterId) || requesterId <= 0 || ownerId !== requesterId) {
          return { forbidden: 'Only the creator of this Pre-WO can open WO from it' };
        }
      }

      if (wo.status !== 'DRAFT') {
        return { conflict: `only DRAFT WO can be converted (current=${wo.status})` };
      }

      const incomingResult = await client.query(
        `SELECT status FROM wo_incoming_reviews WHERE wo_id=$1 FOR UPDATE`,
        [woId]
      );
      const incomingStatus = incomingResult.rows[0]?.status || '';
      if (incomingStatus !== 'QA_APPROVED') {
        return {
          conflict: `incoming checklist must be QA_APPROVED before WO convert (current=${incomingStatus || 'MISSING'})`,
        };
      }

      const woNumber = await generateWoNumberInTx(client);

      if (mrpBomData) {
        // MRP BOM flow
        await client.query(
          `UPDATE work_orders
           SET wo_number=$2, status='OPEN', bom_header_id=NULL,
               mrp_bom_no=$3, mrp_bom_rev=$4,
               opened_by=$5, opened_at=NOW()
           WHERE id=$1`,
          [woId, woNumber, mrpBomData.bom_no, mrpBomData.revision || null, req.user.id]
        );

        await client.query('DELETE FROM wo_bom_snapshot WHERE wo_id=$1', [woId]);
        for (const line of mrpBomData.lines) {
          await client.query(
            `INSERT INTO wo_bom_snapshot
               (wo_id, line_no, part_no, qty_required, uom, description, mrp_bom_no, mrp_line_no)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [woId, line.line_no, line.item_code,
             parseFloat(line.qty_per_assembly) || 0,
             line.uom || 'PCS',
             line.item_description || line.item_code,
             mrpBomData.bom_no, line.line_no]
          );
        }
      } else {
        // Legacy local BOM flow
        const bomHeaderId = requestedBomHeaderId || wo.bom_header_id;
        if (!bomHeaderId) {
          return { conflict: 'bom_header_id or mrp_bom_no is required before convert' };
        }

        const bomResult = await client.query(
          `SELECT id, status FROM master_bom_header WHERE id=$1 FOR UPDATE`,
          [bomHeaderId]
        );
        if (!bomResult.rows.length) return { conflict: `BOM header ${bomHeaderId} not found` };
        if (bomResult.rows[0].status !== 'APPROVED') {
          return { conflict: `BOM must be APPROVED before WO convert (current=${bomResult.rows[0].status})` };
        }

        await client.query(
          `UPDATE work_orders
           SET wo_number=$2, status='OPEN', bom_header_id=$3,
               opened_by=$4, opened_at=NOW()
           WHERE id=$1`,
          [woId, woNumber, bomHeaderId, req.user.id]
        );

        await client.query('DELETE FROM wo_bom_snapshot WHERE wo_id=$1', [woId]);
        await client.query(
          `INSERT INTO wo_bom_snapshot
             (wo_id, line_no, part_no, qty_required, uom, description, source_bom_id, source_detail_id)
           SELECT $1, d.line_no, d.part_no, d.qty_per, d.uom, d.description, d.bom_header_id, d.id
           FROM master_bom_detail d
           WHERE d.bom_header_id=$2
           ORDER BY d.line_no`,
          [woId, bomHeaderId]
        );
      }

      const out = await client.query(
        `SELECT id, wo_number, part_no, qty_target, qty_started, qty_good, status,
                bom_header_id, mrp_bom_no, mrp_bom_rev, wms_prod_order_id, mrp_demand_ref, opened_at
         FROM work_orders WHERE id=$1`,
        [woId]
      );

      return { wo: out.rows[0] };
    });

    if (payload.notFound) {
      return res.status(404).json({ status: 'error', code: 'WO_NOT_FOUND', request_id: reqId(res) });
    }
    if (payload.forbidden) {
      return res.status(403).json({ status: 'error', code: 'WO_CONVERT_FORBIDDEN', message: payload.forbidden, request_id: reqId(res) });
    }
    if (payload.conflict) {
      return res.status(409).json({ status: 'error', code: 'WO_CONVERT_BLOCKED', message: payload.conflict, request_id: reqId(res) });
    }

    const woLabel = payload.wo.wo_number || `ID-${payload.wo.id}`;

    // Fire-and-forget: create WMS production order after WO Convert
    if (payload.wo && wms.isConfigured()) {
      setImmediate(async () => {
        try {
          const wmsOrder = await wms.createProdOrder({
            product_sku:     payload.wo.part_no,
            target_qty:      payload.wo.qty_target,
            wo_number:       payload.wo.wo_number,
            demand_plan_ref: payload.wo.mrp_demand_ref || null,
          });
          if (wmsOrder && wmsOrder.id) {
            await require("../../db").query(
              `UPDATE work_orders SET wms_prod_order_id=$1 WHERE id=$2`,
              [wmsOrder.id, payload.wo.id]
            );
            console.log(`[wo_release] WMS prod order: ${wmsOrder.id} for WO ${payload.wo.wo_number}`);
          }
        } catch (e) { console.error("[wo_release] WMS createProdOrder error:", e.message); }
      });
    }
    await safeCreateNotifications([
      {
        notice_type: 'WO_OPENED_FROM_PREWO',
        severity: 'INFO',
        audience_key: 'STORE',
        title: `WO ${woLabel} opened from Pre-WO`,
        message: 'Store can proceed with material preparation and kitting gate.',
        entity_type: 'WORK_ORDER',
        entity_id: String(payload.wo.id),
        wo_id: payload.wo.id,
        created_by: req.user.id,
      },
      {
        notice_type: 'WO_OPENED_FROM_PREWO',
        severity: 'INFO',
        audience_key: 'PD',
        title: `WO ${woLabel} is OPEN`,
        message: 'WO opened and BOM snapshot frozen. Prepare PD routing sequence.',
        entity_type: 'WORK_ORDER',
        entity_id: String(payload.wo.id),
        wo_id: payload.wo.id,
        created_by: req.user.id,
      },
    ]);

    return res.json({ status: 'success', wo: payload.wo, request_id: reqId(res) });
  } catch (error) {
    return res.status(500).json({ status: 'error', code: 'WO_CONVERT_FAILED', message: error.message, request_id: reqId(res) });
  }
});

router.get('/api/wo/:woId(\\d+)', requireRoles(['PM', 'STORE', 'QC', 'QA', 'TECH', 'PD', 'ADMIN']), async (req, res) => {
  const woId = Number(req.params.woId);
  if (!Number.isInteger(woId) || woId <= 0) return sendValidationError(res, 'woId must be positive integer');

  try {
    const woResult = await query(
      `SELECT id, wo_number, part_no, qty_target, qty_started, qty_good, status, yield_pct, created_at, opened_at, closed_at
       FROM work_orders
       WHERE id=$1`,
      [woId]
    );
    if (!woResult.rows.length) {
      return res.status(404).json({ status: 'error', code: 'WO_NOT_FOUND', request_id: reqId(res) });
    }

    const snapshotResult = await query(
      `SELECT line_no, part_no, qty_required, uom, description
       FROM wo_bom_snapshot
       WHERE wo_id=$1
       ORDER BY line_no`,
      [woId]
    );

    return res.json({
      status: 'success',
      wo: woResult.rows[0],
      bom_snapshot: snapshotResult.rows,
      request_id: reqId(res),
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', code: 'WO_QUERY_FAILED', message: error.message, request_id: reqId(res) });
  }
});

router.get('/api/wo/list', requireRoles(['PM', 'STORE', 'QC', 'QA', 'TECH', 'PD', 'ADMIN']), async (req, res) => {
  try {
    const result = await query(
      `SELECT id, wo_number, part_no, qty_target, qty_started, qty_good, status, created_at, opened_at, closed_at 
       FROM work_orders 
       ORDER BY id DESC 
       LIMIT 100`
    );
    return res.json({ status: 'success', wos: result.rows, request_id: reqId(res) });
  } catch (error) {
    return res.status(500).json({ status: 'error', code: 'WOS_FETCH_FAILED', message: error.message, request_id: reqId(res) });
  }
});

router.post('/api/wo/req', requireRoles(['PM', 'ADMIN']), async (req, res) => {
  const woId = Number(req.body?.wo_id);
  const items = req.body?.items; // Array of { part_no, qty_requested }

  if (!Number.isInteger(woId) || woId <= 0) return sendValidationError(res, 'wo_id must be positive integer');
  if (!Array.isArray(items) || items.length === 0) return sendValidationError(res, 'items must be a non-empty array');

  try {
    const payload = await withTransaction(async (client) => {
      // 1. Verify WO
      const woResult = await client.query('SELECT status, bom_header_id FROM work_orders WHERE id=$1', [woId]);
      if (!woResult.rows.length) return { notFound: true };
      const wo = woResult.rows[0];

      if (wo.status === 'DRAFT') {
        return { conflict: 'Cannot request materials for a DRAFT work order. Convert it first.' };
      }
      if (wo.status === 'CLOSED') {
        return { conflict: `Cannot request materials for a ${wo.status} work order.` };
      }

      // 2. Generate Req No
      const reqNo = await generateReqNumberInTx(client);

      // 3. Insert Header
      const reqResult = await client.query(
        `INSERT INTO material_requisitions (req_no, wo_id, status, created_by)
         VALUES ($1, $2, 'PENDING_STORE', $3)
         RETURNING id, req_no, status, created_at`,
        [reqNo, woId, req.user.id]
      );
      const newReq = reqResult.rows[0];

      // 4. Insert Items
      // We could validate part_no against WO BOM Snapshot if we want strictness, 
      // but PM might request sub-materials or alternative parts not strictly in the BOM.
      const itemValues = [];
      const itemParams = [];
      let paramIndex = 1;

      for (const item of items) {
        if (!item.part_no || typeof item.part_no !== 'string' || item.part_no.length > 12) {
          throw new Error('Invalid part_no in items array');
        }
        if (typeof item.qty_requested !== 'number' || item.qty_requested <= 0) {
          throw new Error(`Invalid qty_requested for part ${item.part_no}`);
        }

        itemValues.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2})`);
        itemParams.push(newReq.id, item.part_no.trim(), item.qty_requested);
        paramIndex += 3;
      }

      await client.query(
        `INSERT INTO material_req_items (req_id, part_no, qty_requested)
         VALUES ${itemValues.join(', ')}`,
        itemParams
      );

      return { requisition: newReq };
    });

    if (payload.notFound) {
      return res.status(404).json({ status: 'error', code: 'WO_NOT_FOUND', request_id: reqId(res) });
    }
    if (payload.conflict) {
      return res.status(409).json({ status: 'error', code: 'REQ_CREATE_BLOCKED', message: payload.conflict, request_id: reqId(res) });
    }

    return res.json({ status: 'success', requisition: payload.requisition, request_id: reqId(res) });
  } catch (error) {
    if (error.message.includes('Invalid part_no') || error.message.includes('Invalid qty_requested')) {
      return res.status(400).json({ status: 'error', code: 'INVALID_REQ_PAYLOAD', message: error.message, request_id: reqId(res) });
    }
    return res.status(500).json({ status: 'error', code: 'REQ_CREATE_FAILED', message: error.message, request_id: reqId(res) });
  }
});

router.get('/api/wo/req/list', requireRoles(['PM', 'STORE', 'QC', 'QA', 'PD', 'ADMIN']), async (req, res) => {
  const woId = req.query.wo_id ? Number(req.query.wo_id) : null;

  try {
    let result;
    if (woId) {
      result = await query(
        `SELECT r.id, r.req_no, r.wo_id, r.status, r.created_at, u.username as created_by
         FROM material_requisitions r
         LEFT JOIN users u ON r.created_by = u.id
         WHERE r.wo_id = $1
         ORDER BY r.id DESC`,
        [woId]
      );
    } else {
      result = await query(
        `SELECT r.id, r.req_no, r.wo_id, r.status, r.created_at, u.username as created_by,
                w.wo_number, w.part_no as wo_part_no
         FROM material_requisitions r
         LEFT JOIN users u ON r.created_by = u.id
         LEFT JOIN work_orders w ON r.wo_id = w.id
         ORDER BY r.id DESC
         LIMIT 100`
      );
    }

    // Attach items
    const requisitions = result.rows;
    if (requisitions.length > 0) {
      const reqIds = requisitions.map(r => r.id);
      const itemsResult = await query(
        `SELECT req_id, part_no, qty_requested, qty_transferred, qty_used, qty_scrap, qty_returned
         FROM material_req_items
         WHERE req_id = ANY($1)
         ORDER BY part_no`,
        [reqIds]
      );

      const itemsByReq = {};
      for (const item of itemsResult.rows) {
        if (!itemsByReq[item.req_id]) itemsByReq[item.req_id] = [];
        itemsByReq[item.req_id].push(item);
      }

      for (const r of requisitions) {
        r.items = itemsByReq[r.id] || [];
      }
    }

    return res.json({ status: 'success', requisitions, request_id: reqId(res) });
  } catch (error) {
    return res.status(500).json({ status: 'error', code: 'REQ_FETCH_FAILED', message: error.message, request_id: reqId(res) });
  }
});

module.exports = router;
