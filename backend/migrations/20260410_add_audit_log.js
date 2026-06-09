/**
 * Migration: Add audit_log table
 *
 * Audit trail สำหรับ WO status changes, approvals, deductions ฯลฯ
 * เก็บ entity_type + entity_id + action พร้อม old/new value เป็น JSONB
 */

exports.up = async function up(knex) {
  await knex.schema.raw(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id           BIGSERIAL PRIMARY KEY,
      entity_type  TEXT        NOT NULL,
      entity_id    TEXT        NOT NULL,
      action       TEXT        NOT NULL,
      old_value    JSONB,
      new_value    JSONB,
      actor_id     INTEGER,
      actor_role   TEXT,
      ip_address   TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_audit_log_entity
      ON audit_log(entity_type, entity_id);

    CREATE INDEX IF NOT EXISTS idx_audit_log_actor
      ON audit_log(actor_id);

    CREATE INDEX IF NOT EXISTS idx_audit_log_created
      ON audit_log(created_at DESC);
  `);
};

exports.down = async function down(knex) {
  await knex.schema.raw(`
    DROP TABLE IF EXISTS audit_log;
  `);
};
