/**
 * wo_polling.js — MRP→MES auto-push polling job
 *
 * Polls MRP every MRP_SYNC_INTERVAL_MS (default 5 min) for CONFIRMED MOs.
 * For each MO not yet in MES: auto-creates WO draft/open.
 *   - BOM match → status=OPEN  (operator can start immediately)
 *   - No BOM    → status=DRAFT (PM needs to map BOM)
 *
 * Idempotent: INSERT WHERE NOT EXISTS on mrp_mo_no.
 * Fire-and-forget: errors are logged, never crash server.
 *
 * Start: call startMRPPolling(pool, schema) after DB connect.
 * Stop:  call stopMRPPolling().
 */
'use strict';

const mrp = require('../../common/mrp_client');
const { query } = require('../../db');

const INTERVAL_MS = Number(process.env.MRP_SYNC_INTERVAL_MS) || 5 * 60 * 1000; // 5 min
let _intervalHandle = null;
let _lastPollTs = null;    // ISO string of last successful poll
let _isRunning   = false;  // prevent overlapping runs

async function _pollOnce() {
  if (!mrp.isConfigured()) return;
  if (_isRunning) {
    console.warn('[mrp-sync] previous poll still running — skipping');
    return;
  }
  _isRunning = true;
  try {
    // First run: pass null to get ALL CONFIRMED MOs (no date filter).
    // Subsequent runs: only fetch MOs updated since last poll.
    const since = _lastPollTs || null;
    const mos = await mrp.listConfirmedMOs(since);
    if (!mos.length) {
      _lastPollTs = new Date().toISOString();
      return;
    }

    console.log(`[mrp-sync] ${mos.length} CONFIRMED MO(s) found since ${since}`);
    let created = 0, skipped = 0;

    for (const mo of mos) {
      try {
        // Check if WO already exists for this MO
        const existing = await query(
          `SELECT id FROM work_orders WHERE mrp_mo_no=$1 LIMIT 1`,
          [mo.mo_no]
        );
        if (existing.rows.length) { skipped++; continue; }

        // Find matching APPROVED BOM by product_code (part_no match)
        let bomHeaderId = null;
        if (mo.bom_no) {
          const bomByCode = await query(
            `SELECT id FROM master_bom_header WHERE bom_code=$1 AND status='APPROVED' LIMIT 1`,
            [mo.bom_no]
          );
          if (bomByCode.rows.length) bomHeaderId = Number(bomByCode.rows[0].id);
        }
        if (!bomHeaderId && mo.product_code) {
          const bomByPart = await query(
            `SELECT id FROM master_bom_header WHERE part_no=$1 AND status='APPROVED' ORDER BY id LIMIT 1`,
            [mo.product_code]
          );
          if (bomByPart.rows.length) bomHeaderId = Number(bomByPart.rows[0].id);
        }

        const woStatus = bomHeaderId ? 'OPEN' : 'DRAFT';

        // Find system user for created_by
        const userRow = await query(
          `SELECT id FROM users WHERE role IN ('ADMIN','PM') ORDER BY id LIMIT 1`
        );
        const createdBy = userRow.rows.length ? Number(userRow.rows[0].id) : 1;

        await query(`
          INSERT INTO work_orders
            (part_no, qty_target, status, bom_header_id, created_by, mrp_demand_ref, mrp_mo_no)
          SELECT $1, $2, $3, $4, $5, $6, $7
          WHERE NOT EXISTS (SELECT 1 FROM work_orders WHERE mrp_mo_no=$7)
        `, [
          mo.product_code,
          mo.qty_required || 1,
          woStatus,
          bomHeaderId,
          createdBy,
          mo.mo_no,   // use mo_no as demand_ref fallback
          mo.mo_no,
        ]);

        if (woStatus === 'DRAFT') {
          console.warn(`[mrp-sync] WARN: no BOM for product_code=${mo.product_code} mo_no=${mo.mo_no} → WO=DRAFT`);
        } else {
          console.log(`[mrp-sync] Created WO OPEN for mo_no=${mo.mo_no} product=${mo.product_code}`);
        }
        created++;
      } catch (e) {
        console.error(`[mrp-sync] ERROR processing mo_no=${mo.mo_no}:`, e.message);
      }
    }

    _lastPollTs = new Date().toISOString();
    if (created > 0 || skipped > 0) {
      console.log(`[mrp-sync] poll complete: created=${created} skipped=${skipped}`);
    }
  } catch (e) {
    console.error('[mrp-sync] poll error:', e.message);
  } finally {
    _isRunning = false;
  }
}

function startMRPPolling() {
  if (_intervalHandle) return;
  if (!mrp.isConfigured()) {
    console.log('[mrp-sync] MRP_API_URL not set — polling disabled');
    return;
  }
  console.log(`[mrp-sync] Starting MRP polling every ${INTERVAL_MS / 1000}s`);
  // Run immediately on start, then on interval
  _pollOnce().catch(e => console.error('[mrp-sync] initial poll error:', e.message));
  _intervalHandle = setInterval(() => {
    _pollOnce().catch(e => console.error('[mrp-sync] interval poll error:', e.message));
  }, INTERVAL_MS);
}

function stopMRPPolling() {
  if (_intervalHandle) {
    clearInterval(_intervalHandle);
    _intervalHandle = null;
    console.log('[mrp-sync] Polling stopped');
  }
}

module.exports = { startMRPPolling, stopMRPPolling };
