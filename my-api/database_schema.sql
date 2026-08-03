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
--
-- ── รอบตรวจทาน (2026-07-30) : sync เอกสารนี้ให้ตรงกับ migrations.js + โค้ดจริง ──────
--   7) pre_wo_requests.wo_id : VARCHAR(100)  ->  INTEGER REFERENCES work_orders(id)
--      ของจริง (migrations.js) เป็น FK ตัวเลขไป work_orders(id) และโค้ด convert (routes/wo.js)
--      เขียนค่า id ตัวเลขลงคอลัมน์นี้  ->  เอกสารเดิมเขียน VARCHAR = ผิด (prod จะได้ชนิดต่างจาก dev)
--      -> ย้ายออกจากบล็อก DEFERRED ท้ายไฟล์ด้วย (มัน FK ตัวเลข ไม่ใช่ FK ที่อ้าง wo_no)
--   8) pp_projects : เพิ่ม `product_image` TEXT (รูปสินค้า data URL — ฟีเจอร์ของเรา)
--      มีใน migrations.js + DB จริงแล้ว แต่ตกหล่นในเอกสารนี้  ->  เติมให้ครบ (additive, nullable)
--   9) production_reports.status : ตัด CHECK enum ('PENDING','IN_PROGRESS','DONE','CANCELLED') ออก
--      คอลัมน์นี้เก็บ "ข้อความอิสระ" (เช่น 'SMT เสร็จ เหลือ Depanel/Packing') ตาม app + seed จริง
--      -> ถ้าคง CHECK ไว้ prod จะ reject ข้อมูลจริงตอน insert (migrations.js ก็ไม่มี CHECK นี้)
--
-- ── รอบแก้ไข (2026-07-31) : ตามคำสั่งผู้ใช้ — เฉพาะ my-api (ไม่แตะ backend/ ที่มีตาราง users ของตัวเองแยกต่างหาก) ──
--   10) app_users -> users (เปลี่ยนชื่อตาราง) : rename ใน migrations.js ด้วย `ALTER TABLE IF EXISTS app_users RENAME TO users`
--       ก่อน CREATE IF NOT EXISTS เพื่อไม่ให้ข้อมูล/ผู้ใช้เดิมหาย · แก้ทุกจุดที่ query ตารางนี้ (auth.js, authz.js, admin.js,
--       productionPlan.js, backup.js, seed_admin.sql)
--   11) ตัดตาราง pre_wo_requests ทิ้ง (ฟีเจอร์ "คำขอเปิด WO ล่วงหน้า" — create/approve/convert) ผู้ใช้ยืนยันแล้วว่ารู้ว่า
--       เป็นฟีเจอร์ที่ใช้งานอยู่จริง (มี endpoint ใน routes/wo.js + e2e test) — ลบไปพร้อมกันทั้ง endpoint, entry ใน
--       backup.js TABLES list, และ mock ฝั่ง frontend (mocks/handlers.ts) · migrations.js มี `DROP TABLE IF EXISTS pre_wo_requests`
--   12) pp_projects : เพิ่ม `delivery_date` + `delivery_remark` (ตามที่คุยในที่ประชุม PP — วันส่งมอบลูกค้า แยกจาก
--       expected/revised ที่เป็นวันเสร็จผลิตภายใน · remark ไว้ใส่รายละเอียดตอนวันยังไม่ finalize → โผล่ดอกจัน+hover ในตาราง)
--   13) bom_lines : เพิ่ม line_no/level/component_type/customer_pn/mfg_pn/brand/avl_os_flag/ref_designators/
--       price_thb/price_usd/total_thb — เพื่อนอีกคนที่ดูแล DB ส่ง schema นี้มา (ให้ตรงกับ BOM จริงฝั่งวิศวกรรม
--       ดูตัวอย่างที่ SYN BOM_From_Rev00.xlsx) sync เข้า my-api ตามนี้ (additive ล้วน ไม่กระทบข้อมูลเดิม)
--   14) inventory_lots : เพิ่ม `uid` (VARCHAR UNIQUE) — เอกสารนี้ประกาศไว้อยู่แล้วแต่ migrations.js ยังไม่มี
--       เพิ่มให้ตรงกับ schema ที่เพื่อนส่งมา (2026-08-03) ยังไม่รู้ format/ที่มาแน่ชัด — สคีมาให้ตรงกันไว้ก่อน
--       ส่วน logic การ generate/ใช้งานจริงรอคุยกับเพื่อนอีกที
--
-- ── go-live: ไฟล์นี้ไฟล์เดียวจบ ────────────────────────────────────────────
--   psql -U <user> -d productiondb -f database_schema.sql
--   (หรือ)  docker exec -i mes-postgres psql -U syntechdb -d productiondb < database_schema.sql
--
--   ไฟล์นี้ทำครบ 3 อย่างในตัวเอง: (1) สร้างตาราง+constraint  (2) สร้าง index  (3) สร้าง admin คนแรก
--   จากนั้นตั้ง env `SEED_DEMO=false` แล้วสตาร์ท my-api ได้เลย
--   ⚠️ รหัส admin เริ่มต้น = "admin" → เปลี่ยนทันทีหลังล็อกอินครั้งแรก (ดูท้ายไฟล์)
-- ============================================================================

-- ── Users / Auth ───────────────────────────────────────────────────────────
-- ⚠️ ตารางนี้เดิมชื่อ app_users — เปลี่ยนชื่อเป็น users (2026-07-31, my-api เท่านั้น ดูหมายเหตุ #10 ด้านบน)
CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    username      VARCHAR(100) NOT NULL UNIQUE,
    full_name     VARCHAR(200) NOT NULL,
    role          VARCHAR(20)  NOT NULL DEFAULT 'VIEWER',
    is_active     BOOLEAN      NOT NULL DEFAULT true,
    password_hash VARCHAR(255) NOT NULL,
    permissions   JSONB        NOT NULL DEFAULT '[]'::jsonb,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT users_password_not_empty CHECK (password_hash <> ''),
    CONSTRAINT users_role_check CHECK (role IN ('ADMIN','MEMBER','VIEWER'))
);
CREATE INDEX idx_users_permissions ON users USING gin (permissions);

CREATE TABLE audit_logs (
    id          SERIAL PRIMARY KEY,
    actor       VARCHAR(100) NOT NULL,
    actor_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,   -- (เพื่อน) normalize actor
    action      VARCHAR(100) NOT NULL,
    target_type VARCHAR(50),
    target_id   VARCHAR(100),
    detail      TEXT,
    note        TEXT,                                                  -- (เรา) หมายเหตุการแก้ไข PP / edit history
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,     -- NULLABLE: NULL = แจ้งเตือนแบบ global
    type       VARCHAR(50)  NOT NULL,
    title      VARCHAR(200) NOT NULL,
    message    TEXT         NOT NULL,
    link       VARCHAR(200),
    is_read    BOOLEAN      NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ── BOM ──────────────────────────────────────────────────────────────────────
-- ⚠️ ไม่มีตาราง `boms` (หัว BOM) — BOM ตัวจริงมาจากระบบภายนอก (MRP)
--    เก็บแต่ `bom_lines` (รายการชิ้นส่วน) โดย bom_id = เลขอ้างอิง BOM ของระบบภายนอก
--    เป็น plain INTEGER ไม่มี FK (ระบบนี้ยืนยันความมีอยู่ของ BOM ไม่ได้)
CREATE TABLE bom_lines (
    id              SERIAL PRIMARY KEY,
    bom_id          INTEGER       NOT NULL,
    part_no         VARCHAR(100)  NOT NULL,
    part_name       VARCHAR(200)  NOT NULL,
    qty_per         NUMERIC(10,4) NOT NULL DEFAULT 1,
    unit            VARCHAR(50)   NOT NULL DEFAULT 'pcs',
    sort_order      INTEGER       NOT NULL DEFAULT 0,
    -- (2026-08-03) เพิ่มตามที่เพื่อนทำ DB ส่งมา — ให้ตรงกับ BOM จริงฝั่งวิศวกรรม (ดู SYN BOM_From_Rev00)
    line_no         INTEGER,
    level           SMALLINT      NOT NULL DEFAULT 1,
    component_type  VARCHAR(100),
    customer_pn     VARCHAR(100),
    mfg_pn          VARCHAR(200),
    brand           VARCHAR(100),
    avl_os_flag     VARCHAR(20)   NOT NULL DEFAULT 'TBD',
    ref_designators VARCHAR(200),                                     -- ตำแหน่งบน PCB จริง เช่น C1,C8
    price_thb       NUMERIC(12,4),
    price_usd       NUMERIC(12,4),
    total_thb       NUMERIC(12,4)
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

-- ⚠️ ไม่มีตาราง `pre_wo_requests` — ฟีเจอร์ "คำขอเปิด WO ล่วงหน้า" (create/approve/convert) ถูกถอดออกจากระบบแล้ว
--    (2026-07-31 ตามคำสั่งผู้ใช้ — ดูหมายเหตุ #11 ด้านบน) ถอดทั้ง endpoint ใน routes/wo.js, entry ใน backup.js,
--    และ mock ฝั่ง frontend (mocks/handlers.ts) ไปพร้อมกัน

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

-- ⚠️ ไม่มีตาราง `jig_retest_requests` — ฟีเจอร์สั่งทดสอบซ้ำถูกถอดออกจากระบบแล้ว
--    (ถอดทั้งตาราง · endpoint GET/POST retest · ปุ่ม "Request Retest" ในหน้า Jig Project)

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
    delivery_date   DATE,                                              -- (เรา) วันส่งมอบลูกค้า — ต่างจาก expected/revised ที่เป็นวันเสร็จผลิตภายใน
    delivery_remark TEXT         NOT NULL DEFAULT '',                   -- (เรา) หมายเหตุ delivery ที่ยังไม่ finalize — โผล่เป็นดอกจัน+hover ในตาราง
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
    product_image   TEXT,                                              -- (เรา) รูปสินค้า (data URL) — แนบจาก popup · แยก endpoint /image ไม่รวมใน list
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
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
    -- NOTE: status = ข้อความอิสระ (เช่น "SMT เสร็จ เหลือ Packing") ไม่ใช่ enum — app/seed ใช้ free text
    --       จึง "ไม่ใส่" CHECK (dump เพื่อนใส่ enum 4 ค่า = จะ reject ข้อมูลจริงตอน insert)
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
-- ALTER TABLE change_requests         ADD CONSTRAINT fk_cr_wo           FOREIGN KEY (wo_ref) REFERENCES work_orders(wo_no) ON DELETE RESTRICT;
-- ============================================================================


-- ============================================================================
-- INDEXES
-- ----------------------------------------------------------------------------
-- เดิมไม่มี index เลย → production_scans (ตารางที่โตเร็วสุด) ถูก seq scan ทุก 8 วินาที
-- จากหน้า Station monitor พอแตะหลักแสน-ล้านแถวจะกิน connection ทั้ง pool แล้วลากทุก endpoint ช้าตาม
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_prod_scans_station_serial_time ON production_scans (station, serial, scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_prod_scans_serial   ON production_scans (serial);
CREATE INDEX IF NOT EXISTS idx_prod_scans_wo       ON production_scans (wo_id);
CREATE INDEX IF NOT EXISTS idx_prod_scans_time     ON production_scans (scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_prod_units_wo       ON production_units (wo_id);
CREATE INDEX IF NOT EXISTS idx_audit_target        ON audit_logs (target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_time          ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qc_results_wo       ON qc_results (wo_id);
CREATE INDEX IF NOT EXISTS idx_qc_records_sn       ON qc_records (sn);
CREATE INDEX IF NOT EXISTS idx_oba_wo              ON oba_records (wo_id);
CREATE INDEX IF NOT EXISTS idx_kitting_wo          ON kitting_issues (wo_id);
CREATE INDEX IF NOT EXISTS idx_routing_serial      ON routing_records (serial);
CREATE INDEX IF NOT EXISTS idx_jig_records_proj    ON jig_test_records (project_code, tested_at DESC);
CREATE INDEX IF NOT EXISTS idx_jig_records_serial  ON jig_test_records (serial);
CREATE INDEX IF NOT EXISTS idx_wo_created          ON work_orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pp_date_record      ON pp_projects (date_record DESC);
CREATE INDEX IF NOT EXISTS idx_inv_lots_part       ON inventory_lots (part_no, received_at);
CREATE INDEX IF NOT EXISTS idx_notif_unread        ON notifications (is_read, created_at DESC);


-- ============================================================================
-- BOOTSTRAP ADMIN  (ผู้ใช้คนแรกของระบบ)
-- ----------------------------------------------------------------------------
-- จำเป็นเพราะ: prod ต้องตั้ง SEED_DEMO=false (ไม่งั้น migrations จะสร้าง admin/member1/viewer1
-- รหัส = ชื่อผู้ใช้) → ถ้าไม่มีบล็อกนี้จะไม่มีใครล็อกอินเข้าระบบได้เลย
--
-- ⚠️  ไฟล์นี้ไม่สร้างบัญชี admin ให้แล้ว — และตั้งใจให้เป็นแบบนั้น
--
--     ของเดิมฝัง bcrypt('admin') ไว้ตรงนี้ = รหัสผ่านของระบบอยู่ในไฟล์ที่ commit ลง git
--     ใครอ่านรีโปได้ก็ล็อกอินได้ และในทางปฏิบัติไม่มีใครกลับมาเปลี่ยนหลัง deploy
--
--     สร้าง admin คนแรกด้วยสคริปต์แทน (รหัสมาจาก env ไม่ใช่จากไฟล์):
--
--       ADMIN_PASSWORD='<รหัสที่ตั้งเอง>' node my-api/seed_admin.js
--       ADMIN_PASSWORD="$(openssl rand -base64 18)" node my-api/seed_admin.js
--
--     ไม่ตั้ง ADMIN_PASSWORD → สคริปต์สุ่มให้แล้วพิมพ์ออกมาครั้งเดียว (จดทันที)
--     สคริปต์ idempotent: มี 'admin' อยู่แล้วจะไม่ทำอะไร
-- ============================================================================

-- ตรวจผลหลังรัน seed_admin.js: ควรเห็น admin 1 แถว
-- SELECT id, username, role, is_active FROM users WHERE username = 'admin';
