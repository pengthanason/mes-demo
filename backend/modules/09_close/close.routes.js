const express = require('express');
const { query, withTransaction } = require('../../db');
const { sendValidationError, reqId, requireRoles, normalizeText, perRouteRateLimit } = require('../../common/http');
const { normalizeCode } = require('../../utils/validator');
const { safeCreateNotifications } = require('../../common/notifications');
const wms = require('../../common/wms_client');
const mrp = require('../../common/mrp_client');

const router = express.Router();

// WO close is a critical, irreversible operation — strict 5 req/min per user.
const woCloseLimiter = perRouteRateLimit({ windowMs: 60000, max: 5 });

function mapCloseApprovals(rows) {
  const result = {
    pm: null,
    pd: null,
  };
  for (const row of rows) {
    const role = normalizeCode(row.approver_role);
    if (role === 'PM') {
      result.pm = {
        approved_by: row.approved_by ? Number(row.approved_by) : null,
        approved_at: row.approved_at || null,
      };
    } else if (role === 'PD') {
      result.pd = {
        approved_by: row.approved_by ? Number(row.approved_by) : null,
        approved_at: row.approved_at || null,
      };
    }
  }
  return result;
}

function approvalReadyForClose(approvals) {
  return Boolean(approvals.pm && approvals.pd);
}

router.post('/api/wo/close', woCloseLimiter, requireRoles(['PM', 'PD', 'ADMIN']), async (req, res) => {
  const woId = Number(req.body?.wo_id);
  if (!Number.isInteger(woId) || woId <= 0) return sendValidationError(res, 'wo_id must be positive integer');

  const requesterRole = normalizeCode(req.user?.role);
  const requesterId = Number(req.user?.id);

  try {
    const payload = await withTransaction(async (client) => {
      const woResult = await client.query(
        `SELECT id, wo_number, status, qty_target, qty_started, qty_good, yield_pct, closed_at
         FROM work_orders
         WHERE id = $1
         FOR UPDATE`,
        [woId]
      );
      if (!woResult.rows.length) return { notFound: true };
      const wo = woResult.rows[0];

      const approvalsResult = await client.query(
        `SELECT approver_role, approved_by, approved_at
         FROM wo_close_approvals
         WHERE wo_id = $1
           AND approver_role IN ('PM', 'PD')
         ORDER BY approver_role ASC`,
        [woId]
      );
      let approvals = mapCloseApprovals(approvalsResult.rows);

      if (wo.status === 'CLOSED') {
        return {
          alreadyClosed: true,
          closedNow: false,
          alreadyApprovedByRole: true,
          wo,
          approvals,
        };
      }

      const isAdminForce = requesterRole === 'ADMIN';
      if (!isAdminForce && !['PM', 'PD'].includes(requesterRole)) {
        return { forbidden: 'only PM, PD, or ADMIN can close WO' };
      }

      let alreadyApprovedByRole = false;
      if (!isAdminForce) {
        const roleApproval = await client.query(
          `SELECT approved_by, approved_at
           FROM wo_close_approvals
           WHERE wo_id = $1
             AND approver_role = $2
           FOR UPDATE`,
          [woId, requesterRole]
        );
        alreadyApprovedByRole = roleApproval.rows.length > 0;

        await client.query(
          `INSERT INTO wo_close_approvals (wo_id, approver_role, approved_by, approved_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (wo_id, approver_role) DO UPDATE
           SET approved_by = EXCLUDED.approved_by,
               approved_at = EXCLUDED.approved_at`,
          [woId, requesterRole, requesterId]
        );

        const refreshedApprovals = await client.query(
          `SELECT approver_role, approved_by, approved_at
           FROM wo_close_approvals
           WHERE wo_id = $1
             AND approver_role IN ('PM', 'PD')
           ORDER BY approver_role ASC`,
          [woId]
        );
        approvals = mapCloseApprovals(refreshedApprovals.rows);
      }

      if (!isAdminForce && !approvalReadyForClose(approvals)) {
        return {
          alreadyClosed: false,
          closedNow: false,
          pendingClose: true,
          alreadyApprovedByRole,
          wo,
          approvals,
        };
      }

      // QA-04: Block DONE if there's any pending/FAIL units.
      // 🚨 BUG FIX: Use default-deny. Any unit not explicitly PASS or PACKED will block the WO closure!
      // This prevents REPAIRED units from slipping through without final QC verification.
      const qcCheckResult = await client.query(
        `SELECT COUNT(*) as ng_count
         FROM production_units 
         WHERE wo_id = $1 AND status NOT IN ('PASS', 'PACKED')`,
        [woId]
      );
      if (Number(qcCheckResult.rows[0].ng_count) > 0) {
        return { qcFailed: 'Cannot close WO with pending, NG, or unverified REPAIRED units. All units must be PASS.' };
      }

      const qtyStarted = Number(wo.qty_started || 0);
      const qtyGood = Number(wo.qty_good || 0);
      const yieldPct = qtyStarted > 0 ? (qtyGood / qtyStarted) * 100 : 0;

      const updated = await client.query(
        `UPDATE work_orders
         SET status = 'CLOSED',
             closed_by = $2,
             closed_at = NOW(),
             yield_pct = $3
         WHERE id = $1
         RETURNING id, wo_number, status, qty_target, qty_started, qty_good, yield_pct, closed_at`,
        [woId, requesterId, yieldPct]
      );

      return {
        alreadyClosed: false,
        closedNow: true,
        pendingClose: false,
        alreadyApprovedByRole,
        wo: updated.rows[0],
        approvals,
      };
    });

    if (payload.notFound) {
      return res.status(404).json({ status: 'error', code: 'WO_NOT_FOUND', request_id: reqId(res) });
    }
    if (payload.forbidden) {
      return res.status(403).json({ status: 'error', code: 'WO_CLOSE_FORBIDDEN', message: payload.forbidden, request_id: reqId(res) });
    }
    if (payload.qcFailed) {
      return res.status(409).json({ status: 'error', code: 'QA_CHECK_FAILED', message: payload.qcFailed, request_id: reqId(res) });
    }

    if (payload.closedNow && payload.wo) {
      const woLabel = payload.wo.wo_number || `ID-${payload.wo.id}`;
      const yieldPct = Number(payload.wo.yield_pct || 0);
      await safeCreateNotifications([
        {
          notice_type: 'WO_CLOSED',
          severity: 'INFO',
          audience_key: 'STORE',
          title: `WO ${woLabel} is CLOSED`,
          message: `Final yield=${yieldPct.toFixed(2)}%. Prepare delivery queue.`,
          entity_type: 'WORK_ORDER',
          entity_id: String(payload.wo.id),
          wo_id: payload.wo.id,
          created_by: req.user.id,
        },
        {
          notice_type: 'WO_CLOSED',
          severity: 'INFO',
          audience_key: 'ACCOUNT',
          title: `WO ${woLabel} closed for accounting`,
          message: `Yield baseline recorded at ${yieldPct.toFixed(2)}%.`,
          entity_type: 'WORK_ORDER',
          entity_id: String(payload.wo.id),
          wo_id: payload.wo.id,
          created_by: req.user.id,
        },
      ]);
      // Outbox Pattern (C1 fix): Write sync events to mes_sync_log, processed by outbox_worker with retry
      try {
        const w = payload.wo;
        const woRef = w.wo_number || String(w.id);
        const qtyGoodFG = Number(w.qty_good || 0);
        const woRow = await query(
          `SELECT part_no, wms_prod_order_id, mrp_demand_ref FROM work_orders WHERE id=$1`, [w.id]
        );
        const woData = woRow.rows[0] || {};
        const events = [];

        if (wms.isConfigured() && qtyGoodFG > 0 && woData.part_no) {
          events.push({ direction: 'MES->WMS', event_type: 'WMS_GR', wo_id: w.id,
            payload: { wo_ref: woRef, part_no: woData.part_no, qty: qtyGoodFG } });
        }
        if (wms.isConfigured() && woData.wms_prod_order_id) {
          events.push({ direction: 'MES->WMS', event_type: 'WMS_PROD_DONE', wo_id: w.id,
            payload: { wms_prod_order_id: woData.wms_prod_order_id, qty_good: qtyGoodFG } });
        }
        if (mrp.isConfigured() && woData.mrp_demand_ref && qtyGoodFG > 0) {
          events.push({ direction: 'MES->MRP', event_type: 'MRP_ACTUAL_QTY', wo_id: w.id,
            payload: { plan_no: woData.mrp_demand_ref, qty: qtyGoodFG } });
        }

        // WMS component consumption — issue BOM materials used in production
        if (wms.isConfigured() && qtyGoodFG > 0) {
          const bomRows = await query(
            `SELECT part_no, qty_required AS qty_per FROM wo_bom_snapshot WHERE wo_id=$1`, [w.id]
          );
          if (bomRows.rows.length > 0) {
            events.push({ direction: 'MES->WMS', event_type: 'WMS_COMPONENT_ISSUE', wo_id: w.id,
              payload: { wo_ref: woRef, bom_lines: bomRows.rows, qty_good: qtyGoodFG } });
          }
        }

        for (const evt of events) {
          await query(
            `INSERT INTO mes_sync_log (direction, event_type, wo_id, payload, status)
             VALUES ($1, $2, $3, $4, 'PENDING')`,
            [evt.direction, evt.event_type, evt.wo_id, JSON.stringify(evt.payload)]
          );
        }
        console.log(`[close] Outbox: ${events.length} events queued for WO ${woRef}`);
      } catch (e) { console.error('[close] outbox insert error:', e.message); }
    } else if (payload.pendingClose && payload.wo) {
      const nextAudience = requesterRole === 'PM' ? 'PD' : requesterRole === 'PD' ? 'PM' : 'PM';
      const woLabel = payload.wo.wo_number || `ID-${payload.wo.id}`;
      await safeCreateNotifications([
        {
          notice_type: 'WO_CLOSE_PENDING_APPROVAL',
          severity: 'INFO',
          audience_key: nextAudience,
          title: `WO ${woLabel} waiting for your close approval`,
          message: `The other approver has submitted close approval. Please review and approve.`,
          entity_type: 'WORK_ORDER',
          entity_id: String(payload.wo.id),
          wo_id: payload.wo.id,
          created_by: req.user.id,
        },
      ]);
    }

    return res.json({
      status: 'success',
      already_closed: Boolean(payload.alreadyClosed),
      close_pending: Boolean(payload.pendingClose),
      close_completed: Boolean(payload.closedNow),
      already_approved_by_role: Boolean(payload.alreadyApprovedByRole),
      approvals: payload.approvals,
      wo: payload.wo,
      request_id: reqId(res),
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', code: 'WO_CLOSE_FAILED', message: error.message, request_id: reqId(res) });
  }
});

router.get('/api/wo/:woId(\\d+)/close-approvals', requireRoles(['PM', 'PD', 'STORE', 'QA', 'QC', 'ADMIN']), async (req, res) => {
  const woId = Number(req.params.woId);
  if (!Number.isInteger(woId) || woId <= 0) return sendValidationError(res, 'woId must be positive integer');

  try {
    const woResult = await query(
      `SELECT id, wo_number, status, qty_target, qty_started, qty_good, yield_pct, closed_at
       FROM work_orders
       WHERE id = $1`,
      [woId]
    );
    if (!woResult.rows.length) {
      return res.status(404).json({ status: 'error', code: 'WO_NOT_FOUND', request_id: reqId(res) });
    }

    const approvalResult = await query(
      `SELECT approver_role, approved_by, approved_at
       FROM wo_close_approvals
       WHERE wo_id = $1
         AND approver_role IN ('PM', 'PD')
       ORDER BY approver_role ASC`,
      [woId]
    );

    return res.json({
      status: 'success',
      wo: woResult.rows[0],
      approvals: mapCloseApprovals(approvalResult.rows),
      request_id: reqId(res),
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', code: 'WO_CLOSE_APPROVALS_FETCH_FAILED', message: error.message, request_id: reqId(res) });
  }
});

router.post('/api/store/delivery/prepare', requireRoles(['STORE', 'ADMIN']), async (req, res) => {
  const woId = Number(req.body?.wo_id);
  const note = normalizeText(req.body?.note);
  if (!Number.isInteger(woId) || woId <= 0) return sendValidationError(res, 'wo_id must be positive integer');

  try {
    const payload = await withTransaction(async (client) => {
      const woResult = await client.query(
        `SELECT id, wo_number, status
         FROM work_orders
         WHERE id = $1
         FOR UPDATE`,
        [woId]
      );
      if (!woResult.rows.length) return { notFound: true };
      const wo = woResult.rows[0];
      if (wo.status !== 'CLOSED') {
        return { conflict: `delivery prepare requires CLOSED WO (current=${wo.status})` };
      }

      const existingResult = await client.query(
        `SELECT id, status, prepared_at, dispatched_at
         FROM wo_delivery_orders
         WHERE wo_id = $1
         FOR UPDATE`,
        [woId]
      );
      const existing = existingResult.rows[0];
      if (existing && existing.status === 'DISPATCHED') {
        return { conflict: 'delivery already dispatched for this WO' };
      }

      const upsert = await client.query(
        `INSERT INTO wo_delivery_orders (wo_id, status, prepared_by, prepared_at, note)
         VALUES ($1, 'PREPARED', $2, NOW(), $3)
         ON CONFLICT (wo_id) DO UPDATE
         SET status = 'PREPARED',
             prepared_by = EXCLUDED.prepared_by,
             prepared_at = NOW(),
             note = EXCLUDED.note
         RETURNING id, wo_id, status, prepared_by, prepared_at, dispatched_by, dispatched_at, note`,
        [woId, req.user.id, note]
      );

      return { wo, delivery: upsert.rows[0] };
    });

    if (payload.notFound) {
      return res.status(404).json({ status: 'error', code: 'WO_NOT_FOUND', request_id: reqId(res) });
    }
    if (payload.conflict) {
      return res.status(409).json({ status: 'error', code: 'DELIVERY_PREPARE_BLOCKED', message: payload.conflict, request_id: reqId(res) });
    }

    const woLabel = payload.wo.wo_number || `ID-${payload.wo.id}`;
    await safeCreateNotifications([
      {
        notice_type: 'DELIVERY_PREPARED',
        severity: 'INFO',
        audience_key: 'PM',
        title: `Store prepared delivery for WO ${woLabel}`,
        message: note || 'Finished goods are prepared for shipment.',
        entity_type: 'WORK_ORDER',
        entity_id: String(payload.wo.id),
        wo_id: payload.wo.id,
        created_by: req.user.id,
      },
      {
        notice_type: 'DELIVERY_PREPARED',
        severity: 'INFO',
        audience_key: 'ACCOUNT',
        title: `Delivery prepared for WO ${woLabel}`,
        message: 'Store has prepared delivery and is waiting dispatch confirmation.',
        entity_type: 'WORK_ORDER',
        entity_id: String(payload.wo.id),
        wo_id: payload.wo.id,
        created_by: req.user.id,
      },
    ]);

    return res.json({
      status: 'success',
      delivery: payload.delivery,
      request_id: reqId(res),
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', code: 'DELIVERY_PREPARE_FAILED', message: error.message, request_id: reqId(res) });
  }
});

router.post('/api/store/delivery/dispatch', requireRoles(['STORE', 'ADMIN']), async (req, res) => {
  const woId = Number(req.body?.wo_id);
  const note = normalizeText(req.body?.note);
  if (!Number.isInteger(woId) || woId <= 0) return sendValidationError(res, 'wo_id must be positive integer');

  try {
    const payload = await withTransaction(async (client) => {
      const woResult = await client.query(
        `SELECT id, wo_number, status
         FROM work_orders
         WHERE id = $1
         FOR UPDATE`,
        [woId]
      );
      if (!woResult.rows.length) return { notFound: true };
      const wo = woResult.rows[0];
      if (wo.status !== 'CLOSED') {
        return { conflict: `delivery dispatch requires CLOSED WO (current=${wo.status})` };
      }

      const deliveryResult = await client.query(
        `SELECT id, status
         FROM wo_delivery_orders
         WHERE wo_id = $1
         FOR UPDATE`,
        [woId]
      );
      if (!deliveryResult.rows.length) {
        return { conflict: 'prepare delivery first before dispatch' };
      }

      const delivery = deliveryResult.rows[0];
      if (delivery.status === 'DISPATCHED') {
        const latest = await client.query(
          `SELECT id, wo_id, status, prepared_by, prepared_at, dispatched_by, dispatched_at, note
           FROM wo_delivery_orders
           WHERE wo_id = $1`,
          [woId]
        );
        return { wo, delivery: latest.rows[0], alreadyDispatched: true };
      }

      const updated = await client.query(
        `UPDATE wo_delivery_orders
         SET status = 'DISPATCHED',
             dispatched_by = $2,
             dispatched_at = NOW(),
             note = CASE
               WHEN $3 = '' THEN note
               ELSE $3
             END
         WHERE wo_id = $1
         RETURNING id, wo_id, status, prepared_by, prepared_at, dispatched_by, dispatched_at, note`,
        [woId, req.user.id, note]
      );

      return { wo, delivery: updated.rows[0], alreadyDispatched: false };
    });

    if (payload.notFound) {
      return res.status(404).json({ status: 'error', code: 'WO_NOT_FOUND', request_id: reqId(res) });
    }
    if (payload.conflict) {
      return res.status(409).json({ status: 'error', code: 'DELIVERY_DISPATCH_BLOCKED', message: payload.conflict, request_id: reqId(res) });
    }

    if (!payload.alreadyDispatched) {
      const woLabel = payload.wo.wo_number || `ID-${payload.wo.id}`;
      await safeCreateNotifications([
        {
          notice_type: 'DELIVERY_DISPATCHED',
          severity: 'INFO',
          audience_key: 'PM',
          title: `WO ${woLabel} dispatched`,
          message: 'Store completed dispatch for finished goods.',
          entity_type: 'WORK_ORDER',
          entity_id: String(payload.wo.id),
          wo_id: payload.wo.id,
          created_by: req.user.id,
        },
        {
          notice_type: 'DELIVERY_DISPATCHED',
          severity: 'INFO',
          audience_key: 'ACCOUNT',
          title: `Dispatch complete for WO ${woLabel}`,
          message: 'Dispatch status is now final.',
          entity_type: 'WORK_ORDER',
          entity_id: String(payload.wo.id),
          wo_id: payload.wo.id,
          created_by: req.user.id,
        },
      ]);
    }

    return res.json({
      status: 'success',
      already_dispatched: Boolean(payload.alreadyDispatched),
      delivery: payload.delivery,
      request_id: reqId(res),
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', code: 'DELIVERY_DISPATCH_FAILED', message: error.message, request_id: reqId(res) });
  }
});

router.get('/api/store/delivery/:woId(\\d+)', requireRoles(['PM', 'STORE', 'PD', 'QA', 'ADMIN']), async (req, res) => {
  const woId = Number(req.params.woId);
  if (!Number.isInteger(woId) || woId <= 0) return sendValidationError(res, 'woId must be positive integer');

  try {
    const woResult = await query(
      `SELECT id, wo_number, status, closed_at
       FROM work_orders
       WHERE id = $1`,
      [woId]
    );
    if (!woResult.rows.length) {
      return res.status(404).json({ status: 'error', code: 'WO_NOT_FOUND', request_id: reqId(res) });
    }

    const deliveryResult = await query(
      `SELECT id, wo_id, status, prepared_by, prepared_at, dispatched_by, dispatched_at, note
       FROM wo_delivery_orders
       WHERE wo_id = $1`,
      [woId]
    );

    return res.json({
      status: 'success',
      wo: woResult.rows[0],
      delivery: deliveryResult.rows[0] || null,
      request_id: reqId(res),
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', code: 'DELIVERY_STATUS_FETCH_FAILED', message: error.message, request_id: reqId(res) });
  }
});

router.get('/api/store/delivery/list', requireRoles(['PM', 'STORE', 'PD', 'QA', 'ADMIN']), async (req, res) => {
  try {
    const result = await query(
      `SELECT
         wo.id AS wo_id,
         wo.wo_number,
         wo.status AS wo_status,
         wo.closed_at,
         d.status AS delivery_status,
         d.prepared_by,
         d.prepared_at,
         d.dispatched_by,
         d.dispatched_at,
         d.note
       FROM work_orders wo
       LEFT JOIN wo_delivery_orders d ON d.wo_id = wo.id
       WHERE wo.status = 'CLOSED'
       ORDER BY wo.closed_at DESC NULLS LAST, wo.id DESC
       LIMIT 120`
    );

    return res.json({
      status: 'success',
      deliveries: result.rows,
      request_id: reqId(res),
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', code: 'DELIVERY_LIST_FETCH_FAILED', message: error.message, request_id: reqId(res) });
  }
});

module.exports = router;
