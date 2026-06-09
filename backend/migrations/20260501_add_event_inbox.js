/**
 * Migration: MES Event Inbox (Phase 1 — receive WMS GR/GI + MRP MO events)
 *
 * Idempotent receive table for cross-system events. Producers (WMS/MRP) POST to
 * /api/events/{source} with HMAC signature; we INSERT here keyed on event_id.
 * A separate background worker drains status='PENDING' rows.
 *
 * Lifecycle decoupled from mes_sync_log (which is FK-bound to work_orders for
 * outbound MES→peer events). Inbox events arrive before any local WO context.
 */
exports.up = async function up(knex) {
  await knex.schema.raw(`
    CREATE TABLE IF NOT EXISTS mes_event_inbox (
      id            BIGSERIAL PRIMARY KEY,
      event_id      TEXT        NOT NULL,
      source        TEXT        NOT NULL,
      event_type    TEXT        NOT NULL,
      payload       JSONB       NOT NULL DEFAULT '{}',
      signature     TEXT,
      status        TEXT        NOT NULL DEFAULT 'PENDING',
      attempts      INTEGER     NOT NULL DEFAULT 0,
      last_error    TEXT,
      received_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      processed_at  TIMESTAMPTZ,
      CONSTRAINT chk_inbox_source CHECK (source IN ('wms','mrp','jig')),
      CONSTRAINT chk_inbox_status CHECK (status IN ('PENDING','OK','FAILED','SKIPPED'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uq_event_inbox_source_eid
      ON mes_event_inbox (source, event_id);
    CREATE INDEX IF NOT EXISTS idx_event_inbox_status
      ON mes_event_inbox (status, received_at);
    CREATE INDEX IF NOT EXISTS idx_event_inbox_type
      ON mes_event_inbox (event_type, received_at DESC);
  `);
};

exports.down = async function down(knex) {
  await knex.schema.raw(`DROP TABLE IF EXISTS mes_event_inbox;`);
};
