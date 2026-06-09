/**
 * MES Event Inbox — Phase 1 (Lean Event Bus, 2026-05-01)
 *
 *   POST /api/events/wms          ← WMS GR/GI/ADJ stock-changed
 *   POST /api/events/mrp          ← MRP MO/PR/PO/demand events
 *
 * Both endpoints HMAC-verify the body against EVENT_INBOX_SECRET, then
 * idempotently INSERT into mes_event_inbox keyed on (source, event_id).
 * Returns 204 on accept, 200 on duplicate (no-op), 401 on bad signature.
 *
 * A separate worker (TBD Phase 1.5) drains status=PENDING rows.
 */
const crypto = require('crypto');
const express = require('express');
const { query } = require('../../db');

const router = express.Router();

const SECRET = (process.env.EVENT_INBOX_SECRET || process.env.STOCK_WEBHOOK_SECRET || '').trim();

function verifySignature(rawBody, headerSig) {
  if (!SECRET) return { ok: false, reason: 'EVENT_INBOX_SECRET not configured' };
  if (!headerSig) return { ok: false, reason: 'missing signature header' };
  const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update(rawBody).digest('hex');
  // timing-safe compare
  const a = Buffer.from(expected);
  const b = Buffer.from(headerSig);
  if (a.length !== b.length) return { ok: false, reason: 'signature length mismatch' };
  if (!crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'signature mismatch' };
  return { ok: true };
}

const VALID_SOURCES = new Set(['wms', 'mrp', 'jig']);

async function handleEvent(req, res, source) {
  if (!VALID_SOURCES.has(source)) {
    return res.status(400).json({ error: 'unknown source' });
  }
  const sig = req.get('X-Synergy-Signature') || '';
  // req.rawBody is captured by express.json's verify callback in server.js
  const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
  const verified = verifySignature(rawBody, sig);
  if (!verified.ok) {
    return res.status(401).json({ error: 'unauthorized', reason: verified.reason });
  }

  const body = req.body || {};
  const eventId = String(body.event_id || body.id || '').trim();
  const eventType = String(body.event || body.event_type || 'unknown').slice(0, 64);
  if (!eventId) {
    return res.status(400).json({ error: 'event_id required' });
  }

  try {
    const sql = `
      INSERT INTO mes_event_inbox (event_id, source, event_type, payload, signature)
      VALUES ($1, $2, $3, $4::jsonb, $5)
      ON CONFLICT (source, event_id) DO NOTHING
      RETURNING id
    `;
    const result = await query(sql, [eventId, source, eventType, JSON.stringify(body), sig]);
    if (result.rows.length === 0) {
      // duplicate — already received
      return res.status(200).json({ status: 'duplicate', event_id: eventId });
    }
    return res.status(204).send();
  } catch (err) {
    console.error('[event-inbox] insert failed', err);
    return res.status(500).json({ error: 'inbox write failed' });
  }
}

router.post('/wms', (req, res) => handleEvent(req, res, 'wms'));
router.post('/mrp', (req, res) => handleEvent(req, res, 'mrp'));

router.get('/health', (req, res) => {
  res.json({
    status: SECRET ? 'ok' : 'unconfigured',
    secret_configured: Boolean(SECRET),
  });
});

router.get('/recent', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 200);
  try {
    const result = await query(
      `SELECT id, event_id, source, event_type, status, attempts, received_at, processed_at
       FROM mes_event_inbox ORDER BY received_at DESC LIMIT $1`,
      [limit],
    );
    res.json({ data: result.rows, meta: { count: result.rows.length } });
  } catch (err) {
    res.status(500).json({ error: 'query failed' });
  }
});

module.exports = router;
