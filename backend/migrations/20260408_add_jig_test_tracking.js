/**
 * Migration: Jig Test Result Tracking
 *
 * เพิ่มตาราง jig_test_results เพื่อ cache ผลทดสอบ ICT/FCT จาก jig-api
 * ผูกกับ unit_sn (wip_tracking) และ wo_id เพื่อให้ Routing/Jumbo query ได้เร็ว
 * โดยไม่ต้อง call jig-api ทุกครั้ง
 */

exports.up = async function up(knex) {
  await knex.schema.raw(`
    CREATE TABLE IF NOT EXISTS jig_test_results (
      id             BIGSERIAL PRIMARY KEY,
      unit_sn        TEXT        NOT NULL,
      wo_id          BIGINT      REFERENCES work_orders(id) ON DELETE SET NULL,
      test_type      TEXT        NOT NULL DEFAULT 'ICT',
      job_status     TEXT        NOT NULL DEFAULT 'WAITING',
      result_status  TEXT,
      jig_name       TEXT        NOT NULL DEFAULT '',
      fwver          TEXT        NOT NULL DEFAULT '',
      raw_payload    JSONB       NOT NULL DEFAULT '{}',
      pushed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at   TIMESTAMPTZ,
      synced_at      TIMESTAMPTZ,
      CONSTRAINT chk_jig_test_type        CHECK (test_type   IN ('ICT','FCT')),
      CONSTRAINT chk_jig_job_status       CHECK (job_status  IN ('WAITING','COMPLETED','ERROR','INVALID_FORMAT')),
      CONSTRAINT chk_jig_result_status    CHECK (result_status IS NULL OR result_status IN ('PASS','FAIL'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uq_jig_test_results_sn_type
      ON jig_test_results(unit_sn, test_type);

    CREATE INDEX IF NOT EXISTS idx_jig_test_results_wo
      ON jig_test_results(wo_id);

    CREATE INDEX IF NOT EXISTS idx_jig_test_results_status
      ON jig_test_results(job_status, result_status);
  `);
};

exports.down = async function down(knex) {
  await knex.schema.raw(`
    DROP TABLE IF EXISTS jig_test_results;
  `);
};
