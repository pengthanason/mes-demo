const router = require('express').Router();

// ── Mock traceability data (ไม่มี DB — mock สำหรับ demo) ─────────

const SERIALS_LIST = [
  'SN-A100-0001','SN-A100-0002','SN-A100-0003',
  'SN-A300-0001','SN-A300-0002',
  'SN-M450-0001',
];

const TRACES = {
  'SN-A100-0001': {
    serial: 'SN-A100-0001', product: 'PCB-A100', wo: 'WO-202606-001', box: 'BOX-001',
    steps: [
      { step: 'Assembly',  status: 'PASS', at: '2026-06-10T09:00:00Z', operator: 'สมชาย ใจดี',   station: 'SMT-LINE' },
      { step: 'Jig Test',  status: 'PASS', at: '2026-06-10T11:30:00Z', operator: 'JIG-001',        station: 'TEST-BENCH', note: 'V=3.28, I=1.22, T=42°C' },
      { step: 'QC',        status: 'PASS', at: '2026-06-11T09:00:00Z', operator: 'สมหมาย ดีใจ',   station: 'QC-DESK' },
      { step: 'Packed',    status: 'PASS', at: '2026-06-11T14:00:00Z', operator: 'วิชัย สุขใจ',   station: 'PACK-LINE', note: 'BOX-001' },
    ],
  },
  'SN-A100-0002': {
    serial: 'SN-A100-0002', product: 'PCB-A100', wo: 'WO-202606-001', box: 'BOX-001',
    steps: [
      { step: 'Assembly',  status: 'PASS', at: '2026-06-10T09:30:00Z', operator: 'สมชาย ใจดี',   station: 'SMT-LINE' },
      { step: 'Jig Test',  status: 'FAIL', at: '2026-06-10T11:45:00Z', operator: 'JIG-001',        station: 'TEST-BENCH', note: 'FAIL — Voltage low: 3.15V (min 3.20V)' },
      { step: 'Rework',    status: 'PASS', at: '2026-06-10T14:00:00Z', operator: 'ช่างซ่อม A',    station: 'REWORK-DESK', note: 'เปลี่ยน C1 capacitor' },
      { step: 'Jig Test',  status: 'PASS', at: '2026-06-10T15:30:00Z', operator: 'JIG-001',        station: 'TEST-BENCH', note: 'Retest OK — V=3.27' },
      { step: 'QC',        status: 'PASS', at: '2026-06-11T09:30:00Z', operator: 'สมหมาย ดีใจ',   station: 'QC-DESK' },
      { step: 'Packed',    status: 'PASS', at: '2026-06-11T14:15:00Z', operator: 'วิชัย สุขใจ',   station: 'PACK-LINE', note: 'BOX-001' },
    ],
  },
  'SN-A100-0003': {
    serial: 'SN-A100-0003', product: 'PCB-A100', wo: 'WO-202606-001', box: 'BOX-001',
    steps: [
      { step: 'Assembly',  status: 'PASS', at: '2026-06-10T10:00:00Z', operator: 'สมชาย ใจดี',   station: 'SMT-LINE' },
      { step: 'Jig Test',  status: 'PASS', at: '2026-06-10T12:00:00Z', operator: 'JIG-001',        station: 'TEST-BENCH', note: 'V=3.31, I=1.19, T=41°C' },
      { step: 'QC',        status: 'PASS', at: '2026-06-11T10:00:00Z', operator: 'สมหมาย ดีใจ',   station: 'QC-DESK' },
      { step: 'Packed',    status: 'PASS', at: '2026-06-11T14:30:00Z', operator: 'วิชัย สุขใจ',   station: 'PACK-LINE', note: 'BOX-001' },
    ],
  },
  'SN-A300-0001': {
    serial: 'SN-A300-0001', product: 'ASY-300', wo: 'WO-202606-002', box: 'BOX-002',
    steps: [
      { step: 'Assembly',  status: 'PASS', at: '2026-06-11T08:00:00Z', operator: 'มานี รักงาน',   station: 'ASSY-LINE' },
      { step: 'Jig Test',  status: 'FAIL', at: '2026-06-11T10:00:00Z', operator: 'JIG-002',        station: 'TEST-BENCH', note: 'FAIL — Current over limit: 2.85A (max 2.50A)' },
      { step: 'Rework',    status: 'PASS', at: '2026-06-11T13:00:00Z', operator: 'ช่างซ่อม B',    station: 'REWORK-DESK', note: 'ปรับ gearbox preload' },
      { step: 'Jig Test',  status: 'PASS', at: '2026-06-11T15:00:00Z', operator: 'JIG-002',        station: 'TEST-BENCH', note: 'Retest OK — I=2.40A' },
      { step: 'QC',        status: 'PASS', at: '2026-06-12T09:00:00Z', operator: 'สมหมาย ดีใจ',   station: 'QC-DESK' },
      { step: 'Packed',    status: 'PASS', at: '2026-06-12T13:00:00Z', operator: 'วิชัย สุขใจ',   station: 'PACK-LINE', note: 'BOX-002' },
    ],
  },
  'SN-A300-0002': {
    serial: 'SN-A300-0002', product: 'ASY-300', wo: 'WO-202606-002', box: 'BOX-002',
    steps: [
      { step: 'Assembly',  status: 'PASS', at: '2026-06-11T08:30:00Z', operator: 'มานี รักงาน',   station: 'ASSY-LINE' },
      { step: 'Jig Test',  status: 'PASS', at: '2026-06-11T10:30:00Z', operator: 'JIG-002',        station: 'TEST-BENCH', note: 'V=5.08, I=2.12, T=44°C' },
      { step: 'QC',        status: 'PASS', at: '2026-06-12T09:30:00Z', operator: 'สมหมาย ดีใจ',   station: 'QC-DESK' },
      { step: 'Packed',    status: 'PASS', at: '2026-06-12T13:15:00Z', operator: 'วิชัย สุขใจ',   station: 'PACK-LINE', note: 'BOX-002' },
    ],
  },
  'SN-M450-0001': {
    serial: 'SN-M450-0001', product: 'MOT-4500', wo: 'WO-202606-003', box: 'BOX-003',
    steps: [
      { step: 'Assembly',  status: 'PASS', at: '2026-06-08T08:00:00Z', operator: 'สมชาย ใจดี',   station: 'METAL-LINE' },
      { step: 'Jig Test',  status: 'PASS', at: '2026-06-08T10:00:00Z', operator: 'JIG-003',        station: 'TEST-BENCH', note: 'V=12.5, I=3.50, T=55°C' },
      { step: 'QC',        status: 'PASS', at: '2026-06-09T09:00:00Z', operator: 'สมหมาย ดีใจ',   station: 'QC-DESK' },
      { step: 'Packed',    status: 'PASS', at: '2026-06-09T14:00:00Z', operator: 'วิชัย สุขใจ',   station: 'PACK-LINE', note: 'BOX-003' },
      { step: 'Shipped',   status: 'PASS', at: '2026-06-10T08:00:00Z', operator: 'ขนส่ง A',       station: 'SHIPPING', note: 'TOYOTA order #T-20260610' },
    ],
  },
};

const BOXES = {
  'BOX-001': { box_id: 'BOX-001', product: 'PCB-A100', wo: 'WO-202606-001', packed_at: '2026-06-11T14:30:00Z',
    serials: ['SN-A100-0001','SN-A100-0002','SN-A100-0003'] },
  'BOX-002': { box_id: 'BOX-002', product: 'ASY-300',  wo: 'WO-202606-002', packed_at: '2026-06-12T13:15:00Z',
    serials: ['SN-A300-0001','SN-A300-0002'] },
  'BOX-003': { box_id: 'BOX-003', product: 'MOT-4500', wo: 'WO-202606-003', packed_at: '2026-06-09T14:00:00Z',
    serials: ['SN-M450-0001'] },
};

// ── Routes ─────────────────────────────────────────────────────────

router.get('/serials', (req, res) => {
  res.json({ status: 'success', data: SERIALS_LIST });
});

router.get('/trace/:serial', (req, res) => {
  const t = TRACES[req.params.serial];
  if (!t) return res.status(404).json({ status: 'error', message: `Serial "${req.params.serial}" ไม่พบในระบบ` });
  res.json({ status: 'success', data: t });
});

router.get('/assembly', (req, res) => {
  const rows = Object.values(TRACES).map(t => ({
    serial: t.serial, product: t.product, wo: t.wo,
    assembled_at: t.steps[0]?.at, station: t.steps[0]?.station, operator: t.steps[0]?.operator,
  }));
  res.json({ status: 'success', data: rows });
});

router.get('/packing/boxes', (req, res) => {
  const data = Object.values(BOXES).map(b => ({ ...b, qty: b.serials.length, serials: undefined }));
  res.json({ status: 'success', data });
});

router.get('/packing/boxes/:boxId', (req, res) => {
  const box = BOXES[req.params.boxId];
  if (!box) return res.status(404).json({ status: 'error', message: 'box not found' });
  const items = box.serials.map(sn => {
    const t = TRACES[sn];
    const lastStep = t?.steps[t.steps.length - 1];
    return { serial: sn, product: t?.product || '', last_step: lastStep?.step || '', last_status: lastStep?.status || '' };
  });
  res.json({ status: 'success', data: { ...box, items } });
});

router.get('/report/daily', (req, res) => {
  const days = 7;
  const report = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const total = 8 + Math.floor(i * 2.5);
    const fail  = i === 3 ? 2 : i === 5 ? 1 : 0;
    report.push({ date: dateStr, total, pass: total - fail, fail, pass_rate: Math.round((total - fail) / total * 100) });
  }
  res.json({ status: 'success', data: report });
});

router.get('/export/csv', (req, res) => {
  const rows = Object.values(TRACES);
  const lines = ['serial,product,wo,total_steps,has_rework,last_status'];
  for (const t of rows) {
    const hasRework = t.steps.some(s => s.step === 'Rework') ? 'YES' : 'NO';
    const lastStatus = t.steps[t.steps.length - 1].status;
    lines.push(`${t.serial},${t.product},${t.wo},${t.steps.length},${hasRework},${lastStatus}`);
  }
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="traceability.csv"');
  res.send(lines.join('\n'));
});

module.exports = router;
