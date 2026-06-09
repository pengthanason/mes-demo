// Draft alternate store receive flow. Not mounted by backend/server.js as of 2026-04-08.
// Active runtime source of truth lives in backend/modules/02_incoming/incoming.routes.js
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

function buildUidFromParts(yymmdd, seq) {
  return `UID-${yymmdd}-${String(seq).padStart(4, '0')}`;
}

function currentYyMmDd(now = new Date()) {
  return now.toISOString().slice(2, 10).replace(/-/g, '');
}

async function generateUidInTx(client) {
  const yymmdd = currentYyMmDd();
  const prefix = `UID-${yymmdd}-`;

  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`uid-${yymmdd}`]);

  const seqResult = await client.query(
    `SELECT COALESCE(
         MAX(
           CASE
             WHEN RIGHT(uid, 4) ~ '^[0-9]{4}$' THEN CAST(RIGHT(uid, 4) AS INTEGER)
             ELSE NULL
           END
         ),
         0
       ) + 1 AS next_seq
     FROM inventory_uids
     WHERE uid LIKE $1`,
    [`${prefix}%`]
  );

  const nextSeq = Number(seqResult.rows[0]?.next_seq || 1);
  if (!Number.isInteger(nextSeq) || nextSeq <= 0 || nextSeq > 9999) {
    throw new Error(`UID sequence overflow for date ${yymmdd}`);
  }

  return buildUidFromParts(yymmdd, nextSeq);
}

async function postStoreReceive(req, res) {
  const receiverId = Number(req.user?.id);
  const synPn = normalizeCode(req.body?.syn_pn);
  const lotNo = normalizeText(req.body?.lot_no);
  const dateCode = normalizeText(req.body?.date_code);
  const qty = parseQty(req.body?.qty);
  const uom = normalizeCode(req.body?.uom || 'PCS') || 'PCS';
  const storeLocation = normalizeText(req.body?.store_location) || 'RECEIVING';

  if (!Number.isInteger(receiverId) || receiverId <= 0) {
    return sendValidationError(res, 'authenticated user id is required');
  }
  if (!synPn) {
    return sendValidationError(res, 'syn_pn is required');
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

    const materialResult = await client.query(
      `SELECT syn_pn
       FROM material_master
       WHERE syn_pn = $1
       LIMIT 1`,
      [synPn]
    );

    if (!materialResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        status: 'error',
        code: 'MATERIAL_NOT_FOUND',
        message: `syn_pn not found in material_master: ${synPn}`,
        request_id: reqId(res),
      });
    }

    const uid = await generateUidInTx(client);

    const insertResult = await client.query(
      `INSERT INTO inventory_uids (
         uid,
         syn_pn,
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
         'PENDING_IQC',
         $7,
         $8
       )
       RETURNING uid, syn_pn, lot_no, date_code, qty, uom, status, store_location, received_by, created_at`,
      [uid, synPn, lotNo, dateCode, qty, uom, storeLocation, receiverId]
    );

    await client.query('COMMIT');

    return res.status(201).json({
      status: 'success',
      message: 'material received and UID created',
      data: insertResult.rows[0],
      barcode_uid: uid,
      request_id: reqId(res),
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_rollbackError) {
      // eslint-disable-next-line no-console
      console.warn('store rollback failed:', _rollbackError?.message || _rollbackError);
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
