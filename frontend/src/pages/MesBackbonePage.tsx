import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MES_MODULES } from '../lib/mesModules';

type TesterPreset = {
  label: string;
  method: 'GET' | 'POST' | 'PUT';
  path: string;
  role: string;
  userId: string;
  body: string;
};

type DemoLog = {
  step: string;
  status: 'pending' | 'ok' | 'err';
  message: string;
};

type DemoSummary = {
  bomId: number;
  woId: number;
  uid: string;
  unitSn: string;
  woNumber: string;
  routeCode: string;
  routeState: string;
  obaResult: string;
  woStatus: string;
  yieldPct: string;
};

type RouteCatalogStep = {
  step_order: number;
  station_name: string;
  normalized_station_name: string;
  station_type: string;
  requires_fai: boolean;
  is_required: boolean;
  allow_rework: boolean;
};

type RouteCatalogRoute = {
  route_id: number;
  route_code: string;
  route_name: string;
  is_active: boolean;
  is_default: boolean;
  enforce_sequence: boolean;
  steps: RouteCatalogStep[];
};

type RouteCatalogSnapshot = {
  default_route_code: string | null;
  routes: RouteCatalogRoute[];
};

type StationMonitorSummary = {
  routes_total: number;
  stations_total: number;
  units_tracked: number;
  units_in_station: number;
  units_ready_next: number;
  units_rework_required: number;
  units_completed: number;
  scan_in_count_window: number;
  scan_out_pass_count_window: number;
  scan_out_fail_count_window: number;
  stations_with_rework: number;
  stations_with_fail_window: number;
};

type StationMonitorRoute = {
  route_id: number;
  route_code: string;
  enforce_sequence: boolean;
  units_tracked: number;
  units_in_station: number;
  units_ready_next: number;
  units_rework_required: number;
  units_completed: number;
};

type StationMonitorStation = {
  route_id: number;
  route_code: string;
  enforce_sequence: boolean;
  step_order: number;
  station_name: string;
  units_in_station: number;
  units_ready_next: number;
  units_rework_required: number;
  units_completed: number;
  scan_in_count: number;
  scan_out_pass_count: number;
  scan_out_fail_count: number;
  last_scan_at: string | null;
  last_activity_age_sec: number | null;
};

type StationMonitorSnapshot = {
  as_of: string;
  lookback_hours: number;
  filter: {
    route_code: string | null;
  };
  summary: StationMonitorSummary;
  routes: StationMonitorRoute[];
  stations: StationMonitorStation[];
};

type QuickCaseRequest = {
  method: 'GET' | 'POST' | 'PUT';
  path: string;
  role: string;
  userId: string;
  body?: unknown;
};

const modules = MES_MODULES;

const DEFAULT_PORT = '5100';
const MES_ROLES = ['PM', 'STORE', 'QC', 'QA', 'TECH', 'PD', 'ADMIN'];
const ROUTE_STATIONS_R1_R13 = [
  'SMT_SMD',
  'THU_INSERT',
  'ICT',
  'FCT_PCBA',
  'BB_PREP',
  'FCT_BBAS',
  'FQC'
];

const testerPresets: TesterPreset[] = [
  {
    label: 'Health Check',
    method: 'GET',
    path: '/api/mes/health',
    role: 'ADMIN',
    userId: '',
    body: '',
  },
  {
    label: 'Station Monitor',
    method: 'GET',
    path: '/api/mes/stations/monitor?lookback_hours=24',
    role: 'PM',
    userId: '1',
    body: '',
  },
  {
    label: 'Upload BOM',
    method: 'POST',
    path: '/api/bom/upload',
    role: 'ADMIN',
    userId: '',
    body: '{\n  "bom_code": "BOM-WEB-001",\n  "part_no": "1E2ASRES0001",\n  "customer": "SYNTECH",\n  "model": "M1",\n  "revision": "A",\n  "csv_text": "line_no,part_no,qty_per,uom,description\\n1,301ASMOS0001,1,EA,Main MOS"\n}',
  },
  {
    label: 'Create Pre-WO',
    method: 'POST',
    path: '/api/planning/pre-wo',
    role: 'PM',
    userId: '',
    body: '{\n  "part_no": "1E2ASRES0001",\n  "qty_target": 1,\n  "bom_header_id": 1,\n  "demand_plan_ref": "DP-2026-001"\n}',
  },
  {
    label: 'Store Receive UID',
    method: 'POST',
    path: '/api/store/receive',
    role: 'STORE',
    userId: '',
    body: '{\n  "part_no": "301ASMOS0001",\n  "qty_on_hand": 5,\n  "lot_no": "LOT-WEB-001"\n}',
  },
  {
    label: 'QA Approve UID',
    method: 'POST',
    path: '/api/qa/approve',
    role: 'QA',
    userId: '',
    body: '{\n  "uid": "UID-260219-0001",\n  "status": "APPROVED"\n}',
  },
  {
    label: 'Store Validate Checklist',
    method: 'POST',
    path: '/api/incoming/pre-wo/validate-store',
    role: 'STORE',
    userId: '',
    body: '{\n  "wo_id": 1\n}',
  },
  {
    label: 'QA Approve Checklist',
    method: 'POST',
    path: '/api/incoming/pre-wo/approve-qa',
    role: 'QA',
    userId: '',
    body: '{\n  "wo_id": 1\n}',
  },
  {
    label: 'Convert WO',
    method: 'POST',
    path: '/api/wo/convert',
    role: 'PM',
    userId: '',
    body: '{\n  "wo_id": 1\n}',
  },
  {
    label: 'Approve BOM',
    method: 'PUT',
    path: '/api/bom/1/approve',
    role: 'PM',
    userId: '1',
    body: '{}',
  },
  {
    label: 'Get WO',
    method: 'GET',
    path: '/api/wo/1',
    role: 'PM',
    userId: '1',
    body: '',
  },
  {
    label: 'Store Issue',
    method: 'POST',
    path: '/api/store/issue',
    role: 'STORE',
    userId: '',
    body: '{\n  "wo_id": 1,\n  "uid": "UID-260219-0001"\n}',
  },
  {
    label: 'FAI Request',
    method: 'POST',
    path: '/api/fai/request',
    role: 'TECH',
    userId: '',
    body: '{\n  "wo_id": 1\n}',
  },
  {
    label: 'FAI QA Approve',
    method: 'POST',
    path: '/api/fai/approve-qa',
    role: 'QA',
    userId: '',
    body: '{\n  "wo_id": 1\n}',
  },
  {
    label: 'FAI Manager Approve',
    method: 'POST',
    path: '/api/fai/approve-mgr',
    role: 'PD',
    userId: '',
    body: '{\n  "wo_id": 1\n}',
  },
  {
    label: 'Machine Event',
    method: 'POST',
    path: '/api/machine/event',
    role: 'TECH',
    userId: '',
    body: '{\n  "wo_id": 1,\n  "event_type": "RUN_START",\n  "machine_code": "MCH-01"\n}',
  },
  {
    label: 'Start Unit',
    method: 'POST',
    path: '/api/production/start-unit',
    role: 'TECH',
    userId: '',
    body: '{\n  "wo_id": 1,\n  "sn": "SN-WEB-0001"\n}',
  },
  {
    label: 'Scan Material',
    method: 'POST',
    path: '/api/production/scan-material',
    role: 'TECH',
    userId: '',
    body: '{\n  "unit_sn": "SN-WEB-0001",\n  "material_uid": "UID-260219-0001",\n  "used_qty": 1,\n  "station_id": "PD_INCOMING"\n}',
  },
  {
    label: 'Routing Scan-In',
    method: 'POST',
    path: '/api/routing/scan-in',
    role: 'TECH',
    userId: '',
    body: '{\n  "woId": 1,\n  "unit_sn": "SN-WEB-0001",\n  "station_name": "SMT_SMD"\n}',
  },
  {
    label: 'Routing Scan-Out',
    method: 'POST',
    path: '/api/routing/scan-out',
    role: 'TECH',
    userId: '',
    body: '{\n  "woId": 1,\n  "unit_sn": "SN-WEB-0001",\n  "station_name": "SMT_SMD",\n  "status": "PASS"\n}',
  },
  {
    label: 'QC Result PASS',
    method: 'POST',
    path: '/api/qc/result',
    role: 'QC',
    userId: '',
    body: '{\n  "unit_sn": "SN-WEB-0001",\n  "result": "PASS"\n}',
  },
  {
    label: 'Rework Repair',
    method: 'POST',
    path: '/api/rework/repair',
    role: 'QC',
    userId: '',
    body: '{\n  "unit_sn": "SN-WEB-0001"\n}',
  },
  {
    label: 'QA OBA PASS',
    method: 'POST',
    path: '/api/qa/oba',
    role: 'QA',
    userId: '',
    body: '{\n  "unit_sn": "SN-WEB-0001",\n  "result": "PASS"\n}',
  },
  {
    label: 'Close WO',
    method: 'POST',
    path: '/api/wo/close',
    role: 'PM',
    userId: '',
    body: '{\n  "wo_id": 1\n}',
  },
  {
    label: 'Close WO Approval',
    method: 'POST',
    path: '/api/wo/close',
    role: 'PM',
    userId: '',
    body: '{\n  "wo_id": 1\n}',
  },
  {
    label: 'Store Prepare Delivery',
    method: 'POST',
    path: '/api/store/delivery/prepare',
    role: 'STORE',
    userId: '',
    body: '{\n  "wo_id": 1,\n  "note": "prepared by mes shell"\n}',
  },
  {
    label: 'Store Dispatch',
    method: 'POST',
    path: '/api/store/delivery/dispatch',
    role: 'STORE',
    userId: '',
    body: '{\n  "wo_id": 1,\n  "note": "dispatched by mes shell"\n}',
  },
];

function defaultMesBaseUrl() {
  if (typeof window === 'undefined') return `http://127.0.0.1:${DEFAULT_PORT}`;
  const saved = window.localStorage.getItem('mes_base_url');
  if (saved) return saved;
  return window.location.origin || `http://127.0.0.1:${DEFAULT_PORT}`;
}

function normalizeBaseUrl(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return `http://127.0.0.1:${DEFAULT_PORT}`;
  return trimmed.replace(/\/+$/g, '');
}

function normalizePath(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return '/api/mes/health';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function normalizeModuleCode(raw: string | null) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return modules[0].code;
  const padded = /^\d$/.test(trimmed) ? `0${trimmed}` : trimmed;
  if (modules.some((item) => item.code === padded)) return padded;
  return modules[0].code;
}

function parseRoleId(raw: string) {
  const parsed = Number(raw.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return '';
  return String(Math.trunc(parsed));
}

function parseMonitorHours(raw: string) {
  const parsed = Number(raw.trim());
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 168) {
    throw new Error('Lookback Hours must be an integer between 1 and 168');
  }
  return parsed;
}

function formatAgeLabel(ageSec: number | null): string {
  if (ageSec == null || !Number.isFinite(ageSec)) return '-';
  if (ageSec < 60) return `${ageSec}s`;
  if (ageSec < 3600) return `${Math.floor(ageSec / 60)}m`;
  return `${Math.floor(ageSec / 3600)}h`;
}

function formatDateTimeLabel(iso: string | null): string {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

export function MesBackbonePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [baseInput, setBaseInput] = useState<string>(defaultMesBaseUrl);
  const mesBaseUrl = useMemo(() => normalizeBaseUrl(baseInput), [baseInput]);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [activeModuleCode, setActiveModuleCode] = useState<string>(() => normalizeModuleCode(searchParams.get('module')));
  const [selectedPreset, setSelectedPreset] = useState<string>(testerPresets[0].label);
  const [testerMethod, setTesterMethod] = useState<'GET' | 'POST' | 'PUT'>(testerPresets[0].method);
  const [testerPath, setTesterPath] = useState<string>(testerPresets[0].path);
  const [testerRole, setTesterRole] = useState<string>(testerPresets[0].role);
  const [testerUserId, setTesterUserId] = useState<string>(testerPresets[0].userId);
  const [testerBody, setTesterBody] = useState<string>(testerPresets[0].body);
  const [testerStatus, setTesterStatus] = useState<{ kind: 'ok' | 'warn' | 'err'; message: string } | null>(null);
  const [testerResponse, setTesterResponse] = useState<string>('');
  const [testerPending, setTesterPending] = useState<boolean>(false);
  const [demoPending, setDemoPending] = useState<boolean>(false);
  const [demoLogs, setDemoLogs] = useState<DemoLog[]>([]);
  const [demoSummary, setDemoSummary] = useState<DemoSummary | null>(null);
  const [pmId, setPmId] = useState<string>('1');
  const [storeId, setStoreId] = useState<string>('2');
  const [qaId, setQaId] = useState<string>('3');
  const [pdId, setPdId] = useState<string>('4');
  const [techId, setTechId] = useState<string>('5');
  const [qcId, setQcId] = useState<string>('6');
  const [caseWoId, setCaseWoId] = useState<string>('1');
  const [caseBomId, setCaseBomId] = useState<string>('1');
  const [caseUid, setCaseUid] = useState<string>('UID-260219-0001');
  const [caseUnitSn, setCaseUnitSn] = useState<string>('SN-WEB-0001');
  const [caseRouteCode, setCaseRouteCode] = useState<string>('');
  const [caseRouteStation, setCaseRouteStation] = useState<string>(ROUTE_STATIONS_R1_R13[0]);
  const [monitorHours, setMonitorHours] = useState<string>('24');
  const [monitorRouteCode, setMonitorRouteCode] = useState<string>('');
  const [routeCatalogPending, setRouteCatalogPending] = useState<boolean>(false);
  const [routeCatalogStatus, setRouteCatalogStatus] = useState<{ kind: 'ok' | 'warn' | 'err'; message: string } | null>(null);
  const [routeCatalog, setRouteCatalog] = useState<RouteCatalogSnapshot | null>(null);

  function getMesAccessToken() {
    if (typeof window === 'undefined') return '';
    return String(window.localStorage.getItem('mes_access_token') || '').trim();
  }

  function buildMesHeaders(
    method: 'GET' | 'POST' | 'PUT',
    role: string,
    userId: string,
  ): Record<string, string> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const accessToken = getMesAccessToken();

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    } else {
      headers['X-User-Role'] = role;
      if (userId.trim()) headers['X-User-Id'] = userId.trim();
    }

    if (method !== 'GET') headers['Content-Type'] = 'application/json';
    return headers;
  }
  const [monitorPending, setMonitorPending] = useState<boolean>(false);
  const [monitorAutoRefresh, setMonitorAutoRefresh] = useState<boolean>(true);
  const [monitorStatus, setMonitorStatus] = useState<{ kind: 'ok' | 'warn' | 'err'; message: string } | null>(null);
  const [monitorData, setMonitorData] = useState<StationMonitorSnapshot | null>(null);
  const activeModule = useMemo(() => modules.find((item) => item.code === activeModuleCode) || modules[0], [activeModuleCode]);
  const activeModuleIndex = useMemo(() => modules.findIndex((item) => item.code === activeModule.code), [activeModule.code]);
  const activeModulePresets = useMemo(
    () => testerPresets.filter((item) => activeModule.presetLabels.includes(item.label)),
    [activeModule]
  );
  const availableRoutes = useMemo(() => routeCatalog?.routes || [], [routeCatalog]);
  const activeRoutingRoute = useMemo(() => {
    if (!availableRoutes.length) return null;
    const normalized = caseRouteCode.trim().toUpperCase();
    return (
      availableRoutes.find((item) => item.route_code.toUpperCase() === normalized) ||
      availableRoutes.find((item) => item.is_default) ||
      availableRoutes[0] ||
      null
    );
  }, [availableRoutes, caseRouteCode]);
  const effectiveRouteCode = activeRoutingRoute?.route_code || caseRouteCode.trim() || routeCatalog?.default_route_code || '';
  const routingStationOptions = useMemo<RouteCatalogStep[]>(() => {
    if (activeRoutingRoute?.steps?.length) {
      return activeRoutingRoute.steps;
    }
    return ROUTE_STATIONS_R1_R13.map((stationName, index) => ({
      step_order: index + 1,
      station_name: stationName,
      normalized_station_name: stationName,
      station_type: 'PD',
      requires_fai: false,
      is_required: true,
      allow_rework: true,
    }));
  }, [activeRoutingRoute]);
  const selectedRoutingStation = useMemo(
    () => routingStationOptions.find((item) => item.station_name === caseRouteStation) || routingStationOptions[0] || null,
    [routingStationOptions, caseRouteStation]
  );

  useEffect(() => {
    const codeFromQuery = normalizeModuleCode(searchParams.get('module'));
    setActiveModuleCode((prev) => (prev === codeFromQuery ? prev : codeFromQuery));
  }, [searchParams]);

  useEffect(() => {
    if (!activeRoutingRoute?.route_code) return;
    setCaseRouteCode((prev) => (prev.trim() ? prev : activeRoutingRoute.route_code));
  }, [activeRoutingRoute]);

  useEffect(() => {
    if (!routingStationOptions.length) return;
    setCaseRouteStation((prev) => {
      const nextStation = routingStationOptions.some((item) => item.station_name === prev)
        ? prev
        : routingStationOptions[0].station_name;
      if (nextStation !== prev) {
        syncRoutingTesterBody({ stationName: nextStation });
      }
      return nextStation;
    });
  }, [routingStationOptions]);

  function selectModule(code: string) {
    if (!modules.some((item) => item.code === code)) return;
    setActiveModuleCode(code);
    const nextParams = new URLSearchParams(searchParams);
    if (nextParams.get('module') !== code) {
      nextParams.set('module', code);
      setSearchParams(nextParams, { replace: true });
    }
  }

  function shiftActiveModule(delta: number) {
    const targetIndex = activeModuleIndex + delta;
    if (targetIndex < 0 || targetIndex >= modules.length) return;
    selectModule(modules[targetIndex].code);
  }

  function parsePositiveInt(raw: string, label: string) {
    const parsed = Number(raw.trim());
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(`${label} must be a positive integer`);
    }
    return parsed;
  }

  function defaultUserIdForRole(role: string) {
    if (role === 'PM') return parseRoleId(pmId);
    if (role === 'STORE') return parseRoleId(storeId);
    if (role === 'QA') return parseRoleId(qaId);
    if (role === 'PD') return parseRoleId(pdId);
    if (role === 'TECH') return parseRoleId(techId);
    if (role === 'QC') return parseRoleId(qcId);
    return '';
  }

  function saveBaseUrl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeBaseUrl(baseInput);
    setBaseInput(normalized);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('mes_base_url', normalized);
    }
  }

  function applyPreset(label: string) {
    const preset = testerPresets.find((item) => item.label === label);
    if (!preset) return;
    let nextBody = preset.body;
    if (label === 'Routing Scan-In') {
      nextBody = JSON.stringify({
        woId: Number(caseWoId) || 1,
        unit_sn: caseUnitSn.trim() || 'SN-WEB-0001',
        station_name: caseRouteStation,
        ...(effectiveRouteCode ? { route_code: effectiveRouteCode } : {}),
      }, null, 2);
    } else if (label === 'Routing Scan-Out') {
      nextBody = JSON.stringify({
        woId: Number(caseWoId) || 1,
        unit_sn: caseUnitSn.trim() || 'SN-WEB-0001',
        station_name: caseRouteStation,
        ...(effectiveRouteCode ? { route_code: effectiveRouteCode } : {}),
        status: 'PASS',
      }, null, 2);
    }
    setSelectedPreset(preset.label);
    setTesterMethod(preset.method);
    setTesterPath(preset.path);
    setTesterRole(preset.role);
    setTesterUserId(preset.userId);
    setTesterBody(nextBody);
    setTesterStatus(null);
    setTesterResponse('');
  }

  function syncRoutingTesterBody(selection: { routeCode?: string; stationName?: string }) {
    if (!testerPath.includes('/api/routing/')) return;
    setTesterBody((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return prev;
      try {
        const parsed = JSON.parse(trimmed);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return prev;
        const next = { ...parsed } as Record<string, unknown>;
        if (selection.stationName !== undefined) {
          next.station_name = selection.stationName;
        }
        if (selection.routeCode !== undefined) {
          if (selection.routeCode) next.route_code = selection.routeCode;
          else delete next.route_code;
        }
        return JSON.stringify(next, null, 2);
      } catch (_error) {
        return prev;
      }
    });
  }

  function handleRouteCodeChange(nextRouteCode: string) {
    setCaseRouteCode(nextRouteCode);
    syncRoutingTesterBody({ routeCode: nextRouteCode });
  }

  function handleRouteStationChange(nextStation: string) {
    setCaseRouteStation(nextStation);
    syncRoutingTesterBody({ stationName: nextStation });
  }

  async function runTester(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const path = normalizePath(testerPath);
    const targetUrl = `${mesBaseUrl}${path}`;
    const headers = buildMesHeaders(testerMethod, testerRole || 'ADMIN', testerUserId);

    let requestBody: string | undefined;
    if (testerMethod !== 'GET') {
      const trimmed = testerBody.trim();
      if (trimmed) {
        try {
          requestBody = JSON.stringify(JSON.parse(trimmed));
        } catch (_error) {
          setTesterStatus({ kind: 'err', message: 'JSON payload is invalid. Please fix before sending.' });
          return;
        }
      } else {
        requestBody = '{}';
      }
    }

    setTesterPending(true);
    setTesterStatus(null);
    setTesterResponse('');

    try {
      const response = await fetch(targetUrl, {
        method: testerMethod,
        headers,
        body: requestBody,
      });

      const rawText = await response.text();
      let pretty = rawText;
      try {
        pretty = JSON.stringify(JSON.parse(rawText), null, 2);
      } catch (_error) {
        // keep raw text
      }

      setTesterResponse(pretty || '<empty response>');
      setTesterStatus({
        kind: response.ok ? 'ok' : 'warn',
        message: `${testerMethod} ${path} -> HTTP ${response.status}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Request failed';
      setTesterStatus({ kind: 'err', message: `Request failed: ${message}` });
    } finally {
      setTesterPending(false);
    }
  }

  async function runQuickHealth() {
    setTesterPending(true);
    setTesterStatus(null);
    setTesterResponse('');
    try {
      const response = await fetch(`${mesBaseUrl}/api/mes/health`, {
        method: 'GET',
        headers: buildMesHeaders('GET', 'ADMIN', ''),
      });
      const rawText = await response.text();
      let pretty = rawText;
      try {
        pretty = JSON.stringify(JSON.parse(rawText), null, 2);
      } catch (_error) {
        // keep raw text
      }
      setTesterResponse(pretty || '<empty response>');
      setTesterStatus({
        kind: response.ok ? 'ok' : 'warn',
        message: `Health check -> HTTP ${response.status}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Request failed';
      setTesterStatus({ kind: 'err', message: `Request failed: ${message}` });
    } finally {
      setTesterPending(false);
    }
  }

  async function refreshRouteCatalog(options: { silentSuccess?: boolean } = {}) {
    if (routeCatalogPending) return;

    setRouteCatalogPending(true);
    if (!options.silentSuccess) {
      setRouteCatalogStatus(null);
    }

    try {
      const pmUserId = parseRoleId(pmId);
      const headers = buildMesHeaders('GET', 'PM', pmUserId);
      const response = await fetch(`${mesBaseUrl}/api/mes/routes/catalog`, {
        method: 'GET',
        headers,
      });
      const raw = await response.text();
      let parsed: any = {};
      try {
        parsed = raw ? JSON.parse(raw) : {};
      } catch (_error) {
        parsed = { raw };
      }

      if (!response.ok) {
        const reason = parsed?.message || parsed?.code || `HTTP ${response.status}`;
        setRouteCatalogStatus({ kind: 'warn', message: `Route catalog request failed: ${reason}` });
        return;
      }

      const nextCatalog: RouteCatalogSnapshot = {
        default_route_code: parsed?.default_route_code ? String(parsed.default_route_code) : null,
        routes: Array.isArray(parsed?.routes)
          ? parsed.routes.map((item: any) => ({
            route_id: Number(item?.route_id || 0),
            route_code: String(item?.route_code || ''),
            route_name: String(item?.route_name || ''),
            is_active: Boolean(item?.is_active),
            is_default: Boolean(item?.is_default),
            enforce_sequence: Boolean(item?.enforce_sequence),
            steps: Array.isArray(item?.steps)
              ? item.steps.map((step: any) => ({
                step_order: Number(step?.step_order || 0),
                station_name: String(step?.station_name || ''),
                normalized_station_name: String(step?.normalized_station_name || ''),
                station_type: String(step?.station_type || 'PD'),
                requires_fai: Boolean(step?.requires_fai),
                is_required: Boolean(step?.is_required),
                allow_rework: Boolean(step?.allow_rework),
              }))
              : [],
          }))
          : [],
      };

      setRouteCatalog(nextCatalog);

      if (!caseRouteCode.trim()) {
        const defaultRouteCode = nextCatalog.default_route_code || nextCatalog.routes[0]?.route_code || '';
        if (defaultRouteCode) {
          setCaseRouteCode(defaultRouteCode);
          syncRoutingTesterBody({ routeCode: defaultRouteCode });
        }
      }

      if (!options.silentSuccess) {
        setRouteCatalogStatus({
          kind: 'ok',
          message: `Loaded ${nextCatalog.routes.length} active route(s) from MES`,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'route catalog request failed';
      setRouteCatalogStatus({ kind: 'err', message });
    } finally {
      setRouteCatalogPending(false);
    }
  }

  async function refreshStationMonitor(options: { silentSuccess?: boolean } = {}) {
    if (monitorPending) return;
    let lookbackHours = 24;
    try {
      lookbackHours = parseMonitorHours(monitorHours);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'invalid lookback hours';
      setMonitorStatus({ kind: 'err', message });
      return;
    }

    const routeCode = monitorRouteCode.trim();
    const params = new URLSearchParams();
    params.set('lookback_hours', String(lookbackHours));
    if (routeCode) params.set('route_code', routeCode);

    setMonitorPending(true);
    if (!options.silentSuccess) {
      setMonitorStatus(null);
    }

    try {
      const pmUserId = parseRoleId(pmId);
      const headers = buildMesHeaders('GET', 'PM', pmUserId);

      const response = await fetch(`${mesBaseUrl}/api/mes/stations/monitor?${params.toString()}`, {
        method: 'GET',
        headers,
      });
      const raw = await response.text();
      let parsed: any = {};
      try {
        parsed = raw ? JSON.parse(raw) : {};
      } catch (_error) {
        parsed = { raw };
      }

      if (!response.ok) {
        const reason = parsed?.message || parsed?.code || `HTTP ${response.status}`;
        setMonitorStatus({ kind: 'warn', message: `Station monitor request failed: ${reason}` });
        return;
      }

      setMonitorData({
        as_of: String(parsed?.as_of || ''),
        lookback_hours: Number(parsed?.lookback_hours || lookbackHours),
        filter: {
          route_code: parsed?.filter?.route_code ? String(parsed.filter.route_code) : null,
        },
        summary: {
          routes_total: Number(parsed?.summary?.routes_total || 0),
          stations_total: Number(parsed?.summary?.stations_total || 0),
          units_tracked: Number(parsed?.summary?.units_tracked || 0),
          units_in_station: Number(parsed?.summary?.units_in_station || 0),
          units_ready_next: Number(parsed?.summary?.units_ready_next || 0),
          units_rework_required: Number(parsed?.summary?.units_rework_required || 0),
          units_completed: Number(parsed?.summary?.units_completed || 0),
          scan_in_count_window: Number(parsed?.summary?.scan_in_count_window || 0),
          scan_out_pass_count_window: Number(parsed?.summary?.scan_out_pass_count_window || 0),
          scan_out_fail_count_window: Number(parsed?.summary?.scan_out_fail_count_window || 0),
          stations_with_rework: Number(parsed?.summary?.stations_with_rework || 0),
          stations_with_fail_window: Number(parsed?.summary?.stations_with_fail_window || 0),
        },
        routes: Array.isArray(parsed?.routes)
          ? parsed.routes.map((item: any) => ({
            route_id: Number(item?.route_id || 0),
            route_code: String(item?.route_code || ''),
            enforce_sequence: Boolean(item?.enforce_sequence),
            units_tracked: Number(item?.units_tracked || 0),
            units_in_station: Number(item?.units_in_station || 0),
            units_ready_next: Number(item?.units_ready_next || 0),
            units_rework_required: Number(item?.units_rework_required || 0),
            units_completed: Number(item?.units_completed || 0),
          }))
          : [],
        stations: Array.isArray(parsed?.stations)
          ? parsed.stations.map((item: any) => ({
            route_id: Number(item?.route_id || 0),
            route_code: String(item?.route_code || ''),
            enforce_sequence: Boolean(item?.enforce_sequence),
            step_order: Number(item?.step_order || 0),
            station_name: String(item?.station_name || ''),
            units_in_station: Number(item?.units_in_station || 0),
            units_ready_next: Number(item?.units_ready_next || 0),
            units_rework_required: Number(item?.units_rework_required || 0),
            units_completed: Number(item?.units_completed || 0),
            scan_in_count: Number(item?.scan_in_count || 0),
            scan_out_pass_count: Number(item?.scan_out_pass_count || 0),
            scan_out_fail_count: Number(item?.scan_out_fail_count || 0),
            last_scan_at: item?.last_scan_at ? String(item.last_scan_at) : null,
            last_activity_age_sec:
              item?.last_activity_age_sec == null ? null : Number(item.last_activity_age_sec),
          }))
          : [],
      });

      if (!options.silentSuccess) {
        setMonitorStatus({
          kind: 'ok',
          message: `Station monitor updated (${lookbackHours}h window)`,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'station monitor request failed';
      setMonitorStatus({ kind: 'err', message });
    } finally {
      setMonitorPending(false);
    }
  }

  useEffect(() => {
    void refreshRouteCatalog({ silentSuccess: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesBaseUrl, pmId]);

  useEffect(() => {
    void refreshStationMonitor({ silentSuccess: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesBaseUrl]);

  useEffect(() => {
    if (!monitorAutoRefresh) return undefined;
    const timer = window.setInterval(() => {
      void refreshStationMonitor({ silentSuccess: true });
    }, 15000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monitorAutoRefresh, mesBaseUrl, monitorHours, monitorRouteCode, pmId]);

  async function runQuickRequest(label: string, request: QuickCaseRequest) {
    setTesterPending(true);
    setTesterStatus(null);
    setTesterResponse('');
    try {
      const headers = buildMesHeaders(request.method, request.role, request.userId);

      const response = await fetch(`${mesBaseUrl}${request.path}`, {
        method: request.method,
        headers,
        body: request.method === 'GET' ? undefined : JSON.stringify(request.body ?? {}),
      });

      const rawText = await response.text();
      let pretty = rawText;
      try {
        pretty = JSON.stringify(JSON.parse(rawText), null, 2);
      } catch (_error) {
        // keep raw text
      }

      setTesterResponse(pretty || '<empty response>');
      setTesterStatus({
        kind: response.ok ? 'ok' : 'warn',
        message: `${label} -> HTTP ${response.status}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Request failed';
      setTesterStatus({ kind: 'err', message: `${label} failed: ${message}` });
    } finally {
      setTesterPending(false);
    }
  }

  function buildCaseRequest(preset: TesterPreset): QuickCaseRequest {
    const woId = parsePositiveInt(caseWoId, 'WO ID');
    const bomId = parsePositiveInt(caseBomId, 'BOM ID');
    const uid = caseUid.trim();
    const unitSn = caseUnitSn.trim();
    const fallbackUserId = defaultUserIdForRole(preset.role);
    const userId = preset.userId.trim() || fallbackUserId;

    switch (preset.label) {
      case 'Create Pre-WO':
        return {
          method: preset.method,
          path: preset.path,
          role: preset.role,
          userId,
          body: { part_no: '1E2ASRES0001', qty_target: 1, bom_header_id: bomId },
        };
      case 'Approve BOM':
        return {
          method: preset.method,
          path: `/api/bom/${bomId}/approve`,
          role: preset.role,
          userId,
          body: {},
        };
      case 'Get WO':
        return {
          method: preset.method,
          path: `/api/wo/${woId}`,
          role: preset.role,
          userId,
        };
      case 'Convert WO':
        return {
          method: preset.method,
          path: preset.path,
          role: preset.role,
          userId,
          body: { wo_id: woId },
        };
      case 'Store Validate Checklist':
      case 'QA Approve Checklist':
      case 'Close WO Approval':
      case 'Store Prepare Delivery':
      case 'Store Dispatch':
      case 'Store Issue':
        if (preset.label === 'Store Issue' && !uid) throw new Error('UID is required for Store Issue');
        return {
          method: preset.method,
          path: preset.path,
          role: preset.role,
          userId,
          body: preset.label === 'Store Issue' ? { wo_id: woId, uid } : { wo_id: woId },
        };
      case 'FAI Request':
      case 'FAI QA Approve':
      case 'FAI Manager Approve':
      case 'Close WO':
        return {
          method: preset.method,
          path: preset.path,
          role: preset.role,
          userId,
          body: { wo_id: woId },
        };
      case 'Start Unit':
        if (!unitSn) throw new Error('Unit SN is required for Start Unit');
        return {
          method: preset.method,
          path: preset.path,
          role: preset.role,
          userId,
          body: { wo_id: woId, sn: unitSn },
        };
      case 'Scan Material':
        if (!unitSn) throw new Error('Unit SN is required for Scan Material');
        if (!uid) throw new Error('UID is required for Scan Material');
        return {
          method: preset.method,
          path: preset.path,
          role: preset.role,
          userId,
          body: { unit_sn: unitSn, material_uid: uid, used_qty: 1, station_id: 'PD_INCOMING' },
        };
      case 'Routing Scan-In':
        if (!unitSn) throw new Error('Unit SN is required for Routing Scan-In');
        return {
          method: preset.method,
          path: preset.path,
          role: preset.role,
          userId,
          body: {
            woId,
            unit_sn: unitSn,
            station_name: caseRouteStation,
            ...(effectiveRouteCode ? { route_code: effectiveRouteCode } : {}),
          },
        };
      case 'Routing Scan-Out':
        if (!unitSn) throw new Error('Unit SN is required for Routing Scan-Out');
        return {
          method: preset.method,
          path: preset.path,
          role: preset.role,
          userId,
          body: {
            woId,
            unit_sn: unitSn,
            station_name: caseRouteStation,
            ...(effectiveRouteCode ? { route_code: effectiveRouteCode } : {}),
            status: 'PASS',
          },
        };
      case 'QC Result PASS':
        if (!unitSn) throw new Error('Unit SN is required for QC Result');
        return {
          method: preset.method,
          path: preset.path,
          role: preset.role,
          userId,
          body: { unit_sn: unitSn, result: 'PASS' },
        };
      case 'Rework Repair':
        if (!unitSn) throw new Error('Unit SN is required for Rework Repair');
        return {
          method: preset.method,
          path: preset.path,
          role: preset.role,
          userId,
          body: { unit_sn: unitSn },
        };
      case 'QA OBA PASS':
        if (!unitSn) throw new Error('Unit SN is required for QA OBA');
        return {
          method: preset.method,
          path: preset.path,
          role: preset.role,
          userId,
          body: { unit_sn: unitSn, result: 'PASS' },
        };
      default: {
        let body: unknown = undefined;
        if (preset.method !== 'GET' && preset.body.trim()) {
          body = JSON.parse(preset.body);
        }
        return {
          method: preset.method,
          path: preset.path,
          role: preset.role,
          userId,
          body,
        };
      }
    }
  }

  async function runCasePreset(label: string) {
    const preset = testerPresets.find((item) => item.label === label);
    if (!preset) return;
    applyPreset(label);
    try {
      const request = buildCaseRequest(preset);
      await runQuickRequest(label, request);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'invalid case payload';
      setTesterStatus({ kind: 'err', message });
      setTesterResponse('');
    }
  }

  async function runRoutingQuick(status: 'SCAN_IN' | 'PASS' | 'FAIL') {
    try {
      const woId = parsePositiveInt(caseWoId, 'WO ID');
      const unitSn = caseUnitSn.trim();
      const userId = defaultUserIdForRole('TECH');
      if (!unitSn) throw new Error('Unit SN is required for Routing quick action');
      const path = status === 'SCAN_IN' ? '/api/routing/scan-in' : '/api/routing/scan-out';
      const body =
        status === 'SCAN_IN'
          ? { woId, unit_sn: unitSn, station_name: caseRouteStation, ...(effectiveRouteCode ? { route_code: effectiveRouteCode } : {}) }
          : { woId, unit_sn: unitSn, station_name: caseRouteStation, ...(effectiveRouteCode ? { route_code: effectiveRouteCode } : {}), status };
      const label = status === 'SCAN_IN' ? `Routing Scan-In (${caseRouteStation})` : `Routing Scan-Out ${status} (${caseRouteStation})`;
      await runQuickRequest(label, {
        method: 'POST',
        path,
        role: 'TECH',
        userId,
        body,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'routing quick action failed';
      setTesterStatus({ kind: 'err', message });
      setTesterResponse('');
    }
  }

  function logDemo(step: string, status: 'pending' | 'ok' | 'err', message: string) {
    setDemoLogs((prev) => [...prev, { step, status, message }]);
  }

  async function requestMesApi(method: 'GET' | 'POST' | 'PUT', path: string, role: string, userId: string, body?: unknown) {
    const headers = buildMesHeaders(method, role, userId);

    const response = await fetch(`${mesBaseUrl}${path}`, {
      method,
      headers,
      body: method === 'GET' ? undefined : JSON.stringify(body || {}),
    });
    const raw = await response.text();
    let parsed: any = {};
    try {
      parsed = raw ? JSON.parse(raw) : {};
    } catch (_error) {
      parsed = { raw };
    }

    if (!response.ok) {
      const message = parsed?.message || parsed?.error || parsed?.code || raw || 'request failed';
      throw new Error(`HTTP ${response.status} ${path}: ${message}`);
    }
    return parsed;
  }

  async function runOneClickDemo() {
    if (demoPending) return;

    const parsedPmId = parseRoleId(pmId);
    const parsedStoreId = parseRoleId(storeId);
    const parsedQaId = parseRoleId(qaId);
    const parsedPdId = parseRoleId(pdId);
    const parsedTechId = parseRoleId(techId);
    if (!parsedPmId || !parsedStoreId || !parsedQaId || !parsedPdId || !parsedTechId) {
      setTesterStatus({ kind: 'err', message: 'Demo requires valid numeric IDs for PM/STORE/QA/PD/TECH.' });
      return;
    }
    if (parsedQaId === parsedPdId) {
      setTesterStatus({ kind: 'err', message: 'Demo requires QA ID and PD ID to be different (dual-key FAI).' });
      return;
    }

    setDemoPending(true);
    setDemoLogs([]);
    setDemoSummary(null);
    setTesterStatus(null);

    const suffix = `${Date.now().toString(36)}${Math.random().toString(16).slice(2, 6)}`.toUpperCase();
    const bomCode = `BOM-DEMO-${suffix}`;
    const lotNo = `LOT-DEMO-${suffix}`;
    const unitSn = `SN-DEMO-${suffix}`;
    const demoRouteStations = routingStationOptions.map((item) => item.station_name);
    const demoRouteCode = effectiveRouteCode;

    try {
      logDemo('Health', 'pending', 'Checking MES health');
      const health = await requestMesApi('GET', '/api/mes/health', 'ADMIN', '');
      logDemo('Health', 'ok', `MES ready version=${health.version || 'n/a'}`);

      logDemo('BOM Upload', 'pending', 'Uploading demo BOM');
      const bomUpload = await requestMesApi('POST', '/api/bom/upload', 'ADMIN', '', {
        bom_code: bomCode,
        part_no: '1E2ASRES0001',
        customer: 'SYNTECH',
        model: 'M1',
        revision: 'A',
        csv_text: 'line_no,part_no,qty_per,uom,description\n1,301ASMOS0001,1,EA,Main MOS',
      });
      const bomId = Number(bomUpload.bom_header_id);
      logDemo('BOM Upload', 'ok', `bom_header_id=${bomId}`);

      logDemo('BOM Approve', 'pending', 'Approving BOM by PM');
      await requestMesApi('PUT', `/api/bom/${bomId}/approve`, 'PM', parsedPmId, {});
      logDemo('BOM Approve', 'ok', `BOM ${bomId} approved`);

      logDemo('Pre-WO', 'pending', 'Creating pre-work order');
      const preWo = await requestMesApi('POST', '/api/planning/pre-wo', 'PM', parsedPmId, {
        part_no: '1E2ASRES0001',
        qty_target: 1,
        bom_header_id: bomId,
        demand_plan_ref: 'DP-DEMO-001',
      });
      const woId = Number(preWo?.pre_wo?.id);
      logDemo('Pre-WO', 'ok', `wo_id=${woId}`);

      logDemo('Store Receive', 'pending', 'Receiving material UID');
      const receipt = await requestMesApi('POST', '/api/store/receive', 'STORE', parsedStoreId, {
        part_no: '301ASMOS0001',
        qty_on_hand: 5,
        lot_no: lotNo,
      });
      const uid = String(receipt?.receipt?.uid || '');
      logDemo('Store Receive', 'ok', `uid=${uid}`);

      logDemo('QA Approve UID', 'pending', 'Approving received UID');
      await requestMesApi('POST', '/api/qa/approve', 'QA', parsedQaId, { uid, status: 'APPROVED' });
      logDemo('QA Approve UID', 'ok', `UID approved`);

      logDemo('Incoming Store Check', 'pending', 'Store checking incoming line by line');
      await requestMesApi('POST', '/api/incoming/pre-wo/store-check', 'STORE', parsedStoreId, {
        wo_id: woId,
        line_no: 1,
      });
      logDemo('Incoming Store Check', 'ok', 'line=1 checked by Store');

      logDemo('Incoming Store Validate', 'pending', 'Store validating incoming checklist');
      await requestMesApi('POST', '/api/incoming/pre-wo/validate-store', 'STORE', parsedStoreId, { wo_id: woId });
      logDemo('Incoming Store Validate', 'ok', 'status=STORE_VALIDATED');

      logDemo('Incoming QA Check', 'pending', 'QA checking incoming line by line');
      await requestMesApi('POST', '/api/incoming/pre-wo/qa-check', 'QA', parsedQaId, {
        wo_id: woId,
        line_no: 1,
      });
      logDemo('Incoming QA Check', 'ok', 'line=1 checked by QA');

      logDemo('Incoming QA Approve', 'pending', 'QA approving incoming checklist');
      await requestMesApi('POST', '/api/incoming/pre-wo/approve-qa', 'QA', parsedQaId, { wo_id: woId });
      logDemo('Incoming QA Approve', 'ok', 'status=QA_APPROVED');

      logDemo('WO Convert', 'pending', 'Converting pre-WO to OPEN');
      const converted = await requestMesApi('POST', '/api/wo/convert', 'PM', parsedPmId, { wo_id: woId });
      const woNumber = String(converted?.wo?.wo_number || '');
      logDemo('WO Convert', 'ok', `wo_number=${woNumber || 'generated'}`);

      logDemo('Store Issue', 'pending', 'Issuing material to WO');
      await requestMesApi('POST', '/api/store/issue', 'STORE', parsedStoreId, { wo_id: woId, uid });
      logDemo('Store Issue', 'ok', 'WO moved to READY');

      logDemo('FAI Request', 'pending', 'Requesting FAI');
      await requestMesApi('POST', '/api/fai/request', 'TECH', parsedTechId, { wo_id: woId });
      logDemo('FAI Request', 'ok', 'WO moved to WAIT_FAI_QA');

      logDemo('FAI QA Approve', 'pending', 'QA key approval');
      await requestMesApi('POST', '/api/fai/approve-qa', 'QA', parsedQaId, { wo_id: woId });
      logDemo('FAI QA Approve', 'ok', 'WO moved to WAIT_FAI_MGR');

      logDemo('FAI Manager Approve', 'pending', 'Manager key approval');
      await requestMesApi('POST', '/api/fai/approve-mgr', 'PD', parsedPdId, { wo_id: woId });
      logDemo('FAI Manager Approve', 'ok', 'WO moved to RUNNING');

      logDemo('Start Unit', 'pending', 'Starting unit scan');
      await requestMesApi('POST', '/api/production/start-unit', 'TECH', parsedTechId, { wo_id: woId, sn: unitSn });
      logDemo('Start Unit', 'ok', `unit_sn=${unitSn}`);

      logDemo('Scan Material', 'pending', 'Linking material traceability');
      await requestMesApi('POST', '/api/production/scan-material', 'TECH', parsedTechId, {
        unit_sn: unitSn,
        material_uid: uid,
        used_qty: 1,
        station_id: 'PD_INCOMING',
      });
      logDemo('Scan Material', 'ok', 'SN <-> UID linked');

      let routeState = '';
      for (const station of demoRouteStations) {
        logDemo(`Routing ${station} In`, 'pending', `Routing scan-in ${station}`);
        await requestMesApi('POST', '/api/routing/scan-in', 'TECH', parsedTechId, {
          woId,
          unit_sn: unitSn,
          station_name: station,
          ...(demoRouteCode ? { route_code: demoRouteCode } : {}),
        });
        logDemo(`Routing ${station} In`, 'ok', `${station} scan-in success`);

        logDemo(`Routing ${station} Out`, 'pending', `Routing scan-out ${station} PASS`);
        const routeOut = await requestMesApi('POST', '/api/routing/scan-out', 'TECH', parsedTechId, {
          woId,
          unit_sn: unitSn,
          station_name: station,
          ...(demoRouteCode ? { route_code: demoRouteCode } : {}),
          status: 'PASS',
        });
        routeState = String(routeOut?.state || '');
        logDemo(`Routing ${station} Out`, 'ok', `state=${routeState || 'READY_NEXT'}`);
      }

      logDemo('QA-OBA', 'pending', 'QA out-box audit PASS');
      const oba = await requestMesApi('POST', '/api/qa/oba', 'QA', parsedQaId, {
        unit_sn: unitSn,
        result: 'PASS',
      });
      const obaResult = String(oba?.oba_result || '');
      logDemo('QA-OBA', 'ok', `oba_result=${obaResult || 'PASS'}`);

      logDemo('Close WO (PM)', 'pending', 'PM submits close approval');
      await requestMesApi('POST', '/api/wo/close', 'PM', parsedPmId, {
        wo_id: woId,
      });
      logDemo('Close WO (PM)', 'ok', 'PM approval submitted');

      logDemo('Close WO (PD)', 'pending', 'PD submits final close approval');
      const closed = await requestMesApi('POST', '/api/wo/close', 'PD', parsedPdId, {
        wo_id: woId,
      });
      const woStatus = String(closed?.wo?.status || '');
      const yieldPct = String(closed?.wo?.yield_pct || '');
      logDemo('Close WO (PD)', 'ok', `wo_status=${woStatus || 'CLOSED'}, yield=${yieldPct || 'n/a'}%`);

      logDemo('Delivery Prepare', 'pending', 'Store prepares delivery');
      await requestMesApi('POST', '/api/store/delivery/prepare', 'STORE', parsedStoreId, {
        wo_id: woId,
        note: 'Prepared by one-click demo',
      });
      logDemo('Delivery Prepare', 'ok', 'delivery_status=PREPARED');

      setDemoSummary({
        bomId,
        woId,
        uid,
        unitSn,
        woNumber,
        routeCode: demoRouteCode,
        routeState,
        obaResult,
        woStatus,
        yieldPct,
      });
      setTesterStatus({ kind: 'ok', message: 'One-click demo completed full chain (Incoming checklist -> Routing -> QA-OBA -> Dual Close -> Delivery Prepare).' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'demo failed';
      logDemo('Demo Failed', 'err', message);
      setTesterStatus({ kind: 'err', message: `Demo stopped: ${message}` });
    } finally {
      setDemoPending(false);
    }
  }

  return (
    <section className="panel stack-lg">
      <div className="mes-hero">
        <h1 className="panel__title">MES Backbone Main Shell</h1>
        <p className="panel__subtitle">ศูนย์กลางสำหรับเปิดทดสอบ MES API แบบทีละ Module โดยไม่ชน WMS เดิม</p>
      </div>

      <form className="mes-base-form" onSubmit={saveBaseUrl}>
        <label className="field">
          <span>MES Base URL</span>
          <input
            value={baseInput}
            onChange={(event) => setBaseInput(event.target.value)}
            placeholder={`http://172.xx.xx.xx:${DEFAULT_PORT}`}
          />
        </label>
        <div className="mes-actions">
          <button className="btn" type="submit">
            Save URL
          </button>
          <a className="btn secondary" href={`${mesBaseUrl}/api/mes/health`} target="_blank" rel="noreferrer">
            Open Health
          </a>
        </div>
      </form>

      <section className="panel mes-quick-play">
        <h2 className="panel__title panel__title--sm">Quick Play (ง่าย)</h2>
        <p className="panel__subtitle">ถ้าไม่อยากเช็กลึก ให้กดตามลำดับ: 1) Check Health 2) Run One-Click Demo</p>
        <div className="mes-actions">
          <button className="btn" type="button" disabled={testerPending || demoPending} onClick={runQuickHealth}>
            {testerPending ? 'Checking...' : '1) Check Health'}
          </button>
          <button className="btn" type="button" disabled={demoPending || testerPending} onClick={runOneClickDemo}>
            {demoPending ? 'Running Demo...' : '2) Run One-Click Demo'}
          </button>
          <button className="btn secondary" type="button" onClick={() => setShowAdvanced((prev) => !prev)}>
            {showAdvanced ? 'ซ่อนโหมดละเอียด' : 'เปิดโหมดละเอียด'}
          </button>
        </div>
        {!showAdvanced && testerStatus ? <div className={`notice ${testerStatus.kind}`}>{testerStatus.message}</div> : null}
        {!showAdvanced && demoSummary ? (
          <div className="notice ok">
            Demo done: woId={demoSummary.woId}, unit={demoSummary.unitSn}, routeCode={demoSummary.routeCode || '-'}, routeState={demoSummary.routeState || '-'}, woStatus={demoSummary.woStatus || '-'}
          </div>
        ) : null}
        {!showAdvanced && testerResponse ? <pre className="mes-response">{testerResponse}</pre> : null}
      </section>

      <section className="panel mes-monitor">
        <div className="panel__row">
          <div>
            <h2 className="panel__title panel__title--sm">Station Monitoring Dashboard</h2>
            <p className="panel__subtitle">ภาพรวมแต่ละสถานีจาก WIP + routing events ใช้เช็กคอขวดและจุดเสี่ยง rework/fail</p>
          </div>
          <div className="mes-actions">
            <button
              className="btn"
              type="button"
              onClick={() => void refreshStationMonitor()}
              disabled={monitorPending}
            >
              {monitorPending ? 'Refreshing...' : 'Refresh Monitor'}
            </button>
            <button className="btn secondary" type="button" onClick={() => setMonitorAutoRefresh((prev) => !prev)}>
              Auto 15s: {monitorAutoRefresh ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>

        <form
          className="mes-monitor-controls"
          onSubmit={(event) => {
            event.preventDefault();
            void refreshStationMonitor();
          }}
        >
          <label className="field">
            <span>Lookback (hours)</span>
            <input value={monitorHours} onChange={(event) => setMonitorHours(event.target.value)} placeholder="24" />
          </label>
          <label className="field">
            <span>Route Code (optional)</span>
            <input
              value={monitorRouteCode}
              onChange={(event) => setMonitorRouteCode(event.target.value)}
              placeholder="DEFAULT_PD_CHAIN_R1R13"
            />
          </label>
          <button className="btn secondary" type="submit" disabled={monitorPending}>
            Apply Filter
          </button>
        </form>

        {monitorStatus ? <div className={`notice ${monitorStatus.kind}`}>{monitorStatus.message}</div> : null}

        {monitorData ? (
          <>
            <div className="mes-monitor-kpis">
              <div className="mes-monitor-kpi">
                <span>Tracked Units</span>
                <strong>{monitorData.summary.units_tracked}</strong>
              </div>
              <div className="mes-monitor-kpi">
                <span>In Station</span>
                <strong>{monitorData.summary.units_in_station}</strong>
              </div>
              <div className="mes-monitor-kpi">
                <span>Rework Required</span>
                <strong>{monitorData.summary.units_rework_required}</strong>
              </div>
              <div className="mes-monitor-kpi">
                <span>Fail in Window</span>
                <strong>{monitorData.summary.scan_out_fail_count_window}</strong>
              </div>
              <div className="mes-monitor-kpi">
                <span>Routes</span>
                <strong>{monitorData.summary.routes_total}</strong>
              </div>
              <div className="mes-monitor-kpi">
                <span>Stations</span>
                <strong>{monitorData.summary.stations_total}</strong>
              </div>
            </div>

            <p className="panel__subtitle">
              Snapshot: {formatDateTimeLabel(monitorData.as_of)} | Window: {monitorData.lookback_hours}h
              {monitorData.filter.route_code ? ` | Route: ${monitorData.filter.route_code}` : ' | Route: all active'}
            </p>

            <div className="mes-monitor-routes">
              {monitorData.routes.map((route) => (
                <div key={route.route_id} className="mes-monitor-route">
                  <strong>{route.route_code}</strong>
                  <span>mode={route.enforce_sequence ? 'SEQUENCE' : 'FLEX'}</span>
                  <span>tracked={route.units_tracked}</span>
                  <span>rework={route.units_rework_required}</span>
                </div>
              ))}
            </div>

            <div className="table-wrap">
              <table className="table compact">
                <thead>
                  <tr>
                    <th>Route</th>
                    <th>Step</th>
                    <th>Station</th>
                    <th className="num">In Station</th>
                    <th className="num">Ready Next</th>
                    <th className="num">Rework</th>
                    <th className="num">Scan-In</th>
                    <th className="num">Pass</th>
                    <th className="num">Fail</th>
                    <th>Last Scan</th>
                    <th>Age</th>
                  </tr>
                </thead>
                <tbody>
                  {monitorData.stations.map((station) => (
                    <tr
                      key={`${station.route_id}-${station.step_order}-${station.station_name}`}
                      className={station.units_rework_required > 0 || station.scan_out_fail_count > 0 ? 'mes-monitor-row-alert' : ''}
                    >
                      <td className="code">{station.route_code}</td>
                      <td className="num">{station.step_order}</td>
                      <td>{station.station_name}</td>
                      <td className="num">{station.units_in_station}</td>
                      <td className="num">{station.units_ready_next}</td>
                      <td className="num">{station.units_rework_required}</td>
                      <td className="num">{station.scan_in_count}</td>
                      <td className="num">{station.scan_out_pass_count}</td>
                      <td className="num">{station.scan_out_fail_count}</td>
                      <td>{formatDateTimeLabel(station.last_scan_at)}</td>
                      <td>{formatAgeLabel(station.last_activity_age_sec)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="empty">ยังไม่มี snapshot monitor กด Refresh Monitor เพื่อโหลดข้อมูล</div>
        )}
      </section>

      <div className="mes-module-grid">
        <div className="mes-module-tabs" role="tablist" aria-label="MES module tabs">
          {modules.map((item) => (
            <button
              key={item.code}
              type="button"
              role="tab"
              aria-selected={activeModule.code === item.code}
              className={activeModule.code === item.code ? 'mes-module-tab active' : 'mes-module-tab'}
              onClick={() => selectModule(item.code)}
            >
              M{item.code}
            </button>
          ))}
        </div>

        <article className="mes-module-card">
          <div className="mes-module-head">
            <span className="mes-module-code">Module {activeModule.code}</span>
            <h2>{activeModule.title}</h2>
          </div>
          <p>{activeModule.objective}</p>
          <div className="mes-endpoints">
            {activeModule.endpoints.map((endpoint) => (
              <a
                key={`${activeModule.code}-${endpoint}`}
                href={`${mesBaseUrl}${endpoint.replace(':woId', '1').replace(':bomId', '1')}`}
                target="_blank"
                rel="noreferrer"
              >
                {endpoint}
              </a>
            ))}
          </div>
          <div className="mes-case-context">
            <label className="field">
              <span>WO ID</span>
              <input value={caseWoId} onChange={(event) => setCaseWoId(event.target.value)} />
            </label>
            <label className="field">
              <span>BOM ID</span>
              <input value={caseBomId} onChange={(event) => setCaseBomId(event.target.value)} />
            </label>
            <label className="field">
              <span>UID</span>
              <input value={caseUid} onChange={(event) => setCaseUid(event.target.value)} />
            </label>
            <label className="field">
              <span>Unit SN</span>
              <input value={caseUnitSn} onChange={(event) => setCaseUnitSn(event.target.value)} />
            </label>
          </div>
          <div className="mes-actions">
            <button className="btn secondary" type="button" disabled={activeModuleIndex <= 0} onClick={() => shiftActiveModule(-1)}>
              Prev Module
            </button>
            <button className="btn secondary" type="button" disabled={activeModuleIndex >= modules.length - 1} onClick={() => shiftActiveModule(1)}>
              Next Module
            </button>
          </div>
          <div className="mes-module-presets">
            {activeModulePresets.map((preset) => (
              <button
                key={`${activeModule.code}-${preset.label}`}
                type="button"
                className={preset.label === selectedPreset ? 'mes-preset-chip active' : 'mes-preset-chip'}
                disabled={testerPending || demoPending}
                onClick={() => runCasePreset(preset.label)}
              >
                {preset.label}
              </button>
            ))}
          </div>
          {activeModule.code === '06' ? (
            <div className="mes-routing-quick">
              <label className="field">
                <span>Route Code</span>
                <select value={effectiveRouteCode} onChange={(event) => handleRouteCodeChange(event.target.value)}>
                  {availableRoutes.length ? (
                    availableRoutes.map((route) => (
                      <option key={route.route_code} value={route.route_code}>
                        {route.route_code}{route.is_default ? ' (default)' : ''}
                      </option>
                    ))
                  ) : (
                    <option value="">Fallback route list</option>
                  )}
                </select>
              </label>
              <label className="field">
                <span>Routing Station</span>
                <select value={caseRouteStation} onChange={(event) => handleRouteStationChange(event.target.value)}>
                  {routingStationOptions.map((station) => (
                    <option key={`${effectiveRouteCode || 'fallback'}-${station.station_name}`} value={station.station_name}>
                      {String(station.step_order).padStart(2, '0')} · {station.station_name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="panel__subtitle">
                {activeRoutingRoute
                  ? `Route mode: ${activeRoutingRoute.enforce_sequence ? 'SEQUENCE' : 'FLEX'} | Steps: ${activeRoutingRoute.steps.length} | Selected step: ${selectedRoutingStation?.step_order || '-'}`
                  : 'Using fallback station list until route catalog loads'}
                {selectedRoutingStation?.requires_fai ? ' | requires FAI' : ''}
                {selectedRoutingStation && !selectedRoutingStation.is_required ? ' | optional step' : ''}
              </p>
              {routeCatalogStatus ? <div className={`notice ${routeCatalogStatus.kind}`}>{routeCatalogStatus.message}</div> : null}
              <div className="mes-actions">
                <button className="btn secondary" type="button" disabled={testerPending || demoPending} onClick={() => runRoutingQuick('SCAN_IN')}>
                  Scan-In
                </button>
                <button className="btn secondary" type="button" disabled={testerPending || demoPending} onClick={() => runRoutingQuick('PASS')}>
                  Scan-Out PASS
                </button>
                <button className="btn danger" type="button" disabled={testerPending || demoPending} onClick={() => runRoutingQuick('FAIL')}>
                  Scan-Out FAIL
                </button>
                <button className="btn secondary" type="button" disabled={routeCatalogPending} onClick={() => void refreshRouteCatalog()}>
                  {routeCatalogPending ? 'Loading Route Catalog...' : 'Reload Route Catalog'}
                </button>
              </div>
            </div>
          ) : null}
        </article>
      </div>

      {showAdvanced ? (
        <>
          <section className="panel mes-demo-runner">
            <h2 className="panel__title panel__title--sm">One-Click Demo Runner</h2>
            <p className="panel__subtitle">กดปุ่มเดียว ระบบจะรันครบ BOM to Pre-WO to Incoming Checklist to WO Convert to Routing to QA-OBA to Dual Close to Delivery Prepare</p>
            <p className="panel__subtitle">ค่าเริ่มต้น Demo User IDs: PM=1, STORE=2, QA=3, PD=4, TECH=5</p>

            <div className="filters-grid">
              <label className="field">
                <span>PM ID</span>
                <input value={pmId} onChange={(event) => setPmId(event.target.value)} />
              </label>
              <label className="field">
                <span>STORE ID</span>
                <input value={storeId} onChange={(event) => setStoreId(event.target.value)} />
              </label>
              <label className="field">
                <span>QA ID</span>
                <input value={qaId} onChange={(event) => setQaId(event.target.value)} />
              </label>
              <label className="field">
                <span>PD ID</span>
                <input value={pdId} onChange={(event) => setPdId(event.target.value)} />
              </label>
              <label className="field">
                <span>TECH ID</span>
                <input value={techId} onChange={(event) => setTechId(event.target.value)} />
              </label>
            </div>

            <div className="mes-actions">
              <button className="btn" type="button" disabled={demoPending} onClick={runOneClickDemo}>
                {demoPending ? 'Running Demo...' : 'Run One-Click Demo'}
              </button>
              <button
                className="btn secondary"
                type="button"
                onClick={() => {
                  setDemoLogs([]);
                  setDemoSummary(null);
                }}
              >
                Clear Demo Log
              </button>
            </div>

            {demoSummary ? (
              <div className="notice ok">
                Demo IDs: bomId={demoSummary.bomId}, woId={demoSummary.woId}, woNumber={demoSummary.woNumber || '-'}, uid={demoSummary.uid}, unitSn={demoSummary.unitSn}, routeCode={demoSummary.routeCode || '-'}, routeState={demoSummary.routeState || '-'}, oba={demoSummary.obaResult || '-'}, woStatus={demoSummary.woStatus || '-'}, yield={demoSummary.yieldPct || '-'}%
              </div>
            ) : null}

            {demoLogs.length ? (
              <div className="mes-demo-log">
                {demoLogs.map((item, idx) => (
                  <div key={`${item.step}-${idx}`} className={`mes-demo-item ${item.status}`}>
                    <strong>{item.step}</strong>
                    <span>{item.message}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <form className="panel mes-tester" onSubmit={runTester}>
            <h2 className="panel__title panel__title--sm">MES API Tester</h2>
            <p className="panel__subtitle">ยิง API ได้จากหน้าเว็บโดยตั้ง Role/User/Header และ JSON payload ได้ทันที</p>
            <p className="panel__subtitle">`User ID` ใส่เมื่อ endpoint ต้องระบุผู้อนุมัติ (เช่น QA/MGR gate) ถ้าไม่แน่ใจให้ปล่อยว่างก่อน</p>

            <div className="filters-grid">
              <label className="field field--wide">
                <span>Preset</span>
                <select value={selectedPreset} onChange={(event) => applyPreset(event.target.value)}>
                  {testerPresets.map((item) => (
                    <option key={item.label} value={item.label}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Method</span>
                <select value={testerMethod} onChange={(event) => setTesterMethod(event.target.value as 'GET' | 'POST' | 'PUT')}>
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                </select>
              </label>

              <label className="field">
                <span>Role</span>
                <select value={testerRole} onChange={(event) => setTesterRole(event.target.value)}>
                  {MES_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>User ID</span>
                <input value={testerUserId} onChange={(event) => setTesterUserId(event.target.value)} placeholder="1" />
              </label>

              <label className="field">
                <span>Route Code</span>
                <select value={effectiveRouteCode} onChange={(event) => handleRouteCodeChange(event.target.value)}>
                  {availableRoutes.length ? (
                    availableRoutes.map((route) => (
                      <option key={`tester-${route.route_code}`} value={route.route_code}>
                        {route.route_code}
                      </option>
                    ))
                  ) : (
                    <option value="">Fallback route list</option>
                  )}
                </select>
              </label>

              <label className="field">
                <span>Station Name</span>
                <select value={caseRouteStation} onChange={(event) => handleRouteStationChange(event.target.value)}>
                  {routingStationOptions.map((station) => (
                    <option key={`tester-${station.station_name}`} value={station.station_name}>
                      {String(station.step_order).padStart(2, '0')} · {station.station_name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field field--wide">
                <span>API Path</span>
                <input value={testerPath} onChange={(event) => setTesterPath(event.target.value)} placeholder="/api/mes/health" />
              </label>

              <label className="field field--wide">
                <span>JSON Body (for POST/PUT)</span>
                <textarea value={testerBody} onChange={(event) => setTesterBody(event.target.value)} placeholder="{}" />
              </label>
            </div>

            <div className="mes-actions">
              <button className="btn" type="submit" disabled={testerPending}>
                {testerPending ? 'Sending...' : 'Send Request'}
              </button>
              <button
                className="btn secondary"
                type="button"
                onClick={() => {
                  setTesterStatus(null);
                  setTesterResponse('');
                }}
              >
                Clear Output
              </button>
            </div>

            {testerStatus ? <div className={`notice ${testerStatus.kind}`}>{testerStatus.message}</div> : null}
            {testerResponse ? <pre className="mes-response">{testerResponse}</pre> : null}
          </form>
        </>
      ) : null}
    </section>
  );
}
