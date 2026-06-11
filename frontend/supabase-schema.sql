-- Run this entire file in: Supabase Dashboard → SQL Editor → New Query → Run

-- Work Orders
CREATE TABLE IF NOT EXISTS work_orders (
  wo_id        TEXT PRIMARY KEY,
  product_code TEXT,
  customer     TEXT,
  qty          INTEGER DEFAULT 0,
  current_step TEXT DEFAULT 'DRAFT',
  station      TEXT,
  qty_good     INTEGER DEFAULT 0,
  fai_inspector TEXT,
  fai_approver  TEXT,
  fai_passed    BOOLEAN,
  actual_qty    INTEGER,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- OBA Records
CREATE TABLE IF NOT EXISTS oba_records (
  id          TEXT PRIMARY KEY,
  wo_id       TEXT,
  lot_no      TEXT,
  sample_qty  INTEGER DEFAULT 0,
  result      TEXT,
  defect_note TEXT,
  timestamp   TIMESTAMPTZ DEFAULT now()
);

-- QC Records
CREATE TABLE IF NOT EXISTS qc_records (
  id         TEXT PRIMARY KEY,
  sn         TEXT,
  status     TEXT,
  time       TEXT,
  error      TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Routing History
CREATE TABLE IF NOT EXISTS routing_history (
  id         TEXT PRIMARY KEY,
  ts         TEXT,
  serial     TEXT,
  sequence   TEXT,
  result     TEXT,
  total_sec  REAL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Production Reports
CREATE TABLE IF NOT EXISTS production_reports (
  id           TEXT PRIMARY KEY,
  code         TEXT DEFAULT '',
  customer     TEXT DEFAULT '',
  status       TEXT DEFAULT '',
  qty          INTEGER DEFAULT 0,
  delivery     TEXT DEFAULT '',
  stage        TEXT DEFAULT 'Planning',
  is_completed BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- ── Row Level Security (allow public read/write — demo only) ─────────────

ALTER TABLE work_orders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE oba_records       ENABLE ROW LEVEL SECURITY;
ALTER TABLE qc_records        ENABLE ROW LEVEL SECURITY;
ALTER TABLE routing_history   ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_all" ON work_orders        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON oba_records        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON qc_records         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON routing_history    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON production_reports FOR ALL USING (true) WITH CHECK (true);
