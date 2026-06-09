-- Draft alternate incoming/IQC schema. Not the active runtime schema as of
-- 2026-04-08. The running app currently uses backend/schema.sql together with
-- backend/modules/02_incoming/incoming.routes.js.

BEGIN;

DO $$
BEGIN
    CREATE TYPE inventory_uid_status AS ENUM (
        'PENDING_IQC',
        'AVAILABLE',
        'QUARANTINE'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    CREATE TYPE iqc_result_status AS ENUM ('PASS', 'FAIL');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS inventory_uids (
    uid VARCHAR(32) PRIMARY KEY,
    syn_pn VARCHAR(64) NOT NULL,
    lot_no VARCHAR(128) NOT NULL,
    date_code VARCHAR(64) NOT NULL,
    qty NUMERIC(18, 3) NOT NULL,
    uom VARCHAR(16) NOT NULL DEFAULT 'PCS',
    status inventory_uid_status NOT NULL DEFAULT 'PENDING_IQC',
    store_location VARCHAR(128) NOT NULL DEFAULT 'RECEIVING',
    received_by INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_inventory_uids_material_master
        FOREIGN KEY (syn_pn)
        REFERENCES material_master(syn_pn)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT fk_inventory_uids_received_by
        FOREIGN KEY (received_by)
        REFERENCES users(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT chk_inventory_uids_uid_format
        CHECK (uid ~ '^UID-[0-9]{6}-[0-9]{4}$'),
    CONSTRAINT chk_inventory_uids_syn_pn_not_blank
        CHECK (BTRIM(syn_pn) <> ''),
    CONSTRAINT chk_inventory_uids_lot_no_not_blank
        CHECK (BTRIM(lot_no) <> ''),
    CONSTRAINT chk_inventory_uids_date_code_not_blank
        CHECK (BTRIM(date_code) <> ''),
    CONSTRAINT chk_inventory_uids_qty_positive
        CHECK (qty > 0),
    CONSTRAINT chk_inventory_uids_uom_not_blank
        CHECK (BTRIM(uom) <> ''),
    CONSTRAINT chk_inventory_uids_store_location_not_blank
        CHECK (BTRIM(store_location) <> ''),
    CONSTRAINT chk_inventory_uids_received_by_positive
        CHECK (received_by > 0)
);

CREATE TABLE IF NOT EXISTS iqc_inspections (
    id BIGSERIAL PRIMARY KEY,
    uid VARCHAR(32) NOT NULL,
    inspector_id INT NOT NULL,
    result iqc_result_status NOT NULL,
    nc_reference VARCHAR(128),
    remark TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_iqc_inspections_uid
        FOREIGN KEY (uid)
        REFERENCES inventory_uids(uid)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT fk_iqc_inspections_inspector
        FOREIGN KEY (inspector_id)
        REFERENCES users(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT chk_iqc_inspections_inspector_positive
        CHECK (inspector_id > 0),
    CONSTRAINT chk_iqc_inspections_nc_reference_required_on_fail
        CHECK (result <> 'FAIL' OR BTRIM(COALESCE(nc_reference, '')) <> '')
);

CREATE INDEX IF NOT EXISTS idx_inventory_uids_syn_pn_status
    ON inventory_uids(syn_pn, status);

CREATE INDEX IF NOT EXISTS idx_inventory_uids_status
    ON inventory_uids(status);

CREATE INDEX IF NOT EXISTS idx_inventory_uids_store_location
    ON inventory_uids(store_location);

CREATE INDEX IF NOT EXISTS idx_iqc_inspections_uid_created_at
    ON iqc_inspections(uid, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_iqc_inspections_result_created_at
    ON iqc_inspections(result, created_at DESC);

CREATE OR REPLACE FUNCTION set_incoming_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inventory_uids_set_updated_at ON inventory_uids;
CREATE TRIGGER trg_inventory_uids_set_updated_at
BEFORE UPDATE ON inventory_uids
FOR EACH ROW
EXECUTE FUNCTION set_incoming_updated_at();

COMMIT;
