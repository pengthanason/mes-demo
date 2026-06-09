export type MesModule = {
  code: string;
  title: string;
  objective: string;
  endpoints: string[];
  presetLabels: string[];
};

export const MES_MODULES: MesModule[] = [
  {
    code: '01',
    title: 'Planning + BOM',
    objective: 'Create Pre-WO and control BOM review/approve gate.',
    endpoints: ['/api/planning/pre-wo', '/api/bom/upload', '/api/bom/:bomId/review'],
    presetLabels: ['Health Check', 'Upload BOM', 'Create Pre-WO', 'Approve BOM'],
  },
  {
    code: '02',
    title: 'Incoming (Store + QA)',
    objective: 'UID receive + QA gate, then Pre-WO incoming checklist with Store check/validate and QA check/approve.',
    endpoints: [
      '/api/store/receive',
      '/api/qa/approve',
      '/api/incoming/pre-wo/:woId',
      '/api/incoming/pre-wo/store-check',
      '/api/incoming/pre-wo/qa-check',
      '/api/incoming/pre-wo/validate-store',
      '/api/incoming/pre-wo/approve-qa',
    ],
    presetLabels: ['Store Receive UID', 'QA Approve UID', 'Store Check Line', 'QA Check Line', 'Store Validate Checklist', 'QA Approve Checklist'],
  },
  {
    code: '03',
    title: 'WO Release',
    objective: 'Convert DRAFT to WO and snapshot BOM.',
    endpoints: ['/api/wo/convert', '/api/wo/:woId'],
    presetLabels: ['Convert WO', 'Get WO'],
  },
  {
    code: '04',
    title: 'Kitting',
    objective: 'Issue material against WO snapshot only.',
    endpoints: ['/api/store/issue'],
    presetLabels: ['Store Issue'],
  },
  {
    code: '05',
    title: 'FAI + Machine',
    objective: 'Enforce dual-key FAI and machine event logs.',
    endpoints: ['/api/fai/request', '/api/fai/approve-qa', '/api/fai/approve-mgr', '/api/machine/event'],
    presetLabels: ['FAI Request', 'FAI QA Approve', 'FAI Manager Approve', 'Machine Event'],
  },
  {
    code: '06',
    title: 'Production + Routing',
    objective: 'Track unit/material traceability across production-only FLEX routing stages.',
    endpoints: [
      '/api/production/start-unit',
      '/api/production/scan-material',
      '/api/mes/routes/catalog',
      '/api/routing/scan-in',
      '/api/routing/scan-out',
      '/api/mes/stations/monitor',
    ],
    presetLabels: ['Start Unit', 'Scan Material', 'Routing Scan-In', 'Routing Scan-Out', 'Station Monitor'],
  },
  {
    code: '07',
    title: 'QC + Rework',
    objective: 'Control PASS/FAIL and NG -> REPAIRED loop.',
    endpoints: ['/api/qc/result', '/api/rework/repair'],
    presetLabels: ['QC Result PASS', 'Rework Repair'],
  },
  {
    code: '08',
    title: 'QA-OBA',
    objective: 'Out Box Audit by QA (PASS/FAIL) with rework return on FAIL.',
    endpoints: ['/api/qa/oba'],
    presetLabels: ['QA OBA PASS'],
  },
  {
    code: '09',
    title: 'Close + Delivery',
    objective: 'Close WO with PM+PD approval and prepare/dispatch delivery by Store.',
    endpoints: ['/api/wo/close', '/api/store/delivery/prepare', '/api/store/delivery/dispatch'],
    presetLabels: ['Close WO Approval', 'Store Prepare Delivery', 'Store Dispatch'],
  },
  {
    code: '10',
    title: 'Notifications',
    objective: 'Broadcast and acknowledge operational notices across roles.',
    endpoints: ['/api/notifications'],
    presetLabels: [],
  },
  {
    code: '11',
    title: 'PM Core Flow',
    objective: 'Lead management, gate transitions, and PM change requests.',
    endpoints: ['/api/pm/leads', '/api/pm/leads/:leadId/gate-g1', '/api/pm/leads/:leadId/gate-g2', '/api/pm/leads/:leadId/gate-g3', '/api/pm/cr'],
    presetLabels: [],
  },
  {
    code: '12',
    title: 'SCM Cases + Split Lot',
    objective: 'Manage SCM/QA cases, lot split SOP, and supplier dispositions.',
    endpoints: ['/api/scm/cases', '/api/scm/cases/:caseId/resolve', '/api/scm/lots/split', '/api/scm/dispositions'],
    presetLabels: [],
  },
];
