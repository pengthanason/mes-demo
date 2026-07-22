-- ============================================================================
-- MES Database Schema — RECONCILED (v2)
-- ============================================================================
-- ฐาน: schema ที่เพื่อน BE ทำให้ (hardened: FK + constraint + normalize)
-- แล้ว reconcile กับ app จริง (my-api) โดย:
--   • รับของเพื่อนที่ถูกต้อง (FK ภายใน, check constraint, UNIQUE, actor_id) มาใช้
--   • REVERT เฉพาะจุดที่เพื่อนเข้าใจ field ผิด (ไม่งั้น app พัง)
--   • เก็บคอลัมน์/ค่าใหม่ที่ทีมเราเพิ่มหลังส่ง SQL ให้เพื่อน
--   • FK ที่อ้าง work_orders(wo_no) แยกเป็นส่วน "DEFERRED" ท้ายไฟล์ (ดูเหตุผลด้านล่าง)
--
-- สรุปจุดที่ปรับจาก dump ของเพื่อน (พร้อมเหตุผล):
--   1) pp_projects.pc_prpo..pc_packing : numeric(5,2) 0-100  ->  VARCHAR(30)
--      เพื่อนเข้าใจว่าเป็น "% ความคืบหน้า" แต่จริงๆ เก็บ "สถานะ step"
--      ('' | WAIT | ON_PROCESS | DONE | DELAY) ใช้ลงสี Gantt  ->  ตัด pp_pc_range_check ออก
--   2) audit_logs : คง `note` (หมายเหตุการแก้ไข PP / edit history) + รับ actor_id ของเพื่อน
--   3) change_requests.m_type : 4M  ->  5M+1E (เพิ่ม Measurement, Environment)
--   4) pp_projects : เพิ่ม `pp_type` (internal/external) และ `bom_rec_date` (ฟีเจอร์ของเรา)
--   5) notifications.user_id : NOT NULL  ->  NULLABLE + FK (ของเราแทรกแบบ global ไม่มี user_id)
--   6) FK ...wo_id/wo_ref/code -> work_orders(wo_no) : DEFERRED
--      app บาง path (Workflow/QC) แทรก wo_id สังเคราะห์ ('WORKFLOW','QC') ที่ไม่มีใน work_orders
--      -> ถ้าบังคับ FK ตอนนี้ insert จะ fail  ->  เปิดใช้หลัง normalize wo_id (ดูท้ายไฟล์)
-- ============================================================================

-- ── Users / Auth ───────────────────────────────────────────────────────────
CREATE TABLE app_users (
    id            SERIAL PRIMARY KEY,
    username      VARCHAR(100) NOT NULL UNIQUE,
    full_name     VARCHAR(200) NOT NULL,
    role          VARCHAR(20)  NOT NULL DEFAULT 'VIEWER',
    is_active     BOOLEAN      NOT NULL DEFAULT true,
    password_hash VARCHAR(255) NOT NULL,
    permissions   JSONB        NOT NULL DEFAULT '[]'::jsonb,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT app_users_password_not_empty CHECK (password_hash <> ''),
    CONSTRAINT app_users_role_check CHECK (role IN ('ADMIN','MEMBER','VIEWER'))
);
CREATE INDEX idx_app_users_permissions ON app_users USING gin (permissions);

CREATE TABLE audit_logs (
    id          SERIAL PRIMARY KEY,
    actor       VARCHAR(100) NOT NULL,
    actor_id    INTEGER REFERENCES app_users(id) ON DELETE SET NULL,   -- (เพื่อน) normalize actor
    action      VARCHAR(100) NOT NULL,
    target_type VARCHAR(50),
    target_id   VARCHAR(100),
    detail      TEXT,
    note        TEXT,                                                  -- (เรา) หมายเหตุการแก้ไข PP / edit history
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER REFERENCES app_users(id) ON DELETE CASCADE,     -- NULLABLE: NULL = แจ้งเตือนแบบ global
    type       VARCHAR(50)  NOT NULL,
    title      VARCHAR(200) NOT NULL,
    message    TEXT         NOT NULL,
    link       VARCHAR(200),
    is_read    BOOLEAN      NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ── BOM ──────────────────────────────────────────────────────────────────────
CREATE TABLE boms (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(200) NOT NULL,
    version     VARCHAR(50)  NOT NULL DEFAULT '1.0',
    approved    BOOLEAN      NOT NULL DEFAULT false,
    approved_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (name, version)
);

CREATE TABLE bom_lines (
    id         SERIAL PRIMARY KEY,
    bom_id     INTEGER       NOT NULL REFERENCES boms(id) ON DELETE CASCADE,
    part_no    VARCHAR(100)  NOT NULL,
    part_name  VARCHAR(200)  NOT NULL,
    qty_per    NUMERIC(10,4) NOT NULL DEFAULT 1,
    unit       VARCHAR(50)   NOT NULL DEFAULT 'pcs',
    sort_order INTEGER       NOT NULL DEFAULT 0
);

-- ── Work Orders / Planning ───────────────────────────────────────────────────
CREATE TABLE work_orders (
    id            SERIAL PRIMARY KEY,
    wo_no         VARCHAR(50)  NOT NULL UNIQUE,
    product_name  VARCHAR(200) NOT NULL,
    qty           INTEGER      NOT NULL,
    status        VARCHAR(30)  NOT NULL DEFAULT 'PENDING',
    due_date      DATE,
    customer      VARCHAR(100),
    station       VARCHAR(100),
    current_step  VARCHAR(30)  NOT NULL DEFAULT 'DRAFT',
    qty_good      INTEGER      NOT NULL DEFAULT 0,
    actual_qty    INTEGER,
    fai_inspector VARCHAR(100),
    fai_approver  VARCHAR(100),
    fai_passed    BOOLEAN      NOT NULL DEFAULT false,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT work_orders_qty_check CHECK (qty > 0),
    CONSTRAINT work_orders_status_check CHECK (status IN ('PENDING','IN_PROGRESS','DONE','CANCELLED'))
);

CREATE TABLE pre_wo_requests (
    id         SERIAL PRIMARY KEY,
    bom_id     INTEGER      NOT NULL REFERENCES boms(id),
    qty        INTEGER      NOT NULL,
    due_date   DATE         NOT NULL,
    status     VARCHAR(30)  NOT NULL DEFAULT 'PENDING',
    wo_id      VARCHAR(100),                                           -- -> work_orders(wo_no) : ดู DEFERRED
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT pre_wo_requests_qty_check CHECK (qty > 0),
    CONSTRAINT pre_wo_requests_status_check CHECK (status IN ('PENDING','APPROVED','CONVERTED','REJECTED'))
);

CREATE TABLE work_centers (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(150) NOT NULL,
    stations   INTEGER      NOT NULL DEFAULT 1,
    efficiency INTEGER      NOT NULL DEFAULT 100,
    note       TEXT         NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ── Workflow builder (routing template) ──────────────────────────────────────
CREATE TABLE workflows (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(150) NOT NULL DEFAULT '',
    customer   VARCHAR(100) NOT NULL DEFAULT '',
    model      VARCHAR(150) NOT NULL DEFAULT '',
    steps      JSONB        NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_workflows_steps ON workflows USING gin (steps);

CREATE TABLE workflow_results (
    id         SERIAL PRIMARY KEY,
    serial     VARCHAR(150) NOT NULL,
    customer   VARCHAR(100) NOT NULL DEFAULT '',
    model      VARCHAR(150) NOT NULL DEFAULT '',
    sequence   TEXT         NOT NULL DEFAULT '',
    result     VARCHAR(10)  NOT NULL DEFAULT 'PASS',
    total_sec  INTEGER      NOT NULL DEFAULT 0,
    line       VARCHAR(10)  NOT NULL DEFAULT 'internal',
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ── Jig Test ─────────────────────────────────────────────────────────────────
CREATE TABLE jig_projects (
    id           SERIAL PRIMARY KEY,
    project_code VARCHAR(50)  NOT NULL UNIQUE,
    name         VARCHAR(200) NOT NULL,
    jig_id       VARCHAR(50)  NOT NULL DEFAULT '',
    test_type    VARCHAR(10)  NOT NULL DEFAULT 'ICT',
    is_active    BOOLEAN      NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE jig_test_records (
    id           SERIAL PRIMARY KEY,
    project_code VARCHAR(50)  NOT NULL REFERENCES jig_projects(project_code),
    serial       VARCHAR(100) NOT NULL,
    result       VARCHAR(10)  NOT NULL,
    tested_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    voltage      NUMERIC(7,3),
    current_ma   NUMERIC(8,3),
    temp_c       NUMERIC(5,2),
    fail_param   VARCHAR(100),
    notes        TEXT,
    CONSTRAINT jig_test_records_result_check CHECK (result IN ('PASS','FAIL'))
);

CREATE TABLE jig_retest_requests (
    id           SERIAL PRIMARY KEY,
    project_code VARCHAR(50)  NOT NULL,
    serial       VARCHAR(100) NOT NULL,
    status       VARCHAR(20)  NOT NULL DEFAULT 'REQUESTED',
    requested_by VARCHAR(100) NOT NULL DEFAULT '',
    requested_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT jig_retest_requests_status_check CHECK (status IN ('REQUESTED','DONE','CANCELLED'))
);

-- ── Inventory / Kitting ──────────────────────────────────────────────────────
CREATE TABLE inventory_lots (
    id           SERIAL PRIMARY KEY,
    part_no      VARCHAR(100) NOT NULL,
    part_name    VARCHAR(200) NOT NULL DEFAULT '',
    lot_no       VARCHAR(100) NOT NULL,
    qty_received INTEGER      NOT NULL,
    qty_available INTEGER     NOT NULL DEFAULT 0,
    status       VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    note         TEXT,
    received_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    reviewed_at  TIMESTAMPTZ,
    uid          VARCHAR(100) UNIQUE,
    CONSTRAINT inventory_lots_qty_received_check CHECK (qty_received > 0),
    CONSTRAINT inventory_lots_status_check CHECK (status IN ('PENDING','APPROVED','REJECTED'))
);

CREATE TABLE kitting_issues (
    id        SERIAL PRIMARY KEY,
    wo_id     VARCHAR(100) NOT NULL,                                   -- -> work_orders(wo_no) : ดู DEFERRED
    part_no   VARCHAR(100) NOT NULL,
    qty       INTEGER      NOT NULL,
    lot_no    VARCHAR(100) NOT NULL DEFAULT '',
    issued_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT kitting_issues_qty_check CHECK (qty > 0)
);

-- ── Production Plan (PP / 5M+1E) ─────────────────────────────────────────────
CREATE TABLE pp_projects (
    id              SERIAL PRIMARY KEY,
    status          VARCHAR(30)  NOT NULL DEFAULT 'ON_PROCESS',
    status_color    VARCHAR(30)  NOT NULL DEFAULT '',
    pp_type         VARCHAR(20)  NOT NULL DEFAULT 'internal',          -- (เรา) internal / external — แยกแท็บ Dashboard
    wk              INTEGER,
    date_record     DATE,
    product_pn      VARCHAR(100) NOT NULL DEFAULT '',
    model           VARCHAR(150) NOT NULL DEFAULT '',
    customer        VARCHAR(100) NOT NULL DEFAULT '',
    qty             INTEGER      NOT NULL DEFAULT 0,
    produce         INTEGER      NOT NULL DEFAULT 0,
    syn_requestor   VARCHAR(100) NOT NULL DEFAULT '',
    work_order      VARCHAR(100) NOT NULL DEFAULT '',
    wo_name         VARCHAR(150) NOT NULL DEFAULT '',
    matl_coming     VARCHAR(200) NOT NULL DEFAULT '',
    chk_man         BOOLEAN      NOT NULL DEFAULT false,
    chk_mac         BOOLEAN      NOT NULL DEFAULT false,
    chk_med         BOOLEAN      NOT NULL DEFAULT false,
    chk_mat         BOOLEAN      NOT NULL DEFAULT false,
    chk_env         BOOLEAN      NOT NULL DEFAULT false,
    pd_pcba         BOOLEAN      NOT NULL DEFAULT false,
    pd_bbas         BOOLEAN      NOT NULL DEFAULT false,
    pd_test         BOOLEAN      NOT NULL DEFAULT false,
    pd_modified     BOOLEAN      NOT NULL DEFAULT false,
    pd_rma          BOOLEAN      NOT NULL DEFAULT false,
    pd_prep         BOOLEAN      NOT NULL DEFAULT false,
    pd_start_date   DATE,
    pd_finish_date  DATE,
    target_per_day  INTEGER      NOT NULL DEFAULT 0,
    expected_date   DATE,
    revised_date    DATE,
    bom_rec_date    DATE,                                              -- (เรา) วันรับ BOM (กลุ่ม WO)
    qa_test_rate    VARCHAR(50)  NOT NULL DEFAULT '',
    qa_finish_date  DATE,
    qa_status       VARCHAR(30)  NOT NULL DEFAULT '',
    store_received  DATE,
    pd_pic          VARCHAR(150) NOT NULL DEFAULT '',
    pic_responsible VARCHAR(150) NOT NULL DEFAULT '',
    team_member     INTEGER      NOT NULL DEFAULT 0,
    ok_per_day      INTEGER      NOT NULL DEFAULT 0,
    total_ng        INTEGER      NOT NULL DEFAULT 0,
    total_ok        INTEGER      NOT NULL DEFAULT 0,
    special_request TEXT         NOT NULL DEFAULT '',
    remark          TEXT         NOT NULL DEFAULT '',
    done            BOOLEAN      NOT NULL DEFAULT false,
    st_pr_po        BOOLEAN      NOT NULL DEFAULT false,
    st_wait_mat     BOOLEAN      NOT NULL DEFAULT false,
    st_incoming     BOOLEAN      NOT NULL DEFAULT false,
    st_create_bo    BOOLEAN      NOT NULL DEFAULT false,
    st_test         BOOLEAN      NOT NULL DEFAULT false,
    st_rework       BOOLEAN      NOT NULL DEFAULT false,
    st_smt          BOOLEAN      NOT NULL DEFAULT false,
    st_thr          BOOLEAN      NOT NULL DEFAULT false,
    st_bbas         BOOLEAN      NOT NULL DEFAULT false,
    -- pc_* = สถานะต่อ process step ('' | WAIT | ON_PROCESS | DONE | DELAY) — ใช้ลงสี Gantt
    -- NOTE: เป็น VARCHAR (สถานะ) ไม่ใช่ numeric % — (dump ของเพื่อนทำเป็น numeric(5,2) 0-100 = เข้าใจผิด)
    pc_prpo         VARCHAR(30)  NOT NULL DEFAULT '',
    pc_wait         VARCHAR(30)  NOT NULL DEFAULT '',
    pc_incoming     VARCHAR(30)  NOT NULL DEFAULT '',
    pc_smt          VARCHAR(30)  NOT NULL DEFAULT '',
    pc_thr          VARCHAR(30)  NOT NULL DEFAULT '',
    pc_test         VARCHAR(30)  NOT NULL DEFAULT '',
    pc_bbas         VARCHAR(30)  NOT NULL DEFAULT '',
    pc_packing      VARCHAR(30)  NOT NULL DEFAULT '',
    process_log     JSONB        NOT NULL DEFAULT '[]'::jsonb,          -- [{date, step, status}] วาด Gantt หลายสี
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_pp_projects_process_log ON pp_projects USING gin (process_log);

-- ── Production (scan / units / reports) ──────────────────────────────────────
CREATE TABLE production_reports (
    id           SERIAL PRIMARY KEY,
    code         VARCHAR(100) NOT NULL,                                -- -> work_orders(wo_no) : ดู DEFERRED
    customer     VARCHAR(100) NOT NULL DEFAULT '',
    status       TEXT         NOT NULL DEFAULT '',
    stage        VARCHAR(50)  NOT NULL DEFAULT 'Planning',
    qty          INTEGER      NOT NULL DEFAULT 0,
    delivery     DATE,
    is_completed BOOLEAN      NOT NULL DEFAULT false,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT prod_report_status_check CHECK (status IN ('PENDING','IN_PROGRESS','DONE','CANCELLED'))
);

CREATE TABLE production_scans (
    id         SERIAL PRIMARY KEY,
    wo_id      VARCHAR(100) NOT NULL,                                  -- -> work_orders(wo_no) : ดู DEFERRED (Workflow/QC ใช้ค่าสังเคราะห์)
    serial     VARCHAR(100) NOT NULL,
    station    VARCHAR(100) NOT NULL,
    result     VARCHAR(10)  NOT NULL,
    operator   VARCHAR(100) NOT NULL DEFAULT '',
    note       TEXT,
    scanned_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT production_scans_result_check CHECK (result IN ('PASS','FAIL'))
);

CREATE TABLE production_units (
    id           SERIAL PRIMARY KEY,
    wo_id        VARCHAR(100) NOT NULL,                                -- -> work_orders(wo_no) : ดู DEFERRED
    serial       VARCHAR(100) NOT NULL,
    last_station VARCHAR(100) NOT NULL DEFAULT '',
    last_result  VARCHAR(10)  NOT NULL DEFAULT 'PASS',
    scan_count   INTEGER      NOT NULL DEFAULT 0,
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT production_units_last_result_check CHECK (last_result IN ('PASS','FAIL')),
    UNIQUE (wo_id, serial)
);

CREATE TABLE routing_records (
    id         SERIAL PRIMARY KEY,
    serial     VARCHAR(100) NOT NULL,
    sequence   TEXT         NOT NULL,
    result     VARCHAR(10)  NOT NULL,
    total_sec  INTEGER      NOT NULL DEFAULT 0,
    wo_id      VARCHAR(100) NOT NULL,                                  -- -> work_orders(wo_no) : ดู DEFERRED
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ── QC / OBA / Rework ────────────────────────────────────────────────────────
CREATE TABLE oba_records (
    id          SERIAL PRIMARY KEY,
    wo_id       VARCHAR(50)  NOT NULL,                                 -- -> work_orders(wo_no) : ดู DEFERRED
    lot_no      VARCHAR(100) NOT NULL,
    sample_qty  INTEGER      NOT NULL,
    result      VARCHAR(10)  NOT NULL,
    defect_note TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT oba_records_result_check CHECK (result IN ('PASS','FAIL')),
    CONSTRAINT oba_records_sample_qty_check CHECK (sample_qty > 0)
);

CREATE TABLE qc_results (
    id          SERIAL PRIMARY KEY,
    wo_id       VARCHAR(100) NOT NULL,                                 -- -> work_orders(wo_no) : ดู DEFERRED
    lot_no      VARCHAR(100) NOT NULL,
    qty_checked INTEGER      NOT NULL,
    qty_pass    INTEGER      NOT NULL DEFAULT 0,
    qty_fail    INTEGER      NOT NULL DEFAULT 0,
    overall     VARCHAR(10)  NOT NULL,
    defect_desc TEXT,
    remark      TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT qc_qty_nonneg_check CHECK (qty_pass >= 0 AND qty_fail >= 0),
    CONSTRAINT qc_qty_sum_check CHECK ((qty_pass + qty_fail) = qty_checked),
    CONSTRAINT qc_results_overall_check CHECK (overall IN ('PASS','FAIL','PARTIAL')),
    CONSTRAINT qc_results_qty_checked_check CHECK (qty_checked > 0)
);

CREATE TABLE qc_records (
    id           SERIAL PRIMARY KEY,
    sn           VARCHAR(100) NOT NULL,
    status       VARCHAR(10)  NOT NULL,
    error        TEXT,
    qc_result_id INTEGER REFERENCES qc_results(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT qc_records_status_check CHECK (status IN ('PASS','FAIL'))
);

CREATE TABLE rework_tickets (
    id           SERIAL PRIMARY KEY,
    qc_result_id INTEGER      NOT NULL REFERENCES qc_results(id),
    wo_id        VARCHAR(100) NOT NULL,                                -- -> work_orders(wo_no) : ดู DEFERRED
    defect_type  VARCHAR(200) NOT NULL,
    assigned_to  VARCHAR(100) NOT NULL DEFAULT '',
    due_date     DATE,
    status       VARCHAR(20)  NOT NULL DEFAULT 'OPEN',
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT rework_tickets_status_check CHECK (status IN ('OPEN','IN_PROGRESS','DONE'))
);

CREATE TABLE transfer_verifications (
    id           SERIAL PRIMARY KEY,
    qc_result_id INTEGER      NOT NULL REFERENCES qc_results(id),
    wo_id        VARCHAR(100) NOT NULL,                                -- -> work_orders(wo_no) : ดู DEFERRED
    verdict      VARCHAR(10)  NOT NULL,
    note         TEXT,
    verified_by  VARCHAR(100) NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT transfer_verifications_verdict_check CHECK (verdict IN ('APPROVED','REJECTED'))
);

-- ── SCM (cases / dispositions / lot split) ──────────────────────────────────
CREATE TABLE scm_cases (
    id              SERIAL PRIMARY KEY,
    case_id         VARCHAR(50)  NOT NULL UNIQUE,
    case_type       VARCHAR(50)  NOT NULL,
    status          VARCHAR(20)  NOT NULL DEFAULT 'OPEN',
    ref_po          VARCHAR(100) NOT NULL DEFAULT '',
    ref_inv         VARCHAR(100) NOT NULL DEFAULT '',
    part_no         VARCHAR(100) NOT NULL DEFAULT '',
    due_date        DATE,
    resolution_note TEXT         NOT NULL DEFAULT '',
    resolved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE scm_dispositions (
    id         SERIAL PRIMARY KEY,
    case_id    VARCHAR(50)   NOT NULL REFERENCES scm_cases(case_id) ON DELETE CASCADE,
    action     VARCHAR(50)   NOT NULL,
    rma_no     VARCHAR(100)  NOT NULL DEFAULT '',
    return_qty NUMERIC(10,3) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE scm_lot_splits (
    id           SERIAL PRIMARY KEY,
    original_uid VARCHAR(100)  NOT NULL REFERENCES inventory_lots(uid) ON DELETE RESTRICT,
    ok_uid       VARCHAR(100)  NOT NULL REFERENCES inventory_lots(uid) ON DELETE RESTRICT,
    ng_uid       VARCHAR(100)  NOT NULL REFERENCES inventory_lots(uid) ON DELETE RESTRICT,
    original_qty NUMERIC(10,3) NOT NULL,
    ok_qty       NUMERIC(10,3) NOT NULL,
    ng_qty       NUMERIC(10,3) NOT NULL,
    reason       TEXT          NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT split_qty_balance CHECK ((ok_qty + ng_qty) = original_qty),
    CONSTRAINT split_qty_nonneg CHECK (ok_qty >= 0 AND ng_qty >= 0 AND original_qty > 0)
);

-- ── Change Request (5M+1E) ───────────────────────────────────────────────────
CREATE TABLE change_requests (
    id          SERIAL PRIMARY KEY,
    cr_no       VARCHAR(50)  NOT NULL UNIQUE,
    m_type      VARCHAR(20)  NOT NULL,
    wo_ref      VARCHAR(100),                                          -- -> work_orders(wo_no) : ดู DEFERRED
    description TEXT         NOT NULL,
    impact      TEXT         NOT NULL DEFAULT '',
    state       VARCHAR(20)  NOT NULL DEFAULT 'DRAFT',
    g1_note     TEXT,
    g1_at       TIMESTAMPTZ,
    g2_note     TEXT,
    g2_at       TIMESTAMPTZ,
    g3_note     TEXT,
    g3_at       TIMESTAMPTZ,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    -- 5M+1E: 4M เดิม + Measurement + Environment  (dump ของเพื่อนมีแค่ 4M)
    CONSTRAINT change_requests_m_type_check CHECK (m_type IN ('Man','Machine','Material','Method','Measurement','Environment')),
    CONSTRAINT change_requests_state_check CHECK (state IN ('DRAFT','G1_REVIEW','G2_APPROVED','G3_REVIEW','ACTIVE')),
    CONSTRAINT cr_active_must_have_wo   CHECK (state = 'DRAFT' OR wo_ref IS NOT NULL),
    CONSTRAINT cr_g3_only_when_reviewed CHECK (g3_at IS NULL OR state IN ('G3_REVIEW','ACTIVE'))
);

-- ============================================================================
-- DEFERRED FOREIGN KEYS  ->  work_orders(wo_no)
-- ----------------------------------------------------------------------------
-- ยังไม่เปิดใช้ เพราะ app บาง path แทรก wo_id/wo_ref ที่ไม่มีใน work_orders:
--   • production_scans : Workflow save ใช้ wo_id = model|customer|'WORKFLOW' ; QC scan ใช้ 'QC'
--   • production_reports.code, oba/qc/kitting/routing/rework/transfer.wo_id, change_requests.wo_ref
--     : ฟอร์มกรอก wo_id เป็น free text ได้
-- เปิดใช้ได้ "หลัง normalize" ให้ทุก path อ้าง wo_no จริง (หรือสร้าง WO ล่วงหน้า)
-- แล้ว uncomment บล็อกนี้:
--
-- ALTER TABLE production_scans        ADD CONSTRAINT fk_prod_scans_wo   FOREIGN KEY (wo_id)  REFERENCES work_orders(wo_no) ON DELETE RESTRICT;
-- ALTER TABLE production_units        ADD CONSTRAINT fk_prod_units_wo   FOREIGN KEY (wo_id)  REFERENCES work_orders(wo_no) ON DELETE RESTRICT;
-- ALTER TABLE production_reports      ADD CONSTRAINT fk_prod_report_wo  FOREIGN KEY (code)   REFERENCES work_orders(wo_no) ON DELETE RESTRICT;
-- ALTER TABLE routing_records         ADD CONSTRAINT fk_routing_wo      FOREIGN KEY (wo_id)  REFERENCES work_orders(wo_no) ON DELETE RESTRICT;
-- ALTER TABLE oba_records             ADD CONSTRAINT fk_oba_wo          FOREIGN KEY (wo_id)  REFERENCES work_orders(wo_no) ON DELETE RESTRICT;
-- ALTER TABLE qc_results              ADD CONSTRAINT fk_qc_results_wo   FOREIGN KEY (wo_id)  REFERENCES work_orders(wo_no) ON DELETE RESTRICT;
-- ALTER TABLE rework_tickets          ADD CONSTRAINT fk_rework_wo       FOREIGN KEY (wo_id)  REFERENCES work_orders(wo_no) ON DELETE RESTRICT;
-- ALTER TABLE transfer_verifications  ADD CONSTRAINT fk_transfer_wo     FOREIGN KEY (wo_id)  REFERENCES work_orders(wo_no) ON DELETE RESTRICT;
-- ALTER TABLE kitting_issues          ADD CONSTRAINT fk_kitting_wo      FOREIGN KEY (wo_id)  REFERENCES work_orders(wo_no) ON DELETE RESTRICT;
-- ALTER TABLE pre_wo_requests         ADD CONSTRAINT fk_pre_wo_requests_wo FOREIGN KEY (wo_id) REFERENCES work_orders(wo_no) ON DELETE RESTRICT;
-- ALTER TABLE change_requests         ADD CONSTRAINT fk_cr_wo           FOREIGN KEY (wo_ref) REFERENCES work_orders(wo_no) ON DELETE RESTRICT;
-- ============================================================================
