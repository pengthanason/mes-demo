const { randomInt } = require('crypto');
const { query, withTransaction } = require('../../db');
const { normalizeText } = require('../../common/http');

const UID_PATTERN = /^UID-\d{6}-\d{4}$/;

function parseNonNegativeNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function parseDateOrNull(value) {
  const text = normalizeText(value);
  if (!text) return null;
  const dt = new Date(text);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

function buildCaseId() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = randomInt(0, 1000).toString().padStart(3, '0');
  return `CASE-${stamp}-${rand}`;
}

function buildUidCandidate() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yy = String(now.getFullYear()).slice(-2);
  const serial = randomInt(0, 10000).toString().padStart(4, '0');
  return `UID-${dd}${mm}${yy}-${serial}`;
}

function validateUidFormat(uid) {
  if (!UID_PATTERN.test(uid)) {
    throw new Error('INVALID_UID_FORMAT');
  }
}

async function reserveUid(client, requestedUid, partNo, qty, status) {
  const desiredUid = normalizeText(requestedUid);

  if (desiredUid) {
    validateUidFormat(desiredUid);
    const inserted = await client.query(
      `INSERT INTO inventory_uids (uid, part_no, qty_on_hand, status)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING
       RETURNING uid`,
      [desiredUid, partNo, qty, status],
    );
    if (!inserted.rows.length) throw new Error('UID_ALREADY_EXISTS');
    return desiredUid;
  }

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const generatedUid = buildUidCandidate();
    const inserted = await client.query(
      `INSERT INTO inventory_uids (uid, part_no, qty_on_hand, status)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING
       RETURNING uid`,
      [generatedUid, partNo, qty, status],
    );
    if (inserted.rows.length) return generatedUid;
  }

  throw new Error('UID_GENERATION_FAILED');
}

const listCases = async (req, res) => {
  try {
    const statusFilter = normalizeText(req.query?.status).toUpperCase();
    const typeFilter = normalizeText(req.query?.case_type).toUpperCase();
    const limit = Math.min(Math.max(parseInt(req.query?.limit || '100', 10) || 100, 1), 500);
    const offset = Math.max(parseInt(req.query?.offset || '0', 10) || 0, 0);

    const result = await query(
      `SELECT c.*,
              COALESCE(d.disposition_count, 0)::int AS disposition_count
       FROM scm_cases c
       LEFT JOIN (
         SELECT case_id, COUNT(*)::int AS disposition_count
         FROM scm_supplier_dispositions
         GROUP BY case_id
       ) d ON d.case_id = c.case_id
       WHERE ($1::text = '' OR UPPER(c.status) = $1::text)
         AND ($2::text = '' OR UPPER(c.case_type::text) = $2::text)
       ORDER BY c.opened_at DESC
       LIMIT $3 OFFSET $4`,
      [statusFilter, typeFilter, limit, offset],
    );

    return res.json({ success: true, cases: result.rows, limit, offset });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const openCase = async (req, res) => {
  try {
    const caseId = normalizeText(req.body?.case_id) || buildCaseId();
    const caseType = normalizeText(req.body?.case_type).toUpperCase() || 'DOC_PENDING';
    const refPo = normalizeText(req.body?.ref_po);
    const refInv = normalizeText(req.body?.ref_inv);
    const partNo = normalizeText(req.body?.part_no).toUpperCase();
    const ownerId = req.body?.owner_id ?? req.user?.id ?? null;
    const openedBy = req.user?.id ?? null;
    const dueDate = parseDateOrNull(req.body?.due_date);

    const result = await query(
      `INSERT INTO scm_cases (case_id, case_type, ref_po, ref_inv, part_no, owner_id, opened_by, due_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [caseId, caseType, refPo, refInv, partNo, ownerId, openedBy, dueDate],
    );
    return res.status(201).json({ success: true, case: result.rows[0] });
  } catch (err) {
    if (err?.code === '23505') return res.status(409).json({ error: 'case_id already exists' });
    if (err?.code === '22P02') return res.status(400).json({ error: 'invalid case_type' });
    return res.status(500).json({ error: err.message });
  }
};

const resolveCase = async (req, res) => {
  try {
    const caseId = normalizeText(req.params?.caseId);
    const resolutionNote = normalizeText(req.body?.resolution_note);
    const result = await query(
      `UPDATE scm_cases
       SET status = 'CLOSED', resolved_at = NOW(), resolution_note = $1
       WHERE case_id = $2 AND status != 'CLOSED'
       RETURNING *`,
      [resolutionNote, caseId],
    );
    if (!result.rows.length) {
      const check = await query('SELECT status FROM scm_cases WHERE case_id = $1', [caseId]);
      if (!check.rows.length) return res.status(404).json({ error: 'case not found' });
      return res.status(409).json({ error: 'case already closed' });
    }
    return res.json({ success: true, case: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const splitLot = async (req, res) => {
  try {
    const originalUid = normalizeText(req.body?.original_uid);
    const reason = normalizeText(req.body?.reason);
    if (!originalUid) return res.status(400).json({ error: 'original_uid is required' });

    const payload = await withTransaction(async (client) => {
      const origRes = await client.query(
        `SELECT uid, part_no, qty_on_hand, status
         FROM inventory_uids
         WHERE uid = $1
         FOR UPDATE`,
        [originalUid],
      );
      if (!origRes.rows.length) throw new Error('ORIGINAL_UID_NOT_FOUND');

      const original = origRes.rows[0];
      if (String(original.status || '').toUpperCase() === 'SPLIT') throw new Error('ORIGINAL_UID_ALREADY_SPLIT');
      const originalQty = Number(original.qty_on_hand || 0);

      let okQty = parseNonNegativeNumber(req.body?.ok_qty);
      let ngQty = parseNonNegativeNumber(req.body?.ng_qty);

      if (okQty == null && ngQty == null) {
        okQty = originalQty;
        ngQty = 0;
      }
      if (okQty == null || ngQty == null) throw new Error('INVALID_SPLIT_QTY');
      if (okQty + ngQty <= 0) throw new Error('INVALID_SPLIT_QTY');
      if (Math.abs(okQty + ngQty - originalQty) > 0.0001) throw new Error('SPLIT_QTY_MISMATCH');

      const okUid = await reserveUid(client, req.body?.ok_uid, original.part_no, okQty, 'APPROVED');
      const ngUid = await reserveUid(client, req.body?.ng_uid, original.part_no, ngQty, 'REJECTED');
      if (okUid === ngUid || okUid === originalUid || ngUid === originalUid) {
        throw new Error('INVALID_UID_ASSIGNMENT');
      }

      const inserted = await client.query(
        `INSERT INTO scm_split_lots (original_uid, ok_uid, ng_uid, reason, approved_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [originalUid, okUid, ngUid, reason, req.user?.id ?? null],
      );

      await client.query(
        `UPDATE inventory_uids
         SET qty_on_hand = 0,
             status = 'SPLIT'
         WHERE uid = $1`,
        [originalUid],
      );

      return {
        ...inserted.rows[0],
        original_qty: originalQty,
        ok_qty: okQty,
        ng_qty: ngQty,
      };
    });

    return res.status(201).json({ success: true, split: payload });
  } catch (err) {
    if (err.message === 'ORIGINAL_UID_NOT_FOUND') return res.status(404).json({ error: 'Original UID not found' });
    if (err.message === 'ORIGINAL_UID_ALREADY_SPLIT') return res.status(409).json({ error: 'Original UID already split' });
    if (['INVALID_UID_FORMAT', 'INVALID_SPLIT_QTY', 'SPLIT_QTY_MISMATCH', 'INVALID_UID_ASSIGNMENT'].includes(err.message)) {
      const messageMap = {
        INVALID_UID_FORMAT: 'UID format must be UID-DDMMYY-XXXX',
        INVALID_SPLIT_QTY: 'ok_qty and ng_qty must be non-negative numbers, and total must be > 0',
        SPLIT_QTY_MISMATCH: 'ok_qty + ng_qty must equal original UID quantity',
        INVALID_UID_ASSIGNMENT: 'generated/provided UIDs must be unique and different from original_uid',
      };
      return res.status(400).json({ error: messageMap[err.message] });
    }
    if (err.message === 'UID_ALREADY_EXISTS') return res.status(409).json({ error: 'requested UID already exists' });
    return res.status(500).json({ error: err.message });
  }
};

const createDisposition = async (req, res) => {
  try {
    const caseId = normalizeText(req.body?.case_id);
    const action = normalizeText(req.body?.action).toUpperCase();
    const rmaNo = normalizeText(req.body?.rma_no);
    const returnQty = parseNonNegativeNumber(req.body?.return_qty) ?? 0;

    if (!caseId) return res.status(400).json({ error: 'case_id is required' });
    if (!action) return res.status(400).json({ error: 'action is required' });

    const result = await query(
      `INSERT INTO scm_supplier_dispositions (case_id, action, rma_no, return_qty, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [caseId, action, rmaNo, returnQty, req.user?.id ?? null],
    );
    return res.status(201).json({ success: true, disposition: result.rows[0] });
  } catch (err) {
    if (err?.code === '23503') return res.status(404).json({ error: 'case_id not found' });
    if (err?.code === '22P02') return res.status(400).json({ error: 'invalid action' });
    return res.status(500).json({ error: err.message });
  }
};

module.exports = {
  listCases,
  openCase,
  resolveCase,
  splitLot,
  createDisposition,
};






