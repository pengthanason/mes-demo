/**
 * Migration: Add outbox retry columns to mes_sync_log
 * Supports P0-1 Outbox Pattern for WO Close integration
 */
exports.up = async function up(knex) {
  await knex.schema.raw(`
    ALTER TABLE mes_sync_log
      ADD COLUMN IF NOT EXISTS attempts     INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 5;
  `);
};

exports.down = async function down(knex) {
  await knex.schema.raw(`
    ALTER TABLE mes_sync_log
      DROP COLUMN IF EXISTS attempts,
      DROP COLUMN IF EXISTS max_attempts;
  `);
};
