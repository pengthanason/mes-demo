const db = require('../../db');
const { normalizeText } = require('../../common/http');

function parseNumberOr(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseDateOrNull(value) {
  const text = normalizeText(value);
  if (!text) return null;
  const dt = new Date(text);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

function parseBool(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return ['1', 'true', 'yes', 'y', 'on'].includes(normalized);
  }
  return Boolean(value);
}

const listLeads = async (req, res) => {
  try {
    const statusFilter = normalizeText(req.query?.status).toUpperCase();
    const limit = Math.min(Math.max(parseInt(req.query?.limit || '100', 10) || 100, 1), 500);
    const offset = Math.max(parseInt(req.query?.offset || '0', 10) || 0, 0);
    const params = [];
    let sql = `
      SELECT *
      FROM pm_projects
    `;

    if (statusFilter) {
      params.push(statusFilter);
      sql += ` WHERE status = $${params.length}`;
    }

    params.push(limit, offset);
    sql += ` ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const result = await db.query(sql, params);
    return res.json({ success: true, leads: result.rows, limit, offset });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const getLead = async (req, res) => {
  try {
    const leadId = normalizeText(req.params?.leadId);
    if (!leadId) return res.status(400).json({ error: 'leadId is required' });

    const leadRes = await db.query('SELECT * FROM pm_projects WHERE project_id = $1', [leadId]);
    if (!leadRes.rows.length) return res.status(404).json({ error: 'Lead not found' });

    const crRes = await db.query(
      `SELECT cr_id, project_id, description, impact_cost, impact_time_days, impact_risk, is_approved, approved_by, decision_date, created_at
       FROM pm_cr_logs
       WHERE project_id = $1
       ORDER BY created_at DESC`,
      [leadId],
    );

    return res.json({ success: true, lead: leadRes.rows[0], cr_logs: crRes.rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const createLead = async (req, res) => {
  try {
    const projectId = normalizeText(req.body?.project_id);
    const customer = normalizeText(req.body?.customer);
    const model = normalizeText(req.body?.model);
    const reqQty = parseNumberOr(req.body?.req_qty, 0);
    const dueDate = parseDateOrNull(req.body?.due_date);
    const scopeBoundary = normalizeText(req.body?.scope_boundary);
    const acceptanceCriteria = normalizeText(req.body?.acceptance_criteria);
    const ownerId = req.body?.owner_id ?? req.user?.id ?? null;

    if (!projectId) return res.status(400).json({ error: 'project_id is required' });
    if (!customer) return res.status(400).json({ error: 'customer is required' });
    if (!Number.isFinite(reqQty) || reqQty < 0) return res.status(400).json({ error: 'req_qty must be a number >= 0' });

    const result = await db.query(
      `INSERT INTO pm_projects (project_id, customer, model, req_qty, due_date, scope_boundary, acceptance_criteria, owner_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'LEAD_RECEIVED')
       RETURNING *`,
      [projectId, customer, model, reqQty, dueDate, scopeBoundary, acceptanceCriteria, ownerId],
    );

    return res.status(201).json({ success: true, lead: result.rows[0] });
  } catch (err) {
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'project_id already exists' });
    }
    return res.status(500).json({ error: err.message });
  }
};

const gateG1 = async (req, res) => {
  try {
    const leadId = normalizeText(req.params?.leadId);
    if (!leadId) return res.status(400).json({ error: 'leadId is required' });
    const isApproved = parseBool(req.body?.is_approved);
    const reason = normalizeText(req.body?.reason);
    const newStatus = isApproved ? 'FEASIBILITY' : 'REQ_INTAKE';

    const result = await db.query(
      `UPDATE pm_projects
       SET status = $1
       WHERE project_id = $2
       RETURNING *`,
      [newStatus, leadId],
    );

    if (!result.rows.length) return res.status(404).json({ error: 'Lead not found' });
    return res.json({ success: true, lead: result.rows[0], message: reason });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const gateG2 = async (req, res) => {
  try {
    const leadId = normalizeText(req.params?.leadId);
    if (!leadId) return res.status(400).json({ error: 'leadId is required' });
    const isFeasible = parseBool(req.body?.is_feasible);
    const leadTimeDays = Number.isFinite(Number(req.body?.lead_time_days)) ? Math.trunc(Number(req.body?.lead_time_days)) : null;
    if (leadTimeDays !== null && leadTimeDays < 0) {
      return res.status(400).json({ error: 'lead_time_days must be >= 0' });
    }
    const feasibilityNotes = normalizeText(req.body?.feasibility_notes);
    const newStatus = isFeasible ? 'QUOTE_PACKAGE_BUILD' : 'LOST_NO_PO';

    const result = await db.query(
      `UPDATE pm_projects
       SET status = $1, lead_time_days = $2, feasibility_notes = $3
       WHERE project_id = $4
       RETURNING *`,
      [newStatus, leadTimeDays, feasibilityNotes, leadId],
    );

    if (!result.rows.length) return res.status(404).json({ error: 'Lead not found' });
    return res.json({ success: true, lead: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const openCR = async (req, res) => {
  try {
    const projectId = normalizeText(req.body?.project_id);
    const description = normalizeText(req.body?.description);
    const impactCost = parseNumberOr(req.body?.impact_cost, 0);
    const impactTimeDays = Math.trunc(parseNumberOr(req.body?.impact_time_days, 0));
    const impactRisk = normalizeText(req.body?.impact_risk);

    if (!projectId) return res.status(400).json({ error: 'project_id is required' });
    if (!description) return res.status(400).json({ error: 'description is required' });

    const result = await db.query(
      `INSERT INTO pm_cr_logs (project_id, description, impact_cost, impact_time_days, impact_risk)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [projectId, description, impactCost, impactTimeDays, impactRisk],
    );

    return res.status(201).json({ success: true, cr: result.rows[0] });
  } catch (err) {
    if (err?.code === '23503') {
      return res.status(404).json({ error: 'project_id not found' });
    }
    return res.status(500).json({ error: err.message });
  }
};

const hookH1 = async (req, res) => {
  try {
    const leadId = normalizeText(req.params?.leadId);
    const bomRev = normalizeText(req.body?.bom_rev) || 'v1';
    const routingRev = normalizeText(req.body?.routing_rev);
    const partNo = normalizeText(req.body?.part_no).toUpperCase();
    if (!partNo) return res.status(400).json({ error: 'part_no is required' });

    const projectRes = await db.query('SELECT * FROM pm_projects WHERE project_id = $1', [leadId]);
    if (!projectRes.rows.length) return res.status(404).json({ error: 'Project not found' });
    const project = projectRes.rows[0];

    const bomCode = `BOM-${leadId}-${bomRev}`;

    const bomResult = await db.query(
      `INSERT INTO master_bom_header (bom_code, part_no, customer, model, revision, status)
       VALUES ($1, $2, $3, $4, $5, 'DRAFT')
       ON CONFLICT (bom_code) DO NOTHING
       RETURNING bom_code`,
      [bomCode, partNo, project.customer, project.model, bomRev],
    );
    const wasCreated = bomResult.rows.length > 0;

    return res.json({
      success: true,
      bom_code: bomCode,
      part_no: partNo,
      routing_rev: routingRev,
      was_created: wasCreated,
      message: wasCreated
        ? `Hook H1: BOM ${bomCode} created`
        : `Hook H1: BOM ${bomCode} already exists (no update)`,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const hookH2 = async (req, res) => {
  try {
    const leadId = normalizeText(req.params?.leadId);
    const contractNo = normalizeText(req.body?.contract_no) || `CONT-${leadId}`;
    const poNumber = normalizeText(req.body?.po_number);
    const deliveryTerms = normalizeText(req.body?.delivery_terms);
    const paymentTerms = normalizeText(req.body?.payment_terms);
    const signedDate = parseDateOrNull(req.body?.signed_date);

    await db.query(
      `INSERT INTO pm_contracts (project_id, contract_no, po_number, delivery_terms, payment_terms, signed_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (project_id)
       DO UPDATE SET contract_no = EXCLUDED.contract_no,
                     po_number = EXCLUDED.po_number,
                     delivery_terms = EXCLUDED.delivery_terms,
                     payment_terms = EXCLUDED.payment_terms,
                     signed_date = EXCLUDED.signed_date`,
      [leadId, contractNo, poNumber, deliveryTerms, paymentTerms, signedDate],
    );

    return res.json({ success: true, message: `Hook H2 Triggered: Contract data for ${leadId} sent to MRP/Finance` });
  } catch (err) {
    if (err?.code === '23503') {
      return res.status(404).json({ error: 'Project not found' });
    }
    return res.status(500).json({ error: err.message });
  }
};

const hookH3 = async (req, res) => {
  try {
    const leadId = normalizeText(req.params?.leadId);
    const csatScore = parseNumberOr(req.body?.csat_score, 0);
    const pqaFindings = normalizeText(req.body?.pqa_findings);

    const result = await db.query(
      `UPDATE pm_projects
       SET status = 'CLOSED',
           csat_score = $2,
           pqa_findings = $3
       WHERE project_id = $1
       RETURNING *`,
      [leadId, csatScore, pqaFindings],
    );

    if (!result.rows.length) return res.status(404).json({ error: 'Project not found' });
    return res.json({
      success: true,
      message: `Hook H3 Triggered: Project ${leadId} closed and CSAT/PQA pushed to QMS`,
      csat_score: csatScore,
      pqa_findings: pqaFindings,
      project: result.rows[0],
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const gateG3 = async (req, res) => {
  try {
    const leadId = normalizeText(req.params?.leadId);
    if (!leadId) return res.status(400).json({ error: 'leadId is required' });
    const outcome = normalizeText(req.body?.outcome).toUpperCase();
    const reasonCode = normalizeText(req.body?.reason_code);

    if (!['YES', 'WAIT', 'NO'].includes(outcome)) {
      return res.status(400).json({ error: 'outcome must be YES, WAIT, or NO' });
    }

    let newStatus = 'WAIT_PO';
    if (outcome === 'YES') newStatus = 'WON_YES_PO';
    if (outcome === 'NO') newStatus = 'LOST_NO_PO';

    const lead = await db.withTransaction(async (client) => {
      const result = await client.query(
        `UPDATE pm_projects
         SET status = $1
         WHERE project_id = $2
         RETURNING *`,
        [newStatus, leadId],
      );

      if (!result.rows.length) throw new Error('LEAD_NOT_FOUND');

      if (outcome !== 'YES') {
        await client.query(
          `INSERT INTO pm_po_logs (project_id, wait_reason_code, lost_reason_code)
           VALUES ($1, $2, $3)`,
          [leadId, outcome === 'WAIT' ? reasonCode : null, outcome === 'NO' ? reasonCode : null],
        );
      }

      return result.rows[0];
    });

    return res.json({ success: true, lead });
  } catch (err) {
    if (err.message === 'LEAD_NOT_FOUND') return res.status(404).json({ error: 'Lead not found' });
    return res.status(500).json({ error: err.message });
  }
};

module.exports = {
  listLeads,
  getLead,
  createLead,
  gateG1,
  gateG2,
  openCR,
  hookH1,
  hookH2,
  hookH3,
  gateG3,
};






