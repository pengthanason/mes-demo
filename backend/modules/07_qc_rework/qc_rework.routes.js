const express = require('express');
const productionController = require('../../controllers/production.controller');
const { requireRoles } = require('../../common/http');
const { withTransaction } = require('../../db');
const { sendValidationError, reqId } = require('../../common/http');
const { safeCreateNotifications } = require('../../common/notifications');

const router = express.Router();

router.post('/api/rework/repair', requireRoles(['TECH', 'PD', 'QC', 'ADMIN']), productionController.postReworkRepair);
router.post('/api/qc/result', requireRoles(['QC', 'ADMIN']), productionController.postQcResult);
router.post('/api/qc/transfer-verify', requireRoles(['QC', 'QA', 'ADMIN']), async (req, res) => {
    const reqIdNum = Number(req.body?.req_id);
    const isApproved = req.body?.is_approved == null ? true : Boolean(req.body.is_approved);
    const note = req.body?.note || '';

    if (!Number.isInteger(reqIdNum) || reqIdNum <= 0) return sendValidationError(res, 'req_id must be positive integer');

    try {
        const payload = await withTransaction(async (client) => {
            const reqResult = await client.query('SELECT status, req_no FROM material_requisitions WHERE id=$1 FOR UPDATE', [reqIdNum]);
            if (!reqResult.rows.length) return { notFound: 'requisition' };
            const requisition = reqResult.rows[0];

            if (requisition.status !== 'PENDING_QC') {
                return { conflict: `QC can only verify materials when status is PENDING_QC(current = ${requisition.status})` };
            }

            let newStatus = isApproved ? 'PENDING_PD' : 'PENDING_STORE'; // If rejected, return to store to fix

            await client.query(
                'UPDATE material_requisitions SET status=$1, updated_at=NOW() WHERE id=$2',
                [newStatus, reqIdNum]
            );

            return {
                req_no: requisition.req_no,
                req_status: newStatus,
                is_approved: isApproved
            };
        });

        if (payload.notFound) {
            return res.status(404).json({ status: 'error', code: 'REQ_NOT_FOUND', request_id: reqId(res) });
        }
        if (payload.conflict) {
            return res.status(409).json({ status: 'error', code: 'QC_VERIFY_BLOCKED', message: payload.conflict, request_id: reqId(res) });
        }

        if (payload.is_approved) {
            await safeCreateNotifications([{
                notice_type: 'MATERIAL_TRANSFER_APPROVED',
                severity: 'INFO',
                audience_key: 'PD',
                title: `Materials for ${payload.req_no} verified by QC`,
                message: `QC has verified the material transfer for Requisition ${payload.req_no}.Ready for PD to accept.`,
                entity_type: 'REQUISITION',
                entity_id: String(reqIdNum),
                created_by: req.user.id,
            }]);
        } else {
            await safeCreateNotifications([{
                notice_type: 'MATERIAL_TRANSFER_REJECTED',
                severity: 'WARN',
                audience_key: 'STORE',
                title: `Transfer ${payload.req_no} rejected by QC`,
                message: `QC rejected the transfer.Reason: ${note}. Please fix and re - transfer.`,
                entity_type: 'REQUISITION',
                entity_id: String(reqIdNum),
                created_by: req.user.id,
            }]);
        }

        return res.json({ status: 'success', ...payload, request_id: reqId(res) });
    } catch (error) {
        return res.status(500).json({ status: 'error', code: 'QC_VERIFY_FAILED', message: error.message, request_id: reqId(res) });
    }
});

module.exports = router;
