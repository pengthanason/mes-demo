const { withTransaction, query } = require('../db');
const { normalizeCode, validateUid } = require('../utils/validator');

const MACHINE_EVENT_TYPES = new Set(['SETUP_START', 'SETUP_END', 'RUN_START', 'PAUSE', 'RESUME', 'STOP']);

function getUserFromRequest(req) {
  return req.user || { id: null, role: 'ANON' };
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

function reqId(res) {
  return res.getHeader('X-Request-Id') || '';
}

function parseUsedQty(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

async function postRequestFai(req, res) {
  const user = getUserFromRequest(req);
  const woId = Number(req.body?.wo_id);
  if (!Number.isInteger(woId) || woId <= 0) {
    return sendValidationError(res, 'wo_id is required');
  }

  try {
    const payload = await withTransaction(async (client) => {
      const woResult = await client.query('SELECT * FROM work_orders WHERE id=$1 FOR UPDATE', [woId]);
      if (!woResult.rows.length) {
        return { notFound: true };
      }
      const wo = woResult.rows[0];
      if (!['READY', 'WAIT_FAI'].includes(wo.status)) {
        return { conflict: `WO status must be READY/WAIT_FAI before FAI request (current=${wo.status})` };
      }

      await client.query(
        `UPDATE work_orders
         SET status='WAIT_FAI_QA'
         WHERE id=$1`,
        [woId]
      );
      await client.query(
        `INSERT INTO fai_logs (wo_id, status, note)
         VALUES ($1, 'REQUESTED', $2)`,
        [woId, `requested by user_id=${user.id || 'unknown'}`]
      );

      return { ok: true };
    });

    if (payload.notFound) {
      return res.status(404).json({ status: 'error', code: 'WO_NOT_FOUND', request_id: reqId(res) });
    }
    if (payload.conflict) {
      return res.status(409).json({ status: 'error', code: 'INVALID_STATUS_TRANSITION', message: payload.conflict, request_id: reqId(res) });
    }
    return res.json({ status: 'success', wo_id: woId, new_status: 'WAIT_FAI_QA', request_id: reqId(res) });
  } catch (error) {
    return res.status(500).json({ status: 'error', code: 'REQUEST_FAI_FAILED', message: error.message, request_id: reqId(res) });
  }
}

async function postApproveFaiByQa(req, res) {
  const user = getUserFromRequest(req);
  const woId = Number(req.body?.wo_id);
  if (!Number.isInteger(woId) || woId <= 0) {
    return sendValidationError(res, 'wo_id is required');
  }
  if (!user.id) {
    return sendValidationError(res, 'x-user-id header is required for QA approval');
  }

  try {
    const payload = await withTransaction(async (client) => {
      const woResult = await client.query('SELECT * FROM work_orders WHERE id=$1 FOR UPDATE', [woId]);
      if (!woResult.rows.length) {
        return { notFound: true };
      }
      const wo = woResult.rows[0];
      if (!['WAIT_FAI_QA', 'WAIT_FAI'].includes(wo.status)) {
        return { conflict: `WO status must be WAIT_FAI_QA/WAIT_FAI for QA approval (current=${wo.status})` };
      }

      await client.query(`UPDATE work_orders SET status='WAIT_FAI_MGR' WHERE id=$1`, [woId]);
      await client.query(
        `INSERT INTO fai_logs (wo_id, qa_id, status, note)
         VALUES ($1, $2, 'QA_APPROVED', $3)`,
        [woId, user.id, `qa approved by user_id=${user.id}`]
      );
      return { ok: true };
    });

    if (payload.notFound) {
      return res.status(404).json({ status: 'error', code: 'WO_NOT_FOUND', request_id: reqId(res) });
    }
    if (payload.conflict) {
      return res.status(409).json({ status: 'error', code: 'INVALID_STATUS_TRANSITION', message: payload.conflict, request_id: reqId(res) });
    }
    return res.json({ status: 'success', wo_id: woId, new_status: 'WAIT_FAI_MGR', request_id: reqId(res) });
  } catch (error) {
    return res.status(500).json({ status: 'error', code: 'FAI_QA_APPROVAL_FAILED', message: error.message, request_id: reqId(res) });
  }
}

async function postApproveFaiByMgr(req, res) {
  const user = getUserFromRequest(req);
  const woId = Number(req.body?.wo_id);
  if (!Number.isInteger(woId) || woId <= 0) {
    return sendValidationError(res, 'wo_id is required');
  }
  if (!user.id) {
    return sendValidationError(res, 'x-user-id header is required for manager approval');
  }

  try {
    const payload = await withTransaction(async (client) => {
      const woResult = await client.query('SELECT * FROM work_orders WHERE id=$1 FOR UPDATE', [woId]);
      if (!woResult.rows.length) {
        return { notFound: true };
      }
      const wo = woResult.rows[0];
      if (!['WAIT_FAI_MGR', 'WAIT_FAI'].includes(wo.status)) {
        return { conflict: `WO status must be WAIT_FAI_MGR/WAIT_FAI for manager approval (current=${wo.status})` };
      }

      const lastQa = await client.query(
        `SELECT qa_id
         FROM fai_logs
         WHERE wo_id=$1
           AND status='QA_APPROVED'
         ORDER BY id DESC
         LIMIT 1`,
        [woId]
      );
      if (!lastQa.rows.length || !lastQa.rows[0].qa_id) {
        return { conflict: 'QA approval record is required before manager approval' };
      }
      if (Number(lastQa.rows[0].qa_id) === Number(user.id)) {
        return { conflict: 'dual-key FAI policy violated: qa_id must differ from mgr_id' };
      }

      await client.query(`UPDATE work_orders SET status='RUNNING' WHERE id=$1`, [woId]);
      await client.query(
        `INSERT INTO fai_logs (wo_id, qa_id, mgr_id, status, note)
         VALUES ($1, $2, $3, 'MANAGER_APPROVED', $4)`,
        [woId, lastQa.rows[0].qa_id, user.id, `manager approved by user_id=${user.id}`]
      );

      return { ok: true };
    });

    if (payload.notFound) {
      return res.status(404).json({ status: 'error', code: 'WO_NOT_FOUND', request_id: reqId(res) });
    }
    if (payload.conflict) {
      return res.status(409).json({ status: 'error', code: 'FAI_MANAGER_APPROVAL_BLOCKED', message: payload.conflict, request_id: reqId(res) });
    }
    return res.json({ status: 'success', wo_id: woId, new_status: 'RUNNING', request_id: reqId(res) });
  } catch (error) {
    return res.status(500).json({ status: 'error', code: 'FAI_MANAGER_APPROVAL_FAILED', message: error.message, request_id: reqId(res) });
  }
}

async function postMachineEvent(req, res) {
  const user = getUserFromRequest(req);
  const woId = Number(req.body?.wo_id);
  const eventType = normalizeCode(req.body?.event_type);

  if (!Number.isInteger(woId) || woId <= 0) {
    return sendValidationError(res, 'wo_id is required');
  }
  if (!MACHINE_EVENT_TYPES.has(eventType)) {
    return sendValidationError(res, `event_type must be one of ${Array.from(MACHINE_EVENT_TYPES).join(', ')}`);
  }

  try {
    const payload = await withTransaction(async (client) => {
      const woResult = await client.query('SELECT * FROM work_orders WHERE id=$1 FOR UPDATE', [woId]);
      if (!woResult.rows.length) return { notFound: true };
      const wo = woResult.rows[0];

      if (eventType === 'RUN_START' && wo.status !== 'RUNNING') {
        return { conflict: `RUN_START is blocked until WO is RUNNING (current=${wo.status})` };
      }
      if (['PAUSE', 'RESUME', 'STOP'].includes(eventType) && wo.status !== 'RUNNING') {
        return { conflict: `${eventType} requires WO status RUNNING (current=${wo.status})` };
      }

      await client.query(
        `INSERT INTO machine_events (wo_id, event_type, user_id, note)
         VALUES ($1, $2::machine_event_type, $3, $4)`,
        [woId, eventType, user.id, `event by role=${user.role || 'UNKNOWN'}`]
      );
      return { ok: true };
    });

    if (payload.notFound) {
      return res.status(404).json({ status: 'error', code: 'WO_NOT_FOUND', request_id: reqId(res) });
    }
    if (payload.conflict) {
      return res.status(409).json({ status: 'error', code: 'MACHINE_EVENT_BLOCKED', message: payload.conflict, request_id: reqId(res) });
    }

    return res.json({ status: 'success', wo_id: woId, event_type: eventType, request_id: reqId(res) });
  } catch (error) {
    return res.status(500).json({ status: 'error', code: 'MACHINE_EVENT_FAILED', message: error.message, request_id: reqId(res) });
  }
}

async function postStartUnit(req, res) {
  const woId = Number(req.body?.wo_id);
  const unitSn = String(req.body?.sn || '').trim();
  if (!Number.isInteger(woId) || woId <= 0) {
    return sendValidationError(res, 'wo_id is required');
  }
  if (!unitSn) {
    return sendValidationError(res, 'sn is required');
  }

  try {
    const payload = await withTransaction(async (client) => {
      const woResult = await client.query('SELECT * FROM work_orders WHERE id=$1 FOR UPDATE', [woId]);
      if (!woResult.rows.length) return { notFound: true };
      const wo = woResult.rows[0];
      if (wo.status !== 'RUNNING') {
        return { conflict: `WO must be RUNNING to start unit scan (current=${wo.status})` };
      }

      const insertResult = await client.query(
        `INSERT INTO production_units (sn, wo_id, current_station, status, started_at)
         VALUES ($1, $2, 'PD_INCOMING', 'IN_PROGRESS', NOW())
         ON CONFLICT (sn) DO NOTHING
         RETURNING sn, wo_id, status, started_at`,
        [unitSn, woId]
      );

      let created = false;
      let row;
      if (insertResult.rows.length) {
        created = true;
        row = insertResult.rows[0];
        await client.query(
          `UPDATE work_orders
           SET qty_started = qty_started + 1
           WHERE id=$1`,
          [woId]
        );
      } else {
        const existing = await client.query('SELECT sn, wo_id, status, started_at FROM production_units WHERE sn=$1', [unitSn]);
        row = existing.rows[0];
        if (Number(row.wo_id) !== woId) {
          return { conflict: `sn=${unitSn} already belongs to another WO (existing_wo_id=${row.wo_id})` };
        }
      }

      return { created, row };
    });

    if (payload.notFound) {
      return res.status(404).json({ status: 'error', code: 'WO_NOT_FOUND', request_id: reqId(res) });
    }
    if (payload.conflict) {
      return res.status(409).json({ status: 'error', code: 'UNIT_START_BLOCKED', message: payload.conflict, request_id: reqId(res) });
    }

    return res.json({
      status: 'success',
      created: payload.created,
      unit: payload.row,
      request_id: reqId(res),
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', code: 'START_UNIT_FAILED', message: error.message, request_id: reqId(res) });
  }
}

async function postScanMaterial(req, res) {
  const unitSn = String(req.body?.unit_sn || '').trim();
  const materialUid = String(req.body?.material_uid || '').trim().toUpperCase();
  const stationId = String(req.body?.station_id || '').trim() || 'PD';
  const usedQty = parseUsedQty(req.body?.used_qty == null ? 1 : req.body.used_qty);

  if (!unitSn || !materialUid) {
    return sendValidationError(res, 'unit_sn and material_uid are required');
  }
  if (!usedQty) {
    return sendValidationError(res, 'used_qty must be a positive number');
  }
  const uidValidation = validateUid(materialUid);
  if (!uidValidation.valid) {
    return sendValidationError(res, uidValidation.errors[0], uidValidation.errors);
  }

  try {
    const payload = await withTransaction(async (client) => {
      const unitResult = await client.query(
        `SELECT pu.sn, pu.wo_id, pu.status AS unit_status, wo.status AS wo_status
         FROM production_units pu
         JOIN work_orders wo ON wo.id = pu.wo_id
         WHERE pu.sn=$1
         FOR UPDATE`,
        [unitSn]
      );
      if (!unitResult.rows.length) return { notFound: 'unit' };
      const unit = unitResult.rows[0];
      if (unit.wo_status !== 'RUNNING') {
        return { conflict: `material scan requires WO in RUNNING status (current=${unit.wo_status})` };
      }
      if (!['IN_PROGRESS', 'REPAIRED'].includes(unit.unit_status)) {
        return { conflict: `material scan is allowed only for IN_PROGRESS or REPAIRED units (current=${unit.unit_status})` };
      }

      const uidResult = await client.query(
        `SELECT uid, part_no, qty_on_hand, status, lot_no
         FROM inventory_uids
         WHERE uid=$1
         FOR UPDATE`,
        [materialUid]
      );
      if (!uidResult.rows.length) return { notFound: 'uid' };
      const uid = uidResult.rows[0];
      if (uid.status !== 'APPROVED') {
        return { conflict: `material UID must be APPROVED (current=${uid.status})` };
      }

      const bomMatch = await client.query(
        `SELECT 1
         FROM wo_bom_snapshot
         WHERE wo_id=$1
           AND part_no=$2
         LIMIT 1`,
        [unit.wo_id, uid.part_no]
      );
      if (!bomMatch.rows.length) {
        return { conflict: `material part_no=${uid.part_no} not found in WO BOM snapshot` };
      }

      // P4-1: propagate lot_no from inventory_uids for traceability
      const lotNo = uid.lot_no || null;
      await client.query(
        `INSERT INTO unit_material_links (unit_sn, material_uid, used_qty, station_id, lot_no)
         VALUES ($1, $2, $3, $4, $5)`,
        [unitSn, materialUid, usedQty, stationId, lotNo]
      );
      const inventoryUpdate = await client.query(
        `UPDATE inventory_uids
         SET qty_on_hand = qty_on_hand - $2
         WHERE uid = $1 AND qty_on_hand >= $2
         RETURNING qty_on_hand`,
        [materialUid, usedQty]
      );
      if (inventoryUpdate.rowCount === 0) {
        throw new Error(`Insufficient qty for UID ${materialUid}`);
      }
      await client.query(
        `UPDATE production_units
         SET current_station='PRODUCTION', status='IN_PROGRESS'
         WHERE sn=$1`,
        [unitSn]
      );

      return {
        ok: true,
        qty_on_hand_after: Number(inventoryUpdate.rows[0].qty_on_hand),
      };
    });

    if (payload.notFound === 'unit') {
      return res.status(404).json({ status: 'error', code: 'UNIT_NOT_FOUND', request_id: reqId(res) });
    }
    if (payload.notFound === 'uid') {
      return res.status(404).json({ status: 'error', code: 'MATERIAL_UID_NOT_FOUND', request_id: reqId(res) });
    }
    if (payload.conflict) {
      return res.status(409).json({ status: 'error', code: 'SCAN_MATERIAL_BLOCKED', message: payload.conflict, request_id: reqId(res) });
    }

    return res.json({
      status: 'success',
      unit_sn: unitSn,
      material_uid: materialUid,
      used_qty: usedQty,
      qty_on_hand_after: payload.qty_on_hand_after,
      request_id: reqId(res),
    });
  } catch (error) {
    if (error?.code === '23505') {
      return res.status(409).json({
        status: 'error',
        code: 'DUPLICATE_UNIT_MATERIAL_LINK',
        message: 'same material UID is already linked to this unit',
        request_id: reqId(res),
      });
    }
    return res.status(500).json({ status: 'error', code: 'SCAN_MATERIAL_FAILED', message: error.message, request_id: reqId(res) });
  }
}

async function postReworkRepair(req, res) {
  const unitSn = String(req.body?.unit_sn || '').trim();
  if (!unitSn) {
    return sendValidationError(res, 'unit_sn is required');
  }

  try {
    const payload = await withTransaction(async (client) => {
      const rowResult = await client.query(
        `SELECT pu.sn, pu.wo_id, pu.status AS unit_status, wo.status AS wo_status
         FROM production_units pu
         JOIN work_orders wo ON wo.id = pu.wo_id
         WHERE pu.sn=$1
         FOR UPDATE`,
        [unitSn]
      );
      if (!rowResult.rows.length) {
        return { notFound: true };
      }
      const row = rowResult.rows[0];
      if (row.wo_status !== 'RUNNING') {
        return { conflict: `rework requires WO in RUNNING status (current=${row.wo_status})` };
      }
      if (row.unit_status !== 'NG') {
        return { conflict: `rework repair is allowed only for NG units (current=${row.unit_status})` };
      }

      await client.query(
        `UPDATE production_units
         SET status='REPAIRED',
             current_station='REWORK_DONE'
         WHERE sn=$1`,
        [unitSn]
      );

      return { wo_id: row.wo_id };
    });

    if (payload.notFound) {
      return res.status(404).json({ status: 'error', code: 'UNIT_NOT_FOUND', request_id: reqId(res) });
    }
    if (payload.conflict) {
      return res.status(409).json({ status: 'error', code: 'REWORK_REPAIR_BLOCKED', message: payload.conflict, request_id: reqId(res) });
    }

    return res.json({ status: 'success', unit_sn: unitSn, new_status: 'REPAIRED', request_id: reqId(res) });
  } catch (error) {
    return res.status(500).json({ status: 'error', code: 'REWORK_REPAIR_FAILED', message: error.message, request_id: reqId(res) });
  }
}

async function postQcResult(req, res) {
  const unitSn = String(req.body?.unit_sn || '').trim();
  const result = normalizeCode(req.body?.result);
  if (!unitSn) {
    return sendValidationError(res, 'unit_sn is required');
  }
  if (!['PASS', 'FAIL'].includes(result)) {
    return sendValidationError(res, 'result must be PASS or FAIL');
  }

  try {
    const payload = await withTransaction(async (client) => {
      const rowResult = await client.query(
        `SELECT pu.sn, pu.wo_id, pu.status AS unit_status, wo.status AS wo_status
         FROM production_units pu
         JOIN work_orders wo ON wo.id = pu.wo_id
         WHERE pu.sn=$1
         FOR UPDATE`,
        [unitSn]
      );
      if (!rowResult.rows.length) {
        return { notFound: true };
      }
      const row = rowResult.rows[0];
      if (row.wo_status !== 'RUNNING') {
        return { conflict: `QC result requires WO in RUNNING status (current=${row.wo_status})` };
      }

      if (!['IN_PROGRESS', 'REPAIRED'].includes(row.unit_status)) {
        return { conflict: `QC result is allowed only for IN_PROGRESS or REPAIRED units (current=${row.unit_status})` };
      }

      if (result === 'PASS') {
        await client.query(
          `UPDATE production_units
           SET status='PASS', current_station='QC_PASS'
           WHERE sn=$1`,
          [unitSn]
        );
        await client.query(
          `UPDATE work_orders
           SET qty_good = qty_good + 1
           WHERE id=$1`,
          [row.wo_id]
        );
      } else {
        await client.query(
          `UPDATE production_units
           SET status='NG', current_station='REWORK'
           WHERE sn=$1`,
          [unitSn]
        );
      }

      return { wo_id: row.wo_id };
    });

    if (payload.notFound) {
      return res.status(404).json({ status: 'error', code: 'UNIT_NOT_FOUND', request_id: reqId(res) });
    }
    if (payload.conflict) {
      return res.status(409).json({ status: 'error', code: 'QC_RESULT_BLOCKED', message: payload.conflict, request_id: reqId(res) });
    }

    return res.json({ status: 'success', unit_sn: unitSn, result, request_id: reqId(res) });
  } catch (error) {
    return res.status(500).json({ status: 'error', code: 'QC_RESULT_FAILED', message: error.message, request_id: reqId(res) });
  }
}

async function getMachineDurations(req, res) {
  const woId = Number(req.params?.woId);
  if (!Number.isInteger(woId) || woId <= 0) {
    return sendValidationError(res, 'woId must be positive integer');
  }
  try {
    const result = await query(
      `SELECT
         id,
         event_type,
         timestamp AS started_at,
         LEAD(timestamp) OVER (ORDER BY timestamp, id) AS ended_at,
         EXTRACT(EPOCH FROM (LEAD(timestamp) OVER (ORDER BY timestamp, id) - timestamp))::NUMERIC(18, 3) AS duration_sec
       FROM machine_events
       WHERE wo_id = $1
       ORDER BY timestamp, id`,
      [woId]
    );
    return res.json({
      status: 'success',
      wo_id: woId,
      events: result.rows,
      request_id: reqId(res),
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', code: 'MACHINE_DURATION_QUERY_FAILED', message: error.message, request_id: reqId(res) });
  }
}

module.exports = {
  postRequestFai,
  postApproveFaiByQa,
  postApproveFaiByMgr,
  postMachineEvent,
  postStartUnit,
  postScanMaterial,
  postReworkRepair,
  postQcResult,
  getMachineDurations,
};
