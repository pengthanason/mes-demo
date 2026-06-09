const express = require('express');
const { withTransaction } = require('../../db');
const { normalizeCode, validateUid } = require('../../utils/validator');
const { sendValidationError, reqId, requireRoles, perRouteRateLimit } = require('../../common/http');
const { safeCreateNotifications } = require('../../common/notifications');
const wms = require('../../common/wms_client');

const router = express.Router();

// Kitting / store-issue operations — 30 req/min per user.
const kittingLimiter = perRouteRateLimit({ windowMs: 60000, max: 30 });

router.post('/api/store/issue', kittingLimiter, requireRoles(['STORE', 'ADMIN']), async (req, res) => {
  const woId = Number(req.body?.wo_id);
  const uid = normalizeCode(req.body?.uid);
  const markReady = req.body?.mark_ready == null ? true : Boolean(req.body.mark_ready);

  if (!Number.isInteger(woId) || woId <= 0) return sendValidationError(res, 'wo_id must be positive integer');

  const uidValidation = validateUid(uid);
  if (!uidValidation.valid) return sendValidationError(res, 'invalid uid', uidValidation.errors);

  try {
    const payload = await withTransaction(async (client) => {
      const woResult = await client.query('SELECT * FROM work_orders WHERE id=$1 FOR UPDATE', [woId]);
      if (!woResult.rows.length) return { notFound: 'wo' };
      const wo = woResult.rows[0];

      if (!['OPEN', 'READY'].includes(wo.status)) {
        return { conflict: `store issue requires WO in OPEN/READY status (current=${wo.status})` };
      }

      const uidResult = await client.query(
        `SELECT uid, part_no, qty_on_hand, status
         FROM inventory_uids
         WHERE uid=$1
         FOR UPDATE`,
        [uid]
      );
      if (!uidResult.rows.length) return { notFound: 'uid' };
      const uidRow = uidResult.rows[0];

      if (uidRow.status !== 'APPROVED') {
        return { conflict: `UID must be APPROVED before issue (current=${uidRow.status})` };
      }

      const bomMatch = await client.query(
        `SELECT 1
         FROM wo_bom_snapshot
         WHERE wo_id=$1
           AND part_no=$2
         LIMIT 1`,
        [woId, uidRow.part_no]
      );
      if (!bomMatch.rows.length) {
        return { conflict: `UID part_no=${uidRow.part_no} not found in WO BOM snapshot` };
      }

      if (markReady) {
        await client.query(`UPDATE work_orders SET status='READY' WHERE id=$1`, [woId]);
      }

      return {
        uid: uidRow.uid,
        part_no: uidRow.part_no,
        wo_status: markReady ? 'READY' : wo.status,
      };
    });

    if (payload.notFound === 'wo') {
      return res.status(404).json({ status: 'error', code: 'WO_NOT_FOUND', request_id: reqId(res) });
    }
    if (payload.notFound === 'uid') {
      return res.status(404).json({ status: 'error', code: 'UID_NOT_FOUND', request_id: reqId(res) });
    }
    if (payload.conflict) {
      return res.status(409).json({ status: 'error', code: 'STORE_ISSUE_BLOCKED', message: payload.conflict, request_id: reqId(res) });
    }

    await safeCreateNotifications([
      {
        notice_type: 'STORE_ISSUE_COMPLETED',
        severity: 'INFO',
        audience_key: 'QC',
        title: `Store issue complete for WO ${woId}`,
        message: `UID ${payload.uid} (${payload.part_no}) was issued to PD. WO status=${payload.wo_status}.`,
        entity_type: 'WORK_ORDER',
        entity_id: String(woId),
        wo_id: woId,
        uid: payload.uid,
        created_by: req.user.id,
      },
      {
        notice_type: 'STORE_ISSUE_COMPLETED',
        severity: 'INFO',
        audience_key: 'PD',
        title: `Material issued for WO ${woId}`,
        message: `Store issued UID ${payload.uid}. QC has been notified for incoming check.`,
        entity_type: 'WORK_ORDER',
        entity_id: String(woId),
        wo_id: woId,
        uid: payload.uid,
        created_by: req.user.id,
      },
    ]);

    // Fire-and-forget: WMS GI for this UID's part
    if (payload.uid && payload.part_no && wms.isConfigured()) {
      setImmediate(async () => {
        try {
          const woRow = await require('../../db').query(
            `SELECT wo_number FROM work_orders WHERE id=$1`, [woId]
          );
          const woRef = woRow.rows[0]?.wo_number || String(woId);
          const result = await wms.postGI(woRef, [{ part_no: payload.part_no, qty: 1 }], 'mes-kitting');
          if (!result.ok) console.warn('[kitting] WMS GI warning:', result.errors);
          else console.log('[kitting] WMS GI ok part=' + payload.part_no + ' wo=' + woRef);
        } catch (e) { console.error('[kitting] WMS GI error:', e.message); }
      });
    }

    return res.json({ status: 'success', ...payload, request_id: reqId(res) });
  } catch (error) {
    return res.status(500).json({ status: 'error', code: 'STORE_ISSUE_FAILED', message: error.message, request_id: reqId(res) });
  }
});

router.post('/api/kitting/transfer', kittingLimiter, requireRoles(['STORE', 'ADMIN']), async (req, res) => {
  const reqIdNum = Number(req.body?.req_id);
  const partNo = req.body?.part_no;
  const transferQty = Number(req.body?.qty);

  if (!Number.isInteger(reqIdNum) || reqIdNum <= 0) return sendValidationError(res, 'req_id must be positive integer');
  if (!partNo || typeof partNo !== 'string') return sendValidationError(res, 'part_no is required');
  if (isNaN(transferQty) || transferQty <= 0) return sendValidationError(res, 'qty must be positive number');

  try {
    const payload = await withTransaction(async (client) => {
      // 1. Verify Requisition
      const reqResult = await client.query('SELECT status FROM material_requisitions WHERE id=$1 FOR UPDATE', [reqIdNum]);
      if (!reqResult.rows.length) return { notFound: 'requisition' };
      const requisition = reqResult.rows[0];

      if (requisition.status !== 'PENDING_STORE') {
        return { conflict: `Store can only transfer materials when status is PENDING_STORE (current=${requisition.status})` };
      }

      // 2. Verify Item in Requisition
      const itemResult = await client.query(
        'SELECT qty_requested, qty_transferred FROM material_req_items WHERE req_id=$1 AND part_no=$2 FOR UPDATE',
        [reqIdNum, partNo]
      );
      if (!itemResult.rows.length) return { notFound: 'item' };
      const item = itemResult.rows[0];

      // Store can physically scan items here. We could implement UID deduction logic, 
      // but for this GAP-06 workflow tracking requested versus transferred quantity is sufficient for the first phase.
      const newTransferred = Number(item.qty_transferred) + transferQty;

      await client.query(
        'UPDATE material_req_items SET qty_transferred=$1 WHERE req_id=$2 AND part_no=$3',
        [newTransferred, reqIdNum, partNo]
      );

      // Check if all items in this requisition have been fully transferred
      const allItemsResult = await client.query(
        'SELECT qty_requested, qty_transferred FROM material_req_items WHERE req_id=$1',
        [reqIdNum]
      );

      let allFulfilled = true;
      for (const row of allItemsResult.rows) {
        if (Number(row.qty_transferred) < Number(row.qty_requested)) {
          allFulfilled = false;
          break;
        }
      }

      let newStatus = requisition.status;
      if (allFulfilled) {
        newStatus = 'PENDING_QC';
        await client.query(
          'UPDATE material_requisitions SET status=$1, updated_at=NOW() WHERE id=$2',
          [newStatus, reqIdNum]
        );
      }

      return {
        part_no: partNo,
        qty_transferred: newTransferred,
        req_status: newStatus
      };
    });

    if (payload.notFound === 'requisition') {
      return res.status(404).json({ status: 'error', code: 'REQ_NOT_FOUND', request_id: reqId(res) });
    }
    if (payload.notFound === 'item') {
      return res.status(404).json({ status: 'error', code: 'ITEM_NOT_IN_REQ', request_id: reqId(res) });
    }
    if (payload.conflict) {
      return res.status(409).json({ status: 'error', code: 'TRANSFER_BLOCKED', message: payload.conflict, request_id: reqId(res) });
    }

    if (payload.req_status === 'PENDING_QC') {
      await safeCreateNotifications([{
        notice_type: 'MATERIAL_TRANSFER_READY',
        severity: 'INFO',
        audience_key: 'QC',
        title: `Material Requisition ${reqIdNum} ready for QC Verification`,
        message: `Store has finished preparing materials for requisition ${reqIdNum}. Awaiting QC check.`,
        entity_type: 'REQUISITION',
        entity_id: String(reqIdNum),
        created_by: req.user.id,
      }]);
    }

    return res.json({ status: 'success', ...payload, request_id: reqId(res) });
  } catch (error) {
    return res.status(500).json({ status: 'error', code: 'TRANSFER_FAILED', message: error.message, request_id: reqId(res) });
  }
});

// SKIP_KITTING bypass — advances WO directly to RUNNING, skipping kitting + FAI gates.
// Only available when SKIP_KITTING=true env flag is set.
// Intended for UAT Day-1 and lines that don't require pre-kitting.
const SKIP_KITTING = String(process.env.SKIP_KITTING || 'false').toLowerCase() === 'true';

router.post('/api/kitting/bypass', requireRoles(['PM', 'ADMIN', 'PD']), async (req, res) => {
  if (!SKIP_KITTING) {
    return res.status(403).json({
      status: 'error',
      code: 'KITTING_BYPASS_DISABLED',
      message: 'Set SKIP_KITTING=true to enable kitting bypass',
      request_id: reqId(res),
    });
  }

  const woId = Number(req.body?.wo_id);
  if (!Number.isInteger(woId) || woId <= 0) return sendValidationError(res, 'wo_id must be positive integer');

  try {
    const payload = await withTransaction(async (client) => {
      const woResult = await client.query('SELECT id, wo_number, status FROM work_orders WHERE id=$1 FOR UPDATE', [woId]);
      if (!woResult.rows.length) return { notFound: true };
      const wo = woResult.rows[0];

      if (wo.status === 'RUNNING') return { wo, alreadyRunning: true };
      if (!['OPEN', 'READY', 'WAIT_FAI', 'WAIT_FAI_QA', 'WAIT_FAI_MGR'].includes(wo.status)) {
        return { conflict: `bypass requires WO in OPEN/READY/WAIT_FAI state (current=${wo.status})` };
      }

      await client.query(`UPDATE work_orders SET status='RUNNING', opened_by=$2, opened_at=NOW() WHERE id=$1`, [woId, req.user.id]);
      return { wo: { ...wo, status: 'RUNNING' } };
    });

    if (payload.notFound) return res.status(404).json({ status: 'error', code: 'WO_NOT_FOUND', request_id: reqId(res) });
    if (payload.conflict) return res.status(409).json({ status: 'error', code: 'BYPASS_BLOCKED', message: payload.conflict, request_id: reqId(res) });

    const woLabel = payload.wo.wo_number || `ID-${payload.wo.id}`;
    console.log(`[kitting-bypass] WO ${woLabel} → RUNNING (SKIP_KITTING=true)`);
    return res.json({ status: 'success', wo: payload.wo, skipped_kitting: true, request_id: reqId(res) });
  } catch (error) {
    console.error('[kitting-bypass] error:', error.message);
    return res.status(500).json({ status: 'error', code: 'BYPASS_FAILED', message: error.message, request_id: reqId(res) });
  }
});

module.exports = router;
