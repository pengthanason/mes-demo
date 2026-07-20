-- =====================================================================
--  MES Web — Database Schema (PostgreSQL)
--  โครงสร้างฐานข้อมูลทั้งหมดที่ frontend (Vite admin UI) ใช้งานผ่าน my-api
--  ที่มา: รวบรวมจาก my-api/migrations.js (CREATE TABLE + ALTER ADD COLUMN
--         ถูกยุบรวมให้เป็น CREATE TABLE ฉบับสมบูรณ์ต่อ 1 ตาราง)
--  จุดประสงค์: ให้ทีม Backend ดูภาพรวมว่าเว็บมีตาราง/ฟิลด์อะไรบ้าง (schema-only, ไม่รวมข้อมูล seed)
--  หมายเหตุ: migration จริงเป็นแบบ additive (IF NOT EXISTS) — ไฟล์นี้เป็น "ผลลัพธ์สุดท้าย" ของ schema
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
--  BOM (Bill of Materials)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE boms (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  version     VARCHAR(50)  NOT NULL DEFAULT '1.0',
  approved    BOOLEAN      NOT NULL DEFAULT false,
  approved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (name, version)
);

CREATE TABLE bom_lines (
  id         SERIAL PRIMARY KEY,
  bom_id     INTEGER      NOT NULL REFERENCES boms(id) ON DELETE CASCADE,
  part_no    VARCHAR(100) NOT NULL,
  part_name  VARCHAR(200) NOT NULL,
  qty_per    NUMERIC(10,4) NOT NULL DEFAULT 1,
  unit       VARCHAR(50)  NOT NULL DEFAULT 'pcs',
  sort_order INTEGER      NOT NULL DEFAULT 0
);

-- ─────────────────────────────────────────────────────────────────────
--  Work Orders (WO) + Pre-WO Requests
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE work_orders (
  id            SERIAL PRIMARY KEY,
  wo_no         VARCHAR(50)  NOT NULL UNIQUE,
  product_name  VARCHAR(200) NOT NULL,
  qty           INTEGER      NOT NULL CHECK (qty > 0),
  status        VARCHAR(30)  NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING','IN_PROGRESS','DONE','CANCELLED')),
  due_date      DATE,
  -- WO lifecycle (Dashboard / FAI / Close)
  customer      VARCHAR(100),
  station       VARCHAR(100),
  current_step  VARCHAR(30)  NOT NULL DEFAULT 'DRAFT',
  qty_good      INTEGER      NOT NULL DEFAULT 0,
  actual_qty    INTEGER,
  fai_inspector VARCHAR(100),
  fai_approver  VARCHAR(100),
  fai_passed    BOOLEAN      NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE pre_wo_requests (
  id         SERIAL PRIMARY KEY,
  bom_id     INTEGER     NOT NULL REFERENCES boms(id),
  qty        INTEGER     NOT NULL CHECK (qty > 0),
  due_date   DATE        NOT NULL,
  status     VARCHAR(30) NOT NULL DEFAULT 'PENDING'
               CHECK (status IN ('PENDING','APPROVED','CONVERTED','REJECTED')),
  wo_id      INTEGER REFERENCES work_orders(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────
--  Records: OBA / QC / Routing (legacy per-serial log)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE oba_records (
  id          SERIAL PRIMARY KEY,
  wo_id       VARCHAR(50)  NOT NULL,
  lot_no      VARCHAR(100) NOT NULL,
  sample_qty  INTEGER      NOT NULL CHECK (sample_qty > 0),
  result      VARCHAR(10)  NOT NULL CHECK (result IN ('PASS','FAIL')),
  defect_note TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE qc_records (
  id         SERIAL PRIMARY KEY,
  sn         VARCHAR(100) NOT NULL,
  status     VARCHAR(10)  NOT NULL CHECK (status IN ('PASS','FAIL')),
  error      TEXT,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE routing_records (
  id         SERIAL PRIMARY KEY,
  serial     VARCHAR(100) NOT NULL,
  sequence   TEXT         NOT NULL,
  result     VARCHAR(10)  NOT NULL,
  total_sec  INTEGER      NOT NULL DEFAULT 0,
  wo_id      VARCHAR(100) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────
--  4M Change Request (FE-9)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE change_requests (
  id          SERIAL PRIMARY KEY,
  cr_no       VARCHAR(50)  NOT NULL UNIQUE,
  m_type      VARCHAR(20)  NOT NULL CHECK (m_type IN ('Man','Machine','Material','Method')),
  wo_ref      VARCHAR(100) NOT NULL DEFAULT '',
  description TEXT         NOT NULL,
  impact      TEXT         NOT NULL DEFAULT '',
  state       VARCHAR(20)  NOT NULL DEFAULT 'DRAFT'
                CHECK (state IN ('DRAFT','G1_REVIEW','G2_APPROVED','ACTIVE')),
  g1_note     TEXT,
  g1_at       TIMESTAMPTZ,
  g2_note     TEXT,
  g2_at       TIMESTAMPTZ,
  g3_note     TEXT,
  g3_at       TIMESTAMPTZ,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────
--  Notifications (FE-11)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE notifications (
  id         SERIAL PRIMARY KEY,
  type       VARCHAR(50)  NOT NULL,
  title      VARCHAR(200) NOT NULL,
  message    TEXT         NOT NULL,
  link       VARCHAR(200),
  is_read    BOOLEAN      NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────
--  SCM Cases + Dispositions + Lot Splits (FE-12)
-- ─────────────────────────────────────────────────────────────────────
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
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE scm_dispositions (
  id         SERIAL PRIMARY KEY,
  case_id    VARCHAR(50)   NOT NULL REFERENCES scm_cases(case_id) ON DELETE CASCADE,
  action     VARCHAR(50)   NOT NULL,
  rma_no     VARCHAR(100)  NOT NULL DEFAULT '',
  return_qty NUMERIC(10,3) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE scm_lot_splits (
  id           SERIAL PRIMARY KEY,
  original_uid VARCHAR(100)  NOT NULL,
  ok_uid       VARCHAR(100)  NOT NULL,
  ng_uid       VARCHAR(100)  NOT NULL,
  original_qty NUMERIC(10,3) NOT NULL,
  ok_qty       NUMERIC(10,3) NOT NULL,
  ng_qty       NUMERIC(10,3) NOT NULL,
  reason       TEXT          NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────
--  Auth / Admin: App Users + Audit Logs (FE-13)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE app_users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(100) NOT NULL UNIQUE,
  full_name     VARCHAR(200) NOT NULL,
  role          VARCHAR(20)  NOT NULL DEFAULT 'VIEWER'
                  CHECK (role IN ('ADMIN','MEMBER','VIEWER')),
  is_active     BOOLEAN      NOT NULL DEFAULT true,
  password_hash VARCHAR(100) NOT NULL DEFAULT '',            -- bcrypt (รหัสเริ่มต้น = username)
  permissions   JSONB        NOT NULL DEFAULT '[]'::jsonb,   -- สิทธิ์รายหน้า (ว่าง [] = ตาม role)
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_logs (
  id          SERIAL PRIMARY KEY,
  actor       VARCHAR(100) NOT NULL,
  action      VARCHAR(100) NOT NULL,
  target_type VARCHAR(50),
  target_id   VARCHAR(100),
  detail      TEXT,
  note        TEXT,                                    -- หมายเหตุ/เหตุผลการแก้ไข (กรอกตอน Save ในหน้าแก้ไข pp)
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────
--  Jig Test: Projects + Records + Retest Requests (FE-15)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE jig_projects (
  id           SERIAL PRIMARY KEY,
  project_code VARCHAR(50)  NOT NULL UNIQUE,
  name         VARCHAR(200) NOT NULL,
  jig_id       VARCHAR(50)  NOT NULL DEFAULT '',
  test_type    VARCHAR(10)  NOT NULL DEFAULT 'ICT',   -- ICT / FCT
  is_active    BOOLEAN      NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE jig_test_records (
  id           SERIAL PRIMARY KEY,
  project_code VARCHAR(50)  NOT NULL REFERENCES jig_projects(project_code),
  serial       VARCHAR(100) NOT NULL,
  result       VARCHAR(10)  NOT NULL CHECK (result IN ('PASS','FAIL')),
  tested_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  voltage      NUMERIC(7,3),
  current_ma   NUMERIC(8,3),
  temp_c       NUMERIC(5,2),
  fail_param   VARCHAR(100),
  notes        TEXT
);

CREATE TABLE jig_retest_requests (
  id           SERIAL PRIMARY KEY,
  project_code VARCHAR(50)  NOT NULL,
  serial       VARCHAR(100) NOT NULL,
  status       VARCHAR(20)  NOT NULL DEFAULT 'REQUESTED'
                 CHECK (status IN ('REQUESTED','DONE','CANCELLED')),
  requested_by VARCHAR(100) NOT NULL DEFAULT '',
  requested_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────
--  QC Results + Rework Tickets + Transfer Verifications (FE-10)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE qc_results (
  id          SERIAL PRIMARY KEY,
  wo_id       VARCHAR(100) NOT NULL,
  lot_no      VARCHAR(100) NOT NULL,
  qty_checked INTEGER      NOT NULL CHECK (qty_checked > 0),
  qty_pass    INTEGER      NOT NULL DEFAULT 0,
  qty_fail    INTEGER      NOT NULL DEFAULT 0,
  overall     VARCHAR(10)  NOT NULL CHECK (overall IN ('PASS','FAIL','PARTIAL')),
  defect_desc TEXT,
  remark      TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE rework_tickets (
  id           SERIAL PRIMARY KEY,
  qc_result_id INTEGER      NOT NULL REFERENCES qc_results(id),
  wo_id        VARCHAR(100) NOT NULL,
  defect_type  VARCHAR(200) NOT NULL,
  assigned_to  VARCHAR(100) NOT NULL DEFAULT '',
  due_date     DATE,
  status       VARCHAR(20)  NOT NULL DEFAULT 'OPEN'
                 CHECK (status IN ('OPEN','IN_PROGRESS','DONE')),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE transfer_verifications (
  id           SERIAL PRIMARY KEY,
  qc_result_id INTEGER      NOT NULL REFERENCES qc_results(id),
  wo_id        VARCHAR(100) NOT NULL,
  verdict      VARCHAR(10)  NOT NULL CHECK (verdict IN ('APPROVED','REJECTED')),
  note         TEXT,
  verified_by  VARCHAR(100) NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────
--  Production Report
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE production_reports (
  id           SERIAL PRIMARY KEY,
  code         VARCHAR(100) NOT NULL DEFAULT '',
  customer     VARCHAR(100) NOT NULL DEFAULT '',
  status       TEXT         NOT NULL DEFAULT '',
  stage        VARCHAR(50)  NOT NULL DEFAULT 'Planning',
  qty          INTEGER      NOT NULL DEFAULT 0,
  delivery     DATE,
  is_completed BOOLEAN      NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────
--  Incoming / Kitting (รับวัตถุดิบเข้า + เบิกออกไปผลิต)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE inventory_lots (
  id            SERIAL PRIMARY KEY,
  part_no       VARCHAR(100) NOT NULL,
  part_name     VARCHAR(200) NOT NULL DEFAULT '',
  lot_no        VARCHAR(100) NOT NULL,
  qty_received  INTEGER      NOT NULL CHECK (qty_received > 0),
  qty_available INTEGER      NOT NULL DEFAULT 0,
  status        VARCHAR(20)  NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  note          TEXT,
  received_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  reviewed_at   TIMESTAMPTZ
);

CREATE TABLE kitting_issues (
  id        SERIAL PRIMARY KEY,
  wo_id     VARCHAR(100) NOT NULL,
  part_no   VARCHAR(100) NOT NULL,
  qty       INTEGER      NOT NULL CHECK (qty > 0),
  lot_no    VARCHAR(100) NOT NULL DEFAULT '',
  issued_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────
--  Production Scan (operator สแกนชิ้นงานทีละชิ้นที่แต่ละสถานี)
--  NOTE: หน้า Routing/Scan History (FE-CONNECT-3 / #50) จะอ่าน timeline การสแกนของแต่ละ unit
--        ผ่าน endpoint GET /api/routing/history/:unitSn (ฝั่ง BE อยู่ใน mes_draft#5 — รอ merge)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE production_units (
  id           SERIAL PRIMARY KEY,
  wo_id        VARCHAR(100) NOT NULL,
  serial       VARCHAR(100) NOT NULL,
  last_station VARCHAR(100) NOT NULL DEFAULT '',
  last_result  VARCHAR(10)  NOT NULL DEFAULT 'PASS' CHECK (last_result IN ('PASS','FAIL')),
  scan_count   INTEGER      NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (wo_id, serial)
);

CREATE TABLE production_scans (
  id         SERIAL PRIMARY KEY,
  wo_id      VARCHAR(100) NOT NULL,
  serial     VARCHAR(100) NOT NULL,
  station    VARCHAR(100) NOT NULL,
  result     VARCHAR(10)  NOT NULL CHECK (result IN ('PASS','FAIL')),
  operator   VARCHAR(100) NOT NULL DEFAULT '',
  note       TEXT,
  scanned_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────
--  Production Plan (โมดูล Add Project — ตาม Excel FM03) — ตารางหลักของหน้า Dashboard PP
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE pp_projects (
  id              SERIAL PRIMARY KEY,
  pp_type         VARCHAR(20)  NOT NULL DEFAULT 'internal',  -- internal (งานภายใน) / external (งานภายนอก) — แยกแท็บใน Dashboard
  status          VARCHAR(30)  NOT NULL DEFAULT 'ON_PROCESS',
  status_color    VARCHAR(30)  NOT NULL DEFAULT '',        -- สีของช่อง Status (เปลี่ยนเองในตารางได้ ไม่กระทบชื่อสถานะ)
  wk              INTEGER,
  date_record     DATE,
  product_pn      VARCHAR(100) NOT NULL DEFAULT '',
  model           VARCHAR(150) NOT NULL DEFAULT '',
  customer        VARCHAR(100) NOT NULL DEFAULT '',
  qty             INTEGER      NOT NULL DEFAULT 0,
  produce         INTEGER      NOT NULL DEFAULT 0,         -- ผลิตไปแล้ว (Balance = qty - produce)
  syn_requestor   VARCHAR(100) NOT NULL DEFAULT '',        -- Owner
  work_order      VARCHAR(100) NOT NULL DEFAULT '',
  wo_name         VARCHAR(150) NOT NULL DEFAULT '',        -- (เลิกใช้ — คงไว้กัน data เก่า)
  matl_coming     VARCHAR(200) NOT NULL DEFAULT '',
  -- 4M1E checks (เลิกใช้ในฟอร์ม แต่คงคอลัมน์ไว้)
  chk_man         BOOLEAN NOT NULL DEFAULT false,
  chk_mac         BOOLEAN NOT NULL DEFAULT false,
  chk_med         BOOLEAN NOT NULL DEFAULT false,
  chk_mat         BOOLEAN NOT NULL DEFAULT false,
  chk_env         BOOLEAN NOT NULL DEFAULT false,
  -- Type
  pd_pcba         BOOLEAN NOT NULL DEFAULT false,
  pd_bbas         BOOLEAN NOT NULL DEFAULT false,
  pd_test         BOOLEAN NOT NULL DEFAULT false,
  pd_modified     BOOLEAN NOT NULL DEFAULT false,
  pd_rma          BOOLEAN NOT NULL DEFAULT false,
  pd_prep         BOOLEAN NOT NULL DEFAULT false,
  -- PD PLAN
  pd_start_date   DATE,
  pd_finish_date  DATE,
  target_per_day  INTEGER      NOT NULL DEFAULT 0,         -- CAP / DAY
  expected_date   DATE,
  revised_date    DATE,                                    -- Revised date (แสดงก่อน Remark)
  bom_rec_date    DATE,                                    -- Bom Rec — วันที่รับ BOM (กลุ่ม WO)
  -- QA
  qa_test_rate    VARCHAR(50)  NOT NULL DEFAULT '',        -- Sampling%
  qa_finish_date  DATE,
  qa_status       VARCHAR(30)  NOT NULL DEFAULT '',        -- สถานะฝั่ง QA (แยกจาก status งาน)
  -- Store
  store_received  DATE,
  -- PIC
  pd_pic          VARCHAR(150) NOT NULL DEFAULT '',        -- PIC Name
  pic_responsible VARCHAR(150) NOT NULL DEFAULT '',        -- (เลิกโชว์ในตาราง/ฟอร์ม แต่คงคอลัมน์)
  team_member     INTEGER      NOT NULL DEFAULT 0,
  ok_per_day      INTEGER      NOT NULL DEFAULT 0,         -- (เลิกใช้)
  total_ng        INTEGER      NOT NULL DEFAULT 0,
  total_ok        INTEGER      NOT NULL DEFAULT 0,         -- Total FG
  special_request TEXT         NOT NULL DEFAULT '',
  remark          TEXT         NOT NULL DEFAULT '',
  done            BOOLEAN      NOT NULL DEFAULT false,     -- (เลิกใช้)
  -- STATUS pipeline (9 ขั้น) — โชว์ในฟอร์ม/Excel ไม่โชว์ตาราง Dashboard
  st_pr_po        BOOLEAN NOT NULL DEFAULT false,
  st_wait_mat     BOOLEAN NOT NULL DEFAULT false,
  st_incoming     BOOLEAN NOT NULL DEFAULT false,
  st_create_bo    BOOLEAN NOT NULL DEFAULT false,
  st_test         BOOLEAN NOT NULL DEFAULT false,
  st_rework       BOOLEAN NOT NULL DEFAULT false,
  st_smt          BOOLEAN NOT NULL DEFAULT false,
  st_thr          BOOLEAN NOT NULL DEFAULT false,
  st_bbas         BOOLEAN NOT NULL DEFAULT false,
  -- Process 8 step — สถานะต่อ step ('' | WAIT | ON_PROCESS | DONE | DELAY) โชว์เป็นช่องสีในตาราง
  pc_prpo         VARCHAR(30) NOT NULL DEFAULT '',
  pc_wait         VARCHAR(30) NOT NULL DEFAULT '',
  pc_incoming     VARCHAR(30) NOT NULL DEFAULT '',
  pc_smt          VARCHAR(30) NOT NULL DEFAULT '',
  pc_thr          VARCHAR(30) NOT NULL DEFAULT '',
  pc_test         VARCHAR(30) NOT NULL DEFAULT '',
  pc_bbas         VARCHAR(30) NOT NULL DEFAULT '',
  pc_packing      VARCHAR(30) NOT NULL DEFAULT '',
  -- ประวัติการเปลี่ยน process/สถานะ (event log) — [{ date, step, status, note? }] ใช้วาด Gantt หลายสี
  process_log     JSONB        NOT NULL DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────
--  Workflow (ลำดับกระบวนการผลิต) + Work Centers + Results
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE workflows (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(150) NOT NULL DEFAULT '',
  customer   VARCHAR(100) NOT NULL DEFAULT '',
  model      VARCHAR(150) NOT NULL DEFAULT '',
  steps      JSONB        NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE work_centers (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(150) NOT NULL,
  stations   INTEGER      NOT NULL DEFAULT 1,     -- จำนวนเครื่อง/หัวที่ทำขนานกัน
  efficiency INTEGER      NOT NULL DEFAULT 100,   -- % ความเร็วจริงเทียบมาตรฐาน
  note       TEXT         NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE workflow_results (
  id         SERIAL PRIMARY KEY,
  serial     VARCHAR(150) NOT NULL,
  customer   VARCHAR(100) NOT NULL DEFAULT '',
  model      VARCHAR(150) NOT NULL DEFAULT '',
  sequence   TEXT         NOT NULL DEFAULT '',
  result     VARCHAR(10)  NOT NULL DEFAULT 'PASS',
  total_sec  INTEGER      NOT NULL DEFAULT 0,
  line       VARCHAR(10)  NOT NULL DEFAULT 'internal',   -- internal / external
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
