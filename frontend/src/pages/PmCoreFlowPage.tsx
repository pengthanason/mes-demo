import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { fmtDateTime, fmtNum, normalizeText, parseNumber } from '../lib/format';

type Notice = {
  kind: 'ok' | 'warn' | 'err';
  message: string;
};

type PmLead = {
  project_id: string;
  customer: string;
  model: string;
  req_qty: number;
  due_date: string | null;
  status: string;
  scope_boundary: string;
  acceptance_criteria: string;
  feasibility_notes: string;
  lead_time_days: number | null;
  owner_id: number | null;
  created_at: string;
  updated_at: string;
};

type CrLog = {
  cr_id: number;
  project_id: string;
  description: string;
  impact_cost: number;
  impact_time_days: number;
  impact_risk: string;
  is_approved: boolean | null;
  created_at: string;
};

type LeadDetailResponse = {
  success: boolean;
  lead: PmLead;
  cr_logs: CrLog[];
};

function toErrorMessage(error: unknown): string {
  const apiError = (error as { response?: { data?: { error?: string; message?: string } } })?.response?.data;
  if (apiError?.error) return apiError.error;
  if (apiError?.message) return apiError.message;
  if (error instanceof Error) return error.message;
  return 'request failed';
}

export function PmCoreFlowPage() {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [leadForm, setLeadForm] = useState({
    project_id: '',
    customer: '',
    model: '',
    req_qty: '0',
    due_date: '',
    scope_boundary: '',
    acceptance_criteria: '',
  });
  const [g1Form, setG1Form] = useState({ is_approved: true, reason: '' });
  const [g2Form, setG2Form] = useState({ is_feasible: true, lead_time_days: '14', feasibility_notes: '' });
  const [g3Form, setG3Form] = useState({ outcome: 'YES', reason_code: '' });
  const [crForm, setCrForm] = useState({ description: '', impact_cost: '0', impact_time_days: '0', impact_risk: '' });

  const leadsQuery = useQuery({
    queryKey: ['pm-leads'],
    queryFn: async () => {
      const { data } = await api.get<{ success: boolean; leads: PmLead[] }>('/pm/leads', {
        headers: { 'X-Client-Page': 'react_pm_core_flow' },
      });
      return data.leads || [];
    },
  });

  const leads = leadsQuery.data || [];

  useEffect(() => {
    if (!leads.length) {
      setSelectedLeadId('');
      return;
    }
    if (!selectedLeadId) {
      setSelectedLeadId(leads[0].project_id);
      return;
    }
    if (!leads.some((lead) => lead.project_id === selectedLeadId)) {
      setSelectedLeadId(leads[0].project_id);
    }
  }, [leads, selectedLeadId]);

  const leadDetailQuery = useQuery({
    queryKey: ['pm-lead-detail', selectedLeadId],
    enabled: Boolean(selectedLeadId),
    queryFn: async () => {
      const { data } = await api.get<LeadDetailResponse>(`/pm/leads/${encodeURIComponent(selectedLeadId)}`, {
        headers: { 'X-Client-Page': 'react_pm_core_flow' },
      });
      return data;
    },
  });

  const selectedLead = useMemo(() => {
    if (leadDetailQuery.data?.lead) return leadDetailQuery.data.lead;
    return leads.find((lead) => lead.project_id === selectedLeadId) || null;
  }, [leadDetailQuery.data, leads, selectedLeadId]);

  const createLead = useMutation({
    mutationFn: async () => {
      const payload = {
        project_id: normalizeText(leadForm.project_id),
        customer: normalizeText(leadForm.customer),
        model: normalizeText(leadForm.model),
        req_qty: parseNumber(leadForm.req_qty),
        due_date: leadForm.due_date ? new Date(leadForm.due_date).toISOString() : null,
        scope_boundary: normalizeText(leadForm.scope_boundary),
        acceptance_criteria: normalizeText(leadForm.acceptance_criteria),
      };
      const { data } = await api.post<{ success: boolean; lead: PmLead }>('/pm/leads', payload, {
        headers: { 'X-Client-Page': 'react_pm_core_flow' },
      });
      return data.lead;
    },
    onSuccess: async (lead) => {
      setLeadForm({
        project_id: '',
        customer: '',
        model: '',
        req_qty: '0',
        due_date: '',
        scope_boundary: '',
        acceptance_criteria: '',
      });
      setSelectedLeadId(lead.project_id);
      setNotice({ kind: 'ok', message: `Lead ${lead.project_id} created` });
      await queryClient.invalidateQueries({ queryKey: ['pm-leads'] });
    },
    onError: (error) => {
      setNotice({ kind: 'err', message: `Create lead failed: ${toErrorMessage(error)}` });
    },
  });

  const gateG1 = useMutation({
    mutationFn: async () => {
      if (!selectedLeadId) throw new Error('No lead selected');
      await api.put(
        `/pm/leads/${encodeURIComponent(selectedLeadId)}/gate-g1`,
        {
          is_approved: g1Form.is_approved,
          reason: normalizeText(g1Form.reason),
        },
        { headers: { 'X-Client-Page': 'react_pm_core_flow' } },
      );
    },
    onSuccess: async () => {
      setNotice({ kind: 'ok', message: `Gate G1 updated for ${selectedLeadId}` });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['pm-leads'] }),
        queryClient.invalidateQueries({ queryKey: ['pm-lead-detail', selectedLeadId] }),
      ]);
    },
    onError: (error) => setNotice({ kind: 'err', message: `Gate G1 failed: ${toErrorMessage(error)}` }),
  });

  const gateG2 = useMutation({
    mutationFn: async () => {
      if (!selectedLeadId) throw new Error('No lead selected');
      await api.put(
        `/pm/leads/${encodeURIComponent(selectedLeadId)}/gate-g2`,
        {
          is_feasible: g2Form.is_feasible,
          lead_time_days: Math.trunc(parseNumber(g2Form.lead_time_days)),
          feasibility_notes: normalizeText(g2Form.feasibility_notes),
        },
        { headers: { 'X-Client-Page': 'react_pm_core_flow' } },
      );
    },
    onSuccess: async () => {
      setNotice({ kind: 'ok', message: `Gate G2 updated for ${selectedLeadId}` });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['pm-leads'] }),
        queryClient.invalidateQueries({ queryKey: ['pm-lead-detail', selectedLeadId] }),
      ]);
    },
    onError: (error) => setNotice({ kind: 'err', message: `Gate G2 failed: ${toErrorMessage(error)}` }),
  });

  const gateG3 = useMutation({
    mutationFn: async () => {
      if (!selectedLeadId) throw new Error('No lead selected');
      await api.put(
        `/pm/leads/${encodeURIComponent(selectedLeadId)}/gate-g3`,
        {
          outcome: normalizeText(g3Form.outcome).toUpperCase(),
          reason_code: normalizeText(g3Form.reason_code),
        },
        { headers: { 'X-Client-Page': 'react_pm_core_flow' } },
      );
    },
    onSuccess: async () => {
      setNotice({ kind: 'ok', message: `Gate G3 updated for ${selectedLeadId}` });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['pm-leads'] }),
        queryClient.invalidateQueries({ queryKey: ['pm-lead-detail', selectedLeadId] }),
      ]);
    },
    onError: (error) => setNotice({ kind: 'err', message: `Gate G3 failed: ${toErrorMessage(error)}` }),
  });

  const createCr = useMutation({
    mutationFn: async () => {
      if (!selectedLeadId) throw new Error('No lead selected');
      await api.post(
        '/pm/cr',
        {
          project_id: selectedLeadId,
          description: normalizeText(crForm.description),
          impact_cost: parseNumber(crForm.impact_cost),
          impact_time_days: Math.trunc(parseNumber(crForm.impact_time_days)),
          impact_risk: normalizeText(crForm.impact_risk),
        },
        { headers: { 'X-Client-Page': 'react_pm_core_flow' } },
      );
    },
    onSuccess: async () => {
      setCrForm({ description: '', impact_cost: '0', impact_time_days: '0', impact_risk: '' });
      setNotice({ kind: 'ok', message: `CR logged for ${selectedLeadId}` });
      await queryClient.invalidateQueries({ queryKey: ['pm-lead-detail', selectedLeadId] });
    },
    onError: (error) => setNotice({ kind: 'err', message: `Create CR failed: ${toErrorMessage(error)}` }),
  });

  function submitCreateLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    createLead.mutate();
  }

  return (
    <div className="stack-lg">
      <section className="panel">
        <h1 className="panel__title">PM Core Flow (Module 11)</h1>
        <p className="panel__subtitle">Lead Intake, Gate Review (G1/G2/G3), and Change Request log.</p>

        {notice ? <div className={`notice ${notice.kind}`}>{notice.message}</div> : null}

        <form className="stack" onSubmit={submitCreateLead}>
          <div className="filters-grid">
            <label className="field">
              <span>Project ID</span>
              <input
                value={leadForm.project_id}
                onChange={(event) => setLeadForm((prev) => ({ ...prev, project_id: event.target.value }))}
                placeholder="PROJECT-2026-001"
              />
            </label>
            <label className="field">
              <span>Customer</span>
              <input
                value={leadForm.customer}
                onChange={(event) => setLeadForm((prev) => ({ ...prev, customer: event.target.value }))}
                placeholder="Customer name"
              />
            </label>
            <label className="field">
              <span>Model</span>
              <input
                value={leadForm.model}
                onChange={(event) => setLeadForm((prev) => ({ ...prev, model: event.target.value }))}
                placeholder="Model"
              />
            </label>
            <label className="field">
              <span>Required Qty</span>
              <input
                type="number"
                min={0}
                value={leadForm.req_qty}
                onChange={(event) => setLeadForm((prev) => ({ ...prev, req_qty: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>Due Date</span>
              <input
                type="date"
                value={leadForm.due_date}
                onChange={(event) => setLeadForm((prev) => ({ ...prev, due_date: event.target.value }))}
              />
            </label>
            <label className="field field--wide">
              <span>Scope Boundary</span>
              <input
                value={leadForm.scope_boundary}
                onChange={(event) => setLeadForm((prev) => ({ ...prev, scope_boundary: event.target.value }))}
                placeholder="Scope summary"
              />
            </label>
            <label className="field field--wide">
              <span>Acceptance Criteria</span>
              <input
                value={leadForm.acceptance_criteria}
                onChange={(event) => setLeadForm((prev) => ({ ...prev, acceptance_criteria: event.target.value }))}
                placeholder="Acceptance criteria"
              />
            </label>
          </div>
          <div className="panel__row">
            <button type="submit" className="btn" disabled={createLead.isPending}>
              {createLead.isPending ? 'Creating...' : 'Create PM Lead'}
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="panel__row">
          <h2 className="panel__title panel__title--sm">Lead Management Dashboard</h2>
          <button className="btn secondary" onClick={() => leadsQuery.refetch()} disabled={leadsQuery.isFetching}>
            {leadsQuery.isFetching ? 'Reloading...' : 'Reload'}
          </button>
        </div>

        {leadsQuery.isLoading ? <div className="empty">Loading leads...</div> : null}
        {leadsQuery.error ? <div className="notice err">Failed to load leads.</div> : null}

        {!leadsQuery.isLoading && !leads.length ? <div className="empty">No PM leads found.</div> : null}

        {!!leads.length ? (
          <div className="table-wrap">
            <table className="table compact">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Customer</th>
                  <th>Qty</th>
                  <th>Due Date</th>
                  <th>Status</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr
                    key={lead.project_id}
                    style={selectedLeadId === lead.project_id ? { background: '#f2f8ff' } : undefined}
                  >
                    <td>
                      <button className="btn secondary" onClick={() => setSelectedLeadId(lead.project_id)}>
                        {lead.project_id}
                      </button>
                    </td>
                    <td>{lead.customer || '-'}</td>
                    <td>{fmtNum(lead.req_qty)}</td>
                    <td>{fmtDateTime(lead.due_date)}</td>
                    <td>{lead.status}</td>
                    <td>{fmtDateTime(lead.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {selectedLead ? (
        <>
          <section className="panel">
            <h2 className="panel__title panel__title--sm">Lead Detail: {selectedLead.project_id}</h2>
            <p className="panel__subtitle">
              Status: <strong>{selectedLead.status}</strong> | Customer: {selectedLead.customer || '-'} | Qty:{' '}
              {fmtNum(selectedLead.req_qty)}
            </p>

            <div className="quick-grid quick-grid--dense">
              <form
                className="panel stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  gateG1.mutate();
                }}
              >
                <h3 className="panel__title panel__title--sm">Gate G1</h3>
                <label className="field">
                  <span>Decision</span>
                  <select
                    value={g1Form.is_approved ? 'APPROVE' : 'REJECT'}
                    onChange={(event) => setG1Form((prev) => ({ ...prev, is_approved: event.target.value === 'APPROVE' }))}
                  >
                    <option value="APPROVE">Approve</option>
                    <option value="REJECT">Reject</option>
                  </select>
                </label>
                <label className="field">
                  <span>Reason</span>
                  <input
                    value={g1Form.reason}
                    onChange={(event) => setG1Form((prev) => ({ ...prev, reason: event.target.value }))}
                    placeholder="Reason"
                  />
                </label>
                <button className="btn" type="submit" disabled={gateG1.isPending}>
                  {gateG1.isPending ? 'Saving...' : 'Submit G1'}
                </button>
              </form>

              <form
                className="panel stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  gateG2.mutate();
                }}
              >
                <h3 className="panel__title panel__title--sm">Gate G2</h3>
                <label className="field">
                  <span>Feasibility</span>
                  <select
                    value={g2Form.is_feasible ? 'YES' : 'NO'}
                    onChange={(event) => setG2Form((prev) => ({ ...prev, is_feasible: event.target.value === 'YES' }))}
                  >
                    <option value="YES">Feasible</option>
                    <option value="NO">Not feasible</option>
                  </select>
                </label>
                <label className="field">
                  <span>Lead Time (days)</span>
                  <input
                    type="number"
                    min={0}
                    value={g2Form.lead_time_days}
                    onChange={(event) => setG2Form((prev) => ({ ...prev, lead_time_days: event.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>Feasibility Notes</span>
                  <input
                    value={g2Form.feasibility_notes}
                    onChange={(event) => setG2Form((prev) => ({ ...prev, feasibility_notes: event.target.value }))}
                    placeholder="Notes"
                  />
                </label>
                <button className="btn" type="submit" disabled={gateG2.isPending}>
                  {gateG2.isPending ? 'Saving...' : 'Submit G2'}
                </button>
              </form>

              <form
                className="panel stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  gateG3.mutate();
                }}
              >
                <h3 className="panel__title panel__title--sm">Gate G3</h3>
                <label className="field">
                  <span>PO Outcome</span>
                  <select
                    value={g3Form.outcome}
                    onChange={(event) => setG3Form((prev) => ({ ...prev, outcome: event.target.value }))}
                  >
                    <option value="YES">YES (Won)</option>
                    <option value="WAIT">WAIT PO</option>
                    <option value="NO">NO (Lost)</option>
                  </select>
                </label>
                <label className="field">
                  <span>Reason Code</span>
                  <input
                    value={g3Form.reason_code}
                    onChange={(event) => setG3Form((prev) => ({ ...prev, reason_code: event.target.value }))}
                    placeholder="Reason code"
                  />
                </label>
                <button className="btn" type="submit" disabled={gateG3.isPending}>
                  {gateG3.isPending ? 'Saving...' : 'Submit G3'}
                </button>
              </form>
            </div>
          </section>

          <section className="panel">
            <h2 className="panel__title panel__title--sm">Change Request (CR) Log</h2>
            <form
              className="stack"
              onSubmit={(event) => {
                event.preventDefault();
                createCr.mutate();
              }}
            >
              <div className="filters-grid">
                <label className="field field--wide">
                  <span>Description</span>
                  <textarea
                    value={crForm.description}
                    onChange={(event) => setCrForm((prev) => ({ ...prev, description: event.target.value }))}
                    placeholder="Describe change request"
                  />
                </label>
                <label className="field">
                  <span>Impact Cost</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={crForm.impact_cost}
                    onChange={(event) => setCrForm((prev) => ({ ...prev, impact_cost: event.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>Impact Time (days)</span>
                  <input
                    type="number"
                    min={0}
                    value={crForm.impact_time_days}
                    onChange={(event) => setCrForm((prev) => ({ ...prev, impact_time_days: event.target.value }))}
                  />
                </label>
                <label className="field field--wide">
                  <span>Impact Risk</span>
                  <input
                    value={crForm.impact_risk}
                    onChange={(event) => setCrForm((prev) => ({ ...prev, impact_risk: event.target.value }))}
                    placeholder="Risk note"
                  />
                </label>
              </div>
              <div className="panel__row">
                <button className="btn" type="submit" disabled={createCr.isPending}>
                  {createCr.isPending ? 'Logging...' : 'Log CR'}
                </button>
              </div>
            </form>

            {leadDetailQuery.isLoading ? <div className="empty">Loading CR logs...</div> : null}
            {leadDetailQuery.data?.cr_logs?.length ? (
              <div className="table-wrap">
                <table className="table compact">
                  <thead>
                    <tr>
                      <th>CR ID</th>
                      <th>Description</th>
                      <th>Impact Cost</th>
                      <th>Impact Days</th>
                      <th>Risk</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leadDetailQuery.data.cr_logs.map((log) => (
                      <tr key={log.cr_id}>
                        <td>{log.cr_id}</td>
                        <td>{log.description}</td>
                        <td>{fmtNum(log.impact_cost)}</td>
                        <td>{fmtNum(log.impact_time_days)}</td>
                        <td>{log.impact_risk || '-'}</td>
                        <td>{fmtDateTime(log.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty">No CR logs for this lead.</div>
            )}
          </section>
        </>
      ) : (
        <section className="panel">
          <div className="empty">Select a lead to continue Gate review and CR logging.</div>
        </section>
      )}
    </div>
  );
}
