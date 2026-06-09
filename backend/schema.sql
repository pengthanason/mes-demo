BEGIN;

DO $$
BEGIN
    CREATE TYPE user_role AS ENUM ('PM', 'STORE', 'QC', 'QA', 'TECH', 'PD', 'ADMIN');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    CREATE TYPE bom_status AS ENUM ('DRAFT', 'APPROVED', 'ARCHIVED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    CREATE TYPE work_order_status AS ENUM (
        'DRAFT',
        'OPEN',
        'READY',
        'WAIT_FAI',
        'WAIT_FAI_QA',
        'WAIT_FAI_MGR',
        'RUNNING',
        'CLOSED'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    CREATE TYPE inventory_uid_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SPLIT');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    ALTER TYPE inventory_uid_status ADD VALUE IF NOT EXISTS 'SPLIT';
EXCEPTION
    WHEN undefined_object THEN NULL;
END
$$;

DO $$
BEGIN
    CREATE TYPE production_unit_status AS ENUM ('NEW', 'IN_PROGRESS', 'PASS', 'NG', 'REPAIRED', 'PACKED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    CREATE TYPE machine_event_type AS ENUM ('SETUP_START', 'SETUP_END', 'RUN_START', 'PAUSE', 'RESUME', 'STOP');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    CREATE TYPE fai_status AS ENUM ('REQUESTED', 'QA_APPROVED', 'MANAGER_APPROVED', 'REJECTED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    CREATE TYPE wip_state AS ENUM ('READY_NEXT', 'IN_STATION', 'REWORK_REQUIRED', 'COMPLETED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    CREATE TYPE routing_scan_action AS ENUM ('SCAN_IN', 'SCAN_OUT');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    CREATE TYPE req_status AS ENUM (
        'PENDING_STORE',
        'PENDING_QC',
        'PENDING_PD',
        'ACTIVE_PD',
        'PENDING_RETURN_QA',
        'PENDING_RESTOCK',
        'CLOSED'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

-- NEW PM Enums
DO $$
BEGIN
    CREATE TYPE pm_lead_status AS ENUM (
        'LEAD_RECEIVED', 'REQ_INTAKE', 'READINESS_GATE_PENDING',
        'FEASIBILITY', 'QUOTE_PACKAGE_BUILD', 'SENT_TO_CUSTOMER',
        'FOLLOW_UP', 'WAIT_PO', 'WON_YES_PO', 'LOST_NO_PO',
        'CONTRACTING', 'PR_IN_PROGRESS', 'PAYMENT_PROCESS', 'CLOSED'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

-- NEW SCM Enums
DO $$
BEGIN
    CREATE TYPE scm_case_type AS ENUM (
        'DOC_PENDING', 'NO_PO', 'INV_PO_MISMATCH', 'QTY_SHORT', 'QTY_OVER',
        'WRONG_ITEM', 'DAMAGED', 'NG_QA'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    CREATE TYPE scm_disposition_action AS ENUM (
        'RTV', 'REPLACEMENT', 'USE_AS_IS', 'SCRAP', 'REWORK'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role user_role NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_users_username_not_blank CHECK (BTRIM(username) <> '')
);

CREATE TABLE IF NOT EXISTS mes_sessions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash TEXT NOT NULL,
    access_jti TEXT NOT NULL DEFAULT '',
    refresh_jti TEXT NOT NULL DEFAULT '',
    auth_mode TEXT NOT NULL DEFAULT 'hybrid',
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    refreshed_at TIMESTAMPTZ,
    last_seen_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    revoked_reason TEXT NOT NULL DEFAULT '',
    CONSTRAINT chk_mes_sessions_status CHECK (status IN ('ACTIVE', 'REVOKED', 'EXPIRED')),
    CONSTRAINT chk_mes_sessions_auth_mode CHECK (auth_mode IN ('header', 'jwt', 'hybrid')),
    CONSTRAINT chk_mes_sessions_refresh_hash_not_blank CHECK (BTRIM(refresh_token_hash) <> ''),
    CONSTRAINT chk_mes_sessions_expires_after_create CHECK (expires_at >= created_at)
);

CREATE TABLE IF NOT EXISTS auth_login_audits (
    id BIGSERIAL PRIMARY KEY,
    username TEXT NOT NULL DEFAULT '',
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    success BOOLEAN NOT NULL DEFAULT FALSE,
    reason TEXT NOT NULL DEFAULT '',
    ip_address TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    auth_mode TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS master_bom_header (
    id BIGSERIAL PRIMARY KEY,
    bom_code TEXT NOT NULL UNIQUE,
    part_no CHAR(12) NOT NULL,
    customer TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    revision TEXT NOT NULL DEFAULT '',
    status bom_status NOT NULL DEFAULT 'DRAFT',
    uploaded_by BIGINT REFERENCES users(id),
    approved_by BIGINT REFERENCES users(id),
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    notes TEXT NOT NULL DEFAULT '',
    CONSTRAINT chk_bom_header_code_not_blank CHECK (BTRIM(bom_code) <> '')
);

CREATE TABLE IF NOT EXISTS master_bom_detail (
    id BIGSERIAL PRIMARY KEY,
    bom_header_id BIGINT NOT NULL REFERENCES master_bom_header(id) ON DELETE CASCADE,
    line_no INTEGER NOT NULL,
    part_no CHAR(12) NOT NULL,
    qty_per NUMERIC(18, 6) NOT NULL,
    uom TEXT NOT NULL DEFAULT 'EA',
    description TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_bom_detail_line UNIQUE (bom_header_id, line_no),
    CONSTRAINT chk_bom_detail_line_no CHECK (line_no > 0),
    CONSTRAINT chk_bom_detail_qty CHECK (qty_per > 0)
);

CREATE TABLE IF NOT EXISTS work_orders (
    id BIGSERIAL PRIMARY KEY,
    wo_number CHAR(6) UNIQUE,
    part_no CHAR(12) NOT NULL,
    demand_plan_ref TEXT,
    mrp_bom_no TEXT,
    mrp_bom_rev TEXT,
    wms_prod_order_id TEXT,
    mrp_demand_ref TEXT,
    qty_target NUMERIC(18, 3) NOT NULL DEFAULT 0,
    qty_started NUMERIC(18, 3) NOT NULL DEFAULT 0,
    qty_good NUMERIC(18, 3) NOT NULL DEFAULT 0,
    status work_order_status NOT NULL DEFAULT 'DRAFT',
    bom_header_id BIGINT REFERENCES master_bom_header(id),
    created_by BIGINT REFERENCES users(id),
    opened_by BIGINT REFERENCES users(id),
    closed_by BIGINT REFERENCES users(id),
    opened_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    yield_pct NUMERIC(9, 4),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_work_orders_wo_number_format CHECK (wo_number IS NULL OR wo_number ~ '^[0-9]{6}$'),
    CONSTRAINT chk_work_orders_qty_target_nonneg CHECK (qty_target >= 0),
    CONSTRAINT chk_work_orders_qty_started_nonneg CHECK (qty_started >= 0),
    CONSTRAINT chk_work_orders_qty_good_nonneg CHECK (qty_good >= 0),
    CONSTRAINT chk_work_orders_qty_good_le_started CHECK (qty_good <= qty_started),
    CONSTRAINT chk_work_orders_yield_range CHECK (yield_pct IS NULL OR (yield_pct >= 0 AND yield_pct <= 100))
);

CREATE TABLE IF NOT EXISTS wo_bom_snapshot (
    id BIGSERIAL PRIMARY KEY,
    wo_id BIGINT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    line_no INTEGER NOT NULL,
    part_no CHAR(12) NOT NULL,
    qty_required NUMERIC(18, 6) NOT NULL,
    uom TEXT NOT NULL DEFAULT 'EA',
    description TEXT NOT NULL DEFAULT '',
    source_bom_id BIGINT REFERENCES master_bom_header(id),
    source_detail_id BIGINT REFERENCES master_bom_detail(id),
    mrp_bom_no TEXT,
    mrp_line_no INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_wo_bom_snapshot_line UNIQUE (wo_id, line_no),
    CONSTRAINT chk_wo_bom_snapshot_qty CHECK (qty_required > 0)
);

CREATE TABLE IF NOT EXISTS wo_incoming_reviews (
    wo_id BIGINT PRIMARY KEY REFERENCES work_orders(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'PENDING_STORE',
    store_validated_by BIGINT REFERENCES users(id),
    store_validated_at TIMESTAMPTZ,
    qa_approved_by BIGINT REFERENCES users(id),
    qa_approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_wo_incoming_reviews_status CHECK (status IN ('PENDING_STORE', 'STORE_VALIDATED', 'QA_APPROVED'))
);

CREATE TABLE IF NOT EXISTS wo_incoming_review_items (
    id BIGSERIAL PRIMARY KEY,
    wo_id BIGINT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    line_no INTEGER NOT NULL,
    part_no CHAR(12) NOT NULL,
    qty_required NUMERIC(18, 6) NOT NULL,
    approved_qty NUMERIC(18, 3) NOT NULL DEFAULT 0,
    store_checked BOOLEAN NOT NULL DEFAULT FALSE,
    store_checked_by BIGINT REFERENCES users(id),
    store_checked_at TIMESTAMPTZ,
    qa_checked BOOLEAN NOT NULL DEFAULT FALSE,
    qa_checked_by BIGINT REFERENCES users(id),
    qa_checked_at TIMESTAMPTZ,
    note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_wo_incoming_review_item_line UNIQUE (wo_id, line_no),
    CONSTRAINT chk_wo_incoming_review_items_line_no CHECK (line_no > 0),
    CONSTRAINT chk_wo_incoming_review_items_qty_required CHECK (qty_required > 0),
    CONSTRAINT chk_wo_incoming_review_items_approved_qty_nonneg CHECK (approved_qty >= 0)
);

CREATE TABLE IF NOT EXISTS inventory_uids (
    uid TEXT PRIMARY KEY,
    part_no CHAR(12) NOT NULL,
    qty_on_hand NUMERIC(18, 3) NOT NULL DEFAULT 0,
    status inventory_uid_status NOT NULL DEFAULT 'PENDING',
    lot_no TEXT NOT NULL DEFAULT '',
    received_by BIGINT REFERENCES users(id),
    approved_by BIGINT REFERENCES users(id),
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    note TEXT NOT NULL DEFAULT '',
    CONSTRAINT chk_inventory_uid_format CHECK (uid ~ '^UID-[0-9]{6}-[0-9]{4}$'),
    CONSTRAINT chk_inventory_uid_qty_nonneg CHECK (qty_on_hand >= 0)
);

CREATE TABLE IF NOT EXISTS production_units (
    sn TEXT PRIMARY KEY,
    wo_id BIGINT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    current_station TEXT NOT NULL DEFAULT 'PD_INCOMING',
    status production_unit_status NOT NULL DEFAULT 'NEW',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS unit_material_links (
    id BIGSERIAL PRIMARY KEY,
    unit_sn TEXT NOT NULL REFERENCES production_units(sn) ON DELETE CASCADE,
    material_uid TEXT NOT NULL REFERENCES inventory_uids(uid),
    lot_no TEXT,
    used_qty NUMERIC(18, 3) NOT NULL DEFAULT 1,
    station_id TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_unit_material UNIQUE (unit_sn, material_uid),
    CONSTRAINT chk_unit_material_used_qty CHECK (used_qty > 0)
);

CREATE TABLE IF NOT EXISTS traceability_relations (
    parent_sn TEXT NOT NULL REFERENCES production_units(sn) ON DELETE CASCADE,
    child_sn TEXT NOT NULL REFERENCES production_units(sn) ON DELETE CASCADE,
    relation_type TEXT NOT NULL DEFAULT 'BBAS',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (parent_sn, child_sn),
    CONSTRAINT uq_traceability_child UNIQUE (child_sn),
    CONSTRAINT chk_traceability_not_self CHECK (parent_sn <> child_sn)
);

CREATE TABLE IF NOT EXISTS fai_logs (
    id BIGSERIAL PRIMARY KEY,
    wo_id BIGINT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    qa_id BIGINT REFERENCES users(id),
    mgr_id BIGINT REFERENCES users(id),
    status fai_status NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_fai_dual_key CHECK (qa_id IS NULL OR mgr_id IS NULL OR qa_id <> mgr_id)
);

CREATE TABLE IF NOT EXISTS machine_events (
    id BIGSERIAL PRIMARY KEY,
    wo_id BIGINT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    event_type machine_event_type NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_id BIGINT REFERENCES users(id),
    note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS process_routes (
    id BIGSERIAL PRIMARY KEY,
    route_code TEXT NOT NULL UNIQUE,
    route_name TEXT NOT NULL DEFAULT '',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    enforce_sequence BOOLEAN NOT NULL DEFAULT FALSE,
    created_by BIGINT REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_process_routes_code_not_blank CHECK (BTRIM(route_code) <> ''),
    CONSTRAINT chk_process_routes_name_not_blank CHECK (BTRIM(route_name) <> '')
);

ALTER TABLE process_routes
ADD COLUMN IF NOT EXISTS enforce_sequence BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_process_routes_single_default
ON process_routes ((is_default))
WHERE is_default = TRUE;

CREATE TABLE IF NOT EXISTS route_steps (
    id BIGSERIAL PRIMARY KEY,
    route_id BIGINT NOT NULL REFERENCES process_routes(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL,
    station_name TEXT NOT NULL,
    station_type TEXT NOT NULL DEFAULT 'PD',
    requires_fai BOOLEAN NOT NULL DEFAULT FALSE,
    is_required BOOLEAN NOT NULL DEFAULT TRUE,
    allow_rework BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_route_steps_order UNIQUE (route_id, step_order),
    CONSTRAINT uq_route_steps_station UNIQUE (route_id, station_name),
    CONSTRAINT chk_route_steps_order_positive CHECK (step_order > 0),
    CONSTRAINT chk_route_steps_station_not_blank CHECK (BTRIM(station_name) <> '')
);

ALTER TABLE route_steps
ADD COLUMN IF NOT EXISTS requires_fai BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS wip_tracking (
    id BIGSERIAL PRIMARY KEY,
    wo_id BIGINT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    unit_sn TEXT NOT NULL REFERENCES production_units(sn) ON DELETE CASCADE,
    route_id BIGINT NOT NULL REFERENCES process_routes(id),
    current_step_order INTEGER NOT NULL,
    current_station_name TEXT NOT NULL,
    state wip_state NOT NULL DEFAULT 'IN_STATION',
    last_action routing_scan_action NOT NULL DEFAULT 'SCAN_IN',
    last_status TEXT,
    last_fail_station TEXT NOT NULL DEFAULT '',
    scan_in_count INTEGER NOT NULL DEFAULT 0,
    scan_out_count INTEGER NOT NULL DEFAULT 0,
    last_scan_in_at TIMESTAMPTZ,
    last_scan_out_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_wip_tracking_wo_unit UNIQUE (wo_id, unit_sn),
    CONSTRAINT chk_wip_tracking_step_positive CHECK (current_step_order > 0),
    CONSTRAINT chk_wip_tracking_station_not_blank CHECK (BTRIM(current_station_name) <> ''),
    CONSTRAINT chk_wip_tracking_last_status CHECK (last_status IS NULL OR last_status IN ('PASS', 'FAIL'))
);

CREATE TABLE IF NOT EXISTS wip_tracking_events (
    id BIGSERIAL PRIMARY KEY,
    wo_id BIGINT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    unit_sn TEXT NOT NULL REFERENCES production_units(sn) ON DELETE CASCADE,
    route_id BIGINT NOT NULL REFERENCES process_routes(id),
    step_order INTEGER NOT NULL,
    station_name TEXT NOT NULL,
    action routing_scan_action NOT NULL,
    status TEXT,
    result_state wip_state NOT NULL,
    scanned_by BIGINT REFERENCES users(id),
    scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    note TEXT NOT NULL DEFAULT '',
    CONSTRAINT chk_wip_tracking_events_step_positive CHECK (step_order > 0),
    CONSTRAINT chk_wip_tracking_events_status CHECK (status IS NULL OR status IN ('PASS', 'FAIL')),
    CONSTRAINT chk_wip_tracking_events_station_not_blank CHECK (BTRIM(station_name) <> '')
);

CREATE TABLE IF NOT EXISTS mes_notifications (
    id BIGSERIAL PRIMARY KEY,
    notice_type TEXT NOT NULL DEFAULT 'GENERAL_NOTICE',
    severity TEXT NOT NULL DEFAULT 'INFO',
    audience_key TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL DEFAULT '',
    entity_type TEXT NOT NULL DEFAULT '',
    entity_id TEXT NOT NULL DEFAULT '',
    wo_id BIGINT REFERENCES work_orders(id) ON DELETE SET NULL,
    unit_sn TEXT REFERENCES production_units(sn) ON DELETE SET NULL,
    uid TEXT REFERENCES inventory_uids(uid) ON DELETE SET NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'NEW',
    created_by BIGINT REFERENCES users(id),
    acknowledged_by BIGINT REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged_at TIMESTAMPTZ,
    CONSTRAINT chk_mes_notifications_notice_type CHECK (notice_type ~ '^[A-Z0-9_]{2,64}$'),
    CONSTRAINT chk_mes_notifications_severity CHECK (severity IN ('INFO', 'WARN', 'ERROR')),
    CONSTRAINT chk_mes_notifications_audience CHECK (audience_key ~ '^[A-Z_]{2,32}$'),
    CONSTRAINT chk_mes_notifications_status CHECK (status IN ('NEW', 'ACK')),
    CONSTRAINT chk_mes_notifications_title_not_blank CHECK (BTRIM(title) <> '')
);

CREATE TABLE IF NOT EXISTS mes_sync_log (
    id BIGSERIAL PRIMARY KEY,
    direction TEXT NOT NULL,
    event_type TEXT NOT NULL,
    wo_id BIGINT REFERENCES work_orders(id) ON DELETE SET NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'PENDING',
    error_msg TEXT NOT NULL DEFAULT '',
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    CONSTRAINT chk_sync_direction CHECK (direction IN ('MES->WMS', 'MES->MRP', 'MRP->MES', 'WMS->MES')),
    CONSTRAINT chk_sync_status CHECK (status IN ('PENDING', 'OK', 'FAILED'))
);

CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    old_value JSONB,
    new_value JSONB,
    actor_id INTEGER,
    actor_role TEXT,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS material_requisitions (
    id BIGSERIAL PRIMARY KEY,
    req_no CHAR(10) UNIQUE NOT NULL,
    wo_id BIGINT NOT NULL REFERENCES work_orders(id),
    status req_status NOT NULL DEFAULT 'PENDING_STORE',
    created_by BIGINT REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS material_req_items (
    id BIGSERIAL PRIMARY KEY,
    req_id BIGINT NOT NULL REFERENCES material_requisitions(id) ON DELETE CASCADE,
    part_no CHAR(12) NOT NULL,
    qty_requested NUMERIC(18, 3) NOT NULL DEFAULT 0,
    qty_transferred NUMERIC(18, 3) NOT NULL DEFAULT 0,
    qty_used NUMERIC(18, 3) NOT NULL DEFAULT 0,
    qty_scrap NUMERIC(18, 3) NOT NULL DEFAULT 0,
    qty_returned NUMERIC(18, 3) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS material_scraps (
    id BIGSERIAL PRIMARY KEY,
    req_id BIGINT NOT NULL REFERENCES material_requisitions(id) ON DELETE CASCADE,
    part_no CHAR(12) NOT NULL,
    qty_scrap NUMERIC(18, 3) NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    reported_by BIGINT REFERENCES users(id),
    reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wo_close_approvals (
    id BIGSERIAL PRIMARY KEY,
    wo_id BIGINT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    approver_role user_role NOT NULL,
    approved_by BIGINT REFERENCES users(id),
    approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_wo_close_approvals_role UNIQUE (wo_id, approver_role),
    CONSTRAINT chk_wo_close_approvals_role CHECK (approver_role IN ('PM', 'PD', 'ADMIN'))
);

CREATE TABLE IF NOT EXISTS wo_delivery_orders (
    id BIGSERIAL PRIMARY KEY,
    wo_id BIGINT NOT NULL UNIQUE REFERENCES work_orders(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'PREPARED',
    prepared_by BIGINT REFERENCES users(id),
    prepared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    dispatched_by BIGINT REFERENCES users(id),
    dispatched_at TIMESTAMPTZ,
    note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_wo_delivery_orders_status CHECK (status IN ('PREPARED', 'DISPATCHED'))
);

-- ==========================================
-- NEW PM Core Flow Tables (Module 11)
-- ==========================================
CREATE TABLE IF NOT EXISTS pm_projects (
    project_id TEXT PRIMARY KEY,
    customer TEXT NOT NULL,
    model TEXT NOT NULL DEFAULT '',
    req_qty NUMERIC(18, 3) NOT NULL DEFAULT 0,
    due_date TIMESTAMPTZ,
    status pm_lead_status NOT NULL DEFAULT 'LEAD_RECEIVED',
    scope_boundary TEXT NOT NULL DEFAULT '',
    acceptance_criteria TEXT NOT NULL DEFAULT '',
    nda_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
    feasibility_notes TEXT NOT NULL DEFAULT '',
    feasibility_risk TEXT NOT NULL DEFAULT '',
    lead_time_days INTEGER,
    csat_score NUMERIC(6, 2) NOT NULL DEFAULT 0,
    pqa_findings TEXT NOT NULL DEFAULT '',
    owner_id BIGINT REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pm_cr_logs (
    cr_id BIGSERIAL PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES pm_projects(project_id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    impact_cost NUMERIC(15, 2) NOT NULL DEFAULT 0,
    impact_time_days INTEGER NOT NULL DEFAULT 0,
    impact_risk TEXT NOT NULL DEFAULT '',
    is_approved BOOLEAN,
    approved_by BIGINT REFERENCES users(id),
    decision_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pm_quotes (
    quote_id BIGSERIAL PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES pm_projects(project_id) ON DELETE CASCADE,
    quote_rev TEXT NOT NULL DEFAULT 'v1.0',
    validity_days INTEGER NOT NULL DEFAULT 30,
    terms TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'DRAFT',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pm_po_logs (
    log_id BIGSERIAL PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES pm_projects(project_id) ON DELETE CASCADE,
    wait_reason_code TEXT,
    lost_reason_code TEXT,
    competitor TEXT NOT NULL DEFAULT '',
    price_gap NUMERIC(15, 2),
    aging_bucket TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pm_contracts (
    contract_id BIGSERIAL PRIMARY KEY,
    project_id TEXT NOT NULL UNIQUE REFERENCES pm_projects(project_id) ON DELETE CASCADE,
    contract_no TEXT NOT NULL UNIQUE,
    po_number TEXT NOT NULL DEFAULT '',
    delivery_terms TEXT NOT NULL DEFAULT '',
    payment_terms TEXT NOT NULL DEFAULT '',
    sla TEXT NOT NULL DEFAULT '',
    signed_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- NEW SCM & QA Cases Tables (Module 12)
-- ==========================================
CREATE TABLE IF NOT EXISTS scm_cases (
    case_id TEXT PRIMARY KEY,
    case_type scm_case_type NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN',
    ref_po TEXT NOT NULL DEFAULT '',
    ref_inv TEXT NOT NULL DEFAULT '',
    part_no CHAR(12) NOT NULL DEFAULT '',
    owner_id BIGINT REFERENCES users(id),
    opened_by BIGINT REFERENCES users(id),
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    due_date TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    resolution_note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS scm_split_lots (
    split_id BIGSERIAL PRIMARY KEY,
    original_uid TEXT NOT NULL REFERENCES inventory_uids(uid),
    ok_uid TEXT NOT NULL REFERENCES inventory_uids(uid),
    ng_uid TEXT NOT NULL REFERENCES inventory_uids(uid),
    reason TEXT NOT NULL DEFAULT '',
    approved_by BIGINT REFERENCES users(id),
    split_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scm_supplier_dispositions (
    disp_id BIGSERIAL PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES scm_cases(case_id) ON DELETE CASCADE,
    action scm_disposition_action NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING_SUPPLIER',
    rma_no TEXT NOT NULL DEFAULT '',
    return_qty NUMERIC(18, 3) NOT NULL DEFAULT 0,
    created_by BIGINT REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders(status);
CREATE INDEX IF NOT EXISTS idx_work_orders_wo_number ON work_orders(wo_number);
CREATE INDEX IF NOT EXISTS idx_bom_header_status ON master_bom_header(status);
CREATE INDEX IF NOT EXISTS idx_inventory_uids_part_no ON inventory_uids(part_no);
CREATE INDEX IF NOT EXISTS idx_inventory_uids_status ON inventory_uids(status);
CREATE INDEX IF NOT EXISTS idx_wo_incoming_reviews_status ON wo_incoming_reviews(status);
CREATE INDEX IF NOT EXISTS idx_wo_incoming_review_items_wo_line ON wo_incoming_review_items(wo_id, line_no);
CREATE INDEX IF NOT EXISTS idx_production_units_wo_id ON production_units(wo_id);
CREATE INDEX IF NOT EXISTS idx_unit_material_links_unit ON unit_material_links(unit_sn);
CREATE INDEX IF NOT EXISTS idx_machine_events_wo_time ON machine_events(wo_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_fai_logs_wo_time ON fai_logs(wo_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_route_steps_route_order ON route_steps(route_id, step_order);
CREATE INDEX IF NOT EXISTS idx_route_steps_route_station ON route_steps(route_id, station_name);
CREATE INDEX IF NOT EXISTS idx_wip_tracking_wo_state ON wip_tracking(wo_id, state);
CREATE INDEX IF NOT EXISTS idx_wip_tracking_route_step ON wip_tracking(route_id, current_step_order);
CREATE INDEX IF NOT EXISTS idx_wip_tracking_events_wo_unit_time ON wip_tracking_events(wo_id, unit_sn, scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_mes_notifications_audience_status_time ON mes_notifications(audience_key, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mes_notifications_status_time ON mes_notifications(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mes_notifications_wo_time ON mes_notifications(wo_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mes_sync_log_wo ON mes_sync_log(wo_id);
CREATE INDEX IF NOT EXISTS idx_mes_sync_log_status ON mes_sync_log(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mes_sync_log_event ON mes_sync_log(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wo_close_approvals_wo_id ON wo_close_approvals(wo_id);
CREATE INDEX IF NOT EXISTS idx_wo_delivery_orders_status ON wo_delivery_orders(status);
CREATE INDEX IF NOT EXISTS idx_mes_sessions_user_status ON mes_sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_mes_sessions_refresh_jti ON mes_sessions(refresh_jti);
CREATE INDEX IF NOT EXISTS idx_auth_login_audits_time ON auth_login_audits(created_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_set_updated_at ON users;
CREATE TRIGGER trg_users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_work_orders_set_updated_at ON work_orders;
CREATE TRIGGER trg_work_orders_set_updated_at
BEFORE UPDATE ON work_orders
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_production_units_set_updated_at ON production_units;
CREATE TRIGGER trg_production_units_set_updated_at
BEFORE UPDATE ON production_units
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_wo_incoming_reviews_set_updated_at ON wo_incoming_reviews;
CREATE TRIGGER trg_wo_incoming_reviews_set_updated_at
BEFORE UPDATE ON wo_incoming_reviews
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_wo_incoming_review_items_set_updated_at ON wo_incoming_review_items;
CREATE TRIGGER trg_wo_incoming_review_items_set_updated_at
BEFORE UPDATE ON wo_incoming_review_items
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_wo_delivery_orders_set_updated_at ON wo_delivery_orders;
CREATE TRIGGER trg_wo_delivery_orders_set_updated_at
BEFORE UPDATE ON wo_delivery_orders
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_process_routes_set_updated_at ON process_routes;
CREATE TRIGGER trg_process_routes_set_updated_at
BEFORE UPDATE ON process_routes
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_wip_tracking_set_updated_at ON wip_tracking;
CREATE TRIGGER trg_wip_tracking_set_updated_at
BEFORE UPDATE ON wip_tracking
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE OR REPLACE FUNCTION lock_approved_uid_part_no()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.status = 'APPROVED'::inventory_uid_status AND NEW.part_no IS DISTINCT FROM OLD.part_no THEN
        RAISE EXCEPTION 'part_no is immutable after QA approval for UID=%', OLD.uid
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_approved_uid_part_no ON inventory_uids;
CREATE TRIGGER trg_lock_approved_uid_part_no
BEFORE UPDATE ON inventory_uids
FOR EACH ROW
EXECUTE FUNCTION lock_approved_uid_part_no();

INSERT INTO process_routes (route_code, route_name, is_active, is_default, enforce_sequence)
SELECT
    'DEFAULT_PD_CHAIN_R1R13',
    'Default Production Flex Route',
    TRUE,
    FALSE,
    FALSE
WHERE NOT EXISTS (
    SELECT 1
    FROM process_routes
    WHERE route_code = 'DEFAULT_PD_CHAIN_R1R13'
);

UPDATE process_routes
SET is_default = FALSE
WHERE route_code <> 'DEFAULT_PD_CHAIN_R1R13'
  AND is_default = TRUE;

UPDATE process_routes
SET route_name = 'Default Production Flex Route',
    is_active = TRUE,
    is_default = TRUE,
    enforce_sequence = FALSE
WHERE route_code = 'DEFAULT_PD_CHAIN_R1R13';

INSERT INTO route_steps (route_id, step_order, station_name, station_type, requires_fai, is_required, allow_rework)
SELECT
    pr.id,
    s.step_order,
    s.station_name,
    'PD',
    s.requires_fai,
    TRUE,
    TRUE
FROM process_routes pr
JOIN (
    VALUES
        (1, 'SMT_SMD', FALSE),
        (2, 'THU_INSERT', FALSE),
        (3, 'ICT', FALSE),
        (4, 'FCT_PCBA', FALSE),
        (5, 'BB_PREP', FALSE),
        (6, 'FCT_BBAS', FALSE),
        (7, 'FQC', FALSE)
) AS s(step_order, station_name, requires_fai) ON TRUE
WHERE pr.route_code = 'DEFAULT_PD_CHAIN_R1R13'
ON CONFLICT (route_id, step_order) DO UPDATE
SET station_name = EXCLUDED.station_name,
    station_type = EXCLUDED.station_type,
    requires_fai = EXCLUDED.requires_fai,
    is_required = EXCLUDED.is_required,
    allow_rework = EXCLUDED.allow_rework;

DELETE FROM route_steps rs
USING process_routes pr
WHERE rs.route_id = pr.id
  AND pr.route_code = 'DEFAULT_PD_CHAIN_R1R13'
  AND rs.step_order NOT BETWEEN 1 AND 7;

COMMIT;

