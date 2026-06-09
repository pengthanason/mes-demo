// Draft alternate incoming flow. Not mounted by backend/server.js as of 2026-04-08.
// Active runtime source of truth lives in backend/modules/02_incoming/incoming.routes.js
// and backend/schema.sql.

const dbModule = require('../db');
const { generateUidInTx } = require('../common/numbering');

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

function parseQty(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
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

async function postStoreReceive(req, res) {
  const userId = Number(req.user?.id);
  const synPn = normalizeCode(req.body?.syn_pn);
  const mfgPn = normalizeCode(req.body?.mfg_pn);
  const lotNo = normalizeText(req.body?.lot_no);
  const dateCode = normalizeText(req.body?.date_code);
  const qty = parseQty(req.body?.qty);
  const uom = normalizeCode(req.body?.uom || 'PCS') || 'PCS';

  if (!Number.isInteger(userId) || userId <= 0) {
    return sendValidationError(res, 'authenticated user id is required');
  }
  if (!synPn) {
    return sendValidationError(res, 'syn_pn is required');
  }
  if (!mfgPn) {
    return sendValidationError(res, 'mfg_pn is required');
  }
  if (!lotNo) {
    return sendValidationError(res, 'lot_no is required');
  }
  if (!dateCode) {
    return sendValidationError(res, 'date_code is required');
  }
  if (qty == null) {
    return sendValidationError(res, 'qty must be a positive number');
  }
  if (!uom) {
    return sendValidationError(res, 'uom is required');
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const material = await client.query(
      `SELECT syn_pn
       FROM material_master
       WHERE syn_pn = $1
       LIMIT 1`,
      [synPn]
    );

    if (!material.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        status: 'error',
        code: 'MATERIAL_NOT_FOUND',
        message: `syn_pn not found in material_master: ${synPn}`,
        request_id: reqId(res),
      });
    }

    // Utility-based UID generation with advisory lock + daily sequence.
    const uid = await generateUidInTx(client);

    const inserted = await client.query(
      `INSERT INTO inventory_uids (
         uid,
         syn_pn,
         mfg_pn,
         lot_no,
         date_code,
         qty,
         uom,
         status,
         store_location,
         received_by
       )
       VALUES (
         $1,
         $2,
         $3,
         $4,
         $5,
         $6,
         $7,
         'PENDING_IQC',
         'RECEIVING',
         $8
       )
       RETURNING uid, syn_pn, mfg_pn, lot_no, date_code, qty, uom, status, store_location, received_by, created_at`,
      [uid, synPn, mfgPn, lotNo, dateCode, qty, uom, userId]
    );

    await client.query('COMMIT');

    return res.status(201).json({
      status: 'success',
      message: 'material received and UID created',
      data: inserted.rows[0],
      barcode_uid: uid,
      request_id: reqId(res),
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_rollbackError) {
      // eslint-disable-next-line no-console
      console.warn('incoming rollback failed:', _rollbackError?.message || _rollbackError);
    }

    return res.status(500).json({
      status: 'error',
      code: 'STORE_RECEIVE_FAILED',
      message: error.message,
      request_id: reqId(res),
    });
  } finally {
    client.release();
  }
}

module.exports = {
  postStoreReceive,
};
