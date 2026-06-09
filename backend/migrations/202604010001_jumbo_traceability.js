/**
 * Migration: Jumbo Customer Traceability
 */
exports.up = async function up(knex) {
  await knex.schema.raw(`
    CREATE TABLE IF NOT EXISTS jumbo_serial_batches (
      id           BIGSERIAL PRIMARY KEY,
      part_no      TEXT NOT NULL,
      start_serial INTEGER NOT NULL,
      qty          INTEGER NOT NULL CHECK (qty > 0),
      created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS jumbo_serials (
      id            BIGSERIAL PRIMARY KEY,
      batch_id      BIGINT NOT NULL REFERENCES jumbo_serial_batches(id) ON DELETE CASCADE,
      serial_string TEXT NOT NULL,
      part_no       TEXT NOT NULL,
      serial_no     INTEGER NOT NULL,
      status        TEXT NOT NULL DEFAULT 'GENERATED' CHECK (status IN ('GENERATED','USED')),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (serial_string)
    );
    CREATE INDEX IF NOT EXISTS idx_jumbo_serials_part   ON jumbo_serials(part_no);
    CREATE INDEX IF NOT EXISTS idx_jumbo_serials_status ON jumbo_serials(status);
    CREATE TABLE IF NOT EXISTS jumbo_assemblies (
      id            BIGSERIAL PRIMARY KEY,
      assembly_type TEXT NOT NULL CHECK (assembly_type IN ('BBAS_MAIN','BBAS_RSU')),
      bbas_serial   TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'ASSEMBLED' CHECK (status IN ('ASSEMBLED','PACKED','SHIPPED')),
      note          TEXT NOT NULL DEFAULT '',
      created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (bbas_serial)
    );
    CREATE INDEX IF NOT EXISTS idx_jumbo_assemblies_type   ON jumbo_assemblies(assembly_type);
    CREATE INDEX IF NOT EXISTS idx_jumbo_assemblies_status ON jumbo_assemblies(status);
    CREATE TABLE IF NOT EXISTS jumbo_assembly_components (
      id               BIGSERIAL PRIMARY KEY,
      assembly_id      BIGINT NOT NULL REFERENCES jumbo_assemblies(id) ON DELETE CASCADE,
      component_serial TEXT NOT NULL,
      part_no          TEXT NOT NULL,
      slot_label       TEXT NOT NULL,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (component_serial)
    );
    CREATE INDEX IF NOT EXISTS idx_jumbo_components_assembly ON jumbo_assembly_components(assembly_id);
    CREATE TABLE IF NOT EXISTS jumbo_packing_boxes (
      id          BIGSERIAL PRIMARY KEY,
      box_no      TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED','SHIPPED')),
      note        TEXT NOT NULL DEFAULT '',
      created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      closed_at   TIMESTAMPTZ,
      UNIQUE (box_no)
    );
    CREATE TABLE IF NOT EXISTS jumbo_box_items (
      id          BIGSERIAL PRIMARY KEY,
      box_id      BIGINT NOT NULL REFERENCES jumbo_packing_boxes(id) ON DELETE CASCADE,
      assembly_id BIGINT NOT NULL REFERENCES jumbo_assemblies(id) ON DELETE RESTRICT,
      scanned_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      scanned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (assembly_id)
    );
    CREATE INDEX IF NOT EXISTS idx_jumbo_box_items_box ON jumbo_box_items(box_id);
  `);
};
exports.down = async function down(knex) {
  await knex.schema.raw(`
    DROP TABLE IF EXISTS jumbo_box_items;
    DROP TABLE IF EXISTS jumbo_packing_boxes;
    DROP TABLE IF EXISTS jumbo_assembly_components;
    DROP TABLE IF EXISTS jumbo_assemblies;
    DROP TABLE IF EXISTS jumbo_serials;
    DROP TABLE IF EXISTS jumbo_serial_batches;
  `);
};
