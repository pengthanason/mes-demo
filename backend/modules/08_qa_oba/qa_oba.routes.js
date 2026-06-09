const express = require('express');
const { withTransaction } = require('../../db');
const {
  normalizeText,
  sendValidationError,
  reqId,
  requireRoles,
} = require('../../common/http');
const { normalizeCode } = require('../../utils/validator');
const { safeCreateNotifications } = require('../../common/notifications');

const router = express.Router();

router.post('/api/qa/oba', requireRoles(['QA', 'ADMIN']), async (req, res) => {
  const unitSn = normalizeText(req.body?.unit_sn);
  const result = normalizeCode(req.body?.result);
  const note = normalizeText(req.body?.note);

  if (!unitSn) return sendValidationError(res, 'unit_sn is required');
  if (!['PASS', 'FAIL'].includes(result)) return sendValidationError(res, 'result must be PASS or FAIL');

  try {
    const payload = await withTransaction(async (client) => {
      const unitResult = await client.query(
        `SELECT pu.sn,
                pu.wo_id,
                pu.status,
                pu.current_station,
                wo.status AS wo_status,
                wo.qty_good
         FROM production_units pu
         JOIN work_orders wo ON wo.id = pu.wo_id
         WHERE pu.sn=$1
         FOR UPDATE`,
        [unitSn]
      );
      if (!unitResult.rows.length) return { notFound: true };

      const unit = unitResult.rows[0];
      if (unit.wo_status !== 'RUNNING') {
        return { conflict: `QA-OBA requires WO in RUNNING status (current=${unit.wo_status})` };
      }
      if (!['PASS', 'PACKED'].includes(unit.status)) {
        return { conflict: `QA-OBA is allowed only for PASS/PACKED units (current=${unit.status})` };
      }

      if (result === 'PASS') {
        if (unit.status === 'PACKED' && unit.current_station === 'QA_OBA_PASS') {
          return {
            obaResult: 'PASS',
            woId: Number(unit.wo_id),
            unitStatus: 'PACKED',
            currentStation: 'QA_OBA_PASS',
            qtyGood: Number(unit.qty_good || 0),
            alreadyPassed: true,
          };
        }

        const updateUnit = await client.query(
          `UPDATE production_units
           SET status='PACKED',
               current_station='QA_OBA_PASS'
           WHERE sn=$1
           RETURNING status, current_station`,
          [unitSn]
        );

        return {
          obaResult: 'PASS',
          woId: Number(unit.wo_id),
          unitStatus: updateUnit.rows[0].status,
          currentStation: updateUnit.rows[0].current_station,
          qtyGood: Number(unit.qty_good || 0),
          alreadyPassed: false,
        };
      }

      const qtyGoodCurrent = Number(unit.qty_good || 0);
      const updateWo = await client.query(
        `UPDATE work_orders
         SET qty_good = CASE
             WHEN qty_good > 0 THEN qty_good - 1
             ELSE 0
         END
         WHERE id=$1
         RETURNING qty_good`,
        [unit.wo_id]
      );

      const updateUnit = await client.query(
        `UPDATE production_units
         SET status='NG',
             current_station='REWORK'
         WHERE sn=$1
         RETURNING status, current_station`,
        [unitSn]
      );

      return {
        obaResult: 'FAIL',
        woId: Number(unit.wo_id),
        unitStatus: updateUnit.rows[0].status,
        currentStation: updateUnit.rows[0].current_station,
        qtyGood: Number(updateWo.rows[0].qty_good),
        qtyGoodAdjusted: qtyGoodCurrent > 0,
        alreadyPassed: false,
      };
    });

    if (payload.notFound) {
      return res.status(404).json({ status: 'error', code: 'UNIT_NOT_FOUND', request_id: reqId(res) });
    }
    if (payload.conflict) {
      return res.status(409).json({ status: 'error', code: 'QA_OBA_BLOCKED', message: payload.conflict, request_id: reqId(res) });
    }

    const notices = [];
    if (payload.obaResult === 'FAIL') {
      notices.push({
        notice_type: 'QA_OBA_FAIL',
        severity: 'WARN',
        audience_key: 'STORE',
        title: `QA-OBA FAIL on ${unitSn}`,
        message: `Unit moved to REWORK. WO ${payload.woId} qty_good_after=${Number(payload.qtyGood || 0)}.`,
        entity_type: 'PRODUCTION_UNIT',
        entity_id: unitSn,
        wo_id: payload.woId,
        unit_sn: unitSn,
        created_by: req.user.id,
      });
      notices.push({
        notice_type: 'QA_OBA_FAIL',
        severity: 'WARN',
        audience_key: 'ACCOUNT',
        title: `QA-OBA FAIL for WO ${payload.woId}`,
        message: `Unit ${unitSn} failed OBA and returned to rework.`,
        entity_type: 'WORK_ORDER',
        entity_id: String(payload.woId),
        wo_id: payload.woId,
        unit_sn: unitSn,
        created_by: req.user.id,
      });
    }
    await safeCreateNotifications(notices);

    return res.json({
      status: 'success',
      unit_sn: unitSn,
      oba_result: payload.obaResult,
      unit_status: payload.unitStatus,
      current_station: payload.currentStation,
      qty_good_after: payload.qtyGood,
      qty_good_adjusted: Boolean(payload.qtyGoodAdjusted),
      already_passed: Boolean(payload.alreadyPassed),
      note: note || '',
      request_id: reqId(res),
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', code: 'QA_OBA_FAILED', message: error.message, request_id: reqId(res) });
  }
});

router.post('/api/qa/return-confirm', requireRoles(['QA', 'ADMIN']), async (req, res) => {
  const reqIdNum = Number(req.body?.req_id);
  const isApproved = req.body?.is_approved == null ? true : Boolean(req.body.is_approved);
  const note = req.body?.note || '';

  if (!Number.isInteger(reqIdNum) || reqIdNum <= 0) return sendValidationError(res, 'req_id must be positive integer');

  try {
    const payload = await withTransaction(async (client) => {
      const reqResult = await client.query('SELECT status, req_no FROM material_requisitions WHERE id=$1 FOR UPDATE', [reqIdNum]);
      if (!reqResult.rows.length) return { notFound: true };
      const requisition = reqResult.rows[0];

      if (requisition.status !== 'PENDING_RETURN_QA') {
        return { conflict: `QA can only confirm returns when status is PENDING_RETURN_QA (current=${requisition.status})` };
      }

      let newStatus = isApproved ? 'PENDING_RESTOCK' : 'ACTIVE_PD'; // If rejected, return to PD to fix numbers

      await client.query(
        'UPDATE material_requisitions SET status=$1, updated_at=NOW() WHERE id=$2',
        [newStatus, reqIdNum]
      );

      return { req_no: requisition.req_no };
    });

    if (payload.notFound) return res.status(404).json({ status: 'error', code: 'REQ_NOT_FOUND', request_id: reqId(res) });
    if (payload.conflict) return res.status(409).json({ status: 'error', code: 'QA_RETURN_BLOCKED', message: payload.conflict, request_id: reqId(res) });

    if (isApproved) {
      await safeCreateNotifications([{
        notice_type: 'MATERIAL_RETURN_APPROVED',
        severity: 'INFO',
        audience_key: 'STORE',
        title: `QA Approved Material Return for ${payload.req_no}`,
        message: `QA has verified the returned materials for Requisition ${payload.req_no} towards ERP. Store can now restock.`,
        entity_type: 'REQUISITION',
        entity_id: String(reqIdNum),
        created_by: req.user.id,
      }]);
    } else {
      await safeCreateNotifications([{
        notice_type: 'MATERIAL_RETURN_REJECTED',
        severity: 'WARN',
        audience_key: 'PD',
        title: `QA Rejected Material Return for ${payload.req_no}`,
        message: `QA rejected the return metrics: ${note}. Please recount and submit again.`,
        entity_type: 'REQUISITION',
        entity_id: String(reqIdNum),
        created_by: req.user.id,
      }]);
    }

    return res.json({ status: 'success', req_no: payload.req_no, is_approved: isApproved, request_id: reqId(res) });
  } catch (error) {
    return res.status(500).json({ status: 'error', code: 'QA_RETURN_FAILED', message: error.message, request_id: reqId(res) });
  }
});

module.exports = router;
