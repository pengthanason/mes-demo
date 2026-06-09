/**
 * outbox_worker.js — Background worker for mes_sync_log outbox pattern (C1 fix)
 *
 * Processes PENDING sync events with retry logic.
 * Runs every 10 seconds, picks up to 10 events per cycle.
 */
"use strict";
const { query } = require("../db");
const wms = require("./wms_client");
const mrp = require("./mrp_client");

let _interval = null;
let _missingTableDisabled = false;

function isMissingOutboxTableError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes('relation "mes_sync_log" does not exist');
}

async function processEvent(row) {
  const payload = row.payload || {};
  switch (row.event_type) {
    case "WMS_GR": {
      if (!wms.isConfigured()) return { ok: false, error: "WMS not configured" };
      const result = await wms.postGR(
        payload.wo_ref,
        [{ part_no: payload.part_no, qty: payload.qty }],
        "mes-close"
      );
      if (!result.ok) return { ok: false, error: JSON.stringify(result.errors).slice(0, 500) };
      return { ok: true };
    }
    case "WMS_PROD_DONE": {
      if (!wms.isConfigured()) return { ok: false, error: "WMS not configured" };
      const result = await wms.updateProdOrder(payload.wms_prod_order_id, {
        status: "DONE",
        qty_good: payload.qty_good,
      });
      if (!result) return { ok: false, error: "updateProdOrder returned null" };
      return { ok: true };
    }
    case "MRP_ACTUAL_QTY": {
      if (!mrp.isConfigured()) return { ok: false, error: "MRP not configured" };
      const result = await mrp.updateActualQty(payload.plan_no, payload.qty);
      if (result === null) return { ok: true, note: "MRP misconfigured or plan_no missing — skipped" };
      return { ok: true };
    }
    default:
      return { ok: false, error: `Unknown event_type: ${row.event_type}` };
  }
}

async function tick() {
  try {
    const pending = await query(
      `SELECT id, event_type, wo_id, payload, attempts, max_attempts
       FROM mes_sync_log
       WHERE status = 'PENDING'
       ORDER BY created_at ASC
       LIMIT 10`
    );
    if (!pending.rows.length) return;

    for (const row of pending.rows) {
      try {
        const result = await processEvent(row);
        if (result.ok) {
          await query(
            `UPDATE mes_sync_log
             SET status = 'OK', completed_at = NOW(), attempts = attempts + 1,
                 error_msg = $2
             WHERE id = $1`,
            [row.id, result.note || ""]
          );
          console.log(`[outbox] OK: id=${row.id} type=${row.event_type} wo=${row.wo_id}`);
        } else {
          const newAttempts = (row.attempts || 0) + 1;
          const maxAttempts = row.max_attempts || 5;
          const newStatus = newAttempts >= maxAttempts ? "FAILED" : "PENDING";
          await query(
            `UPDATE mes_sync_log
             SET status = $2, attempts = $3, error_msg = $4,
                 completed_at = CASE WHEN $2 = 'FAILED' THEN NOW() ELSE NULL END
             WHERE id = $1`,
            [row.id, newStatus, newAttempts, (result.error || "").slice(0, 1000)]
          );
          if (newStatus === "FAILED") {
            console.error(`[outbox] FAILED (max retries): id=${row.id} type=${row.event_type} error=${result.error}`);
          } else {
            console.warn(`[outbox] RETRY ${newAttempts}/${maxAttempts}: id=${row.id} type=${row.event_type} error=${result.error}`);
          }
        }
      } catch (e) {
        const newAttempts = (row.attempts || 0) + 1;
        const maxAttempts = row.max_attempts || 5;
        const newStatus = newAttempts >= maxAttempts ? "FAILED" : "PENDING";
        await query(
          `UPDATE mes_sync_log SET status = $2, attempts = $3, error_msg = $4 WHERE id = $1`,
          [row.id, newStatus, newAttempts, (e.message || "").slice(0, 1000)]
        ).catch(() => {});
        console.error(`[outbox] ERROR: id=${row.id} type=${row.event_type}`, e.message);
      }
    }
  } catch (e) {
    if (isMissingOutboxTableError(e)) {
      _missingTableDisabled = true;
      console.warn("[outbox] Disabled: mes_sync_log table is missing in the current database");
      stop();
      return;
    }
    console.error("[outbox] tick error:", e.message);
  }
}

function start(intervalMs = 10000) {
  if (_interval || _missingTableDisabled) return;
  console.log(`[outbox] Worker started — polling every ${intervalMs / 1000}s`);
  _interval = setInterval(tick, intervalMs);
  // Run first tick immediately
  tick();
}

function stop() {
  if (_interval) {
    clearInterval(_interval);
    _interval = null;
    console.log("[outbox] Worker stopped");
  }
}

module.exports = { start, stop, tick };
