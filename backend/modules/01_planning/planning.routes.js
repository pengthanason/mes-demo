const express = require('express');
const { query, withTransaction } = require('../../db');
const {
  normalizeCode,
  validatePN,
} = require('../../utils/validator');
const {
  normalizeText,
  sendValidationError,
  parseNumber,
  reqId,
  requireRoles,
} = require('../../common/http');

const router = express.Router();

function parseCsvLine(line) {
  // Strict parser for controlled onboarding template (no nested quotes/escapes).
  return line.split(',').map((v) => normalizeText(v).replace(/^"|"$/g, ''));
}

function parseCsv(csvText) {
  const lines = String(csvText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return { headers: [], rows: [] };

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const rows = lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = normalizeText(cols[idx] || '');
    });
    return row;
  });

  return { headers, rows };
}

router.post('/api/planning/pre-wo', requireRoles(['PM', 'ADMIN']), async (req, res) => {
  const partNo = normalizeCode(req.body?.part_no);
  const qtyTarget = parseNumber(req.body?.qty_target, NaN);
  const bomHeaderId = req.body?.bom_header_id == null ? null : Number(req.body.bom_header_id);
  const demandPlanRef = normalizeText(req.body?.demand_plan_ref) || null;

  const pnValidation = validatePN(partNo, { enforceComponentWhitelist: false });
  if (!pnValidation.valid) return sendValidationError(res, 'invalid part_no', pnValidation.errors);
  if (!Number.isFinite(qtyTarget) || qtyTarget <= 0) return sendValidationError(res, 'qty_target must be positive number');
  if (!demandPlanRef) return sendValidationError(res, 'mrp_demand_ref is required — every WO must link to a demand plan');
  if (bomHeaderId != null && (!Number.isInteger(bomHeaderId) || bomHeaderId <= 0)) {
    return sendValidationError(res, 'bom_header_id must be positive integer');
  }

  try {
    const result = await query(
      `INSERT INTO work_orders (part_no, qty_target, status, bom_header_id, created_by, demand_plan_ref)
       VALUES ($1, $2, 'DRAFT', $3, $4, $5)
       RETURNING id, wo_number, part_no, demand_plan_ref, qty_target, status, bom_header_id, created_at`,
      [pnValidation.normalized, qtyTarget, bomHeaderId, req.user.id, demandPlanRef]
    );

    return res.status(201).json({ status: 'success', pre_wo: result.rows[0], request_id: reqId(res) });
  } catch (error) {
    return res.status(500).json({ status: 'error', code: 'CREATE_PRE_WO_FAILED', message: error.message, request_id: reqId(res) });
  }
});

router.post('/api/bom/upload', requireRoles(['ADMIN']), async (req, res) => {
  const bomCode = normalizeText(req.body?.bom_code);
  const partNo = normalizeCode(req.body?.part_no);
  const customer = normalizeText(req.body?.customer);
  const model = normalizeText(req.body?.model);
  const revision = normalizeText(req.body?.revision);
  const csvText = req.body?.csv_text;

  if (!bomCode) return sendValidationError(res, 'bom_code is required');

  const rootValidation = validatePN(partNo, { enforceComponentWhitelist: false });
  if (!rootValidation.valid) return sendValidationError(res, 'invalid bom header part_no', rootValidation.errors);
  if (!normalizeText(csvText)) return sendValidationError(res, 'csv_text is required');

  const { headers, rows } = parseCsv(csvText);
  if (!headers.length || !rows.length) return sendValidationError(res, 'csv_text must contain header and at least one detail row');
  if (!headers.includes('part_no') || !headers.includes('qty_per')) {
    return sendValidationError(res, 'csv header must include part_no and qty_per');
  }

  const normalizedLines = [];
  const lineErrors = [];

  rows.forEach((row, idx) => {
    const rowNo = idx + 2;
    const rowPart = normalizeCode(row.part_no);
    const rowQty = parseNumber(row.qty_per, NaN);
    const rowLine = Number.parseInt(row.line_no, 10);
    const lineNo = Number.isInteger(rowLine) && rowLine > 0 ? rowLine : idx + 1;
    const pnCheck = validatePN(rowPart, { enforceComponentWhitelist: true });

    if (!pnCheck.valid) {
      lineErrors.push({ row: rowNo, field: 'part_no', errors: pnCheck.errors });
      return;
    }
    if (!Number.isFinite(rowQty) || rowQty <= 0) {
      lineErrors.push({ row: rowNo, field: 'qty_per', errors: ['qty_per must be positive number'] });
      return;
    }

    normalizedLines.push({
      line_no: lineNo,
      part_no: pnCheck.normalized,
      qty_per: rowQty,
      uom: normalizeText(row.uom) || 'EA',
      description: normalizeText(row.description),
    });
  });

  if (lineErrors.length) {
    return sendValidationError(res, 'bom detail validation failed', lineErrors);
  }

  try {
    const payload = await withTransaction(async (client) => {
      const existing = await client.query('SELECT id FROM master_bom_header WHERE bom_code=$1 FOR UPDATE', [bomCode]);
      let bomHeaderId;

      if (existing.rows.length) {
        bomHeaderId = Number(existing.rows[0].id);
        await client.query(
          `UPDATE master_bom_header
           SET part_no=$2, customer=$3, model=$4, revision=$5, status='DRAFT', approved_by=NULL, approved_at=NULL, uploaded_by=$6, uploaded_at=NOW()
           WHERE id=$1`,
          [bomHeaderId, rootValidation.normalized, customer, model, revision, req.user.id]
        );
        await client.query('DELETE FROM master_bom_detail WHERE bom_header_id=$1', [bomHeaderId]);
      } else {
        const inserted = await client.query(
          `INSERT INTO master_bom_header (bom_code, part_no, customer, model, revision, status, uploaded_by)
           VALUES ($1, $2, $3, $4, $5, 'DRAFT', $6)
           RETURNING id`,
          [bomCode, rootValidation.normalized, customer, model, revision, req.user.id]
        );
        bomHeaderId = Number(inserted.rows[0].id);
      }

      for (const line of normalizedLines) {
        await client.query(
          `INSERT INTO master_bom_detail (bom_header_id, line_no, part_no, qty_per, uom, description)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [bomHeaderId, line.line_no, line.part_no, line.qty_per, line.uom, line.description]
        );
      }

      return { bom_header_id: bomHeaderId, lines: normalizedLines.length };
    });

    return res.status(201).json({ status: 'success', ...payload, request_id: reqId(res) });
  } catch (error) {
    if (error?.code === '23505') {
      return res.status(409).json({
        status: 'error',
        code: 'BOM_LINE_CONFLICT',
        message: 'duplicate line_no in BOM details',
        request_id: reqId(res),
      });
    }

    return res.status(500).json({ status: 'error', code: 'BOM_UPLOAD_FAILED', message: error.message, request_id: reqId(res) });
  }
});

router.get('/api/bom/:bomId/review', requireRoles(['PM', 'STORE', 'QC', 'QA', 'TECH', 'PD', 'ADMIN']), async (req, res) => {
  const bomId = Number(req.params.bomId);
  if (!Number.isInteger(bomId) || bomId <= 0) return sendValidationError(res, 'bomId must be positive integer');

  try {
    const headerResult = await query('SELECT * FROM master_bom_header WHERE id=$1', [bomId]);
    if (!headerResult.rows.length) {
      return res.status(404).json({ status: 'error', code: 'BOM_NOT_FOUND', request_id: reqId(res) });
    }

    const detailsResult = await query(
      `SELECT line_no, part_no, qty_per, uom, description
       FROM master_bom_detail
       WHERE bom_header_id=$1
       ORDER BY line_no`,
      [bomId]
    );

    return res.json({
      status: 'success',
      header: headerResult.rows[0],
      details: detailsResult.rows,
      request_id: reqId(res),
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', code: 'BOM_REVIEW_FAILED', message: error.message, request_id: reqId(res) });
  }
});

router.put('/api/bom/:bomId/detail/:lineNo', requireRoles(['PM', 'ADMIN']), async (req, res) => {
  const bomId = Number(req.params.bomId);
  const lineNo = Number(req.params.lineNo);
  if (!Number.isInteger(bomId) || bomId <= 0) return sendValidationError(res, 'bomId must be positive integer');
  if (!Number.isInteger(lineNo) || lineNo <= 0) return sendValidationError(res, 'lineNo must be positive integer');

  const updates = [];
  const params = [];
  let index = 1;

  if (req.body?.part_no != null) {
    const partValidation = validatePN(req.body.part_no, { enforceComponentWhitelist: true });
    if (!partValidation.valid) return sendValidationError(res, 'invalid part_no', partValidation.errors);
    updates.push(`part_no=$${index++}`);
    params.push(partValidation.normalized);
  }
  if (req.body?.qty_per != null) {
    const qtyPer = parseNumber(req.body.qty_per, NaN);
    if (!Number.isFinite(qtyPer) || qtyPer <= 0) return sendValidationError(res, 'qty_per must be positive number');
    updates.push(`qty_per=$${index++}`);
    params.push(qtyPer);
  }
  if (req.body?.uom != null) {
    updates.push(`uom=$${index++}`);
    params.push(normalizeText(req.body.uom) || 'EA');
  }
  if (req.body?.description != null) {
    updates.push(`description=$${index++}`);
    params.push(normalizeText(req.body.description));
  }

  if (!updates.length) return sendValidationError(res, 'no fields to update');

  params.push(bomId, lineNo);

  try {
    const result = await query(
      `UPDATE master_bom_detail
       SET ${updates.join(', ')}
       WHERE bom_header_id=$${index++}
         AND line_no=$${index}
       RETURNING bom_header_id, line_no, part_no, qty_per, uom, description`,
      params
    );

    if (!result.rows.length) {
      return res.status(404).json({ status: 'error', code: 'BOM_LINE_NOT_FOUND', request_id: reqId(res) });
    }

    return res.json({ status: 'success', detail: result.rows[0], request_id: reqId(res) });
  } catch (error) {
    return res.status(500).json({ status: 'error', code: 'BOM_DETAIL_UPDATE_FAILED', message: error.message, request_id: reqId(res) });
  }
});

router.put('/api/bom/:bomId/approve', requireRoles(['PM', 'ADMIN']), async (req, res) => {
  const bomId = Number(req.params.bomId);
  if (!Number.isInteger(bomId) || bomId <= 0) return sendValidationError(res, 'bomId must be positive integer');

  try {
    const result = await query(
      `UPDATE master_bom_header
       SET status='APPROVED', approved_by=$2, approved_at=NOW()
       WHERE id=$1
       RETURNING id, bom_code, status, approved_by, approved_at`,
      [bomId, req.user.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ status: 'error', code: 'BOM_NOT_FOUND', request_id: reqId(res) });
    }

    return res.json({ status: 'success', bom: result.rows[0], request_id: reqId(res) });
  } catch (error) {
    return res.status(500).json({ status: 'error', code: 'BOM_APPROVE_FAILED', message: error.message, request_id: reqId(res) });
  }
});

router.get('/api/bom/headers', requireRoles(['PM', 'STORE', 'QC', 'QA', 'TECH', 'PD', 'ADMIN']), async (req, res) => {
  try {
    const result = await query(
      `SELECT id, bom_code, part_no, customer, model, revision, status, uploaded_by, uploaded_at, approved_by, approved_at 
       FROM master_bom_header 
       ORDER BY uploaded_at DESC 
       LIMIT 100`
    );
    return res.json({ status: 'success', boms: result.rows, request_id: reqId(res) });
  } catch (error) {
    return res.status(500).json({ status: 'error', code: 'BOM_HEADERS_FETCH_FAILED', message: error.message, request_id: reqId(res) });
  }
});

// --- NEW ONLINE BOM CRUD ENDPOINTS ---

router.post('/api/bom', requireRoles(['PM', 'ADMIN']), async (req, res) => {
  const bomCode = normalizeText(req.body?.bom_code);
  const partNo = normalizeCode(req.body?.part_no);
  const customer = normalizeText(req.body?.customer);
  const model = normalizeText(req.body?.model);
  const revision = normalizeText(req.body?.revision);

  if (!bomCode) return sendValidationError(res, 'bom_code is required');
  const rootValidation = validatePN(partNo, { enforceComponentWhitelist: false });
  if (!rootValidation.valid) return sendValidationError(res, 'invalid part_no', rootValidation.errors);

  try {
    const inserted = await query(
      `INSERT INTO master_bom_header (bom_code, part_no, customer, model, revision, status, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, 'DRAFT', $6)
       RETURNING id, bom_code, part_no, status, uploaded_at`,
      [bomCode, rootValidation.normalized, customer, model, revision, req.user.id]
    );

    return res.status(201).json({ status: 'success', bom: inserted.rows[0], request_id: reqId(res) });
  } catch (error) {
    if (error?.code === '23505') {
      return res.status(409).json({ status: 'error', code: 'BOM_CODE_CONFLICT', message: 'bom_code already exists', request_id: reqId(res) });
    }
    return res.status(500).json({ status: 'error', code: 'BOM_CREATE_FAILED', message: error.message, request_id: reqId(res) });
  }
});

router.post('/api/bom/:bomId/detail', requireRoles(['PM', 'ADMIN']), async (req, res) => {
  const bomId = Number(req.params.bomId);
  if (!Number.isInteger(bomId) || bomId <= 0) return sendValidationError(res, 'bomId must be positive integer');

  const partNo = normalizeCode(req.body?.part_no);
  const qtyPer = parseNumber(req.body?.qty_per, NaN);
  const uom = normalizeText(req.body?.uom) || 'EA';
  const description = normalizeText(req.body?.description);

  const pnCheck = validatePN(partNo, { enforceComponentWhitelist: true });
  if (!pnCheck.valid) return sendValidationError(res, 'invalid part_no', pnCheck.errors);
  if (!Number.isFinite(qtyPer) || qtyPer <= 0) return sendValidationError(res, 'qty_per must be positive number');

  try {
    const inserted = await withTransaction(async (client) => {
      // get the next line number
      const maxLineRes = await client.query('SELECT MAX(line_no) as max_line FROM master_bom_detail WHERE bom_header_id=$1', [bomId]);
      const nextLine = (maxLineRes.rows[0].max_line || 0) + 1;

      const detail = await client.query(
        `INSERT INTO master_bom_detail (bom_header_id, line_no, part_no, qty_per, uom, description)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [bomId, nextLine, pnCheck.normalized, qtyPer, uom, description]
      );
      return detail.rows[0];
    });

    return res.status(201).json({ status: 'success', detail: inserted, request_id: reqId(res) });
  } catch (error) {
    return res.status(500).json({ status: 'error', code: 'BOM_DETAIL_ADD_FAILED', message: error.message, request_id: reqId(res) });
  }
});

router.delete('/api/bom/:bomId/detail/:lineNo', requireRoles(['PM', 'ADMIN']), async (req, res) => {
  const bomId = Number(req.params.bomId);
  const lineNo = Number(req.params.lineNo);
  if (!Number.isInteger(bomId) || bomId <= 0) return sendValidationError(res, 'bomId must be positive integer');
  if (!Number.isInteger(lineNo) || lineNo <= 0) return sendValidationError(res, 'lineNo must be positive integer');

  try {
    const result = await query(
      `DELETE FROM master_bom_detail
         WHERE bom_header_id=$1 AND line_no=$2 RETURNING line_no`,
      [bomId, lineNo]
    );

    if (!result.rows.length) {
      return res.status(404).json({ status: 'error', code: 'BOM_LINE_NOT_FOUND', request_id: reqId(res) });
    }

    return res.json({ status: 'success', message: `Line ${lineNo} deleted`, request_id: reqId(res) });
  } catch (error) {
    return res.status(500).json({ status: 'error', code: 'BOM_DETAIL_DELETE_FAILED', message: error.message, request_id: reqId(res) });
  }
});

module.exports = router;
