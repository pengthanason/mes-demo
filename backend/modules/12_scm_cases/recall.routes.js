/**
 * P4-2: Recall Query API
 *
 * Forward trace: given a supplier lot_no → find all affected WO, SN, and usage.
 * Quarantine: flag affected UIDs as QUARANTINED + log to audit.
 */

const express = require('express');
const router = express.Router();
const { getPool } = require('../../db');
const { requireRoles, reqId, sendValidationError } = require('../../common/http');

/**
 * GET /api/scm/recall?lot_no=LOT-X[&part_no=BC847]
 *
 * Forward trace: lot → UID → unit_material_links → production_units → work_orders
 */
router.get('/api/scm/recall', requireRoles(['ADMIN', 'QC', 'SCM']), async (req, res) => {
  const { lot_no, part_no } = req.query;
  if (!lot_no) {
    return sendValidationError(res, 'lot_no query parameter is required');
  }

  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT
         iu.uid,
         iu.part_no,
         iu.lot_no,
         uml.unit_sn,
         uml.station_id,
         uml.used_qty,
         uml.created_at AS scanned_at,
         pu.wo_id,
         wo.mrp_demand_ref
       FROM inventory_uids iu
       JOIN unit_material_links uml ON uml.material_uid = iu.uid
       JOIN production_units pu ON pu.sn = uml.unit_sn
       JOIN work_orders wo ON wo.id = pu.wo_id
       WHERE iu.lot_no = $1
         AND ($2::text IS NULL OR iu.part_no = $2)
       ORDER BY uml.created_at DESC`,
      [lot_no, part_no || null]
    );

    const affected = result.rows;
    const woSet = new Set(affected.map(r => r.wo_id));
    const snSet = new Set(affected.map(r => r.unit_sn));

    return res.json({
      status: 'ok',
      lot_no,
      part_no: part_no || null,
      total_units: snSet.size,
      total_wos: woSet.size,
      total_links: affected.length,
      affected,
      request_id: reqId(res),
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      code: 'RECALL_QUERY_FAILED',
      message: error.message,
      request_id: reqId(res),
    });
  }
});


/**
 * POST /api/scm/recall/quarantine
 * body: { lot_no, reason }
 *
 * Flag affected UIDs as QUARANTINED + audit log entry.
 */
router.post('/api/scm/recall/quarantine', requireRoles(['ADMIN', 'QC']), async (req, res) => {
  const { lot_no, reason } = req.body || {};
  if (!lot_no) {
    return sendValidationError(res, 'lot_no is required');
  }
  if (!reason) {
    return sendValidationError(res, 'reason is required');
  }

  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Find affected UIDs
      const uidResult = await client.query(
        `SELECT uid, part_no, status, qty_on_hand
         FROM inventory_uids
         WHERE lot_no = $1
           AND status NOT IN ('QUARANTINED', 'REJECTED', 'CONSUMED')`,
        [lot_no]
      );

      const quarantined = [];
      for (const uid of uidResult.rows) {
        await client.query(
          `UPDATE inventory_uids SET status = 'QUARANTINED' WHERE uid = $1`,
          [uid.uid]
        );
        quarantined.push(uid);
      }

      // Audit log
      try {
        const { logAudit } = require('../../common/audit');
        await logAudit(client, {
          action: 'RECALL_QUARANTINE',
          entity_type: 'lot',
          entity_id: lot_no,
          actor: req.user?.username || 'system',
          details: {
            reason,
            uids_quarantined: quarantined.length,
            uids: quarantined.map(u => u.uid),
          },
        });
      } catch (_auditErr) {
        // Audit log is best-effort — don't fail the quarantine
      }

      await client.query('COMMIT');

      return res.json({
        status: 'ok',
        lot_no,
        reason,
        uids_quarantined: quarantined.length,
        uids: quarantined.map(u => ({
          uid: u.uid,
          part_no: u.part_no,
          previous_status: u.status,
          qty_on_hand: u.qty_on_hand,
        })),
        request_id: reqId(res),
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      code: 'QUARANTINE_FAILED',
      message: error.message,
      request_id: reqId(res),
    });
  }
});

module.exports = router;
