const express = require('express');
const { query, withTransaction } = require('../../db');
const { normalizeCode, validatePN, validateUid } = require('../../utils/validator');
const {
  normalizeText,
  sendValidationError,
  parseNumber,
  reqId,
  requireRoles,
} = require('../../common/http');
const { generateUidInTx } = require('../../common/numbering');
const { safeCreateNotifications } = require('../../common/notifications');

const router = express.Router();

function resolveIncomingChecklistRole(req) {
  const normalizedRole = normalizeCode(req.user?.role);
  if (normalizedRole === 'STORE' || normalizedRole === 'QA') return normalizedRole;
  if (normalizedRole === 'ADMIN') {
    const actingRole = normalizeCode(req.body?.acting_role || req.query?.acting_role);
    if (actingRole === 'STORE' || actingRole === 'QA') return actingRole;
  }
  return normalizedRole;
}

async function ensureIncomingChecklistInTx(client, woId) {
  await client.query(
    `INSERT INTO wo_incoming_reviews (wo_id, status)
     VALUES ($1, 'PENDING_STORE')
     ON CONFLICT (wo_id) DO NOTHING`,
    [woId]
  );

  await client.query(
    `INSERT INTO wo_incoming_review_items (wo_id, line_no, part_no, qty_required, approved_qty)
     SELECT
       src.wo_id,
       src.line_no,
       src.part_no,
       src.qty_required,
       COALESCE(inv.approved_qty, 0)
     FROM (
       WITH wo_ctx AS (
         SELECT id, bom_header_id
         FROM work_orders
         WHERE id = $1
       )
       SELECT
         snap.wo_id,
         snap.line_no,
         snap.part_no,
         snap.qty_required
       FROM wo_bom_snapshot snap
       JOIN wo_ctx w ON w.id = snap.wo_id
       UNION ALL
       SELECT
         w.id AS wo_id,
         d.line_no,
         d.part_no,
         d.qty_per AS qty_required
       FROM wo_ctx w
       JOIN master_bom_detail d ON d.bom_header_id = w.bom_header_id
       WHERE NOT EXISTS (
         SELECT 1
         FROM wo_bom_snapshot snap2
         WHERE snap2.wo_id = w.id
       )
     ) src
     LEFT JOIN (
       SELECT part_no, SUM(qty_on_hand)::numeric(18, 3) AS approved_qty
       FROM inventory_uids
       WHERE status = 'APPROVED'
       GROUP BY part_no
     ) inv ON inv.part_no = src.part_no
     ON CONFLICT (wo_id, line_no) DO UPDATE
     SET
       part_no = EXCLUDED.part_no,
       qty_required = EXCLUDED.qty_required,
       approved_qty = EXCLUDED.approved_qty`,
    [woId]
  );

  await client.query(
    `WITH wo_ctx AS (
       SELECT id, bom_header_id
       FROM work_orders
       WHERE id = $1
     ),
     source_lines AS (
       SELECT snap.line_no
       FROM wo_bom_snapshot snap
       JOIN wo_ctx w ON w.id = snap.wo_id
       UNION
       SELECT d.line_no
       FROM wo_ctx w
       JOIN master_bom_detail d ON d.bom_header_id = w.bom_header_id
       WHERE NOT EXISTS (
         SELECT 1
         FROM wo_bom_snapshot snap2
         WHERE snap2.wo_id = w.id
       )
     )
     DELETE FROM wo_incoming_review_items item
     WHERE item.wo_id = $1
       AND NOT EXISTS (
         SELECT 1
         FROM source_lines src
         WHERE src.line_no = item.line_no
       )`,
    [woId]
  );
}

async function loadIncomingChecklistInTx(client, woId) {
  const woResult = await client.query(
    `SELECT id, wo_number, part_no, qty_target, status, created_by, opened_by, created_at, opened_at
     FROM work_orders
     WHERE id = $1`,
    [woId]
  );
  if (!woResult.rows.length) return null;

  const reviewResult = await client.query(
    `SELECT wo_id, status, store_validated_by, store_validated_at, qa_approved_by, qa_approved_at
     FROM wo_incoming_reviews
     WHERE wo_id = $1`,
    [woId]
  );

  const itemResult = await client.query(
    `SELECT
       item.line_no,
       item.part_no,
       item.qty_required,
       item.approved_qty,
       item.store_checked,
       item.store_checked_by,
       item.store_checked_at,
       item.qa_checked,
       item.qa_checked_by,
       item.qa_checked_at
     FROM wo_incoming_review_items item
     WHERE item.wo_id = $1
     ORDER BY item.line_no`,
    [woId]
  );

  const summaryResult = await client.query(
    `SELECT
       COUNT(*)::int AS total_items,
       COUNT(*) FILTER (WHERE store_checked)::int AS store_checked_items,
       COUNT(*) FILTER (WHERE qa_checked)::int AS qa_checked_items,
       COUNT(*) FILTER (WHERE approved_qty >= qty_required)::int AS qty_ready_items
     FROM wo_incoming_review_items
     WHERE wo_id = $1`,
    [woId]
  );

  return {
    wo: woResult.rows[0],
    review: reviewResult.rows[0] || null,
    items: itemResult.rows,
    summary: summaryResult.rows[0] || {
      total_items: 0,
      store_checked_items: 0,
      qa_checked_items: 0,
      qty_ready_items: 0,
    },
  };
}

router.post('/api/store/receive', requireRoles(['STORE', 'ADMIN']), async (req, res) => {
  const partNo = normalizeCode(req.body?.part_no);
  const qtyOnHand = parseNumber(req.body?.qty_on_hand, NaN);
  const lotNo = normalizeText(req.body?.lot_no);
  const note = normalizeText(req.body?.note);

  const pnValidation = validatePN(partNo, { enforceComponentWhitelist: true });
  if (!pnValidation.valid) return sendValidationError(res, 'invalid part_no', pnValidation.errors);
  if (!Number.isFinite(qtyOnHand) || qtyOnHand <= 0) return sendValidationError(res, 'qty_on_hand must be positive number');

  try {
    const row = await withTransaction(async (client) => {
      const uid = await generateUidInTx(client);
      const inserted = await client.query(
        `INSERT INTO inventory_uids (uid, part_no, qty_on_hand, status, lot_no, received_by, note)
         VALUES ($1, $2, $3, 'PENDING', $4, $5, $6)
         RETURNING uid, part_no, qty_on_hand, status, lot_no, received_at`,
        [uid, pnValidation.normalized, qtyOnHand, lotNo, req.user.id, note]
      );
      return inserted.rows[0];
    });

    return res.status(201).json({ status: 'success', receipt: row, request_id: reqId(res) });
  } catch (error) {
    return res.status(500).json({ status: 'error', code: 'STORE_RECEIVE_FAILED', message: error.message, request_id: reqId(res) });
  }
});

router.post('/api/qa/approve', requireRoles(['QA', 'ADMIN']), async (req, res) => {
  const uid = normalizeCode(req.body?.uid);
  const status = normalizeCode(req.body?.status || 'APPROVED');

  const uidValidation = validateUid(uid);
  if (!uidValidation.valid) return sendValidationError(res, 'invalid uid', uidValidation.errors);
  if (!['APPROVED', 'REJECTED'].includes(status)) return sendValidationError(res, 'status must be APPROVED or REJECTED');

  try {
    const result = await query(
      `UPDATE inventory_uids
       SET status=$2::inventory_uid_status,
           approved_by=$3,
           approved_at=NOW()
       WHERE uid=$1
       RETURNING uid, part_no, qty_on_hand, status, approved_by, approved_at`,
      [uid, status, req.user.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ status: 'error', code: 'UID_NOT_FOUND', request_id: reqId(res) });
    }

    const updatedUid = result.rows[0];
    const notifications = [];
    if (updatedUid.status === 'APPROVED') {
      notifications.push({
        notice_type: 'UID_QA_APPROVED',
        severity: 'INFO',
        audience_key: 'STORE',
        title: `UID ${updatedUid.uid} approved`,
        message: `QA approved material ${updatedUid.part_no} (qty=${Number(updatedUid.qty_on_hand || 0)}).`,
        entity_type: 'INVENTORY_UID',
        entity_id: updatedUid.uid,
        uid: updatedUid.uid,
        created_by: req.user.id,
      });
      notifications.push({
        notice_type: 'UID_QA_APPROVED',
        severity: 'INFO',
        audience_key: 'ACCOUNT',
        title: `QA approved UID ${updatedUid.uid}`,
        message: `Material ${updatedUid.part_no} is now approved for issue.`,
        entity_type: 'INVENTORY_UID',
        entity_id: updatedUid.uid,
        uid: updatedUid.uid,
        created_by: req.user.id,
      });
    } else {
      notifications.push({
        notice_type: 'UID_QA_REJECTED',
        severity: 'WARN',
        audience_key: 'STORE',
        title: `UID ${updatedUid.uid} rejected`,
        message: `QA rejected material ${updatedUid.part_no}; rework or replacement required.`,
        entity_type: 'INVENTORY_UID',
        entity_id: updatedUid.uid,
        uid: updatedUid.uid,
        created_by: req.user.id,
      });
    }
    await safeCreateNotifications(notifications);

    return res.json({ status: 'success', uid: updatedUid, request_id: reqId(res) });
  } catch (error) {
    return res.status(500).json({ status: 'error', code: 'QA_APPROVE_FAILED', message: error.message, request_id: reqId(res) });
  }
});

router.get('/api/store/uids', requireRoles(['STORE', 'QA', 'PM', 'QC', 'ADMIN']), async (req, res) => {
  try {
    const result = await query(
      `SELECT uid, part_no, qty_on_hand, status, lot_no, received_at, received_by, approved_at, approved_by, note
       FROM inventory_uids
       ORDER BY received_at DESC
       LIMIT 200`
    );
    return res.json({ status: 'success', uids: result.rows, request_id: reqId(res) });
  } catch (error) {
    return res.status(500).json({ status: 'error', code: 'FETCH_UIDS_FAILED', message: error.message, request_id: reqId(res) });
  }
});

router.get('/api/incoming/pre-wo/:woId(\\d+)', requireRoles(['PM', 'STORE', 'QA', 'PD', 'ADMIN']), async (req, res) => {
  const woId = Number(req.params.woId);
  if (!Number.isInteger(woId) || woId <= 0) return sendValidationError(res, 'woId must be positive integer');

  try {
    const payload = await withTransaction(async (client) => {
      const woLock = await client.query(
        `SELECT id
         FROM work_orders
         WHERE id = $1
         FOR UPDATE`,
        [woId]
      );
      if (!woLock.rows.length) return { notFound: true };

      await ensureIncomingChecklistInTx(client, woId);
      const checklist = await loadIncomingChecklistInTx(client, woId);
      if (!checklist) return { notFound: true };
      return checklist;
    });

    if (payload.notFound) {
      return res.status(404).json({ status: 'error', code: 'WO_NOT_FOUND', request_id: reqId(res) });
    }

    return res.json({ status: 'success', ...payload, request_id: reqId(res) });
  } catch (error) {
    return res.status(500).json({ status: 'error', code: 'INCOMING_CHECKLIST_FETCH_FAILED', message: error.message, request_id: reqId(res) });
  }
});

router.post('/api/incoming/pre-wo/store-check', requireRoles(['STORE', 'ADMIN']), async (req, res) => {
  const woId = Number(req.body?.wo_id);
  const lineNo = Number(req.body?.line_no);
  if (!Number.isInteger(woId) || woId <= 0) return sendValidationError(res, 'wo_id must be positive integer');
  if (!Number.isInteger(lineNo) || lineNo <= 0) return sendValidationError(res, 'line_no must be positive integer');

  const actingRole = resolveIncomingChecklistRole(req);
  if (actingRole !== 'STORE') {
    return res.status(403).json({ status: 'error', code: 'FORBIDDEN_ACTOR', message: 'store-check requires acting_role STORE', request_id: reqId(res) });
  }

  try {
    const payload = await withTransaction(async (client) => {
      const woResult = await client.query(
        `SELECT id
         FROM work_orders
         WHERE id = $1
         FOR UPDATE`,
        [woId]
      );
      if (!woResult.rows.length) return { notFound: 'wo' };

      await ensureIncomingChecklistInTx(client, woId);

      const reviewResult = await client.query(
        `SELECT status
         FROM wo_incoming_reviews
         WHERE wo_id = $1
         FOR UPDATE`,
        [woId]
      );
      const review = reviewResult.rows[0];
      if (!review) return { conflict: 'incoming checklist not initialized' };
      if (review.status === 'QA_APPROVED') {
        return { conflict: 'QA already approved incoming checklist; further store changes are blocked' };
      }

      const itemResult = await client.query(
        `SELECT line_no, part_no, qty_required, approved_qty, store_checked
         FROM wo_incoming_review_items
         WHERE wo_id = $1
           AND line_no = $2
         FOR UPDATE`,
        [woId, lineNo]
      );
      if (!itemResult.rows.length) return { notFound: 'line' };
      const item = itemResult.rows[0];

      const approvedQtyResult = await client.query(
        `SELECT COALESCE(SUM(qty_on_hand), 0)::numeric(18, 3) AS approved_qty
         FROM inventory_uids
         WHERE part_no = $1
           AND status = 'APPROVED'`,
        [item.part_no]
      );
      const approvedQty = Number(approvedQtyResult.rows[0].approved_qty || 0);
      const requiredQty = Number(item.qty_required || 0);
      if (approvedQty < requiredQty) {
        return {
          conflict: `insufficient approved material for line ${lineNo} (${item.part_no}): required=${requiredQty}, approved=${approvedQty}`,
          code: 'INCOMING_ITEM_SHORTAGE',
        };
      }

      const updatedItem = await client.query(
        `UPDATE wo_incoming_review_items
         SET approved_qty = $3,
             store_checked = TRUE,
             store_checked_by = $4,
             store_checked_at = NOW()
         WHERE wo_id = $1
           AND line_no = $2
         RETURNING line_no, part_no, qty_required, approved_qty, store_checked, store_checked_at`,
        [woId, lineNo, approvedQty, req.user.id]
      );

      await client.query(
        `UPDATE wo_incoming_reviews
         SET status = 'PENDING_STORE',
             store_validated_by = NULL,
             store_validated_at = NULL,
             qa_approved_by = NULL,
             qa_approved_at = NULL
         WHERE wo_id = $1`,
        [woId]
      );

      const checklist = await loadIncomingChecklistInTx(client, woId);
      return { item: updatedItem.rows[0], checklist };
    });

    if (payload.notFound === 'wo') {
      return res.status(404).json({ status: 'error', code: 'WO_NOT_FOUND', request_id: reqId(res) });
    }
    if (payload.notFound === 'line') {
      return res.status(404).json({ status: 'error', code: 'INCOMING_LINE_NOT_FOUND', request_id: reqId(res) });
    }
    if (payload.conflict) {
      const code = payload.code || 'INCOMING_STORE_CHECK_BLOCKED';
      return res.status(409).json({ status: 'error', code, message: payload.conflict, request_id: reqId(res) });
    }

    return res.json({
      status: 'success',
      item: payload.item,
      checklist: payload.checklist,
      request_id: reqId(res),
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', code: 'INCOMING_STORE_CHECK_FAILED', message: error.message, request_id: reqId(res) });
  }
});

router.post('/api/incoming/pre-wo/qa-check', requireRoles(['QA', 'ADMIN']), async (req, res) => {
  const woId = Number(req.body?.wo_id);
  const lineNo = Number(req.body?.line_no);
  if (!Number.isInteger(woId) || woId <= 0) return sendValidationError(res, 'wo_id must be positive integer');
  if (!Number.isInteger(lineNo) || lineNo <= 0) return sendValidationError(res, 'line_no must be positive integer');

  const actingRole = resolveIncomingChecklistRole(req);
  if (actingRole !== 'QA') {
    return res.status(403).json({ status: 'error', code: 'FORBIDDEN_ACTOR', message: 'qa-check requires acting_role QA', request_id: reqId(res) });
  }

  try {
    const payload = await withTransaction(async (client) => {
      const woResult = await client.query(
        `SELECT id
         FROM work_orders
         WHERE id = $1
         FOR UPDATE`,
        [woId]
      );
      if (!woResult.rows.length) return { notFound: 'wo' };

      await ensureIncomingChecklistInTx(client, woId);

      const reviewResult = await client.query(
        `SELECT status
         FROM wo_incoming_reviews
         WHERE wo_id = $1
         FOR UPDATE`,
        [woId]
      );
      const review = reviewResult.rows[0];
      if (!review) return { conflict: 'incoming checklist not initialized' };
      if (!['STORE_VALIDATED', 'QA_APPROVED'].includes(review.status)) {
        return { conflict: `QA checks require store validation first (current=${review.status})` };
      }

      const itemResult = await client.query(
        `SELECT line_no, part_no, qty_required, approved_qty, store_checked, qa_checked
         FROM wo_incoming_review_items
         WHERE wo_id = $1
           AND line_no = $2
         FOR UPDATE`,
        [woId, lineNo]
      );
      if (!itemResult.rows.length) return { notFound: 'line' };
      const item = itemResult.rows[0];
      if (!item.store_checked) {
        return { conflict: `line ${lineNo} must be checked by Store before QA check` };
      }

      const approvedQtyResult = await client.query(
        `SELECT COALESCE(SUM(qty_on_hand), 0)::numeric(18, 3) AS approved_qty
         FROM inventory_uids
         WHERE part_no = $1
           AND status = 'APPROVED'`,
        [item.part_no]
      );
      const approvedQty = Number(approvedQtyResult.rows[0].approved_qty || 0);
      const requiredQty = Number(item.qty_required || 0);
      if (approvedQty < requiredQty) {
        return {
          conflict: `insufficient approved material for line ${lineNo} (${item.part_no}): required=${requiredQty}, approved=${approvedQty}`,
          code: 'INCOMING_ITEM_SHORTAGE',
        };
      }

      const updatedItem = await client.query(
        `UPDATE wo_incoming_review_items
         SET approved_qty = $3,
             qa_checked = TRUE,
             qa_checked_by = $4,
             qa_checked_at = NOW()
         WHERE wo_id = $1
           AND line_no = $2
         RETURNING line_no, part_no, qty_required, approved_qty, store_checked, qa_checked, qa_checked_at`,
        [woId, lineNo, approvedQty, req.user.id]
      );

      const checklist = await loadIncomingChecklistInTx(client, woId);
      return { item: updatedItem.rows[0], checklist };
    });

    if (payload.notFound === 'wo') {
      return res.status(404).json({ status: 'error', code: 'WO_NOT_FOUND', request_id: reqId(res) });
    }
    if (payload.notFound === 'line') {
      return res.status(404).json({ status: 'error', code: 'INCOMING_LINE_NOT_FOUND', request_id: reqId(res) });
    }
    if (payload.conflict) {
      const code = payload.code || 'INCOMING_QA_CHECK_BLOCKED';
      return res.status(409).json({ status: 'error', code, message: payload.conflict, request_id: reqId(res) });
    }

    return res.json({
      status: 'success',
      item: payload.item,
      checklist: payload.checklist,
      request_id: reqId(res),
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', code: 'INCOMING_QA_CHECK_FAILED', message: error.message, request_id: reqId(res) });
  }
});

router.post('/api/incoming/pre-wo/validate-store', requireRoles(['STORE', 'ADMIN']), async (req, res) => {
  const woId = Number(req.body?.wo_id);
  if (!Number.isInteger(woId) || woId <= 0) return sendValidationError(res, 'wo_id must be positive integer');

  const actingRole = resolveIncomingChecklistRole(req);
  if (actingRole !== 'STORE') {
    return res.status(403).json({ status: 'error', code: 'FORBIDDEN_ACTOR', message: 'validate-store requires acting_role STORE', request_id: reqId(res) });
  }

  try {
    const payload = await withTransaction(async (client) => {
      const woResult = await client.query(
        `SELECT id, wo_number, created_by
         FROM work_orders
         WHERE id = $1
         FOR UPDATE`,
        [woId]
      );
      if (!woResult.rows.length) return { notFound: true };
      const wo = woResult.rows[0];

      await ensureIncomingChecklistInTx(client, woId);

      await client.query(
        `UPDATE wo_incoming_review_items item
         SET approved_qty = COALESCE(
           (
             SELECT SUM(uid.qty_on_hand)::numeric(18, 3)
             FROM inventory_uids uid
             WHERE uid.status = 'APPROVED'
               AND uid.part_no = item.part_no
           ),
           0
         )
         WHERE item.wo_id = $1`,
        [woId]
      );

      const summaryResult = await client.query(
        `SELECT
           COUNT(*)::int AS total_items,
           COUNT(*) FILTER (WHERE store_checked)::int AS store_checked_items,
           COUNT(*) FILTER (WHERE approved_qty >= qty_required)::int AS qty_ready_items
         FROM wo_incoming_review_items
         WHERE wo_id = $1`,
        [woId]
      );
      const summary = summaryResult.rows[0];
      const totalItems = Number(summary.total_items || 0);
      const storeCheckedItems = Number(summary.store_checked_items || 0);
      const qtyReadyItems = Number(summary.qty_ready_items || 0);
      if (!totalItems) return { conflict: 'no BOM snapshot lines available for incoming validation' };
      if (storeCheckedItems < totalItems) {
        return { conflict: `store checklist is incomplete (${storeCheckedItems}/${totalItems})` };
      }
      if (qtyReadyItems < totalItems) {
        return { conflict: `approved qty check is incomplete (${qtyReadyItems}/${totalItems})` };
      }

      await client.query(
        `UPDATE wo_incoming_reviews
         SET status = 'STORE_VALIDATED',
             store_validated_by = $2,
             store_validated_at = NOW(),
             qa_approved_by = NULL,
             qa_approved_at = NULL
         WHERE wo_id = $1`,
        [woId, req.user.id]
      );

      const checklist = await loadIncomingChecklistInTx(client, woId);
      return { checklist, wo };
    });

    if (payload.notFound) {
      return res.status(404).json({ status: 'error', code: 'WO_NOT_FOUND', request_id: reqId(res) });
    }
    if (payload.conflict) {
      return res.status(409).json({ status: 'error', code: 'INCOMING_STORE_VALIDATE_BLOCKED', message: payload.conflict, request_id: reqId(res) });
    }

    const woLabel = payload.wo.wo_number || `ID-${payload.wo.id}`;
    await safeCreateNotifications([
      {
        notice_type: 'INCOMING_STORE_VALIDATED',
        severity: 'INFO',
        audience_key: 'QA',
        title: `Incoming checklist ready for QA (${woLabel})`,
        message: `Store validated all BOM lines for WO ${woLabel}. QA can approve now.`,
        entity_type: 'WORK_ORDER',
        entity_id: String(payload.wo.id),
        wo_id: payload.wo.id,
        created_by: req.user.id,
      },
      {
        notice_type: 'INCOMING_STORE_VALIDATED',
        severity: 'INFO',
        audience_key: 'ACCOUNT',
        title: `Store validated incoming for WO ${woLabel}`,
        message: 'Incoming checklist moved to QA approval stage.',
        entity_type: 'WORK_ORDER',
        entity_id: String(payload.wo.id),
        wo_id: payload.wo.id,
        created_by: req.user.id,
      },
    ]);

    return res.json({
      status: 'success',
      checklist: payload.checklist,
      request_id: reqId(res),
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', code: 'INCOMING_STORE_VALIDATE_FAILED', message: error.message, request_id: reqId(res) });
  }
});

router.post('/api/incoming/pre-wo/approve-qa', requireRoles(['QA', 'ADMIN']), async (req, res) => {
  const woId = Number(req.body?.wo_id);
  if (!Number.isInteger(woId) || woId <= 0) return sendValidationError(res, 'wo_id must be positive integer');

  const actingRole = resolveIncomingChecklistRole(req);
  if (actingRole !== 'QA') {
    return res.status(403).json({ status: 'error', code: 'FORBIDDEN_ACTOR', message: 'approve-qa requires acting_role QA', request_id: reqId(res) });
  }

  try {
    const payload = await withTransaction(async (client) => {
      const woResult = await client.query(
        `SELECT id, wo_number, created_by
         FROM work_orders
         WHERE id = $1
         FOR UPDATE`,
        [woId]
      );
      if (!woResult.rows.length) return { notFound: true };
      const wo = woResult.rows[0];

      await ensureIncomingChecklistInTx(client, woId);

      const reviewResult = await client.query(
        `SELECT status
         FROM wo_incoming_reviews
         WHERE wo_id = $1
         FOR UPDATE`,
        [woId]
      );
      const review = reviewResult.rows[0];
      if (!review) return { conflict: 'incoming checklist not initialized' };
      if (review.status !== 'STORE_VALIDATED' && review.status !== 'QA_APPROVED') {
        return { conflict: `QA approval requires STORE_VALIDATED status (current=${review.status})` };
      }
      if (review.status === 'QA_APPROVED') {
        const checklist = await loadIncomingChecklistInTx(client, woId);
        return { checklist, wo, alreadyApproved: true };
      }

      const summaryResult = await client.query(
        `SELECT
           COUNT(*)::int AS total_items,
           COUNT(*) FILTER (WHERE store_checked)::int AS store_checked_items,
           COUNT(*) FILTER (WHERE qa_checked)::int AS qa_checked_items,
           COUNT(*) FILTER (WHERE approved_qty >= qty_required)::int AS qty_ready_items
         FROM wo_incoming_review_items
         WHERE wo_id = $1`,
        [woId]
      );
      const summary = summaryResult.rows[0];
      const totalItems = Number(summary.total_items || 0);
      const storeCheckedItems = Number(summary.store_checked_items || 0);
      const qaCheckedItems = Number(summary.qa_checked_items || 0);
      const qtyReadyItems = Number(summary.qty_ready_items || 0);
      if (!totalItems) return { conflict: 'no BOM snapshot lines available for incoming approval' };
      if (storeCheckedItems < totalItems) {
        return { conflict: `store checklist is incomplete (${storeCheckedItems}/${totalItems})` };
      }
      if (qaCheckedItems < totalItems) {
        return { conflict: `qa checklist is incomplete (${qaCheckedItems}/${totalItems})` };
      }
      if (qtyReadyItems < totalItems) {
        return { conflict: `approved qty check is incomplete (${qtyReadyItems}/${totalItems})` };
      }

      await client.query(
        `UPDATE wo_incoming_reviews
         SET status = 'QA_APPROVED',
             qa_approved_by = $2,
             qa_approved_at = NOW()
         WHERE wo_id = $1`,
        [woId, req.user.id]
      );

      const checklist = await loadIncomingChecklistInTx(client, woId);
      return { checklist, wo, alreadyApproved: false };
    });

    if (payload.notFound) {
      return res.status(404).json({ status: 'error', code: 'WO_NOT_FOUND', request_id: reqId(res) });
    }
    if (payload.conflict) {
      return res.status(409).json({ status: 'error', code: 'INCOMING_QA_APPROVE_BLOCKED', message: payload.conflict, request_id: reqId(res) });
    }

    if (!payload.alreadyApproved) {
      const woLabel = payload.wo.wo_number || `ID-${payload.wo.id}`;
      await safeCreateNotifications([
        {
          notice_type: 'INCOMING_QA_APPROVED',
          severity: 'INFO',
          audience_key: 'PM',
          title: `Incoming approved by QA (${woLabel})`,
          message: 'All incoming materials are validated and approved for WO release.',
          entity_type: 'WORK_ORDER',
          entity_id: String(payload.wo.id),
          wo_id: payload.wo.id,
          created_by: req.user.id,
        },
        {
          notice_type: 'INCOMING_QA_APPROVED',
          severity: 'INFO',
          audience_key: 'ACCOUNT',
          title: `QA approved incoming for WO ${woLabel}`,
          message: 'Incoming validation is fully approved.',
          entity_type: 'WORK_ORDER',
          entity_id: String(payload.wo.id),
          wo_id: payload.wo.id,
          created_by: req.user.id,
        },
      ]);
    }

    return res.json({
      status: 'success',
      already_approved: Boolean(payload.alreadyApproved),
      checklist: payload.checklist,
      request_id: reqId(res),
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', code: 'INCOMING_QA_APPROVE_FAILED', message: error.message, request_id: reqId(res) });
  }
});

router.post('/api/store/return-restock', requireRoles(['STORE', 'ADMIN']), async (req, res) => {
  const reqIdNum = Number(req.body?.req_id);
  const note = req.body?.note || '';

  if (!Number.isInteger(reqIdNum) || reqIdNum <= 0) return sendValidationError(res, 'req_id must be positive integer');

  try {
    const payload = await withTransaction(async (client) => {
      const reqResult = await client.query('SELECT status, req_no FROM material_requisitions WHERE id=$1 FOR UPDATE', [reqIdNum]);
      if (!reqResult.rows.length) return { notFound: true };
      const requisition = reqResult.rows[0];

      if (requisition.status !== 'PENDING_RESTOCK') {
        return { conflict: `Store can only restock returns when status is PENDING_RESTOCK (current=${requisition.status})` };
      }

      await client.query(
        'UPDATE material_requisitions SET status=$1, updated_at=NOW() WHERE id=$2',
        ['CLOSED', reqIdNum]
      );

      // Note: A full ERP implementation would also generate new UIDs for the returned quantities here, 
      // or increment existing UIDs. For this Tracking scope, closing the document suffices to end the workflow.

      return { req_no: requisition.req_no };
    });

    if (payload.notFound) return res.status(404).json({ status: 'error', code: 'REQ_NOT_FOUND', request_id: reqId(res) });
    if (payload.conflict) return res.status(409).json({ status: 'error', code: 'STORE_RESTOCK_BLOCKED', message: payload.conflict, request_id: reqId(res) });

    await safeCreateNotifications([{
      notice_type: 'MATERIAL_RETURN_RESTOCKED',
      severity: 'INFO',
      audience_key: 'PM',
      title: `Material Return Complete for ${payload.req_no}`,
      message: `Store has gathered and restocked the remaining materials for Requisition ${payload.req_no}. Document CLOSED.`,
      entity_type: 'REQUISITION',
      entity_id: String(reqIdNum),
      created_by: req.user.id,
    }]);

    return res.json({ status: 'success', req_no: payload.req_no, req_status: 'CLOSED', request_id: reqId(res) });
  } catch (error) {
    return res.status(500).json({ status: 'error', code: 'STORE_RESTOCK_FAILED', message: error.message, request_id: reqId(res) });
  }
});


router.post('/api/incoming/pre-wo/reject-qa', requireRoles(['QA', 'ADMIN']), async (req, res) => {
  const woId = Number(req.body?.wo_id);
  const reason = String(req.body?.reason || '').slice(0, 500);
  if (!Number.isInteger(woId) || woId <= 0) return sendValidationError(res, 'wo_id must be positive integer');
  if (!reason) return sendValidationError(res, 'reason is required');

  const actingRole = resolveIncomingChecklistRole(req);
  if (actingRole !== 'QA') {
    return res.status(403).json({ status: 'error', code: 'FORBIDDEN_ACTOR', message: 'reject-qa requires acting_role QA', request_id: reqId(res) });
  }

  try {
    const payload = await withTransaction(async (client) => {
      const woResult = await client.query(
        'SELECT id, wo_number FROM work_orders WHERE id=$1 FOR UPDATE', [woId]
      );
      if (!woResult.rows.length) return { notFound: true };
      const wo = woResult.rows[0];

      await ensureIncomingChecklistInTx(client, woId);

      const reviewResult = await client.query(
        'SELECT status FROM wo_incoming_reviews WHERE wo_id=$1 FOR UPDATE', [woId]
      );
      const review = reviewResult.rows[0];
      if (!review) return { conflict: 'incoming checklist not initialized' };
      if (review.status !== 'STORE_VALIDATED') {
        return { conflict: 'QA rejection requires STORE_VALIDATED status (current=' + review.status + ')' };
      }

      // Reset checklist to PENDING_STORE — clear store validation + all QA checks
      await client.query(
        'UPDATE wo_incoming_reviews SET status=\'PENDING_STORE\', store_validated_by=NULL, store_validated_at=NULL, qa_approved_by=NULL, qa_approved_at=NULL, updated_at=NOW() WHERE wo_id=$1',
        [woId]
      );
      await client.query(
        'UPDATE wo_incoming_review_items SET qa_checked=false, qa_checked_by=NULL, qa_checked_at=NULL, store_checked=false, store_checked_by=NULL, store_checked_at=NULL, note=CASE WHEN note IS NULL OR note=\'\' THEN $2 ELSE note||\' | QA rejected: \'||$2 END, updated_at=NOW() WHERE wo_id=$1',
        [woId, reason]
      );

      return { wo };
    });

    if (payload.notFound) return res.status(404).json({ status: 'error', code: 'WO_NOT_FOUND', request_id: reqId(res) });
    if (payload.conflict) return res.status(409).json({ status: 'error', code: 'INCOMING_QA_REJECT_BLOCKED', message: payload.conflict, request_id: reqId(res) });

    const woLabel = payload.wo.wo_number || ('ID-' + payload.wo.id);
    await safeCreateNotifications([
      {
        notice_type: 'INCOMING_QA_REJECTED',
        severity: 'WARNING',
        audience_key: 'STORE',
        title: 'Incoming rejected by QA (' + woLabel + ')',
        message: 'QA rejected the incoming checklist. Reason: ' + reason + '. Please re-validate materials.',
        entity_type: 'WORK_ORDER',
        entity_id: String(payload.wo.id),
        wo_id: payload.wo.id,
        created_by: req.user.id,
      },
    ]);

    return res.json({ status: 'success', checklist_status: 'PENDING_STORE', request_id: reqId(res) });
  } catch (error) {
    return res.status(500).json({ status: 'error', code: 'INCOMING_QA_REJECT_FAILED', message: error.message, request_id: reqId(res) });
  }
});

module.exports = router;
