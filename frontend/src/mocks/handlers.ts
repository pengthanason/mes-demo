import { http, HttpResponse } from 'msw';

// ── In-memory mutable state ──────────────────────────────────────────────────

let _notifId = 10;
const notifications = [
  { id: 1, type: 'WO_OPEN',     title: 'Work Order เปิดใหม่',       message: 'WO-2026-003 สำหรับ MOT-4500 เปิดแล้ว', link: '/wo-dashboard', is_read: false, created_at: '2026-06-14T08:00:00Z' },
  { id: 2, type: 'QC_FAIL',     title: 'QC ไม่ผ่าน',                 message: 'WO-2026-002 lot LOT-002 พบ defect 3 ชิ้น', link: '/qc-result', is_read: false, created_at: '2026-06-14T09:15:00Z' },
  { id: 3, type: 'CR_APPROVED', title: '4M Change อนุมัติแล้ว',      message: 'CR-2026-001 ผ่าน G1 Review แล้ว',     link: '/4m-change',  is_read: false, created_at: '2026-06-13T14:30:00Z' },
  { id: 4, type: 'WO_CLOSED',   title: 'Work Order ปิดแล้ว',          message: 'WO-2026-001 ปิด WO สำเร็จ qty 120 ชิ้น', link: '/wo-dashboard', is_read: true, created_at: '2026-06-13T16:00:00Z' },
  { id: 5, type: 'REWORK',      title: 'Rework Ticket เปิดใหม่',     message: 'Rework สำหรับ WO-2026-002 ถูกสร้างแล้ว', link: '/qc-result', is_read: true, created_at: '2026-06-12T10:45:00Z' },
];

let _woId = 100;
const woBoard = [
  { id: 1,  wo_no: 'WO-2026-001', product_name: 'PCB-A100',  customer: 'Toyota TH',     qty: 200, current_step: 'CLOSED',      station: 'PACK',    qty_good: 198, actual_qty: 200, fai_inspector: 'สมชาย', fai_approver: 'วิชัย', fai_passed: true,  created_at: '2026-06-01T08:00:00Z', updated_at: '2026-06-13T16:00:00Z' },
  { id: 2,  wo_no: 'WO-2026-002', product_name: 'ASY-300',   customer: 'Honda Mfg',     qty: 150, current_step: 'WAIT_FAI_QA', station: 'QC',      qty_good: 147, actual_qty: null, fai_inspector: null, fai_approver: null, fai_passed: false, created_at: '2026-06-05T09:00:00Z', updated_at: '2026-06-14T09:00:00Z' },
  { id: 3,  wo_no: 'WO-2026-003', product_name: 'MOT-4500',  customer: 'Denso Corp',    qty: 500, current_step: 'RUNNING',     station: 'SMT',     qty_good: 0,   actual_qty: null, fai_inspector: null, fai_approver: null, fai_passed: false, created_at: '2026-06-10T07:00:00Z', updated_at: '2026-06-14T07:30:00Z' },
  { id: 4,  wo_no: 'WO-2026-004', product_name: 'CAB-200',   customer: 'Sumitomo',      qty: 80,  current_step: 'OPEN',        station: 'PREP',    qty_good: 0,   actual_qty: null, fai_inspector: null, fai_approver: null, fai_passed: false, created_at: '2026-06-12T10:00:00Z', updated_at: '2026-06-12T10:00:00Z' },
  { id: 5,  wo_no: 'WO-2026-005', product_name: 'SEN-100',   customer: 'AISIN',         qty: 300, current_step: 'DRAFT',       station: null,      qty_good: 0,   actual_qty: null, fai_inspector: null, fai_approver: null, fai_passed: false, created_at: '2026-06-14T06:00:00Z', updated_at: '2026-06-14T06:00:00Z' },
];

let _reportId = 20;
const reports = [
  { id: '1', code: 'PCB-A100', customer: 'Toyota TH',  status: 'CLOSED',      qty: 200, delivery: '2026-06-13', stage: 'Shipping',   is_completed: true  },
  { id: '2', code: 'ASY-300',  customer: 'Honda Mfg',  status: 'IN_PROGRESS', qty: 150, delivery: '2026-06-20', stage: 'QC',         is_completed: false },
  { id: '3', code: 'MOT-4500', customer: 'Denso Corp', status: 'IN_PROGRESS', qty: 500, delivery: '2026-06-28', stage: 'Production', is_completed: false },
  { id: '4', code: 'CAB-200',  customer: 'Sumitomo',   status: 'OPEN',        qty: 80,  delivery: '2026-06-25', stage: 'Planning',   is_completed: false },
  { id: '5', code: 'SEN-100',  customer: 'AISIN',      status: 'IN_PROGRESS', qty: 300, delivery: '2026-06-30', stage: 'SMT',        is_completed: false },
];

const boms = [
  { bom_id: 'BOM-001', name: 'PCB-A100 Assembly', version: 'v1.2', approved: true,  approved_at: '2026-05-15T09:00:00Z' },
  { bom_id: 'BOM-002', name: 'ASY-300 Unit',       version: 'v2.0', approved: true,  approved_at: '2026-05-20T10:00:00Z' },
  { bom_id: 'BOM-003', name: 'MOT-4500 Drive',     version: 'v1.0', approved: false, approved_at: null },
  { bom_id: 'BOM-004', name: 'CAB-200 Harness',    version: 'v1.1', approved: true,  approved_at: '2026-06-01T09:00:00Z' },
  { bom_id: 'BOM-005', name: 'SEN-100 Sensor',     version: 'v1.0', approved: false, approved_at: null },
];

const bomLines: Record<string, any[]> = {
  'BOM-001': [
    { line_id: 'L001', part_no: 'IC-NXP-001', part_name: 'MCU NXP S32K',    qty_per: 1, unit: 'EA' },
    { line_id: 'L002', part_no: 'CAP-100UF',  part_name: 'Capacitor 100µF', qty_per: 4, unit: 'EA' },
    { line_id: 'L003', part_no: 'RES-10K',    part_name: 'Resistor 10kΩ',   qty_per: 8, unit: 'EA' },
  ],
  'BOM-002': [
    { line_id: 'L004', part_no: 'CONN-12P',   part_name: 'Connector 12P',   qty_per: 2, unit: 'EA' },
    { line_id: 'L005', part_no: 'WIRE-0.5',   part_name: 'Wire 0.5mm²',     qty_per: 50, unit: 'CM' },
  ],
  'BOM-003': [
    { line_id: 'L006', part_no: 'MOT-CORE',   part_name: 'Motor Core',      qty_per: 1, unit: 'EA' },
    { line_id: 'L007', part_no: 'BRG-6205',   part_name: 'Bearing 6205',    qty_per: 2, unit: 'EA' },
  ],
};

let _preWoId = 10;
const preWoList = [
  { req_id: 'REQ-001', bom_id: 'BOM-002', bom_name: 'ASY-300 Unit', qty: 100, due_date: '2026-07-01', status: 'PENDING',   created_at: '2026-06-10T08:00:00Z' },
  { req_id: 'REQ-002', bom_id: 'BOM-003', bom_name: 'MOT-4500 Drive', qty: 200, due_date: '2026-07-15', status: 'APPROVED', created_at: '2026-06-11T09:00:00Z' },
  { req_id: 'REQ-003', bom_id: 'BOM-001', bom_name: 'PCB-A100 Assembly', qty: 500, due_date: '2026-07-05', status: 'APPROVED', created_at: '2026-06-12T09:00:00Z' },
  { req_id: 'REQ-004', bom_id: 'BOM-002', bom_name: 'ASY-300 Unit', qty: 150, due_date: '2026-07-20', status: 'PENDING',  created_at: '2026-06-13T10:00:00Z' },
  { req_id: 'REQ-005', bom_id: 'BOM-001', bom_name: 'PCB-A100 Assembly', qty: 300, due_date: '2026-07-10', status: 'REJECTED', created_at: '2026-06-13T14:00:00Z' },
];

let _crId = 10;
const crList = [
  { id: 1, cr_no: 'CR-2026-001', m_type: 'Machine', wo_ref: 'WO-2026-002', description: 'เปลี่ยนหัวเชื่อม SMT จากรุ่น A ไป B', impact: 'อาจส่งผลต่อ solder quality', state: 'G2_APPROVED', g1_note: 'ตรวจสอบแล้ว OK', g1_at: '2026-06-12T10:00:00Z', g2_note: 'อนุมัติ proceed', g2_at: '2026-06-13T11:00:00Z', g3_note: null, g3_at: null, created_at: '2026-06-11T09:00:00Z' },
  { id: 2, cr_no: 'CR-2026-002', m_type: 'Material', wo_ref: 'WO-2026-003', description: 'เปลี่ยน supplier ฟลักซ์จาก Kester ไป AIM', impact: 'ต้องทดสอบ wettability ก่อน', state: 'G1_REVIEW', g1_note: null, g1_at: null, g2_note: null, g2_at: null, g3_note: null, g3_at: null, created_at: '2026-06-13T14:00:00Z' },
  { id: 3, cr_no: 'CR-2026-003', m_type: 'Method', wo_ref: 'WO-2026-001', description: 'ปรับ reflow profile อุณหภูมิ peak +5°C', impact: 'ลด voiding ใน BGA', state: 'ACTIVE', g1_note: 'OK', g1_at: '2026-06-08T09:00:00Z', g2_note: 'อนุมัติ', g2_at: '2026-06-09T10:00:00Z', g3_note: 'Active ใช้งานได้', g3_at: '2026-06-10T11:00:00Z', created_at: '2026-06-07T08:00:00Z' },
  { id: 4, cr_no: 'CR-2026-004', m_type: 'Man', wo_ref: 'WO-2026-004', description: 'เพิ่มพนักงานสาย SMT กะดึก 2 คน', impact: 'เพิ่มกำลังผลิต ~15%', state: 'DRAFT', g1_note: null, g1_at: null, g2_note: null, g2_at: null, g3_note: null, g3_at: null, created_at: '2026-06-14T08:00:00Z' },
  { id: 5, cr_no: 'CR-2026-005', m_type: 'Machine', wo_ref: 'WO-2026-005', description: 'เพิ่มเครื่อง FCT Tester หัวที่ 5', impact: 'ลดคอขวดที่สถานีเทส', state: 'G2_APPROVED', g1_note: 'ตรวจแล้ว', g1_at: '2026-06-13T10:00:00Z', g2_note: 'อนุมัติงบ', g2_at: '2026-06-14T09:00:00Z', g3_note: null, g3_at: null, created_at: '2026-06-12T08:00:00Z' },
];

let _qcId = 10;
const qcResults = [
  { id: 1, wo_id: 'WO-2026-001', lot_no: 'LOT-001', qty_checked: 50, qty_pass: 50, qty_fail: 0, overall: 'PASS',    defect_desc: null,                 created_at: '2026-06-12T10:00:00Z', verify_id: 1, verdict: 'APPROVED', verified_by: 'วิชัย', verified_at: '2026-06-12T11:00:00Z' },
  { id: 2, wo_id: 'WO-2026-002', lot_no: 'LOT-002', qty_checked: 50, qty_pass: 47, qty_fail: 3, overall: 'PARTIAL', defect_desc: 'Cold solder ที่ C12-C15', created_at: '2026-06-13T09:00:00Z', verify_id: null, verdict: null, verified_by: null, verified_at: null },
  { id: 3, wo_id: 'WO-2026-002', lot_no: 'LOT-003', qty_checked: 50, qty_pass: 45, qty_fail: 5, overall: 'FAIL',    defect_desc: 'Solder bridge ที่ U4',  created_at: '2026-06-13T14:00:00Z', verify_id: null, verdict: null, verified_by: null, verified_at: null },
  { id: 4, wo_id: 'WO-2026-003', lot_no: 'LOT-004', qty_checked: 100, qty_pass: 100, qty_fail: 0, overall: 'PASS', defect_desc: null,                created_at: '2026-06-14T09:00:00Z', verify_id: null, verdict: null, verified_by: null, verified_at: null },
  { id: 5, wo_id: 'WO-2026-001', lot_no: 'LOT-005', qty_checked: 80,  qty_pass: 78,  qty_fail: 2, overall: 'PARTIAL', defect_desc: 'Scratch ที่ผิว 2 ชิ้น', created_at: '2026-06-14T11:00:00Z', verify_id: null, verdict: null, verified_by: null, verified_at: null },
];

const transferVerify: Record<number, any> = {
  1: { id: 1, qc_result_id: 1, wo_id: 'WO-2026-001', verdict: 'APPROVED', note: 'ตรวจสอบแล้วผ่าน', verified_by: 'วิชัย', created_at: '2026-06-12T11:00:00Z', lot_no: 'LOT-001', qty_checked: 50, qty_pass: 50, qty_fail: 0, overall: 'PASS', defect_desc: null, qc_created_at: '2026-06-12T10:00:00Z' },
};

let _reworkId = 10;
const reworkList = [
  { id: 1, qc_result_id: 2, wo_id: 'WO-2026-002', defect_type: 'Cold Solder', assigned_to: 'ช่างนิพนธ์', due_date: '2026-06-16', status: 'IN_PROGRESS', lot_no: 'LOT-002', qc_overall: 'PARTIAL', created_at: '2026-06-13T10:00:00Z' },
  { id: 2, qc_result_id: 3, wo_id: 'WO-2026-002', defect_type: 'Solder Bridge', assigned_to: 'ช่างสมศักดิ์', due_date: '2026-06-17', status: 'OPEN',        lot_no: 'LOT-003', qc_overall: 'FAIL',    created_at: '2026-06-13T14:30:00Z' },
  { id: 3, qc_result_id: 5, wo_id: 'WO-2026-001', defect_type: 'Scratch',       assigned_to: 'ช่างนิพนธ์',  due_date: '2026-06-18', status: 'DONE',        lot_no: 'LOT-005', qc_overall: 'PARTIAL', created_at: '2026-06-14T11:30:00Z' },
  { id: 4, qc_result_id: 2, wo_id: 'WO-2026-002', defect_type: 'Cold Solder',   assigned_to: 'ช่างแมน',    due_date: '2026-06-16', status: 'DONE',        lot_no: 'LOT-002', qc_overall: 'PARTIAL', created_at: '2026-06-13T11:00:00Z' },
  { id: 5, qc_result_id: 3, wo_id: 'WO-2026-002', defect_type: 'Solder Bridge', assigned_to: 'ช่างสมศักดิ์', due_date: '2026-06-19', status: 'IN_PROGRESS', lot_no: 'LOT-003', qc_overall: 'FAIL',    created_at: '2026-06-14T08:00:00Z' },
];

const obaRecords = [
  { id: 1, wo_id: 'WO-2026-001', lot_no: 'LOT-001', sample_qty: 10, result: 'PASS', defect_note: '',              created_at: '2026-06-12T15:00:00Z' },
  { id: 2, wo_id: 'WO-2026-002', lot_no: 'LOT-002', sample_qty: 10, result: 'FAIL', defect_note: 'ฝาปิดหลวม',    created_at: '2026-06-13T16:00:00Z' },
  { id: 3, wo_id: 'WO-2026-003', lot_no: 'LOT-004', sample_qty: 15, result: 'PASS', defect_note: '',              created_at: '2026-06-14T10:00:00Z' },
  { id: 4, wo_id: 'WO-2026-001', lot_no: 'LOT-005', sample_qty: 8,  result: 'PASS', defect_note: '',              created_at: '2026-06-14T12:00:00Z' },
  { id: 5, wo_id: 'WO-2026-002', lot_no: 'LOT-003', sample_qty: 10, result: 'FAIL', defect_note: 'บัดกรีไม่เต็ม', created_at: '2026-06-14T13:00:00Z' },
];

const qcRecords = [
  { id: 1, sn: 'SN-A100-0001', status: 'PASS', error: null, created_at: '2026-06-14T08:01:00Z' },
  { id: 2, sn: 'SN-A100-0002', status: 'FAIL', error: 'SHORT_CIRCUIT', created_at: '2026-06-14T08:03:00Z' },
  { id: 3, sn: 'SN-A100-0003', status: 'PASS', error: null, created_at: '2026-06-14T08:05:00Z' },
  { id: 4, sn: 'SN-A100-0004', status: 'FAIL', error: 'VOLTAGE_LOW', created_at: '2026-06-14T08:07:00Z' },
  { id: 5, sn: 'SN-A100-0005', status: 'PASS', error: null, created_at: '2026-06-14T08:09:00Z' },
];

const routingRecords = [
  { id: 1, serial: 'SN-A100-0001', sequence: 'SMT → AOI → ICT → PACK', result: 'PASS', total_sec: 1820, created_at: '2026-06-14T08:00:00Z' },
  { id: 2, serial: 'SN-A100-0002', sequence: 'SMT → AOI → Rework → ICT → PACK', result: 'PASS', total_sec: 3600, created_at: '2026-06-14T09:00:00Z' },
  { id: 3, serial: 'SN-A300-0001', sequence: 'Assembly → QC → PACK', result: 'PASS', total_sec: 900, created_at: '2026-06-13T14:00:00Z' },
  { id: 4, serial: 'SN-M450-0001', sequence: 'Winding → Test → FAIL', result: 'FAIL', total_sec: 600, created_at: '2026-06-13T15:00:00Z' },
];

let _scmId = 10;
const scmCases = [
  { case_id: 'SCM-2026-001', lot_uid: 'LOT-SCM-001', product: 'PCB-A100', defect_type: 'Cosmetic', qty_ng: 5,  status: 'OPEN',   created_at: '2026-06-13T09:00:00Z', resolved_at: null, dispositions: [{ id: 1, action: 'Rework', qty: 5, note: 'ขัดรอยและทาสี', created_at: '2026-06-13T10:00:00Z' }] },
  { case_id: 'SCM-2026-002', lot_uid: 'LOT-SCM-002', product: 'ASY-300',  defect_type: 'Functional', qty_ng: 10, status: 'CLOSED', created_at: '2026-06-10T08:00:00Z', resolved_at: '2026-06-12T14:00:00Z', dispositions: [{ id: 2, action: 'Scrap', qty: 3, note: 'เสียหายไม่คุ้มซ่อม', created_at: '2026-06-11T09:00:00Z' }, { id: 3, action: 'Use-As-Is', qty: 7, note: 'defect ไม่กระทบ function หลัก', created_at: '2026-06-11T10:00:00Z' }] },
  { case_id: 'SCM-2026-003', lot_uid: 'LOT-SCM-003', product: 'MOT-4500', defect_type: 'Dimension',  qty_ng: 8,  status: 'OPEN',   created_at: '2026-06-14T08:00:00Z', resolved_at: null, dispositions: [] },
  { case_id: 'SCM-2026-004', lot_uid: 'LOT-SCM-004', product: 'PCB-A100', defect_type: 'Functional', qty_ng: 12, status: 'OPEN',   created_at: '2026-06-14T10:00:00Z', resolved_at: null, dispositions: [{ id: 4, action: 'RTV', qty: 12, note: 'ส่งคืน supplier', created_at: '2026-06-14T11:00:00Z' }] },
  { case_id: 'SCM-2026-005', lot_uid: 'LOT-SCM-005', product: 'CAB-200',  defect_type: 'Cosmetic',   qty_ng: 4,  status: 'CLOSED', created_at: '2026-06-11T08:00:00Z', resolved_at: '2026-06-13T09:00:00Z', dispositions: [{ id: 5, action: 'Rework', qty: 4, note: 'ตัดแต่งสายใหม่', created_at: '2026-06-12T10:00:00Z' }] },
];

let _adminUserId = 10;
const adminUsers = [
  { id: 1, username: 'admin',   full_name: 'ผู้ดูแลระบบ',    role: 'ADMIN',  is_active: true,  permissions: [],                                                                                created_at: '2026-01-01T00:00:00Z' },
  { id: 2, username: 'member1', full_name: 'วิชัย สุขใจ',     role: 'MEMBER', is_active: true,  permissions: ['dashboard', 'production_plan', 'work_orders', 'qc', 'jig_test', 'notifications'], created_at: '2026-01-15T00:00:00Z' },
  { id: 3, username: 'viewer1', full_name: 'สมหมาย ดีใจ',    role: 'VIEWER', is_active: true,  permissions: [],                                                                                created_at: '2026-02-01T00:00:00Z' },
  { id: 4, username: 'somchai', full_name: 'สมชาย วงศ์ไทย',  role: 'MEMBER', is_active: false, permissions: [],                                                                                created_at: '2026-03-01T00:00:00Z' },
];

let _auditId = 20;
const auditLogs = [
  { id: 1,  actor: 'admin',   action: 'CREATE_USER', target_type: 'app_user', target_id: '2', detail: 'สร้างผู้ใช้ member',   created_at: '2026-01-15T08:00:00Z' },
  { id: 2,  actor: 'admin',   action: 'CREATE_USER', target_type: 'app_user', target_id: '3', detail: 'สร้างผู้ใช้ viewer',   created_at: '2026-02-01T09:00:00Z' },
  { id: 3,  actor: 'admin',   action: 'DELETE_USER', target_type: 'app_user', target_id: '5', detail: 'ลบผู้ใช้ testuser',    created_at: '2026-04-01T10:00:00Z' },
  { id: 4,  actor: 'admin',   action: 'UPDATE_USER', target_type: 'app_user', target_id: '4', detail: 'Disable somchai',      created_at: '2026-05-10T11:00:00Z' },
  { id: 5,  actor: 'member1', action: 'LOGIN',       target_type: null,       target_id: null, detail: 'เข้าสู่ระบบสำเร็จ',   created_at: '2026-06-20T08:05:00Z' },
  { id: 6,  actor: 'member1', action: 'CREATE_WO',   target_type: 'wo',       target_id: 'WO-202606-001', detail: 'เปิด WO-202606-001 (PCB-A100)', created_at: '2026-06-20T08:20:00Z' },
  { id: 7,  actor: 'member1', action: 'CREATE_CR',   target_type: 'cr',       target_id: '1', detail: 'เปิด CR-001 (Machine)', created_at: '2026-06-20T09:10:00Z' },
  { id: 8,  actor: 'admin',   action: 'LOGIN',       target_type: null,       target_id: null, detail: 'เข้าสู่ระบบสำเร็จ',   created_at: '2026-06-21T07:50:00Z' },
  { id: 9,  actor: 'admin',   action: 'SAVE_WORKFLOW', target_type: 'workflow', target_id: '6', detail: 'บันทึก Preset: PCBA SMT+THT', created_at: '2026-06-21T10:30:00Z' },
  { id: 10, actor: 'viewer1', action: 'LOGIN',       target_type: null,       target_id: null, detail: 'เข้าสู่ระบบสำเร็จ',   created_at: '2026-06-22T13:00:00Z' },
];

// ── Activity auto-log (เดโม): บันทึกทุก mutation ที่สำเร็จลง auditLogs อัตโนมัติ ──
function actorFromAuth(authHeader: string | null): string {
  try { const m = /^Bearer\s+(.+)$/i.exec(authHeader || ''); if (!m) return 'system'; return atob(m[1]).split(':')[0] || 'system'; } catch { return 'system'; }
}
const ACT_RES: [string, string, string][] = [
  ['/api/pp', 'Production Plan', 'pp'],
  ['/api/workflow', 'Workflow', 'workflow'],
  ['/api/wo', 'Work Order', 'wo'],
  ['/api/bom', 'BOM', 'bom'],
  ['/api/cr', 'Change Request (4M)', 'cr'],
  ['/api/jig', 'Jig Test', 'jig'],
  ['/api/scm', 'SCM Case', 'scm'],
  ['/api/rework', 'Rework', 'rework'],
  ['/api/inventory', 'Kitting/Store', 'inventory'],
  ['/api/notifications', 'Notification', 'notifications'],
  ['/api/production', 'Production', 'production'],
];
function describeActivity(method: string, path: string, row: any) {
  const r = ACT_RES.find(([pre]) => path === pre || path.startsWith(pre + '/'));
  const [, label, type] = r || ['', 'ข้อมูล', 'other'];
  const verb = method === 'POST' ? 'CREATE' : method === 'DELETE' ? 'DELETE' : 'UPDATE';
  const th = verb === 'CREATE' ? 'สร้าง' : verb === 'DELETE' ? 'ลบ' : 'แก้ไข';
  const segs = path.split('/').filter(Boolean);
  const last = segs[segs.length - 1];
  const pathId = (method !== 'POST' && last && !/^(projects|results|users|board|cases)$/.test(last) && !ACT_RES.some(([pre]) => pre.endsWith('/' + last))) ? last : null;
  const name = row ? String(row.product_pn || row.model || row.name || row.wo_name || row.cr_no || row.crNo || row.title || row.serial || row.project_code || '') : '';
  const rid = row && row.id != null ? String(row.id) : null;
  const id = type === 'wo' ? ((row && (row.wo_id || row.woId)) || pathId || rid)
    : type === 'jig' ? ((row && row.project_code) || pathId || rid)
    : (rid || pathId);
  return { action: `${verb}_${type.toUpperCase()}`, type, id, detail: `${th} ${label}${name ? `: ${name}` : (id ? ` #${id}` : '')}` };
}
export function recordApiActivity(method: string, url: string, status: number, authHeader: string | null, body?: any) {
  try {
    if (status < 200 || status >= 300) return;
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return;
    let path: string;
    try { path = new URL(url, 'http://localhost').pathname; } catch { path = String(url).split('?')[0]; }   // รองรับทั้ง url เต็มและ relative
    if (!path.startsWith('/api') || path.startsWith('/api/auth')) return;
    if (path.startsWith('/api/admin/users')) return;   // handler บันทึกเองแล้ว
    if (path.includes('audit-log')) return;
    const row = body && body.data ? body.data : null;
    const { action, type, id, detail } = describeActivity(method, path, row);
    auditLogs.push({ id: ++_auditId, actor: actorFromAuth(authHeader), action, target_type: type, target_id: id, detail, created_at: now() });
  } catch { /* noop */ }
}

const jigProjects = [
  { id: 1, project_code: 'PCB-A100', name: 'PCB Assembly A100', jig_id: 'JIG-PCB-001', is_active: true,  test_type: 'ICT', total: 168, pass_count: 158, fail_count: 10, pass_rate: 94.05 },
  { id: 2, project_code: 'ASY-300',  name: 'Assembly Unit 300',  jig_id: 'JIG-ASY-002', is_active: true,  test_type: 'ICT', total: 120, pass_count: 96,  fail_count: 24, pass_rate: 80.00 },
  { id: 3, project_code: 'MOT-4500', name: 'Motor Drive 4500',   jig_id: 'JIG-MOT-003', is_active: false, test_type: 'FCT', total: 84,  pass_count: 82,  fail_count: 2,  pass_rate: 97.62 },
];

const jigRecords: Record<string, any[]> = {
  'PCB-A100': Array.from({ length: 30 }, (_, i) => ({
    id: i + 1, project_code: 'PCB-A100',
    serial: `SN-A100-${String(i + 1).padStart(4, '0')}`,
    result: (i + 1) % 16 === 0 ? 'FAIL' : 'PASS',
    tested_at: new Date(Date.now() - (29 - i) * 3600 * 1000).toISOString(),
    voltage: (3.28 + Math.random() * 0.04).toFixed(3),
    current_ma: (480 + Math.random() * 40).toFixed(1),
    temp_c: (42 + Math.random() * 6).toFixed(1),
    fail_param: (i + 1) % 16 === 0 ? 'VOLTAGE_LOW' : null,
    notes: null,
  })),
  'ASY-300': Array.from({ length: 30 }, (_, i) => ({
    id: i + 100, project_code: 'ASY-300',
    serial: `SN-A300-${String(i + 1).padStart(4, '0')}`,
    result: (i + 1) % 5 === 0 ? 'FAIL' : 'PASS',
    tested_at: new Date(Date.now() - (29 - i) * 3600 * 1000).toISOString(),
    voltage: null, current_ma: null, temp_c: null,
    fail_param: (i + 1) % 5 === 0 ? 'CONTINUITY_FAIL' : null,
    notes: null,
  })),
  'MOT-4500': Array.from({ length: 30 }, (_, i) => ({
    id: i + 200, project_code: 'MOT-4500',
    serial: `SN-M450-${String(i + 1).padStart(4, '0')}`,
    result: (i + 1) % 50 === 0 ? 'FAIL' : 'PASS',
    tested_at: new Date(Date.now() - (29 - i) * 3600 * 1000).toISOString(),
    voltage: (11.9 + Math.random() * 0.2).toFixed(2),
    current_ma: (2100 + Math.random() * 200).toFixed(0),
    temp_c: (55 + Math.random() * 10).toFixed(1),
    fail_param: (i + 1) % 50 === 0 ? 'SPEED_LOW' : null,
    notes: null,
  })),
};

function jigTimeseries(code: string) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const base = code === 'ASY-300' ? 80 : code === 'MOT-4500' ? 98 : 94;
    const total = 20 + Math.floor(Math.random() * 10);
    const passCount = Math.round(total * (base + Math.random() * 4 - 2) / 100);
    return { date: d.toISOString().slice(0, 10), total, pass_count: passCount, fail_count: total - passCount, pass_rate: Number((passCount / total * 100).toFixed(2)) };
  });
}

const TRACES: Record<string, any> = {
  'SN-A100-0001': { serial: 'SN-A100-0001', product: 'PCB-A100', wo: 'WO-2026-001', box: 'BOX-001', steps: [
    { step: 'SMT',    status: 'PASS', at: '2026-06-10T08:00:00Z', operator: 'นิพนธ์',  station: 'SMT-01' },
    { step: 'AOI',    status: 'PASS', at: '2026-06-10T09:30:00Z', operator: 'สมศักดิ์', station: 'AOI-01' },
    { step: 'ICT',    status: 'PASS', at: '2026-06-10T11:00:00Z', operator: 'วิชัย',   station: 'ICT-01' },
    { step: 'PACK',   status: 'PASS', at: '2026-06-11T08:00:00Z', operator: 'สุดา',    station: 'PACK-01' },
  ]},
  'SN-A100-0002': { serial: 'SN-A100-0002', product: 'PCB-A100', wo: 'WO-2026-001', box: 'BOX-001', steps: [
    { step: 'SMT',    status: 'PASS', at: '2026-06-10T08:05:00Z', operator: 'นิพนธ์',  station: 'SMT-01' },
    { step: 'AOI',    status: 'FAIL', at: '2026-06-10T09:35:00Z', operator: 'สมศักดิ์', station: 'AOI-01', note: 'พบ solder bridge ที่ C12' },
    { step: 'Rework', status: 'PASS', at: '2026-06-10T10:30:00Z', operator: 'ช่างแมน', station: 'REWORK-01', note: 'ซ่อมเสร็จ' },
    { step: 'ICT',    status: 'PASS', at: '2026-06-10T11:30:00Z', operator: 'วิชัย',   station: 'ICT-01' },
    { step: 'PACK',   status: 'PASS', at: '2026-06-11T08:10:00Z', operator: 'สุดา',    station: 'PACK-01' },
  ]},
  'SN-A100-0003': { serial: 'SN-A100-0003', product: 'PCB-A100', wo: 'WO-2026-001', box: 'BOX-001', steps: [
    { step: 'SMT',    status: 'PASS', at: '2026-06-10T08:10:00Z', operator: 'นิพนธ์',  station: 'SMT-01' },
    { step: 'AOI',    status: 'PASS', at: '2026-06-10T09:40:00Z', operator: 'สมศักดิ์', station: 'AOI-01' },
    { step: 'ICT',    status: 'PASS', at: '2026-06-10T11:10:00Z', operator: 'วิชัย',   station: 'ICT-01' },
    { step: 'PACK',   status: 'PASS', at: '2026-06-11T08:20:00Z', operator: 'สุดา',    station: 'PACK-01' },
  ]},
  'SN-A300-0001': { serial: 'SN-A300-0001', product: 'ASY-300', wo: 'WO-2026-002', box: 'BOX-002', steps: [
    { step: 'Assembly', status: 'PASS', at: '2026-06-12T08:00:00Z', operator: 'สมหมาย', station: 'ASY-01' },
    { step: 'QC',       status: 'FAIL', at: '2026-06-12T10:00:00Z', operator: 'วิชัย',   station: 'QC-01', note: 'ขันน็อตไม่ครบ' },
    { step: 'Rework',   status: 'PASS', at: '2026-06-12T11:00:00Z', operator: 'ช่างแมน', station: 'REWORK-01' },
    { step: 'QC',       status: 'PASS', at: '2026-06-12T12:00:00Z', operator: 'วิชัย',   station: 'QC-01', note: 'retest ผ่าน' },
    { step: 'PACK',     status: 'PASS', at: '2026-06-12T13:00:00Z', operator: 'สุดา',    station: 'PACK-01' },
  ]},
  'SN-A300-0002': { serial: 'SN-A300-0002', product: 'ASY-300', wo: 'WO-2026-002', box: 'BOX-002', steps: [
    { step: 'Assembly', status: 'PASS', at: '2026-06-12T08:30:00Z', operator: 'สมหมาย', station: 'ASY-01' },
    { step: 'QC',       status: 'PASS', at: '2026-06-12T10:30:00Z', operator: 'วิชัย',   station: 'QC-01' },
    { step: 'PACK',     status: 'PASS', at: '2026-06-12T13:30:00Z', operator: 'สุดา',    station: 'PACK-01' },
  ]},
  'SN-M450-0001': { serial: 'SN-M450-0001', product: 'MOT-4500', wo: 'WO-2026-003', box: 'BOX-003', steps: [
    { step: 'Winding',  status: 'PASS', at: '2026-06-13T08:00:00Z', operator: 'สุรศักดิ์', station: 'WIND-01' },
    { step: 'Jig Test', status: 'PASS', at: '2026-06-13T10:00:00Z', operator: 'วิชัย',     station: 'JIG-01' },
    { step: 'PACK',     status: 'PASS', at: '2026-06-13T14:00:00Z', operator: 'สุดา',      station: 'PACK-01' },
  ]},
};

const BOXES: Record<string, any> = {
  'BOX-001': { box_id: 'BOX-001', product: 'PCB-A100', wo: 'WO-2026-001', packed_at: '2026-06-11T09:00:00Z', serial_count: 3, items: [
    { serial: 'SN-A100-0001', product: 'PCB-A100', last_step: 'PACK', last_status: 'PASS' },
    { serial: 'SN-A100-0002', product: 'PCB-A100', last_step: 'PACK', last_status: 'PASS' },
    { serial: 'SN-A100-0003', product: 'PCB-A100', last_step: 'PACK', last_status: 'PASS' },
  ]},
  'BOX-002': { box_id: 'BOX-002', product: 'ASY-300', wo: 'WO-2026-002', packed_at: '2026-06-12T14:00:00Z', serial_count: 2, items: [
    { serial: 'SN-A300-0001', product: 'ASY-300', last_step: 'PACK', last_status: 'PASS' },
    { serial: 'SN-A300-0002', product: 'ASY-300', last_step: 'PACK', last_status: 'PASS' },
  ]},
  'BOX-003': { box_id: 'BOX-003', product: 'MOT-4500', wo: 'WO-2026-003', packed_at: '2026-06-13T15:00:00Z', serial_count: 1, items: [
    { serial: 'SN-M450-0001', product: 'MOT-4500', last_step: 'PACK', last_status: 'PASS' },
  ]},
};

const dailyReport = Array.from({ length: 7 }, (_, i) => {
  const d = new Date(); d.setDate(d.getDate() - (6 - i));
  const total = 20 + Math.floor(Math.random() * 15);
  const fail = Math.floor(Math.random() * 3);
  return { date: d.toISOString().slice(0, 10), total, pass: total - fail, fail, pass_rate: Number(((total - fail) / total * 100).toFixed(1)) };
});

const now = () => new Date().toISOString();

// ── Helpers ──────────────────────────────────────────────────────────────────

// ── Incoming / Kitting ───────────────────────────────────────────────────────
let _lotId = 100;
const inventoryLots: any[] = [
  { id: 1, part_no: 'R-100K',  part_name: 'Resistor 100K Ohm', lot_no: 'LOT-R100K-A', qty_received: 5000, qty_available: 5000, status: 'APPROVED', note: null, received_at: '2026-06-08T08:00:00Z', reviewed_at: '2026-06-08T10:00:00Z' },
  { id: 2, part_no: 'C-10UF',  part_name: 'Capacitor 10uF',    lot_no: 'LOT-C10UF-A', qty_received: 3000, qty_available: 3000, status: 'APPROVED', note: null, received_at: '2026-06-09T08:00:00Z', reviewed_at: '2026-06-09T11:00:00Z' },
  { id: 3, part_no: 'IC-555',  part_name: 'Timer IC 555',      lot_no: 'LOT-IC555-A', qty_received: 1000, qty_available: 850,  status: 'APPROVED', note: null, received_at: '2026-06-10T08:00:00Z', reviewed_at: '2026-06-10T09:30:00Z' },
  { id: 4, part_no: 'MTR-DC',  part_name: 'DC Motor 12V',      lot_no: 'LOT-MTR-0608',qty_received: 1500, qty_available: 1500, status: 'PENDING',  note: null, received_at: '2026-06-14T08:00:00Z', reviewed_at: null },
  { id: 5, part_no: 'STL-ROD', part_name: 'Steel Rod 10mm',    lot_no: 'LOT-STL-X1',  qty_received: 2000, qty_available: 0,    status: 'REJECTED', note: 'ขนาดไม่ตรงสเปก', received_at: '2026-06-11T08:00:00Z', reviewed_at: '2026-06-11T13:00:00Z' },
];
let _issueId = 100;
const kittingIssues: any[] = [
  { id: 1, wo_id: 'WO-2026-001', part_no: 'R-100K', qty: 800, lot_no: 'LOT-R100K-A', issued_at: '2026-06-10T08:30:00Z' },
  { id: 2, wo_id: 'WO-2026-001', part_no: 'C-10UF', qty: 400, lot_no: 'LOT-C10UF-A', issued_at: '2026-06-10T08:35:00Z' },
  { id: 3, wo_id: 'WO-2026-002', part_no: 'IC-555', qty: 150, lot_no: 'LOT-IC555-A', issued_at: '2026-06-11T09:00:00Z' },
  { id: 4, wo_id: 'WO-2026-003', part_no: 'MTR-DC', qty: 500, lot_no: 'LOT-MTR-0608', issued_at: '2026-06-12T10:00:00Z' },
  { id: 5, wo_id: 'WO-2026-002', part_no: 'C-10UF', qty: 300, lot_no: 'LOT-C10UF-A', issued_at: '2026-06-11T09:05:00Z' },
];

let _scanId = 100;
const productionScans: any[] = [
  { id: 1, wo_id: 'WO-2026-003', serial: 'SN-M450-0001', station: 'SMT',  result: 'PASS', operator: 'นิพนธ์', note: null,           scanned_at: '2026-06-14T07:30:00Z' },
  { id: 2, wo_id: 'WO-2026-003', serial: 'SN-M450-0002', station: 'SMT',  result: 'PASS', operator: 'นิพนธ์', note: null,           scanned_at: '2026-06-14T07:35:00Z' },
  { id: 3, wo_id: 'WO-2026-003', serial: 'SN-M450-0003', station: 'SMT',  result: 'FAIL', operator: 'นิพนธ์', note: 'ชิ้นส่วนเลื่อน', scanned_at: '2026-06-14T07:40:00Z' },
  { id: 4, wo_id: 'WO-2026-003', serial: 'SN-M450-0001', station: 'TEST', result: 'PASS', operator: 'วิชัย',  note: null,           scanned_at: '2026-06-14T08:10:00Z' },
  { id: 5, wo_id: 'WO-2026-003', serial: 'SN-M450-0002', station: 'TEST', result: 'PASS', operator: 'วิชัย',  note: null,           scanned_at: '2026-06-14T08:15:00Z' },
];
const productionUnits: any[] = [
  { id: 1, wo_id: 'WO-2026-003', serial: 'SN-M450-0001', last_station: 'TEST', last_result: 'PASS', scan_count: 2, updated_at: '2026-06-14T08:10:00Z' },
  { id: 2, wo_id: 'WO-2026-003', serial: 'SN-M450-0002', last_station: 'TEST', last_result: 'PASS', scan_count: 2, updated_at: '2026-06-14T08:15:00Z' },
  { id: 3, wo_id: 'WO-2026-003', serial: 'SN-M450-0003', last_station: 'SMT',  last_result: 'FAIL', scan_count: 1, updated_at: '2026-06-14T07:40:00Z' },
  { id: 4, wo_id: 'WO-2026-003', serial: 'SN-M450-0004', last_station: 'SMT',  last_result: 'PASS', scan_count: 1, updated_at: '2026-06-14T07:45:00Z' },
  { id: 5, wo_id: 'WO-2026-003', serial: 'SN-M450-0005', last_station: 'SMT',  last_result: 'PASS', scan_count: 1, updated_at: '2026-06-14T07:50:00Z' },
];

let _retestId = 100;
const jigRetests: any[] = [
  { id: 1, project_code: 'PCB-A100', serial: 'SN-A100-0016', status: 'REQUESTED', requested_by: 'วิชัย',    requested_at: '2026-06-14T09:00:00Z' },
  { id: 2, project_code: 'ASY-300',  serial: 'SN-A300-0005', status: 'DONE',      requested_by: 'สมศักดิ์', requested_at: '2026-06-13T10:00:00Z' },
  { id: 3, project_code: 'ASY-300',  serial: 'SN-A300-0010', status: 'REQUESTED', requested_by: 'สมศักดิ์', requested_at: '2026-06-14T08:00:00Z' },
  { id: 4, project_code: 'MOT-4500', serial: 'SN-M450-0050', status: 'REQUESTED', requested_by: 'สุรศักดิ์', requested_at: '2026-06-14T10:00:00Z' },
  { id: 5, project_code: 'PCB-A100', serial: 'SN-A100-0032', status: 'DONE',      requested_by: 'วิชัย',    requested_at: '2026-06-13T15:00:00Z' },
];

// ── Production Plan (pp_projects) ──
let _ppId = 50;
const ppBase = {
  wk: 0, date_record: null, customer: '', syn_requestor: '', work_order: '', wo_name: '', matl_coming: '',
  chk_man: false, chk_mac: false, chk_med: false, chk_mat: false,
  pd_pcba: false, pd_bbas: false, pd_test: false, pd_rma: false, pd_prep: false, pd_start_date: null, pd_finish_date: null,
  qa_test_rate: '', qa_finish_date: null, store_received: null, expected_date: null, revised_date: null,
  done: false, pd_pic: '', pic_responsible: '', team_member: 0, ok_per_day: 0, total_ng: 0, total_ok: 0, remark: '',
  st_pr_po: false, st_wait_mat: false, st_incoming: false, st_create_bo: false, st_test: false, st_rework: false, st_smt: false, st_thr: false, st_bbas: false,
};
const ppProjects: any[] = [
  { ...ppBase, id: 1, status: 'DONE', wk: 22, date_record: '2026-06-01', product_pn: '1E7D25403001', model: 'Water Level Rice - BBAS', customer: 'Toyota TH', qty: 200, work_order: 'WO-2026-001', chk_man: true, chk_mac: true, chk_med: true, chk_mat: true, pd_pcba: true, pd_bbas: true, pd_test: true, pd_start_date: '2026-06-02', pd_finish_date: '2026-06-11', qa_test_rate: '100', qa_finish_date: '2026-06-12', store_received: '2026-06-12', expected_date: '2026-06-13', done: true, pd_pic: 'Noi', team_member: 3, ok_per_day: 40, total_ng: 2, total_ok: 198, remark: 'ส่งครบ', created_at: '2026-06-01T08:00:00Z', updated_at: '2026-06-12T08:00:00Z' },
  { ...ppBase, id: 2, status: 'ON_PROCESS', wk: 24, date_record: '2026-06-10', product_pn: '1E6D25234000', model: 'SMARTNAV - BBAS', customer: 'Honda Mfg', qty: 150, work_order: 'WO-2026-002', chk_mat: true, pd_pcba: true, pd_bbas: true, pd_start_date: '2026-06-12', expected_date: '2026-06-20', pd_pic: 'Kiert', team_member: 2, ok_per_day: 21, total_ng: 1, total_ok: 147, created_at: '2026-06-10T08:00:00Z', updated_at: '2026-06-14T08:00:00Z' },
  { ...ppBase, id: 3, status: 'LATE', wk: 23, date_record: '2026-06-05', product_pn: 'MOT-4500', model: 'Motor Drive 4500', customer: 'Denso Corp', qty: 500, work_order: 'WO-2026-003', chk_man: true, pd_pcba: true, expected_date: '2026-06-12', revised_date: '2026-06-22', pd_pic: 'Run', team_member: 4, ok_per_day: 30, total_ng: 5, total_ok: 250, remark: 'รอ component', created_at: '2026-06-05T08:00:00Z', updated_at: '2026-06-14T08:00:00Z' },
  { ...ppBase, id: 4, status: 'MATL_COMING', wk: 25, date_record: '2026-06-13', product_pn: '1E4D26458000', model: 'CM2 Battery - PCBA', customer: 'AISIN', qty: 80, matl_coming: 'Components (Consign)', expected_date: '2026-06-28', pd_pic: 'Au', team_member: 2, remark: 'รอ consign part', created_at: '2026-06-13T08:00:00Z', updated_at: '2026-06-13T08:00:00Z' },
  { ...ppBase, id: 5, status: 'DONE', wk: 22, date_record: '2026-06-02', product_pn: '1E7D25410002', model: 'Water Level Rice - PCBA', customer: 'Toyota TH', qty: 300, work_order: 'WO-2026-005', wo_name: 'WL Rice Lot2', chk_man: true, chk_mac: true, chk_med: true, chk_mat: true, pd_pcba: true, pd_test: true, pd_start_date: '2026-06-03', pd_finish_date: '2026-06-10', qa_test_rate: '100', qa_finish_date: '2026-06-11', store_received: '2026-06-11', expected_date: '2026-06-12', done: true, pd_pic: 'Noi', pic_responsible: 'Somchai', team_member: 3, ok_per_day: 45, total_ng: 3, total_ok: 297, st_pr_po: true, st_incoming: true, st_smt: true, st_test: true, remark: 'ส่งครบ', created_at: '2026-06-02T08:00:00Z', updated_at: '2026-06-11T08:00:00Z' },
  { ...ppBase, id: 6, status: 'ON_PROCESS', wk: 24, date_record: '2026-06-11', product_pn: '1E6D25240003', model: 'SMARTNAV V2 - BBAS', customer: 'Honda Mfg', qty: 180, work_order: 'WO-2026-006', wo_name: 'SmartNav V2', chk_mat: true, pd_pcba: true, pd_bbas: true, pd_start_date: '2026-06-13', expected_date: '2026-06-21', pd_pic: 'Kiert', pic_responsible: 'Wichai', team_member: 2, ok_per_day: 25, total_ng: 2, total_ok: 120, st_incoming: true, st_smt: true, created_at: '2026-06-11T08:00:00Z', updated_at: '2026-06-15T08:00:00Z' },
  { ...ppBase, id: 7, status: 'LATE', wk: 23, date_record: '2026-06-06', product_pn: 'MOT-4600', model: 'Motor Drive 4600', customer: 'Denso Corp', qty: 450, work_order: 'WO-2026-007', wo_name: 'MotorDrive', chk_man: true, pd_pcba: true, expected_date: '2026-06-13', revised_date: '2026-06-23', pd_pic: 'Run', pic_responsible: 'Anucha', team_member: 4, ok_per_day: 28, total_ng: 6, total_ok: 200, st_wait_mat: true, remark: 'รอ FCT tester', created_at: '2026-06-06T08:00:00Z', updated_at: '2026-06-15T08:00:00Z' },
  { ...ppBase, id: 8, status: 'DONE', wk: 21, date_record: '2026-05-26', product_pn: 'PWR-24V-01', model: 'Power Supply 24V', customer: 'Sony TH', qty: 600, work_order: 'WO-2026-008', wo_name: 'PSU 24V', chk_man: true, chk_mac: true, chk_med: true, chk_mat: true, pd_pcba: true, pd_bbas: true, pd_test: true, pd_start_date: '2026-05-27', pd_finish_date: '2026-06-03', qa_test_rate: '100', qa_finish_date: '2026-06-04', store_received: '2026-06-04', expected_date: '2026-06-05', done: true, pd_pic: 'Ploy', pic_responsible: 'Kan', team_member: 3, ok_per_day: 60, total_ng: 4, total_ok: 596, st_pr_po: true, st_incoming: true, st_smt: true, st_thr: true, st_test: true, created_at: '2026-05-26T08:00:00Z', updated_at: '2026-06-04T08:00:00Z' },
  { ...ppBase, id: 9, status: 'ON_PROCESS', wk: 26, date_record: '2026-06-16', product_pn: 'LED-6621', model: 'LED Panel Ctrl', customer: 'Panasonic', qty: 350, work_order: 'WO-2026-009', wo_name: 'LED Panel', chk_man: true, chk_mat: true, pd_pcba: true, pd_test: true, pd_start_date: '2026-06-17', expected_date: '2026-06-27', pd_pic: 'Mint', pic_responsible: 'Tar', team_member: 3, ok_per_day: 35, total_ng: 3, total_ok: 180, st_incoming: true, st_smt: true, st_test: true, created_at: '2026-06-16T08:00:00Z', updated_at: '2026-06-18T08:00:00Z' },
  { ...ppBase, id: 10, status: 'MATL_COMING', wk: 25, date_record: '2026-06-14', product_pn: 'BMS-9903', model: 'BMS Module', customer: 'LG Energy', qty: 120, matl_coming: 'PCB + Stencil', work_order: 'WO-2026-010', wo_name: 'BMS', expected_date: '2026-06-30', pd_pic: 'Bank', pic_responsible: 'Ohm', team_member: 2, st_pr_po: true, remark: 'รอ PCB', created_at: '2026-06-14T08:00:00Z', updated_at: '2026-06-14T08:00:00Z' },
  { ...ppBase, id: 11, status: 'LATE', wk: 25, date_record: '2026-06-09', product_pn: 'SEN-4412', model: 'Sensor Hub', customer: 'Bosch', qty: 90, work_order: 'WO-2026-011', wo_name: 'SensorHub', chk_man: true, pd_test: true, expected_date: '2026-06-16', revised_date: '2026-06-26', pd_pic: 'Fern', pic_responsible: 'Guy', team_member: 2, ok_per_day: 12, total_ng: 4, total_ok: 40, st_rework: true, remark: 'rework 2 รอบ', created_at: '2026-06-09T08:00:00Z', updated_at: '2026-06-15T08:00:00Z' },
  { ...ppBase, id: 12, status: 'DONE', wk: 22, date_record: '2026-06-01', product_pn: 'RLY-1175', model: 'Relay Board', customer: 'Samsung', qty: 400, work_order: 'WO-2026-012', wo_name: 'Relay', chk_man: true, chk_mac: true, chk_med: true, chk_mat: true, pd_pcba: true, pd_bbas: true, pd_test: true, pd_start_date: '2026-06-02', pd_finish_date: '2026-06-08', qa_test_rate: '100', qa_finish_date: '2026-06-09', store_received: '2026-06-09', expected_date: '2026-06-10', done: true, pd_pic: 'Nan', pic_responsible: 'Jak', team_member: 3, ok_per_day: 50, total_ng: 0, total_ok: 400, st_pr_po: true, st_incoming: true, st_smt: true, st_thr: true, st_test: true, created_at: '2026-06-01T08:00:00Z', updated_at: '2026-06-09T08:00:00Z' },
  { ...ppBase, id: 13, status: 'ON_PROCESS', wk: 26, date_record: '2026-06-17', product_pn: 'CHG-2044', model: 'Charger Ctrl', customer: 'Anker', qty: 250, work_order: 'WO-2026-013', wo_name: 'Charger', chk_mat: true, pd_pcba: true, pd_test: true, pd_start_date: '2026-06-18', expected_date: '2026-06-28', pd_pic: 'Boss', pic_responsible: 'Ta', team_member: 2, ok_per_day: 30, total_ng: 2, total_ok: 150, st_incoming: true, st_smt: true, created_at: '2026-06-17T08:00:00Z', updated_at: '2026-06-19T08:00:00Z' },
  { ...ppBase, id: 14, status: 'MATL_COMING', wk: 27, date_record: '2026-06-18', product_pn: 'GW-7788', model: 'Gateway IoT', customer: 'Huawei', qty: 60, matl_coming: 'Consign components', expected_date: '2026-07-02', pd_pic: 'Poom', pic_responsible: 'Ice', team_member: 1, st_pr_po: true, remark: 'รอ consign', created_at: '2026-06-18T08:00:00Z', updated_at: '2026-06-18T08:00:00Z' },
];

// ── Workflow (presets + results) ──
let _wfId = 10, _wfrId = 10;
const workflows: any[] = [
  { id: 1, name: 'WL Rice - Line A', customer: 'Toyota TH', model: 'Water Level Rice', steps: ['CHECK MATERIAL', 'SMT', 'IPQC', 'TEST', 'PACKING'].map(p => ({ process: p, seconds: 30 })), created_at: '2026-06-10T08:00:00Z' },
  { id: 2, name: 'SMARTNAV - Line B', customer: 'Honda Mfg', model: 'SMARTNAV', created_at: '2026-06-11T08:00:00Z', steps: [
    { process: 'Check material (incoming)', seconds: 120, role: 'incoming', kind: 'process', timeScope: 'once' },
    { process: 'SET UP MACHINE', seconds: 1800, role: 'smt', kind: 'process', timeScope: 'once' },
    { process: 'SMT', seconds: 45, role: 'smt', kind: 'checkpoint', timeScope: 'per_unit', stations: 2, machine: 'SMT Line', failAction: 'rework', maxRetry: 2 },
    { process: 'FCT TEST', seconds: 90, role: 'smt', kind: 'checkpoint', timeScope: 'per_unit', stations: 4, machine: 'FCT Tester', failAction: 'scrap' },
    { process: 'PACKING', seconds: 25, role: 'packing', kind: 'process', timeScope: 'per_unit' },
    { process: 'STORE', seconds: 60, role: 'store', kind: 'process', timeScope: 'once' },
  ] },
  { id: 3, name: 'Motor Drive - Line C', customer: 'Denso Corp', model: 'MOT-4500', created_at: '2026-06-12T08:00:00Z', steps: [
    { process: 'Check material (incoming)', seconds: 90, role: 'incoming', kind: 'process', timeScope: 'once' },
    { process: 'SET UP LINE', seconds: 1200, role: 'smt', kind: 'process', timeScope: 'once' },
    { process: 'WAV', seconds: 60, role: 'smt', kind: 'checkpoint', timeScope: 'per_unit', failAction: 'rework', maxRetry: 1 },
    { process: 'ICT TEST', seconds: 75, role: 'smt', kind: 'checkpoint', timeScope: 'per_unit', failAction: 'back', backToIndex: 2 },
    { process: 'PACKING', seconds: 40, role: 'packing', kind: 'process', timeScope: 'per_unit' },
    { process: 'STORE', seconds: 60, role: 'store', kind: 'process', timeScope: 'once' },
  ] },
  { id: 4, name: 'Sensor - Line A', customer: 'AISIN', model: 'SEN-100', created_at: '2026-06-13T08:00:00Z', steps: [
    { process: 'Check material (incoming)', seconds: 60, role: 'incoming', kind: 'process', timeScope: 'once' },
    { process: 'SMT', seconds: 35, role: 'smt', kind: 'checkpoint', timeScope: 'per_unit', failAction: 'rework', maxRetry: 3 },
    { process: 'TEST', seconds: 50, role: 'smt', kind: 'checkpoint', timeScope: 'per_unit', failAction: 'hold' },
    { process: 'PACKING', seconds: 20, role: 'packing', kind: 'process', timeScope: 'per_unit' },
    { process: 'STORE', seconds: 45, role: 'store', kind: 'process', timeScope: 'once' },
  ] },
  { id: 5, name: 'Cable Assy - Line D', customer: 'Sumitomo', model: 'CAB-200', created_at: '2026-06-14T08:00:00Z', steps: [
    { process: 'Check material (incoming)', seconds: 80, role: 'incoming', kind: 'process', timeScope: 'once' },
    { process: 'INSERT', seconds: 40, role: 'smt', kind: 'checkpoint', timeScope: 'per_unit', failAction: 'rework', maxRetry: 2 },
    { process: 'SOLDERING', seconds: 55, role: 'smt', kind: 'checkpoint', timeScope: 'per_unit', failAction: 'rework', maxRetry: 2 },
    { process: 'FQC', seconds: 30, role: 'smt', kind: 'checkpoint', timeScope: 'per_unit', failAction: 'scrap' },
    { process: 'PACKING', seconds: 25, role: 'packing', kind: 'process', timeScope: 'per_unit' },
    { process: 'STORE', seconds: 50, role: 'store', kind: 'process', timeScope: 'once' },
  ] },
  // ── ผลิต PCBA: สายเต็ม SMT + THT (Solder Paste → SPI → Pick&Place → Reflow → AOI → THT → Wave → ICT → FCT) ──
  { id: 6, name: 'PCBA SMT+THT - Full Line', customer: 'Thanason Electronics', model: 'PCBA-X200', created_at: '2026-06-20T08:00:00Z', steps: [
    { process: 'Check material (incoming)', seconds: 120, role: 'incoming', kind: 'process', timeScope: 'once' },
    { process: 'SET UP MACHINE', seconds: 1800, role: 'setup', kind: 'process', timeScope: 'once' },
    { process: 'SOLDER PASTE PRINT', seconds: 18, role: 'smt', kind: 'process', timeScope: 'per_unit', stations: 1, machine: 'Stencil Printer' },
    { process: 'SPI (Solder Paste Inspection)', seconds: 12, role: 'smt', kind: 'checkpoint', timeScope: 'per_unit', stations: 1, failAction: 'rework', maxRetry: 2 },
    { process: 'SMT PICK & PLACE', seconds: 40, role: 'smt', kind: 'process', timeScope: 'per_unit', stations: 2, machine: 'SMT Line' },
    { process: 'REFLOW OVEN', seconds: 30, role: 'smt', kind: 'process', timeScope: 'per_unit', stations: 1, machine: 'Reflow Oven' },
    { process: 'AOI (Optical Inspection)', seconds: 20, role: 'smt', kind: 'checkpoint', timeScope: 'per_unit', stations: 1, failAction: 'back', backToIndex: 4 },
    { process: 'THT INSERTION', seconds: 45, role: 'smt', kind: 'process', timeScope: 'per_unit', stations: 3 },
    { process: 'WAVE SOLDERING', seconds: 35, role: 'smt', kind: 'process', timeScope: 'per_unit', stations: 1, machine: 'Wave Solder' },
    { process: 'ICT TEST', seconds: 60, role: 'smt', kind: 'checkpoint', timeScope: 'per_unit', stations: 2, machine: 'ICT Tester', failAction: 'rework', maxRetry: 2 },
    { process: 'FCT TEST', seconds: 90, role: 'smt', kind: 'checkpoint', timeScope: 'per_unit', stations: 4, machine: 'FCT Tester', failAction: 'scrap' },
    { process: 'PACKING', seconds: 25, role: 'packing', kind: 'process', timeScope: 'per_unit' },
    { process: 'STORE', seconds: 60, role: 'store', kind: 'process', timeScope: 'once' },
  ] },
  // ── ผลิต PCBA: สาย SMT ล้วน (บอร์ดชิปล้วน ไม่มี THT/Wave) — สายเร็ว ──
  { id: 7, name: 'PCBA SMT Only - Quick Line', customer: 'Thanason Electronics', model: 'PCBA-S50', created_at: '2026-06-21T08:00:00Z', steps: [
    { process: 'Check material (incoming)', seconds: 90, role: 'incoming', kind: 'process', timeScope: 'once' },
    { process: 'SET UP MACHINE', seconds: 1200, role: 'setup', kind: 'process', timeScope: 'once' },
    { process: 'SOLDER PASTE PRINT', seconds: 15, role: 'smt', kind: 'process', timeScope: 'per_unit', stations: 1, machine: 'Stencil Printer' },
    { process: 'SPI (Solder Paste Inspection)', seconds: 10, role: 'smt', kind: 'checkpoint', timeScope: 'per_unit', stations: 1, failAction: 'rework', maxRetry: 2 },
    { process: 'SMT PICK & PLACE', seconds: 35, role: 'smt', kind: 'process', timeScope: 'per_unit', stations: 2, machine: 'SMT Line' },
    { process: 'REFLOW OVEN', seconds: 28, role: 'smt', kind: 'process', timeScope: 'per_unit', stations: 1, machine: 'Reflow Oven' },
    { process: 'AOI (Optical Inspection)', seconds: 18, role: 'smt', kind: 'checkpoint', timeScope: 'per_unit', stations: 1, failAction: 'rework', maxRetry: 1 },
    { process: 'FCT TEST', seconds: 70, role: 'smt', kind: 'checkpoint', timeScope: 'per_unit', stations: 3, machine: 'FCT Tester', failAction: 'scrap' },
    { process: 'PACKING', seconds: 20, role: 'packing', kind: 'process', timeScope: 'per_unit' },
    { process: 'STORE', seconds: 45, role: 'store', kind: 'process', timeScope: 'once' },
  ] },
];
const workflowResults: any[] = [
  { id: 1, serial: 'SN-0001', customer: 'Toyota TH', model: 'Water Level Rice', sequence: 'CHECK MATERIAL(30s) → SMT(30s) → TEST(30s)', result: 'PASS', total_sec: 90, line: 'internal', created_at: '2026-06-14T08:00:00Z' },
  { id: 2, serial: 'SN-0002', customer: 'Honda Mfg', model: 'SMARTNAV', sequence: 'SMT(20s) → TEST❌(15s)', result: 'FAIL', total_sec: 35, line: 'internal', created_at: '2026-06-14T09:00:00Z' },
  { id: 3, serial: 'SN-0003', customer: 'Honda Mfg', model: 'SMARTNAV', sequence: 'SMT(45s) → FCT TEST(90s) → PACKING(25s)', result: 'PASS', total_sec: 160, line: 'external', created_at: '2026-06-14T09:30:00Z' },
  { id: 4, serial: 'SN-0004', customer: 'Denso Corp', model: 'MOT-4500', sequence: 'WAV(60s) → ICT TEST(75s) → PACKING(40s)', result: 'PASS', total_sec: 175, line: 'external', created_at: '2026-06-14T10:00:00Z' },
  { id: 5, serial: 'SN-0005', customer: 'AISIN', model: 'SEN-100', sequence: 'SMT(35s) → TEST❌(50s)', result: 'FAIL', total_sec: 85, line: 'internal', created_at: '2026-06-14T10:30:00Z' },
  { id: 6, serial: 'PCBA-0001', customer: 'Thanason Electronics', model: 'PCBA-X200', sequence: 'SOLDER PASTE PRINT(18s) → SPI(12s) → SMT PICK & PLACE(40s) → REFLOW(30s) → AOI(20s) → THT(45s) → WAVE(35s) → ICT(60s) → FCT(90s) → PACKING(25s)', result: 'PASS', total_sec: 375, line: 'internal', created_at: '2026-06-20T13:00:00Z' },
  { id: 7, serial: 'PCBA-0002', customer: 'Thanason Electronics', model: 'PCBA-X200', sequence: 'SPI(12s) → AOI❌(20s)', result: 'FAIL', total_sec: 32, line: 'internal', created_at: '2026-06-20T13:20:00Z' },
  { id: 8, serial: 'PCBA-0003', customer: 'Thanason Electronics', model: 'PCBA-S50', sequence: 'SOLDER PASTE PRINT(15s) → SPI(10s) → SMT PICK & PLACE(35s) → REFLOW(28s) → AOI(18s) → FCT(70s) → PACKING(20s)', result: 'PASS', total_sec: 196, line: 'external', created_at: '2026-06-21T14:00:00Z' },
];

function ok(data: unknown) { return HttpResponse.json({ status: 'success', data }); }
function okSuccess(extra?: object) { return HttpResponse.json({ status: 'success', ...extra }); }

// ── Handlers ──────────────────────────────────────────────────────────────────

export const handlers = [

  // ── Health ───────────────────────────────────────────────────────────────
  http.get('/api/health', () => HttpResponse.json({ status: 'ok', version: '1.0.0-demo' })),

  // ── Production Plan (pp_projects) ─────────────────────────────────────────
  http.get('/api/pp/projects', ({ request }) => {
    const u = new URL(request.url); const g = (k: string) => u.searchParams.get(k);
    let rows = [...ppProjects];
    if (g('status')) rows = rows.filter(r => r.status === g('status'));
    if (g('customer')) rows = rows.filter(r => (r.customer || '').toLowerCase().includes(g('customer')!.toLowerCase()));
    if (g('product_pn')) rows = rows.filter(r => (r.product_pn || '').toLowerCase().includes(g('product_pn')!.toLowerCase()));
    if (g('model')) rows = rows.filter(r => (r.model || '').toLowerCase().includes(g('model')!.toLowerCase()));
    if (g('date_from')) rows = rows.filter(r => (r.date_record || '') >= g('date_from')!);
    if (g('date_to')) rows = rows.filter(r => (r.date_record || '') <= g('date_to')!);
    return ok(rows);
  }),
  http.post('/api/pp/projects', async ({ request }) => {
    const b: any = await request.json();
    const row = { ...ppBase, ...b, id: ++_ppId, created_at: now(), updated_at: now() };
    ppProjects.unshift(row);
    return HttpResponse.json({ status: 'success', data: row }, { status: 201 });
  }),
  http.put('/api/pp/projects/:id', async ({ params, request }) => {
    const b: any = await request.json();
    const row = ppProjects.find(r => String(r.id) === String(params.id));
    if (!row) return new HttpResponse(null, { status: 404 });
    Object.assign(row, b, { updated_at: now() });
    return ok(row);
  }),
  http.delete('/api/pp/projects/:id', ({ params }) => {
    const i = ppProjects.findIndex(r => String(r.id) === String(params.id));
    if (i >= 0) ppProjects.splice(i, 1);
    return ok({ deleted: true });
  }),

  // ── Workflow (presets + results) ──────────────────────────────────────────
  http.get('/api/workflow', () => ok(workflows)),
  http.post('/api/workflow', async ({ request }) => {
    const b: any = await request.json();
    const row = { id: ++_wfId, name: b.name || '', customer: b.customer || '', model: b.model || '', steps: b.steps || [], created_at: now() };
    workflows.unshift(row);
    return HttpResponse.json({ status: 'success', data: row }, { status: 201 });
  }),
  http.delete('/api/workflow/:id', ({ params }) => {
    const i = workflows.findIndex(w => String(w.id) === String(params.id));
    if (i >= 0) workflows.splice(i, 1);
    return ok({ deleted: true });
  }),
  http.get('/api/workflow/results', () => ok(workflowResults)),
  http.post('/api/workflow/results', async ({ request }) => {
    const b: any = await request.json();
    const row = { id: ++_wfrId, serial: b.serial, customer: b.customer || '', model: b.model || '', sequence: b.sequence || '', result: b.result === 'FAIL' ? 'FAIL' : 'PASS', total_sec: Number(b.total_sec) || 0, line: (b.line === 'external' || b.line === 'mix') ? b.line : 'internal', created_at: now() };
    workflowResults.unshift(row);
    return HttpResponse.json({ status: 'success', data: row }, { status: 201 });
  }),
  http.delete('/api/workflow/results/:id', ({ params }) => {
    const i = workflowResults.findIndex(r => String(r.id) === String(params.id));
    if (i >= 0) workflowResults.splice(i, 1);
    return ok({ deleted: true });
  }),

  // ── Jig: ลบโปรเจกต์ ──
  http.delete('/api/jig/projects/:code', ({ params }) => {
    const i = jigProjects.findIndex(p => p.project_code === params.code);
    if (i >= 0) jigProjects.splice(i, 1);
    return ok({ deleted: true });
  }),

  // ── WO Board ─────────────────────────────────────────────────────────────
  http.get('/api/wo/board', () => ok(woBoard)),
  http.patch('/api/wo/board/:woId', async ({ params, request }) => {
    const body: any = await request.json();
    const wo = woBoard.find(w => w.wo_no === params.woId);
    if (!wo) return new HttpResponse(null, { status: 404 });
    Object.assign(wo, body, { updated_at: now() });
    return ok(wo);
  }),
  http.post('/api/wo/board', async ({ request }) => {
    const body: any = await request.json();
    const wo = { id: ++_woId, wo_no: `WO-2026-${String(_woId).padStart(3,'0')}`, product_name: body.product_name, customer: body.customer ?? '', qty: body.qty, due_date: body.due_date ?? null, current_step: body.current_step ?? 'DRAFT', station: body.station ?? null, qty_good: 0, actual_qty: null, fai_inspector: null, fai_approver: null, fai_passed: false, created_at: now(), updated_at: now() };
    woBoard.push(wo);
    return ok(wo);
  }),

  // ── WO List (Planning) ────────────────────────────────────────────────────
  http.get('/api/wo/list', () => ok(woBoard.map(w => ({ wo_id: w.id, wo_no: w.wo_no, product_name: w.product_name, qty: w.qty, status: w.current_step === 'CLOSED' ? 'DONE' : w.current_step === 'DRAFT' ? 'PENDING' : 'IN_PROGRESS', created_at: w.created_at, due_date: null })))),
  http.get('/api/wo/:woId', ({ params }) => {
    const wo = woBoard.find(w => w.wo_no === params.woId || String(w.id) === params.woId);
    if (!wo) return new HttpResponse(null, { status: 404 });
    return ok(wo);
  }),

  // ── Pre-WO ────────────────────────────────────────────────────────────────
  http.get('/api/wo/req/list', () => ok(preWoList)),
  http.post('/api/wo/req', async ({ request }) => {
    const body: any = await request.json();
    const req = { req_id: `REQ-${String(++_preWoId).padStart(3,'0')}`, ...body, status: 'PENDING', created_at: now() };
    preWoList.push(req);
    return ok(req);
  }),
  http.patch('/api/wo/req/:reqId/approve', ({ params }) => {
    const req = preWoList.find(r => r.req_id === params.reqId);
    if (req) req.status = 'APPROVED';
    return okSuccess();
  }),
  http.post('/api/wo/convert', async ({ request }) => {
    const body: any = await request.json();
    const req = preWoList.find(r => r.req_id === body.req_id);
    if (req) req.status = 'CONVERTED';
    return okSuccess();
  }),

  // ── BOM ───────────────────────────────────────────────────────────────────
  http.get('/api/bom/headers', () => ok(boms)),
  http.get('/api/bom/:bomId/review', ({ params }) => {
    const bom = boms.find(b => b.bom_id === params.bomId);
    if (!bom) return new HttpResponse(null, { status: 404 });
    return ok({ ...bom, lines: bomLines[bom.bom_id] ?? [] });
  }),
  http.put('/api/bom/:bomId/approve', ({ params }) => {
    const bom = boms.find(b => b.bom_id === params.bomId);
    if (bom) { bom.approved = true; bom.approved_at = now(); }
    return okSuccess();
  }),

  // ── Production Report ─────────────────────────────────────────────────────
  http.get('/api/report/list', () => ok(reports)),
  http.post('/api/report', () => {
    const r = { id: String(++_reportId), code: 'NEW-001', customer: '', status: 'PENDING', qty: 0, delivery: '', stage: 'Planning', is_completed: false };
    reports.push(r);
    return ok(r);
  }),
  http.patch('/api/report/:id', async ({ params, request }) => {
    const body: any = await request.json();
    const r = reports.find(x => x.id === params.id);
    if (r) Object.assign(r, body);
    return okSuccess();
  }),
  http.delete('/api/report/:id', ({ params }) => {
    const idx = reports.findIndex(x => x.id === params.id);
    if (idx !== -1) reports.splice(idx, 1);
    return okSuccess();
  }),

  // ── 4M Change (CR) ────────────────────────────────────────────────────────
  http.get('/api/cr/list', () => ok(crList)),
  http.post('/api/cr', async ({ request }) => {
    const body: any = await request.json();
    const cr = { id: ++_crId, cr_no: `CR-2026-${String(_crId).padStart(3,'0')}`, m_type: body.m_type, wo_ref: body.wo_ref ?? '', description: body.description ?? '', impact: body.impact ?? '', state: 'DRAFT', g1_note: null, g1_at: null, g2_note: null, g2_at: null, g3_note: null, g3_at: null, created_at: now() };
    crList.push(cr);
    return ok(cr);
  }),
  http.put('/api/cr/:id/gate-g1', async ({ params, request }) => {
    const body: any = await request.json();
    const cr = crList.find(c => c.id === Number(params.id));
    if (cr) { cr.g1_note = body.note; cr.g1_at = now(); cr.state = 'G1_REVIEW'; }
    return ok(cr);
  }),
  http.put('/api/cr/:id/gate-g2', async ({ params, request }) => {
    const body: any = await request.json();
    const cr = crList.find(c => c.id === Number(params.id));
    if (cr) { cr.g2_note = body.note; cr.g2_at = now(); cr.state = 'G2_APPROVED'; }
    return ok(cr);
  }),
  http.put('/api/cr/:id/gate-g3', async ({ params, request }) => {
    const body: any = await request.json();
    const cr = crList.find(c => c.id === Number(params.id));
    if (cr) { cr.g3_note = body.note; cr.g3_at = now(); cr.state = 'ACTIVE'; }
    return ok(cr);
  }),

  // ── QC Results ────────────────────────────────────────────────────────────
  http.get('/api/qc/results', ({ request }) => {
    const url = new URL(request.url);
    const woId = url.searchParams.get('wo_id');
    const data = woId ? qcResults.filter(q => q.wo_id === woId) : qcResults;
    return ok(data);
  }),
  http.post('/api/qc/result', async ({ request }) => {
    const body: any = await request.json();
    const r = { id: ++_qcId, wo_id: body.wo_id, lot_no: body.lot_no, qty_checked: body.qty_checked, qty_pass: body.qty_pass, qty_fail: body.qty_fail, overall: body.overall, defect_desc: body.defect_desc ?? null, remark: body.remark ?? null, created_at: now(), verify_id: null, verdict: null, verified_by: null, verified_at: null };
    qcResults.push(r);
    return ok(r);
  }),
  http.get('/api/qc/transfer-verify/:id', ({ params }) => {
    const v = transferVerify[Number(params.id)];
    if (!v) return new HttpResponse(null, { status: 404 });
    return ok(v);
  }),
  http.post('/api/qc/transfer-verify', async ({ request }) => {
    const body: any = await request.json();
    const v = { id: ++_auditId, qc_result_id: body.qc_result_id, wo_id: 'WO-DEMO', verdict: body.verdict, note: body.note, verified_by: body.verified_by, created_at: now(), lot_no: 'LOT-DEMO', qty_checked: 0, qty_pass: 0, qty_fail: 0, overall: 'PASS', defect_desc: null, qc_created_at: now() };
    transferVerify[body.qc_result_id] = v;
    const qr = qcResults.find(q => q.id === body.qc_result_id);
    if (qr) { qr.verify_id = v.id; qr.verdict = body.verdict; qr.verified_by = body.verified_by; qr.verified_at = now(); }
    return ok(v);
  }),

  // ── Rework ────────────────────────────────────────────────────────────────
  http.get('/api/rework/list', () => ok(reworkList)),
  http.post('/api/rework/repair', async ({ request }) => {
    const body: any = await request.json();
    const r = { id: ++_reworkId, qc_result_id: body.qc_result_id, wo_id: 'WO-DEMO', defect_type: body.defect_type, assigned_to: body.assigned_to, due_date: body.due_date ?? null, status: 'OPEN', lot_no: 'LOT-DEMO', qc_overall: 'FAIL', created_at: now() };
    reworkList.push(r);
    return ok(r);
  }),
  http.patch('/api/rework/:id/status', async ({ params, request }) => {
    const body: any = await request.json();
    const t = reworkList.find(x => String(x.id) === String(params.id));
    if (!t) return new HttpResponse(null, { status: 404 });
    t.status = body.status;
    return ok(t);
  }),

  // ── OBA ───────────────────────────────────────────────────────────────────
  http.get('/api/oba/list', () => ok(obaRecords)),
  http.post('/api/oba', async ({ request }) => {
    const body: any = await request.json();
    const r = { id: obaRecords.length + 1, ...body, created_at: now() };
    obaRecords.push(r);
    return ok(r);
  }),

  // ── QC (Board) ────────────────────────────────────────────────────────────
  http.get('/api/qc/list', () => ok(qcRecords)),
  http.post('/api/qc', async ({ request }) => {
    const body: any = await request.json();
    const r = { id: qcRecords.length + 1, ...body, created_at: now() };
    qcRecords.push(r);
    return ok(r);
  }),

  // ── Routing History ───────────────────────────────────────────────────────
  http.get('/api/routing/list', () => ok(routingRecords)),
  http.post('/api/routing', async ({ request }) => {
    const body: any = await request.json();
    const r = { id: routingRecords.length + 1, serial: body.serial, sequence: body.sequence, result: body.result, total_sec: body.total_sec, created_at: now() };
    routingRecords.push(r);
    return ok(r);
  }),
  http.delete('/api/routing/:id', ({ params }) => {
    const idx = routingRecords.findIndex(r => String(r.id) === params.id);
    if (idx !== -1) routingRecords.splice(idx, 1);
    return okSuccess();
  }),

  // ── Notifications ─────────────────────────────────────────────────────────
  http.get('/api/notifications/unread-count', () => {
    return HttpResponse.json({ status: 'success', count: notifications.filter(n => !n.is_read).length });
  }),
  http.get('/api/notifications', ({ request }) => {
    const url = new URL(request.url);
    const unreadOnly = url.searchParams.get('unread_only') === 'true';
    const data = unreadOnly ? notifications.filter(n => !n.is_read) : notifications;
    return ok(data);
  }),
  http.post('/api/notifications/:id/read', ({ params }) => {
    const n = notifications.find(x => x.id === Number(params.id));
    if (n) n.is_read = true;
    return okSuccess();
  }),
  http.post('/api/notifications/read-all', () => {
    notifications.forEach(n => { n.is_read = true; });
    return okSuccess();
  }),

  // ── SCM Cases ─────────────────────────────────────────────────────────────
  http.get('/api/scm/cases', () => HttpResponse.json({ success: true, cases: scmCases })),
  http.post('/api/scm/cases', async ({ request }) => {
    const body: any = await request.json();
    const c = { case_id: body.case_id || `SCM-2026-${String(++_scmId).padStart(3,'0')}`, lot_uid: body.lot_uid, product: body.product, defect_type: body.defect_type, qty_ng: body.qty_ng, status: 'OPEN', created_at: now(), resolved_at: null, dispositions: [] };
    scmCases.push(c);
    return HttpResponse.json({ success: true, case: c });
  }),
  http.put('/api/scm/cases/:caseId/resolve', ({ params }) => {
    const c = scmCases.find(x => x.case_id === params.caseId);
    if (c) { c.status = 'CLOSED'; c.resolved_at = now(); }
    return HttpResponse.json({ success: true });
  }),
  http.post('/api/scm/dispositions', async ({ request }) => {
    const body: any = await request.json();
    const c = scmCases.find(x => x.case_id === body.case_id);
    const d = { id: Date.now(), action: body.action, qty: body.qty, note: body.note, created_at: now() };
    if (c) c.dispositions.push(d);
    return HttpResponse.json({ success: true, disposition: d });
  }),
  http.post('/api/scm/lots/split', async ({ request }) => {
    const body: any = await request.json();
    const split = { original_uid: body.lot_uid, ok_uid: `LOT-OK-${Date.now()}`, ng_uid: `LOT-NG-${Date.now()}`, qty_ok: body.qty_ok, qty_ng: body.qty_ng };
    return HttpResponse.json({ success: true, split });
  }),

  // ── Admin Users ───────────────────────────────────────────────────────────
  http.get('/api/admin/users', () => ok(adminUsers)),
  http.post('/api/admin/users', async ({ request }) => {
    const body: any = await request.json();
    const u = { id: ++_adminUserId, username: body.username, full_name: body.full_name, role: body.role, is_active: true, permissions: Array.isArray(body.permissions) ? body.permissions : [], created_at: now() };
    adminUsers.push(u);
    auditLogs.push({ id: ++_auditId, actor: 'admin', action: 'CREATE_USER', target_type: 'app_user', target_id: String(u.id), detail: `สร้างผู้ใช้ ${u.username}`, created_at: now() });
    return ok(u);
  }),
  http.put('/api/admin/users/:id', async ({ params, request }) => {
    const body: any = await request.json();
    const u = adminUsers.find(x => x.id === Number(params.id));
    if (u) Object.assign(u, body);
    return ok(u);
  }),
  http.delete('/api/admin/users/:id', ({ params }) => {
    const idx = adminUsers.findIndex(x => x.id === Number(params.id));
    if (idx !== -1) {
      const [u] = adminUsers.splice(idx, 1);
      auditLogs.push({ id: ++_auditId, actor: 'admin', action: 'DELETE_USER', target_type: 'app_user', target_id: String(u.id), detail: `ลบผู้ใช้ ${u.username}`, created_at: now() });
    }
    return okSuccess();
  }),
  http.get('/api/admin/audit-log', ({ request }) => {
    const url = new URL(request.url);
    const actor = url.searchParams.get('actor')?.toLowerCase();
    const action = url.searchParams.get('action')?.toLowerCase();
    let data = [...auditLogs].reverse();
    if (actor) data = data.filter(l => l.actor.toLowerCase().includes(actor));
    if (action) data = data.filter(l => l.action.toLowerCase().includes(action));
    return ok(data);
  }),

  // ── Traceability ──────────────────────────────────────────────────────────
  http.get('/api/jumbo/serials', () => ok(Object.keys(TRACES))),
  http.get('/api/jumbo/trace/:serial', ({ params }) => {
    const t = TRACES[params.serial as string];
    if (!t) return HttpResponse.json({ status: 'error', message: `ไม่พบ serial: ${params.serial}` }, { status: 404 });
    return ok(t);
  }),
  http.get('/api/jumbo/packing/boxes', () => ok(Object.values(BOXES).map(b => ({ box_id: b.box_id, product: b.product, wo: b.wo, packed_at: b.packed_at, serial_count: b.items.length })))),
  http.get('/api/jumbo/packing/boxes/:boxId', ({ params }) => {
    const b = BOXES[params.boxId as string];
    if (!b) return new HttpResponse(null, { status: 404 });
    return ok(b);
  }),
  http.get('/api/jumbo/report/daily', () => ok(dailyReport)),

  // ── Jig Test ─────────────────────────────────────────────────────────────
  http.get('/api/jig/projects', () => ok(jigProjects)),
  http.get('/api/jig/projects/:code', ({ params }) => {
    const p = jigProjects.find(x => x.project_code === params.code);
    if (!p) return new HttpResponse(null, { status: 404 });
    return ok(p);
  }),
  http.get('/api/jig/projects/:code/records', ({ params, request }) => {
    const url = new URL(request.url);
    const result = url.searchParams.get('result');
    let recs = jigRecords[params.code as string] ?? [];
    if (result) recs = recs.filter((r: any) => r.result === result);
    return ok(recs);
  }),
  http.get('/api/jig/projects/:code/timeseries', ({ params }) => {
    return ok(jigTimeseries(params.code as string));
  }),
  http.get('/api/jig/projects/:code/retests', ({ params }) => {
    return ok(jigRetests.filter((r: any) => r.project_code === params.code));
  }),
  http.post('/api/jig/projects/:code/retest', async ({ params, request }) => {
    const b = await request.json() as any;
    if (!b.serial) return HttpResponse.json({ status: 'error', message: 'serial required' }, { status: 400 });
    const row = { id: ++_retestId, project_code: params.code as string, serial: b.serial, status: 'REQUESTED', requested_by: b.requested_by || '', requested_at: new Date().toISOString() };
    jigRetests.unshift(row);
    return HttpResponse.json({ status: 'success', data: row }, { status: 201 });
  }),

  // ── Incoming / Kitting ───────────────────────────────────────────────────
  http.get('/api/inventory/lots', ({ request }) => {
    const status = new URL(request.url).searchParams.get('status');
    const rows = status ? inventoryLots.filter(l => l.status === status) : inventoryLots;
    return ok([...rows].sort((a, b) => b.received_at.localeCompare(a.received_at)));
  }),
  http.post('/api/inventory/receive', async ({ request }) => {
    const b = await request.json() as any;
    const qty = Number(b.qty);
    if (!b.part_no || !b.lot_no || !qty || qty <= 0) return HttpResponse.json({ status: 'error', message: 'part_no, lot_no, qty(>0) required' }, { status: 400 });
    const row = { id: ++_lotId, part_no: b.part_no, part_name: b.part_name || '', lot_no: b.lot_no, qty_received: qty, qty_available: qty, status: 'PENDING', note: null, received_at: new Date().toISOString(), reviewed_at: null };
    inventoryLots.push(row);
    return HttpResponse.json({ status: 'success', data: row }, { status: 201 });
  }),
  http.post('/api/inventory/lots/:id/review', async ({ params, request }) => {
    const b = await request.json() as any;
    if (!['APPROVED', 'REJECTED'].includes(b.status)) return HttpResponse.json({ status: 'error', message: 'status(APPROVED|REJECTED) required' }, { status: 400 });
    const lot = inventoryLots.find(l => l.id === Number(params.id) && l.status === 'PENDING');
    if (!lot) return HttpResponse.json({ status: 'error', message: 'ไม่พบล็อต PENDING นี้' }, { status: 404 });
    lot.status = b.status;
    if (b.note) lot.note = b.note;
    if (b.status === 'REJECTED') lot.qty_available = 0;
    lot.reviewed_at = new Date().toISOString();
    return ok(lot);
  }),
  http.delete('/api/inventory/lots/:id', ({ params }) => {
    const idx = inventoryLots.findIndex(l => l.id === Number(params.id));
    if (idx === -1) return HttpResponse.json({ status: 'error', message: 'ไม่พบล็อตนี้' }, { status: 404 });
    inventoryLots.splice(idx, 1);
    return HttpResponse.json({ status: 'success' });
  }),
  http.get('/api/inventory/stock', () => {
    const byPart: Record<string, any> = {};
    inventoryLots.filter(l => l.status === 'APPROVED' && l.qty_available > 0).forEach(l => {
      if (!byPart[l.part_no]) byPart[l.part_no] = { part_no: l.part_no, part_name: l.part_name, qty_available: 0 };
      byPart[l.part_no].qty_available += l.qty_available;
    });
    return ok(Object.values(byPart));
  }),
  http.get('/api/inventory/issues', ({ request }) => {
    const woId = new URL(request.url).searchParams.get('wo_id');
    const rows = woId ? kittingIssues.filter(i => i.wo_id === woId) : kittingIssues;
    return ok([...rows].sort((a, b) => b.issued_at.localeCompare(a.issued_at)));
  }),
  http.post('/api/inventory/issue', async ({ request }) => {
    const b = await request.json() as any;
    const need = Number(b.qty);
    if (!b.wo_id || !b.part_no || !need || need <= 0) return HttpResponse.json({ status: 'error', message: 'wo_id, part_no, qty(>0) required' }, { status: 400 });
    const lots = inventoryLots.filter(l => l.part_no === b.part_no && l.status === 'APPROVED' && l.qty_available > 0)
      .sort((a, b2) => a.received_at.localeCompare(b2.received_at));
    const totalAvail = lots.reduce((s, l) => s + l.qty_available, 0);
    if (totalAvail < need) return HttpResponse.json({ status: 'error', message: `stock ไม่พอ: ต้องการ ${need} มีพร้อมเบิก ${totalAvail}` }, { status: 409 });
    let remaining = need;
    const issued = [];
    for (const lot of lots) {
      if (remaining <= 0) break;
      const take = Math.min(lot.qty_available, remaining);
      lot.qty_available -= take;
      const row = { id: ++_issueId, wo_id: b.wo_id, part_no: b.part_no, qty: take, lot_no: lot.lot_no, issued_at: new Date().toISOString() };
      kittingIssues.push(row);
      issued.push(row);
      remaining -= take;
    }
    return HttpResponse.json({ status: 'success', data: issued }, { status: 201 });
  }),

  // ── Production Scan ──────────────────────────────────────────────────────
  http.post('/api/production/scan', async ({ request }) => {
    const b = await request.json() as any;
    if (!b.wo_id || !b.serial || !b.station || !['PASS', 'FAIL'].includes(b.result)) {
      return HttpResponse.json({ status: 'error', message: 'wo_id, serial, station, result(PASS|FAIL) required' }, { status: 400 });
    }
    const now = new Date().toISOString();
    productionScans.push({ id: ++_scanId, wo_id: b.wo_id, serial: b.serial, station: b.station, result: b.result, operator: b.operator || '', note: b.note || null, scanned_at: now });
    let unit = productionUnits.find(u => u.wo_id === b.wo_id && u.serial === b.serial);
    if (unit) {
      unit.last_station = b.station; unit.last_result = b.result; unit.scan_count += 1; unit.updated_at = now;
    } else {
      unit = { id: productionUnits.length + 1, wo_id: b.wo_id, serial: b.serial, last_station: b.station, last_result: b.result, scan_count: 1, updated_at: now };
      productionUnits.push(unit);
    }
    return HttpResponse.json({ status: 'success', data: unit }, { status: 201 });
  }),
  http.get('/api/production/units', ({ request }) => {
    const woId = new URL(request.url).searchParams.get('wo_id');
    const rows = woId ? productionUnits.filter(u => u.wo_id === woId) : productionUnits;
    return ok([...rows].sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
  }),
  http.get('/api/production/scans', ({ request }) => {
    const url = new URL(request.url);
    const woId = url.searchParams.get('wo_id');
    const serial = url.searchParams.get('serial');
    const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 200);
    let rows = productionScans;
    if (woId)   rows = rows.filter(s => s.wo_id === woId);
    if (serial) rows = rows.filter(s => s.serial === serial);
    return ok([...rows].sort((a, b) => b.scanned_at.localeCompare(a.scanned_at)).slice(0, limit));
  }),

  // ── Auth (demo) ──────────────────────────────────────────────────────────
  http.post('/api/auth/login', async ({ request }) => {
    const b = await request.json() as any;
    const DEMO: Record<string, { role: string; name: string }> = {
      admin:   { role: 'ADMIN',  name: 'ผู้ดูแลระบบ' },
      member1: { role: 'MEMBER', name: 'วิชัย สุขใจ' },
      viewer1: { role: 'VIEWER', name: 'สมหมาย ดีใจ' },
    };
    const u = DEMO[b.username];
    if (!u || b.password !== b.username) {
      return HttpResponse.json({ status: 'error', message: 'username หรือ password ไม่ถูกต้อง' }, { status: 401 });
    }
    // permissions: ถ้ามี record ใน adminUsers ใช้ค่านั้น ไม่งั้นว่าง (= ใช้ค่าตาม role)
    const rec = adminUsers.find(x => x.username === b.username);
    const permissions = rec ? rec.permissions : [];
    auditLogs.push({ id: ++_auditId, actor: b.username, action: 'LOGIN', target_type: null, target_id: null, detail: 'เข้าสู่ระบบสำเร็จ', created_at: now() });
    return ok({ id: rec?.id ?? 1, username: b.username, fullName: u.name, role: u.role, permissions, token: btoa(`${b.username}:${u.role}:demo`) });
  }),

  // ── BOM create (demo) ──────────────────────────────────────────────────────
  http.post('/api/bom', async ({ request }) => {
    const b = await request.json() as any;
    const id = 'BOM-' + String(boms.length + 1).padStart(3, '0');
    boms.push({ bom_id: id, name: b.name, version: b.version || '1.0', approved: false, approved_at: null });
    return HttpResponse.json({ status: 'success', data: { bom_id: id, name: b.name, version: b.version, approved: false } }, { status: 201 });
  }),

  // ── WO lots (demo) ──────────────────────────────────────────────────────────
  http.get('/api/wo/:woNo/lots', () => ok([])),

  // ── Jig create project + record (demo) ──────────────────────────────────────
  http.post('/api/jig/projects', async ({ request }) => {
    const b = await request.json() as any;
    jigProjects.push({ id: jigProjects.length + 1, project_code: b.project_code, name: b.name, jig_id: b.jig_id || '', is_active: true, test_type: b.test_type === 'FCT' ? 'FCT' : 'ICT', total: 0, pass_count: 0, fail_count: 0, pass_rate: 0 });
    jigRecords[b.project_code] = [];
    return HttpResponse.json({ status: 'success', data: { project_code: b.project_code, name: b.name } }, { status: 201 });
  }),
  http.post('/api/jig/projects/:code/records', async ({ params, request }) => {
    const b = await request.json() as any;
    const code = params.code as string;
    const recs = jigRecords[code] ?? (jigRecords[code] = []);
    recs.unshift({
      id: Date.now(), project_code: code, serial: b.serial, result: b.result,
      tested_at: new Date().toISOString(), voltage: b.voltage ? Number(b.voltage) : null,
      current_ma: b.current_ma ? Number(b.current_ma) : null, temp_c: b.temp_c ? Number(b.temp_c) : null,
      fail_param: b.fail_param || null, notes: b.notes || null,
    });
    const proj = jigProjects.find(p => p.project_code === code);
    if (proj) {
      proj.total += 1;
      if (b.result === 'PASS') proj.pass_count += 1; else proj.fail_count += 1;
      proj.pass_rate = proj.total ? Math.round(proj.pass_count / proj.total * 1000) / 10 : 0;
    }
    return HttpResponse.json({ status: 'success', data: { serial: b.serial } }, { status: 201 });
  }),
];
