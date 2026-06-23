const db = require('./db');

async function migrate() {
  const client = await db.connect();
  // ตั้ง SEED_DEMO=false เพื่อไม่ใส่ข้อมูลตัวอย่าง (สำหรับ go-live / กระดานเปล่า)
  const SEED_DEMO = process.env.SEED_DEMO !== 'false';
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS boms (
        id          SERIAL PRIMARY KEY,
        name        VARCHAR(200) NOT NULL,
        version     VARCHAR(50)  NOT NULL DEFAULT '1.0',
        approved    BOOLEAN      NOT NULL DEFAULT false,
        approved_at TIMESTAMPTZ,
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        UNIQUE(name, version)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS bom_lines (
        id        SERIAL PRIMARY KEY,
        bom_id    INTEGER     NOT NULL REFERENCES boms(id) ON DELETE CASCADE,
        part_no   VARCHAR(100) NOT NULL,
        part_name VARCHAR(200) NOT NULL,
        qty_per   NUMERIC(10,4) NOT NULL DEFAULT 1,
        unit      VARCHAR(50)  NOT NULL DEFAULT 'pcs',
        sort_order INTEGER NOT NULL DEFAULT 0
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS work_orders (
        id           SERIAL PRIMARY KEY,
        wo_no        VARCHAR(50)  NOT NULL UNIQUE,
        product_name VARCHAR(200) NOT NULL,
        qty          INTEGER      NOT NULL CHECK (qty > 0),
        status       VARCHAR(30)  NOT NULL DEFAULT 'PENDING'
                       CHECK (status IN ('PENDING','IN_PROGRESS','DONE','CANCELLED')),
        due_date     DATE,
        created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS pre_wo_requests (
        id         SERIAL PRIMARY KEY,
        bom_id     INTEGER     NOT NULL REFERENCES boms(id),
        qty        INTEGER     NOT NULL CHECK (qty > 0),
        due_date   DATE        NOT NULL,
        status     VARCHAR(30) NOT NULL DEFAULT 'PENDING'
                     CHECK (status IN ('PENDING','APPROVED','CONVERTED','REJECTED')),
        wo_id      INTEGER REFERENCES work_orders(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ── WO lifecycle columns (Dashboard / FAI / Close) ──
    await client.query(`
      ALTER TABLE work_orders
        ADD COLUMN IF NOT EXISTS customer      VARCHAR(100),
        ADD COLUMN IF NOT EXISTS station       VARCHAR(100),
        ADD COLUMN IF NOT EXISTS current_step  VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
        ADD COLUMN IF NOT EXISTS qty_good      INTEGER     NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS actual_qty    INTEGER,
        ADD COLUMN IF NOT EXISTS fai_inspector VARCHAR(100),
        ADD COLUMN IF NOT EXISTS fai_approver  VARCHAR(100),
        ADD COLUMN IF NOT EXISTS fai_passed    BOOLEAN     NOT NULL DEFAULT false
    `);

    // backfill แถวเก่าที่ยังไม่มีค่า lifecycle
    await client.query(`
      UPDATE work_orders SET
        customer     = COALESCE(customer, 'TOYOTA'),
        station      = COALESCE(station, 'SMT-LINE'),
        current_step = CASE
          WHEN current_step <> 'DRAFT' THEN current_step
          WHEN status = 'DONE'        THEN 'CLOSED'
          WHEN status = 'IN_PROGRESS' THEN 'RUNNING'
          ELSE 'OPEN'
        END
      WHERE customer IS NULL OR station IS NULL
    `);

    // ── Records: OBA / QC / Routing ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS oba_records (
        id          SERIAL PRIMARY KEY,
        wo_id       VARCHAR(50)  NOT NULL,
        lot_no      VARCHAR(100) NOT NULL,
        sample_qty  INTEGER      NOT NULL CHECK (sample_qty > 0),
        result      VARCHAR(10)  NOT NULL CHECK (result IN ('PASS','FAIL')),
        defect_note TEXT,
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS qc_records (
        id         SERIAL PRIMARY KEY,
        sn         VARCHAR(100) NOT NULL,
        status     VARCHAR(10)  NOT NULL CHECK (status IN ('PASS','FAIL')),
        error      TEXT,
        created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS routing_records (
        id         SERIAL PRIMARY KEY,
        serial     VARCHAR(100) NOT NULL,
        sequence   TEXT         NOT NULL,
        result     VARCHAR(10)  NOT NULL,
        total_sec  INTEGER      NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`ALTER TABLE routing_records ADD COLUMN IF NOT EXISTS wo_id VARCHAR(100) NOT NULL DEFAULT ''`);

    // ── 4M Change Request (FE-9) ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS change_requests (
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
      )
    `);

    // ── FE-11: Notifications ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id         SERIAL PRIMARY KEY,
        type       VARCHAR(50)  NOT NULL,
        title      VARCHAR(200) NOT NULL,
        message    TEXT         NOT NULL,
        link       VARCHAR(200),
        is_read    BOOLEAN      NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    const notifCount = await client.query('SELECT COUNT(*) FROM notifications');
    if (SEED_DEMO && Number(notifCount.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO notifications (type, title, message, link, is_read) VALUES
          ('WO_OPEN',     'WO ใหม่เปิดแล้ว',       'WO-202606-002 (ASY-300 × 1500) เริ่มผลิตแล้ว',               '/wo-dashboard', false),
          ('QC_FAIL',     'QC พบของเสีย',            'LOT-002 / WO-202606-001 — Fail 5 pcs บัดกรีเสีย',           '/qc-result',    false),
          ('CR_APPROVED', '4M Change G1 อนุมัติ',    'CR-202606-001 ผ่าน G1 Engineering Review',                  '/4m-change',    false),
          ('WO_CLOSED',   'WO ปิดสำเร็จ',            'WO-202606-003 (MOT-4500 × 3000) ปิดเรียบร้อย',              '/wo-dashboard', true),
          ('REWORK',      'Rework Ticket เปิดใหม่',  'Rework #1 เปิดสำหรับ LOT-002 ช่าง: TBD',                   '/qc-result',    true)
      `);
    }

    // ── FE-12: SCM Cases ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS scm_cases (
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
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS scm_dispositions (
        id         SERIAL PRIMARY KEY,
        case_id    VARCHAR(50)   NOT NULL REFERENCES scm_cases(case_id) ON DELETE CASCADE,
        action     VARCHAR(50)   NOT NULL,
        rma_no     VARCHAR(100)  NOT NULL DEFAULT '',
        return_qty NUMERIC(10,3) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS scm_lot_splits (
        id           SERIAL PRIMARY KEY,
        original_uid VARCHAR(100)  NOT NULL,
        ok_uid       VARCHAR(100)  NOT NULL,
        ng_uid       VARCHAR(100)  NOT NULL,
        original_qty NUMERIC(10,3) NOT NULL,
        ok_qty       NUMERIC(10,3) NOT NULL,
        ng_qty       NUMERIC(10,3) NOT NULL,
        reason       TEXT          NOT NULL DEFAULT '',
        created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      )
    `);
    const scmCount = await client.query('SELECT COUNT(*) FROM scm_cases');
    if (SEED_DEMO && Number(scmCount.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO scm_cases (case_id, case_type, status, ref_po, ref_inv, part_no, due_date, resolution_note, resolved_at) VALUES
          ('SCM-202606-001', 'QTY_SHORT', 'OPEN',   'PO-10234', 'INV-5501', 'R-100K', '2026-06-20', '', NULL),
          ('SCM-202606-002', 'DAMAGED',   'CLOSED',  'PO-10235', 'INV-5502', 'IC-555', '2026-06-15', 'Supplier ส่งของมาทดแทนครบ', NOW())
      `);
    }

    // ── FE-13: Admin Users + Audit Logs ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_users (
        id         SERIAL PRIMARY KEY,
        username   VARCHAR(100) NOT NULL UNIQUE,
        full_name  VARCHAR(200) NOT NULL,
        role       VARCHAR(20)  NOT NULL DEFAULT 'VIEWER'
                     CHECK (role IN ('ADMIN','MEMBER','VIEWER')),
        is_active  BOOLEAN      NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id          SERIAL PRIMARY KEY,
        actor       VARCHAR(100) NOT NULL,
        action      VARCHAR(100) NOT NULL,
        target_type VARCHAR(50),
        target_id   VARCHAR(100),
        detail      TEXT,
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    const userCount = await client.query('SELECT COUNT(*) FROM app_users');
    if (Number(userCount.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO app_users (username, full_name, role) VALUES
          ('admin',   'ผู้ดูแลระบบ',    'ADMIN'),
          ('member1', 'วิชัย สุขใจ',    'MEMBER'),
          ('viewer1', 'สมหมาย ดีใจ',    'VIEWER')
      `);
      await client.query(`
        INSERT INTO audit_logs (actor, action, target_type, target_id, detail) VALUES
          ('admin',   'LOGIN',       NULL,          NULL,           'เข้าสู่ระบบสำเร็จ'),
          ('admin',   'CREATE_WO',   'work_order',  'WO-202606-001', 'สร้าง WO PCB-A100 × 2000'),
          ('member1', 'SUBMIT_QC',   'qc_result',   '1',             'บันทึกผล QC FAIL LOT-002'),
          ('admin',   'APPROVE_G1',  'change_req',  'CR-202606-001', 'อนุมัติ G1 Engineering Review'),
          ('member1', 'OPEN_REWORK', 'rework',      '1',             'เปิด Rework Ticket LOT-002')
      `);
    }

    // ── Auth: คอลัมน์รหัสผ่าน + ตั้งรหัสเริ่มต้น (= username) ให้ผู้ใช้ที่ยังไม่มี ──
    await client.query(`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(100) NOT NULL DEFAULT ''`);
    {
      const bcrypt = require('bcryptjs');
      const needPw = await client.query("SELECT id, username FROM app_users WHERE password_hash = ''");
      for (const u of needPw.rows) {
        await client.query('UPDATE app_users SET password_hash=$1 WHERE id=$2', [bcrypt.hashSync(u.username, 10), u.id]);
      }
      if (needPw.rows.length) console.log(`[migrate] ตั้งรหัสเริ่มต้นให้ ${needPw.rows.length} ผู้ใช้ (รหัส = username)`);
    }

    // ── FE-15: Jig Test Projects + Records ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS jig_projects (
        id           SERIAL PRIMARY KEY,
        project_code VARCHAR(50)  NOT NULL UNIQUE,
        name         VARCHAR(200) NOT NULL,
        jig_id       VARCHAR(50)  NOT NULL DEFAULT '',
        is_active    BOOLEAN      NOT NULL DEFAULT true,
        created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS jig_test_records (
        id           SERIAL PRIMARY KEY,
        project_code VARCHAR(50)   NOT NULL REFERENCES jig_projects(project_code),
        serial       VARCHAR(100)  NOT NULL,
        result       VARCHAR(10)   NOT NULL CHECK (result IN ('PASS','FAIL')),
        tested_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        voltage      NUMERIC(7,3),
        current_ma   NUMERIC(8,3),
        temp_c       NUMERIC(5,2),
        fail_param   VARCHAR(100),
        notes        TEXT
      )
    `);
    const jigCount = await client.query('SELECT COUNT(*) FROM jig_projects');
    if (SEED_DEMO && Number(jigCount.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO jig_projects (project_code, name, jig_id) VALUES
          ('PCB-A100', 'PCB Assembly A100', 'JIG-001'),
          ('ASY-300',  'Motor Assembly 300', 'JIG-002'),
          ('MOT-4500', 'Motor Unit 4500',    'JIG-003')
      `);
      await client.query(`
        INSERT INTO jig_test_records (project_code, serial, result, tested_at, voltage, current_ma, temp_c, fail_param)
        SELECT
          proj.code,
          proj.prefix || LPAD(gs::text, 4, '0'),
          CASE WHEN gs % proj.fail_every = 0 THEN 'FAIL' ELSE 'PASS' END,
          NOW() - (((gs-1)/8) || ' days')::interval - ((gs % 8 * 3) || ' hours')::interval,
          proj.base_v + (gs % 5) * 0.02 - 0.04,
          proj.base_i + (gs % 4) * 0.05 - 0.10,
          38 + (gs % 8),
          CASE WHEN gs % proj.fail_every = 0 THEN 'VOLTAGE_LOW' ELSE NULL END
        FROM (VALUES
          ('PCB-A100', 'A100-', 16, 3.28::numeric, 1.22::numeric),
          ('ASY-300',  'A300-',  5, 5.05::numeric, 2.10::numeric),
          ('MOT-4500', 'M450-', 50, 12.5::numeric, 3.50::numeric)
        ) AS proj(code, prefix, fail_every, base_v, base_i)
        CROSS JOIN generate_series(1, 56) gs
      `);
      console.log('[migrate] seeded jig projects and test records');
    }

    // ── FE-10: QC Results, Rework Tickets, Transfer Verifications ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS qc_results (
        id           SERIAL PRIMARY KEY,
        wo_id        VARCHAR(100) NOT NULL,
        lot_no       VARCHAR(100) NOT NULL,
        qty_checked  INTEGER NOT NULL CHECK (qty_checked > 0),
        qty_pass     INTEGER NOT NULL DEFAULT 0,
        qty_fail     INTEGER NOT NULL DEFAULT 0,
        overall      VARCHAR(10)  NOT NULL CHECK (overall IN ('PASS','FAIL','PARTIAL')),
        defect_desc  TEXT,
        created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS rework_tickets (
        id            SERIAL PRIMARY KEY,
        qc_result_id  INTEGER NOT NULL REFERENCES qc_results(id),
        wo_id         VARCHAR(100) NOT NULL,
        defect_type   VARCHAR(200) NOT NULL,
        assigned_to   VARCHAR(100) NOT NULL DEFAULT '',
        due_date      DATE,
        status        VARCHAR(20)  NOT NULL DEFAULT 'OPEN'
                        CHECK (status IN ('OPEN','IN_PROGRESS','DONE')),
        created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS transfer_verifications (
        id            SERIAL PRIMARY KEY,
        qc_result_id  INTEGER NOT NULL REFERENCES qc_results(id),
        wo_id         VARCHAR(100) NOT NULL,
        verdict       VARCHAR(10)  NOT NULL CHECK (verdict IN ('APPROVED','REJECTED')),
        note          TEXT,
        verified_by   VARCHAR(100) NOT NULL DEFAULT '',
        created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    // ── Production Report ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS production_reports (
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
      )
    `);

    const reportCount = await client.query('SELECT COUNT(*) FROM production_reports');
    if (SEED_DEMO && Number(reportCount.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO production_reports (code, customer, status, stage, qty, delivery, is_completed) VALUES
          ('E13A_STD',    'THS', 'ทดสอบการทำงาน (เช็คสี LED)',        'Test',    270,  '2026-03-30', false),
          ('ZSZ003-081A', 'TAD', 'SMT เสร็จ เหลือ Depanel/Packing',   'Packing', 1200, '2026-04-06', false),
          ('01489E-081',  'TAD', 'ขึ้นงานผลิต',                        'SMT',     90,   '2026-04-06', false),
          ('5K45',        'THS', 'Depanel PCBA, ส่งมอบแล้ว',           'Depanel', 500,  '2026-03-27', true)
      `);
      console.log('[migrate] seeded production reports');
    }

    // ── Incoming / Kitting (รับวัตถุดิบเข้า + เบิกออกไปผลิต) ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS inventory_lots (
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
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS kitting_issues (
        id          SERIAL PRIMARY KEY,
        wo_id       VARCHAR(100) NOT NULL,
        part_no     VARCHAR(100) NOT NULL,
        qty         INTEGER      NOT NULL CHECK (qty > 0),
        lot_no      VARCHAR(100) NOT NULL DEFAULT '',
        issued_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    const lotCount = await client.query('SELECT COUNT(*) FROM inventory_lots');
    if (SEED_DEMO && Number(lotCount.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO inventory_lots (part_no, part_name, lot_no, qty_received, qty_available, status, reviewed_at) VALUES
          ('R-100K',  'Resistor 100K Ohm', 'LOT-R100K-A', 5000, 5000, 'APPROVED', NOW()),
          ('C-10UF',  'Capacitor 10uF',    'LOT-C10UF-A', 3000, 3000, 'APPROVED', NOW()),
          ('IC-555',  'Timer IC 555',      'LOT-IC555-A', 1000,  850, 'APPROVED', NOW()),
          ('MTR-DC',  'DC Motor 12V',      'LOT-MTR-0608',1500, 1500, 'PENDING',  NULL),
          ('STL-ROD', 'Steel Rod 10mm',    'LOT-STL-X1',  2000,    0, 'REJECTED', NOW())
      `);
      console.log('[migrate] seeded inventory lots');
    }

    // ── Jig Retest Requests (FE-15: สั่งทดสอบซ้ำชิ้นที่ FAIL) ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS jig_retest_requests (
        id           SERIAL PRIMARY KEY,
        project_code VARCHAR(50)  NOT NULL,
        serial       VARCHAR(100) NOT NULL,
        status       VARCHAR(20)  NOT NULL DEFAULT 'REQUESTED'
                       CHECK (status IN ('REQUESTED','DONE','CANCELLED')),
        requested_by VARCHAR(100) NOT NULL DEFAULT '',
        requested_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    // ── Production Scan (operator สแกนชิ้นงานทีละชิ้นที่แต่ละสถานี) ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS production_units (
        id           SERIAL PRIMARY KEY,
        wo_id        VARCHAR(100) NOT NULL,
        serial       VARCHAR(100) NOT NULL,
        last_station VARCHAR(100) NOT NULL DEFAULT '',
        last_result  VARCHAR(10)  NOT NULL DEFAULT 'PASS' CHECK (last_result IN ('PASS','FAIL')),
        scan_count   INTEGER      NOT NULL DEFAULT 0,
        updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        UNIQUE (wo_id, serial)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS production_scans (
        id          SERIAL PRIMARY KEY,
        wo_id       VARCHAR(100) NOT NULL,
        serial      VARCHAR(100) NOT NULL,
        station     VARCHAR(100) NOT NULL,
        result      VARCHAR(10)  NOT NULL CHECK (result IN ('PASS','FAIL')),
        operator    VARCHAR(100) NOT NULL DEFAULT '',
        note        TEXT,
        scanned_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    // ── Production Plan (โมดูลใหม่ตาม Excel จริง — Add Project) ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS pp_projects (
        id              SERIAL PRIMARY KEY,
        status          VARCHAR(30)  NOT NULL DEFAULT 'ON_PROCESS',
        wk              INTEGER,
        date_record     DATE,
        product_pn      VARCHAR(100) NOT NULL DEFAULT '',
        model           VARCHAR(150) NOT NULL DEFAULT '',
        customer        VARCHAR(100) NOT NULL DEFAULT '',
        qty             INTEGER      NOT NULL DEFAULT 0,
        syn_requestor   VARCHAR(100) NOT NULL DEFAULT '',
        work_order      VARCHAR(100) NOT NULL DEFAULT '',
        matl_coming     VARCHAR(200) NOT NULL DEFAULT '',
        chk_man         BOOLEAN NOT NULL DEFAULT false,
        chk_mac         BOOLEAN NOT NULL DEFAULT false,
        chk_med         BOOLEAN NOT NULL DEFAULT false,
        chk_mat         BOOLEAN NOT NULL DEFAULT false,
        pd_pcba         BOOLEAN NOT NULL DEFAULT false,
        pd_bbas         BOOLEAN NOT NULL DEFAULT false,
        pd_test         BOOLEAN NOT NULL DEFAULT false,
        pd_start_date   DATE,
        pd_finish_date  DATE,
        qa_test_rate    VARCHAR(50)  NOT NULL DEFAULT '',
        qa_finish_date  DATE,
        store_received  DATE,
        expected_date   DATE,
        revised_date    DATE,
        pd_pic          VARCHAR(150) NOT NULL DEFAULT '',
        team_member     INTEGER      NOT NULL DEFAULT 0,
        ok_per_day      INTEGER      NOT NULL DEFAULT 0,
        total_ng        INTEGER      NOT NULL DEFAULT 0,
        total_ok        INTEGER      NOT NULL DEFAULT 0,
        remark          TEXT         NOT NULL DEFAULT '',
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`ALTER TABLE pp_projects ADD COLUMN IF NOT EXISTS done BOOLEAN NOT NULL DEFAULT false`);
    await client.query(`ALTER TABLE pp_projects ADD COLUMN IF NOT EXISTS pd_rma  BOOLEAN NOT NULL DEFAULT false`);
    await client.query(`ALTER TABLE pp_projects ADD COLUMN IF NOT EXISTS pd_prep BOOLEAN NOT NULL DEFAULT false`);
    await client.query(`ALTER TABLE pp_projects ADD COLUMN IF NOT EXISTS pm      VARCHAR(150) NOT NULL DEFAULT ''`);

    // ── Workflow (ลำดับกระบวนการผลิต — Manufacturing Sequence) ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS workflows (
        id          SERIAL PRIMARY KEY,
        customer    VARCHAR(100) NOT NULL DEFAULT '',
        model       VARCHAR(150) NOT NULL DEFAULT '',
        steps       JSONB        NOT NULL DEFAULT '[]',
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    // ชื่อ Preset (ตั้งชื่อ workflow ได้)
    await client.query(`ALTER TABLE workflows ADD COLUMN IF NOT EXISTS name VARCHAR(150) NOT NULL DEFAULT ''`);

    // ── Workflow Results (บันทึกผลการเดินสายผลิต: Serial + PASS/FAIL + cycle time) ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS workflow_results (
        id           SERIAL PRIMARY KEY,
        serial       VARCHAR(150) NOT NULL,
        customer     VARCHAR(100) NOT NULL DEFAULT '',
        model        VARCHAR(150) NOT NULL DEFAULT '',
        sequence     TEXT         NOT NULL DEFAULT '',
        result       VARCHAR(10)  NOT NULL DEFAULT 'PASS',
        total_sec    INTEGER      NOT NULL DEFAULT 0,
        created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    // Seed ข้อมูลตัวอย่างถ้ายังว่าง
    const { rows } = await client.query('SELECT COUNT(*) FROM boms');
    if (SEED_DEMO && Number(rows[0].count) === 0) {
      await client.query(`
        INSERT INTO boms (name, version, approved, approved_at) VALUES
          ('PCB-A100 BOM', '1.0', true,  NOW()),
          ('ASY-300 BOM',  '2.1', false, NULL),
          ('MOT-4500 BOM', '1.3', true,  NOW())
      `);
      await client.query(`
        INSERT INTO bom_lines (bom_id, part_no, part_name, qty_per, unit, sort_order) VALUES
          (1, 'R-100K',   'Resistor 100K Ohm',  10, 'pcs', 1),
          (1, 'C-10UF',   'Capacitor 10uF',      5, 'pcs', 2),
          (1, 'IC-555',   'Timer IC 555',         2, 'pcs', 3),
          (2, 'MTR-DC',   'DC Motor 12V',         1, 'pcs', 1),
          (2, 'GBX-01',   'Gearbox Assembly',     1, 'pcs', 2),
          (3, 'STL-ROD',  'Steel Rod 10mm',       4, 'pcs', 1),
          (3, 'BRG-6201', 'Bearing 6201',         2, 'pcs', 2)
      `);
      await client.query(`
        INSERT INTO work_orders (wo_no, product_name, qty, status, due_date) VALUES
          ('WO-202606-001', 'PCB-A100', 2000, 'IN_PROGRESS', '2026-06-20'),
          ('WO-202606-002', 'ASY-300',  1500, 'PENDING',     '2026-06-25'),
          ('WO-202606-003', 'MOT-4500', 3000, 'DONE',        '2026-06-10')
      `);
      console.log('[migrate] seeded initial data');
    }

    console.log('[migrate] all tables ready');
  } finally {
    client.release();
  }
}

module.exports = migrate;
