import { useEffect, useMemo, useState } from 'react';
import api from '../lib/api';

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

type RouteCatalogResponse = {
  default_route_code: string | null;
  routes: RouteCatalogRoute[];
};

type RouteDraftStep = {
  step_order: number;
  station_name: string;
  station_type: string;
  requires_fai: boolean;
  is_required: boolean;
  allow_rework: boolean;
};

type RouteDraft = {
  route_id: number | null;
  route_code: string;
  route_name: string;
  is_active: boolean;
  is_default: boolean;
  enforce_sequence: boolean;
  steps: RouteDraftStep[];
};

type Notice = {
  kind: 'ok' | 'warn' | 'err';
  message: string;
};

const PRODUCTION_ONLY_STATION_TYPE = 'PD';
const DEFAULT_STEP: RouteDraftStep = {
  step_order: 1,
  station_name: '',
  station_type: PRODUCTION_ONLY_STATION_TYPE,
  requires_fai: false,
  is_required: true,
  allow_rework: true,
};

const PRODUCTION_FLEX_TEMPLATE_STEPS: RouteDraftStep[] = [
  { step_order: 1, station_name: 'SMT_SMD', station_type: PRODUCTION_ONLY_STATION_TYPE, requires_fai: false, is_required: true, allow_rework: true },
  { step_order: 2, station_name: 'THU_INSERT', station_type: PRODUCTION_ONLY_STATION_TYPE, requires_fai: false, is_required: true, allow_rework: true },
  { step_order: 3, station_name: 'ICT', station_type: PRODUCTION_ONLY_STATION_TYPE, requires_fai: false, is_required: true, allow_rework: true },
  { step_order: 4, station_name: 'FCT_PCBA', station_type: PRODUCTION_ONLY_STATION_TYPE, requires_fai: false, is_required: true, allow_rework: true },
  { step_order: 5, station_name: 'BB_PREP', station_type: PRODUCTION_ONLY_STATION_TYPE, requires_fai: false, is_required: true, allow_rework: true },
  { step_order: 6, station_name: 'FCT_BBAS', station_type: PRODUCTION_ONLY_STATION_TYPE, requires_fai: false, is_required: true, allow_rework: true },
  { step_order: 7, station_name: 'FQC', station_type: PRODUCTION_ONLY_STATION_TYPE, requires_fai: false, is_required: true, allow_rework: true },
];

function buildProductionFlexTemplateSteps(): RouteDraftStep[] {
  return PRODUCTION_FLEX_TEMPLATE_STEPS.map((step) => ({ ...step }));
}

function emptyDraft(): RouteDraft {
  return {
    route_id: null,
    route_code: '',
    route_name: '',
    is_active: true,
    is_default: false,
    enforce_sequence: false,
    steps: [{ ...DEFAULT_STEP }],
  };
}

function routeToDraft(route: RouteCatalogRoute): RouteDraft {
  return {
    route_id: route.route_id,
    route_code: route.route_code,
    route_name: route.route_name,
    is_active: route.is_active,
    is_default: route.is_default,
    enforce_sequence: route.enforce_sequence,
    steps: route.steps.map((step) => ({
      step_order: step.step_order,
      station_name: step.station_name,
      station_type: PRODUCTION_ONLY_STATION_TYPE,
      requires_fai: step.requires_fai,
      is_required: step.is_required,
      allow_rework: step.allow_rework,
    })),
  };
}

function cloneDraft(route: RouteCatalogRoute): RouteDraft {
  return {
    ...routeToDraft(route),
    route_id: null,
    route_code: `${route.route_code}_COPY`,
    route_name: `${route.route_name} Copy`,
  };
}

function normalizeStepOrders(steps: RouteDraftStep[]): RouteDraftStep[] {
  return [...steps]
    .sort((left, right) => Number(left.step_order) - Number(right.step_order))
    .map((step, index) => ({
      ...step,
      station_type: PRODUCTION_ONLY_STATION_TYPE,
      step_order: index + 1,
    }));
}

function applyProductionFlexPreset(route: RouteDraft): RouteDraft {
  return {
    ...route,
    route_code: route.route_code || 'DEFAULT_PD_CHAIN_R1R13',
    route_name: route.route_name || 'Default Production Flex Route',
    is_active: true,
    enforce_sequence: false,
    steps: buildProductionFlexTemplateSteps(),
  };
}

function stationOverlapAudit(routes: RouteCatalogRoute[]) {
  const stationMap = new Map<string, string[]>();
  for (const route of routes) {
    for (const step of route.steps) {
      const stationName = String(step.normalized_station_name || step.station_name || '').trim();
      if (!stationName) continue;
      const list = stationMap.get(stationName) || [];
      list.push(route.route_code);
      stationMap.set(stationName, list);
    }
  }

  return Array.from(stationMap.entries())
    .filter(([, routeCodes]) => new Set(routeCodes).size > 1)
    .map(([stationName, routeCodes]) => ({
      station_name: stationName,
      route_codes: Array.from(new Set(routeCodes)).sort(),
    }))
    .sort((left, right) => left.station_name.localeCompare(right.station_name));
}

export function RouteAdminPage() {
  const [catalog, setCatalog] = useState<RouteCatalogResponse>({ default_route_code: null, routes: [] });
  const [draft, setDraft] = useState<RouteDraft>(emptyDraft);
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const defaultRoute = useMemo(
    () => catalog.routes.find((route) => route.is_default) || null,
    [catalog.routes]
  );
  const activeRoutes = useMemo(
    () => catalog.routes.filter((route) => route.is_active),
    [catalog.routes]
  );
  const overlapRows = useMemo(
    () => stationOverlapAudit(activeRoutes),
    [activeRoutes]
  );

  async function loadCatalog(preferredRouteId: number | null = selectedRouteId) {
    setLoading(true);
    try {
      const { data } = await api.get<RouteCatalogResponse>('/mes/routes/catalog');
      setCatalog({
        default_route_code: data.default_route_code || null,
        routes: Array.isArray(data.routes) ? data.routes : [],
      });

      const nextSelectedRoute =
        (Array.isArray(data.routes) ? data.routes : []).find((route) => route.route_id === preferredRouteId) ||
        (Array.isArray(data.routes) ? data.routes : []).find((route) => route.is_default) ||
        (Array.isArray(data.routes) ? data.routes : [])[0] ||
        null;

      if (nextSelectedRoute) {
        setSelectedRouteId(nextSelectedRoute.route_id);
        setDraft(routeToDraft(nextSelectedRoute));
      } else {
        setSelectedRouteId(null);
        setDraft(emptyDraft());
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'route catalog load failed';
      setNotice({ kind: 'err', message: `Load route catalog failed: ${message}` });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCatalog(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectRoute(route: RouteCatalogRoute) {
    setSelectedRouteId(route.route_id);
    setDraft(routeToDraft(route));
    setNotice(null);
  }

  function updateDraft<K extends keyof RouteDraft>(key: K, value: RouteDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function updateStep(index: number, key: keyof RouteDraftStep, value: RouteDraftStep[keyof RouteDraftStep]) {
    setDraft((prev) => ({
      ...prev,
      steps: prev.steps.map((step, stepIndex) => (
        stepIndex === index ? { ...step, [key]: value } : step
      )),
    }));
  }

  function addStep() {
    setDraft((prev) => ({
      ...prev,
      steps: [
        ...prev.steps,
        {
          ...DEFAULT_STEP,
          step_order: prev.steps.length + 1,
        },
      ],
    }));
  }

  function removeStep(index: number) {
    setDraft((prev) => ({
      ...prev,
      steps: normalizeStepOrders(prev.steps.filter((_, stepIndex) => stepIndex !== index)),
    }));
  }

  function moveStep(index: number, direction: -1 | 1) {
    setDraft((prev) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.steps.length) return prev;
      const nextSteps = [...prev.steps];
      const [current] = nextSteps.splice(index, 1);
      nextSteps.splice(nextIndex, 0, current);
      return { ...prev, steps: normalizeStepOrders(nextSteps) };
    });
  }

  function createNewRoute() {
    setSelectedRouteId(null);
    setDraft(emptyDraft());
    setNotice(null);
  }

  function loadProductionFlexPreset() {
    setDraft((prev) => applyProductionFlexPreset(prev));
    setNotice({
      kind: 'ok',
      message: 'Loaded Production FLEX preset: IQC/OBA stay outside the main route and rework stays in the exception loop.',
    });
  }

  function duplicateCurrentRoute() {
    const current = catalog.routes.find((route) => route.route_id === selectedRouteId);
    if (!current) {
      setNotice({ kind: 'warn', message: 'Select a route before cloning it.' });
      return;
    }
    setSelectedRouteId(null);
    setDraft(cloneDraft(current));
    setNotice({ kind: 'ok', message: `Cloned ${current.route_code}. Save with a new route code when ready.` });
  }

  async function saveRoute() {
    setSaving(true);
    setNotice(null);
    try {
      const payload = {
        route_code: draft.route_code,
        route_name: draft.route_name,
        is_active: draft.is_active,
        is_default: draft.is_default,
        enforce_sequence: draft.enforce_sequence,
        steps: draft.steps.map((step) => ({
          step_order: Number(step.step_order),
          station_name: step.station_name,
          station_type: PRODUCTION_ONLY_STATION_TYPE,
          requires_fai: step.requires_fai,
          is_required: step.is_required,
          allow_rework: step.allow_rework,
        })),
      };

      const response = draft.route_id == null
        ? await api.post<{ route: RouteCatalogRoute }>('/mes/routes', payload)
        : await api.put<{ route: RouteCatalogRoute }>(`/mes/routes/${draft.route_id}`, payload);

      const savedRouteId = Number(response.data.route?.route_id || 0) || null;
      setNotice({
        kind: 'ok',
        message: `${draft.route_id == null ? 'Created' : 'Updated'} route ${response.data.route?.route_code || draft.route_code}`,
      });
      await loadCatalog(savedRouteId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'save failed';
      setNotice({ kind: 'err', message: `Save route failed: ${message}` });
    } finally {
      setSaving(false);
    }
  }

  async function deleteRoute() {
    if (draft.route_id == null) {
      createNewRoute();
      return;
    }
    if (!window.confirm(`Delete route ${draft.route_code}? This only works when the route has no WIP/event history.`)) {
      return;
    }

    setSaving(true);
    setNotice(null);
    try {
      const { data } = await api.delete<{ deleted: boolean; route_code: string }>(`/mes/routes/${draft.route_id}`);
      setNotice({ kind: 'ok', message: `Deleted route ${data.route_code}` });
      await loadCatalog(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'delete failed';
      setNotice({ kind: 'err', message: `Delete route failed: ${message}` });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="stack-lg">
      <div className="panel" style={{ display: 'grid', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <h1 className="panel__title">Route Admin</h1>
            <p className="panel__subtitle">จัดการ production route master แบบ FLEX โดยให้ IQC, OBA และ rework หลุดออกจาก main route</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button className="btn secondary" type="button" onClick={() => void loadCatalog(selectedRouteId)} disabled={loading || saving}>
              {loading ? 'Reloading...' : 'Reload Catalog'}
            </button>
            <button className="btn secondary" type="button" onClick={duplicateCurrentRoute} disabled={saving || loading || selectedRouteId == null}>
              Clone Route
            </button>
            <button className="btn secondary" type="button" onClick={loadProductionFlexPreset} disabled={saving}>
              Load FLEX Preset
            </button>
            <button className="btn" type="button" onClick={createNewRoute} disabled={saving}>
              New Route
            </button>
          </div>
        </div>

        {notice ? <div className={`notice ${notice.kind}`}>{notice.message}</div> : null}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
          <div className="glass-panel" style={{ padding: '0.9rem' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Active Routes</div>
            <strong style={{ fontSize: '1.4rem' }}>{activeRoutes.length}</strong>
          </div>
          <div className="glass-panel" style={{ padding: '0.9rem' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Default Route</div>
            <strong style={{ fontSize: '1rem' }}>{defaultRoute?.route_code || catalog.default_route_code || 'missing'}</strong>
          </div>
          <div className="glass-panel" style={{ padding: '0.9rem' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Shared Stations</div>
            <strong style={{ fontSize: '1.4rem' }}>{overlapRows.length}</strong>
          </div>
          <div className="glass-panel" style={{ padding: '0.9rem' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Sequence Routes</div>
            <strong style={{ fontSize: '1.4rem' }}>{activeRoutes.filter((route) => route.enforce_sequence).length}</strong>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 360px) minmax(0, 1fr)', gap: '1rem', alignItems: 'start' }}>
        <aside className="panel" style={{ display: 'grid', gap: '0.75rem' }}>
          <div>
            <h2 className="panel__title panel__title--sm">Current Routes</h2>
            <p className="panel__subtitle">อ่านจาก `/api/mes/routes/catalog` โดยตรง</p>
          </div>
          <div style={{ display: 'grid', gap: '0.6rem' }}>
            {catalog.routes.map((route) => (
              <button
                key={route.route_id}
                type="button"
                onClick={() => selectRoute(route)}
                style={{
                  textAlign: 'left',
                  padding: '0.85rem',
                  borderRadius: 10,
                  border: route.route_id === selectedRouteId ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                  background: route.route_id === selectedRouteId ? 'rgba(59,130,246,0.12)' : 'var(--bg-panel)',
                  color: 'var(--text-main)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong>{route.route_code}</strong>
                  <span style={{ fontSize: '0.75rem', color: route.is_active ? 'var(--success)' : 'var(--text-muted)' }}>
                    {route.is_active ? 'ACTIVE' : 'INACTIVE'}
                  </span>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '0.35rem' }}>{route.route_name}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.76rem', marginTop: '0.45rem' }}>
                  {route.enforce_sequence ? 'SEQUENCE' : 'FLEX'} · {route.steps.length} steps
                  {route.is_default ? ' · default' : ''}
                </div>
              </button>
            ))}
            {!catalog.routes.length ? <div className="empty">ยังไม่พบ route master ในระบบ</div> : null}
          </div>
        </aside>

        <div style={{ display: 'grid', gap: '1rem' }}>
          <section className="panel" style={{ display: 'grid', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div>
                <h2 className="panel__title panel__title--sm">{draft.route_id == null ? 'New Route Draft' : `Edit Route #${draft.route_id}`}</h2>
                <p className="panel__subtitle">route หลักนี้มีไว้สำหรับ Production only และเปิดแบบ FLEX ไม่บังคับลำดับ</p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button className="btn secondary" type="button" onClick={() => setDraft((prev) => ({ ...prev, steps: normalizeStepOrders(prev.steps) }))} disabled={saving}>
                  Normalize Steps
                </button>
                <button className="btn" type="button" onClick={() => void saveRoute()} disabled={saving}>
                  {saving ? 'Saving...' : draft.route_id == null ? 'Create Route' : 'Save Route'}
                </button>
                <button className="btn secondary" type="button" onClick={() => updateDraft('is_active', !draft.is_active)} disabled={saving}>
                  {draft.is_active ? 'Mark Inactive' : 'Mark Active'}
                </button>
                <button className="btn danger" type="button" onClick={() => void deleteRoute()} disabled={saving || draft.route_id == null}>
                  Delete Route
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
              <label className="field">
                <span>Route Code</span>
                <input value={draft.route_code} onChange={(event) => updateDraft('route_code', event.target.value.toUpperCase())} placeholder="DEFAULT_PD_CHAIN_R1R13" />
              </label>
              <label className="field">
                <span>Route Name</span>
                <input value={draft.route_name} onChange={(event) => updateDraft('route_name', event.target.value)} placeholder="Default Production Flex Route" />
              </label>
            </div>

            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <label style={{ display: 'inline-flex', gap: '0.45rem', alignItems: 'center' }}>
                <input type="checkbox" checked={draft.is_active} onChange={(event) => updateDraft('is_active', event.target.checked)} />
                <span>Active route</span>
              </label>
              <label style={{ display: 'inline-flex', gap: '0.45rem', alignItems: 'center' }}>
                <input type="checkbox" checked={draft.is_default} onChange={(event) => updateDraft('is_default', event.target.checked)} />
                <span>Default route</span>
              </label>
              <label style={{ display: 'inline-flex', gap: '0.45rem', alignItems: 'center' }}>
                <input type="checkbox" checked={draft.enforce_sequence} onChange={(event) => updateDraft('enforce_sequence', event.target.checked)} />
                <span>Enforce sequence</span>
              </label>
            </div>

            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Station Steps</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>main route นี้เก็บเฉพาะ production stages; IQC อยู่ Module 02, OBA อยู่ Module 08, rework เป็น exception loop</p>
                </div>
                <button className="btn secondary" type="button" onClick={addStep} disabled={saving}>
                  Add Step
                </button>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ minWidth: 920 }}>
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Station</th>
                      <th>Scope</th>
                      <th>FAI</th>
                      <th>Required</th>
                      <th>Rework</th>
                      <th>Move</th>
                      <th>Remove</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draft.steps.map((step, index) => (
                      <tr key={`${draft.route_id || 'new'}-${index}`}>
                        <td>
                          <input
                            className="form-input"
                            value={step.step_order}
                            onChange={(event) => updateStep(index, 'step_order', Number(event.target.value || 0))}
                            style={{ minWidth: 80 }}
                          />
                        </td>
                        <td>
                          <input
                            className="form-input"
                            value={step.station_name}
                            onChange={(event) => updateStep(index, 'station_name', event.target.value.toUpperCase().replace(/\s+/g, '_'))}
                            placeholder="SMT_SMD"
                          />
                        </td>
                        <td>
                          <div className="form-input" style={{ display: 'inline-flex', alignItems: 'center', minWidth: 96 }}>
                            {PRODUCTION_ONLY_STATION_TYPE}
                          </div>
                        </td>
                        <td>
                          <input type="checkbox" checked={step.requires_fai} onChange={(event) => updateStep(index, 'requires_fai', event.target.checked)} />
                        </td>
                        <td>
                          <input type="checkbox" checked={step.is_required} onChange={(event) => updateStep(index, 'is_required', event.target.checked)} />
                        </td>
                        <td>
                          <input type="checkbox" checked={step.allow_rework} onChange={(event) => updateStep(index, 'allow_rework', event.target.checked)} />
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.35rem' }}>
                            <button className="btn secondary" type="button" onClick={() => moveStep(index, -1)} disabled={index === 0 || saving}>Up</button>
                            <button className="btn secondary" type="button" onClick={() => moveStep(index, 1)} disabled={index === draft.steps.length - 1 || saving}>Down</button>
                          </div>
                        </td>
                        <td>
                          <button className="btn danger" type="button" onClick={() => removeStep(index)} disabled={draft.steps.length <= 1 || saving}>
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="panel" style={{ display: 'grid', gap: '1rem' }}>
            <div>
              <h2 className="panel__title panel__title--sm">Route Master Check</h2>
              <p className="panel__subtitle">มุมนี้ช่วยเช็ก route master ปัจจุบันว่ามีจุดเสี่ยงอะไรบ้างก่อนเอาไปใช้หน้างาน</p>
            </div>

            <div className="glass-panel" style={{ padding: '0.9rem' }}>
              <strong style={{ display: 'block', marginBottom: '0.5rem' }}>Quick Findings</strong>
              <ul style={{ display: 'grid', gap: '0.35rem', paddingLeft: '1rem' }}>
                <li>{defaultRoute ? `Default route is ${defaultRoute.route_code}` : 'No default active route found'}</li>
                <li>{overlapRows.length ? `${overlapRows.length} station(s) appear in more than one active route` : 'No overlapping stations across active routes'}</li>
                <li>{activeRoutes.some((route) => route.enforce_sequence) ? 'At least one active route enforces sequence' : 'All active routes are currently FLEX mode'}</li>
                <li>{activeRoutes.every((route) => route.steps.length > 0) ? 'Every active route has at least one step' : 'Some active routes have no steps'}</li>
              </ul>
            </div>

            {overlapRows.length ? (
              <div className="glass-panel" style={{ padding: '0.9rem' }}>
                <strong style={{ display: 'block', marginBottom: '0.5rem' }}>Shared Stations Across Active Routes</strong>
                <div style={{ display: 'grid', gap: '0.45rem' }}>
                  {overlapRows.map((row) => (
                    <div key={row.station_name} style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: '0.65rem' }}>
                      <div style={{ fontWeight: 600 }}>{row.station_name}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{row.route_codes.join(', ')}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div style={{ overflowX: 'auto' }}>
              <table style={{ minWidth: 880 }}>
                <thead>
                  <tr>
                    <th>Route</th>
                    <th>Mode</th>
                    <th>Default</th>
                    <th>Active</th>
                    <th>Steps</th>
                    <th>Station Map</th>
                  </tr>
                </thead>
                <tbody>
                  {catalog.routes.map((route) => (
                    <tr key={`audit-${route.route_id}`}>
                      <td>
                        <strong>{route.route_code}</strong>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.2rem' }}>{route.route_name}</div>
                      </td>
                      <td>{route.enforce_sequence ? 'SEQUENCE' : 'FLEX'}</td>
                      <td>{route.is_default ? 'YES' : '-'}</td>
                      <td>{route.is_active ? 'YES' : 'NO'}</td>
                      <td>{route.steps.length}</td>
                      <td style={{ maxWidth: 420 }}>
                        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                          {route.steps.map((step) => (
                            <span
                              key={`${route.route_id}-${step.step_order}`}
                              style={{
                                display: 'inline-flex',
                                gap: '0.25rem',
                                alignItems: 'center',
                                padding: '0.25rem 0.45rem',
                                borderRadius: 999,
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid var(--border-color)',
                                fontSize: '0.75rem',
                              }}
                            >
                              <strong>{step.step_order}</strong>
                              <span>{step.station_name}</span>
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
