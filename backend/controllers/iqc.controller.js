// Draft alternate IQC flow. Not mounted by backend/server.js as of 2026-04-08.
// This file uses the PENDING_IQC -> AVAILABLE/QUARANTINE model, while the
// active runtime flow is defined in backend/modules/02_incoming/incoming.routes.js
// and backend/schema.sql.

const dbModule = require('../db');

const db = dbModule.pool || dbModule;

function reqId(res) {
  return res.getHeader('X-Request-Id') || '';
}

function normalizeText(value) {
  if (value == null) return '';
  return String(value).trim();
}

function normalizeCode(value) {
  return normalizeText(value).toUpperCase();
}

function sendValidationError(res, message, details = []) {
  return res.status(400).json({
    status: 'error',
    code: 'VALIDATION_ERROR',
    message,
    details,
    request_id: reqId(res),
  });
}

async function postIqcInspect(req, res) {
  const inspectorId = Number(req.user?.id);
  const uid = normalizeCode(req.body?.uid);
  const result = normalizeCode(req.body?.result);
  const ncReference = normalizeText(req.body?.nc_reference);
  const remark = normalizeText(req.body?.remark);

  if (!Number.isInteger(inspectorId) || inspectorId <= 0) {
    return sendValidationError(res, 'authenticated inspector user id is required');
  }
  if (!uid) {
    return sendValidationError(res, 'uid is required');
  }
  if (!['PASS', 'FAIL'].includes(result)) {
    return sendValidationError(res, "result must be either 'PASS' or 'FAIL'");
  }
  if (result === 'FAIL' && !ncReference) {
    return sendValidationError(res, 'nc_reference is required when result is FAIL');
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const uidResult = await client.query(
      `SELECT uid, status, received_by
       FROM inventory_uids
       WHERE uid = $1
       FOR UPDATE`,
      [uid]
    );

    if (!uidResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        status: 'error',
        code: 'UID_NOT_FOUND',
        message: `uid not found: ${uid}`,
        request_id: reqId(res),
      });
    }

    const inventoryUid = uidResult.rows[0];
    if (inventoryUid.status !== 'PENDING_IQC') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        status: 'error',
        code: 'IQC_STATUS_CONFLICT',
        message: `inspection allowed only when status is PENDING_IQC (current=${inventoryUid.status})`,
        request_id: reqId(res),
      });
    }

    if (Number(inventoryUid.received_by) === inspectorId) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        status: 'error',
        code: 'DUAL_KEY_VIOLATION',
        message: 'inspector must not be the same user as the receiver',
        request_id: reqId(res),
      });
    }

    const inspectionResult = await client.query(
      `INSERT INTO iqc_inspections (
         uid,
         inspector_id,
         result,
         nc_reference,
         remark
       )
       VALUES ($1, $2, $3, NULLIF($4, ''), NULLIF($5, ''))
       RETURNING id, uid, inspector_id, result, nc_reference, remark, created_at`,
      [uid, inspectorId, result, ncReference, remark]
    );

    const nextStatus = result === 'PASS' ? 'AVAILABLE' : 'QUARANTINE';
    const updatedUidResult = await client.query(
      `UPDATE inventory_uids
       SET status = $2,
           updated_at = NOW()
       WHERE uid = $1
       RETURNING uid, status, received_by, updated_at`,
      [uid, nextStatus]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      status: 'success',
      data: {
        inspection: inspectionResult.rows[0],
        inventory_uid: updatedUidResult.rows[0],
      },
      request_id: reqId(res),
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_rollbackError) {
      // eslint-disable-next-line no-console
      console.warn('iqc rollback failed:', _rollbackError?.message || _rollbackError);
    }

    return res.status(500).json({
      status: 'error',
      code: 'IQC_INSPECT_FAILED',
      message: error.message,
      request_id: reqId(res),
    });
  } finally {
    client.release();
  }
}

module.exports = {
  postIqcInspect,
};
