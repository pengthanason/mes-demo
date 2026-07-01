import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { fmtDateTime, fmtNum, normalizeText, parseNumber } from '../lib/format';
import { Paginator } from '../components/Paginator';

type Notice = {
  kind: 'ok' | 'warn' | 'err';
  message: string;
};

type ScmCase = {
  case_id: string;
  case_type: string;
  status: string;
  ref_po: string;
  ref_inv: string;
  part_no: string;
  owner_id: number | null;
  opened_by: number | null;
  opened_at: string;
  due_date: string | null;
  resolved_at: string | null;
  resolution_note: string;
  disposition_count: number;
};

type SplitResult = {
  split_id: number;
  original_uid: string;
  ok_uid: string;
  ng_uid: string;
  original_qty: number;
  ok_qty: number;
  ng_qty: number;
  split_at: string;
  reason: string;
};

function toErrorMessage(error: unknown): string {
  const apiError = (error as { response?: { data?: { error?: string; message?: string } } })?.response?.data;
  if (apiError?.error) return apiError.error;
  if (apiError?.message) return apiError.message;
  if (error instanceof Error) return error.message;
  return 'request failed';
}

// api (lib/api.ts) ไม่ throw เอง — คืน { data, status } เสมอ ต้องเช็ค status เองกัน "success ปลอม"
function ensureOk(res: { status: number; data: any }): void {
  if (res.status === 0) throw new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');
  if (res.status >= 400) throw new Error(res.data?.error || res.data?.message || `ทำรายการไม่สำเร็จ (${res.status})`);
}

export function ScmCasesPage() {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [statusFilter, setStatusFilter] = useState('OPEN');
  const [casePage, setCasePage] = useState(1);
  const CASE_PAGE_SIZE = 10;
  const [caseForm, setCaseForm] = useState({
    case_id: '',
    case_type: 'DOC_PENDING',
    ref_po: '',
    ref_inv: '',
    part_no: '',
    due_date: '',
  });
  const [resolveTarget, setResolveTarget] = useState<ScmCase | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [dispositionTarget, setDispositionTarget] = useState<ScmCase | null>(null);
  const [dispositionForm, setDispositionForm] = useState({
    action: 'RTV',
    rma_no: '',
    return_qty: '0',
  });
  const [splitForm, setSplitForm] = useState({
    original_uid: '',
    ok_qty: '0',
    ng_qty: '0',
    reason: '',
  });
  const [splitResult, setSplitResult] = useState<SplitResult | null>(null);

  const casesQuery = useQuery({
    queryKey: ['scm-cases', statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      const res = await api.get<{ success: boolean; cases: ScmCase[] }>(`/scm/cases?${params.toString()}`, {
        headers: { 'X-Client-Page': 'react_scm_cases' },
      });
      ensureOk(res);
      return res.data?.cases || [];
    },
  });

  const openCase = useMutation({
    mutationFn: async () => {
      const payload = {
        case_id: normalizeText(caseForm.case_id),
        case_type: normalizeText(caseForm.case_type).toUpperCase(),
        ref_po: normalizeText(caseForm.ref_po),
        ref_inv: normalizeText(caseForm.ref_inv),
        part_no: normalizeText(caseForm.part_no).toUpperCase(),
        due_date: caseForm.due_date ? new Date(caseForm.due_date).toISOString() : null,
      };
      ensureOk(await api.post('/scm/cases', payload, { headers: { 'X-Client-Page': 'react_scm_cases' } }));
    },
    onSuccess: async () => {
      setCaseForm({ case_id: '', case_type: 'DOC_PENDING', ref_po: '', ref_inv: '', part_no: '', due_date: '' });
      setNotice({ kind: 'ok', message: 'SCM case created' });
      await queryClient.invalidateQueries({ queryKey: ['scm-cases'] });
    },
    onError: (error) => setNotice({ kind: 'err', message: `Create case failed: ${toErrorMessage(error)}` }),
  });

  const resolveCase = useMutation({
    mutationFn: async () => {
      if (!resolveTarget) throw new Error('No case selected');
      ensureOk(await api.put(
        `/scm/cases/${encodeURIComponent(resolveTarget.case_id)}/resolve`,
        { resolution_note: normalizeText(resolutionNote) },
        { headers: { 'X-Client-Page': 'react_scm_cases' } },
      ));
    },
    onSuccess: async () => {
      setNotice({ kind: 'ok', message: 'Case resolved' });
      setResolveTarget(null);
      setResolutionNote('');
      await queryClient.invalidateQueries({ queryKey: ['scm-cases'] });
    },
    onError: (error) => setNotice({ kind: 'err', message: `Resolve case failed: ${toErrorMessage(error)}` }),
  });

  const createDisposition = useMutation({
    mutationFn: async () => {
      if (!dispositionTarget) throw new Error('No case selected');
      ensureOk(await api.post(
        '/scm/dispositions',
        {
          case_id: dispositionTarget.case_id,
          action: normalizeText(dispositionForm.action).toUpperCase(),
          rma_no: normalizeText(dispositionForm.rma_no),
          return_qty: parseNumber(dispositionForm.return_qty),
        },
        { headers: { 'X-Client-Page': 'react_scm_cases' } },
      ));
    },
    onSuccess: async () => {
      setNotice({ kind: 'ok', message: 'Supplier disposition submitted' });
      setDispositionTarget(null);
      setDispositionForm({ action: 'RTV', rma_no: '', return_qty: '0' });
      await queryClient.invalidateQueries({ queryKey: ['scm-cases'] });
    },
    onError: (error) => setNotice({ kind: 'err', message: `Create disposition failed: ${toErrorMessage(error)}` }),
  });

  const splitLot = useMutation({
    mutationFn: async () => {
      const res = await api.post<{ success: boolean; split: SplitResult }>(
        '/scm/lots/split',
        {
          original_uid: normalizeText(splitForm.original_uid),
          ok_qty: parseNumber(splitForm.ok_qty),
          ng_qty: parseNumber(splitForm.ng_qty),
          reason: normalizeText(splitForm.reason),
        },
        { headers: { 'X-Client-Page': 'react_scm_cases' } },
      );
      ensureOk(res);
      return res.data.split;
    },
    onSuccess: (payload) => {
      setSplitResult(payload);
      setNotice({ kind: 'ok', message: `Split lot done: OK=${payload.ok_uid} | NG=${payload.ng_uid}` });
    },
    onError: (error) => setNotice({ kind: 'err', message: `Split lot failed: ${toErrorMessage(error)}` }),
  });

  function submitOpenCase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    openCase.mutate();
  }

  function submitSplitLot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    splitLot.mutate();
  }

  return (
    <div className="stack-lg">
      <section className="panel">
        <h1 className="panel__title">SCM Cases</h1>
        <p className="panel__subtitle">จัดการเคสซัพพลาย — case inbox · lot split · supplier disposition</p>

        {notice ? <div className={`notice ${notice.kind}`}>{notice.message}</div> : null}

        <form className="stack" onSubmit={submitOpenCase}>
          <div className="filters-grid">
            <label className="field">
              <span>Case ID (optional)</span>
              <input
                value={caseForm.case_id}
                onChange={(event) => setCaseForm((prev) => ({ ...prev, case_id: event.target.value }))}
                placeholder="Auto if blank"
              />
            </label>
            <label className="field">
              <span>Case Type</span>
              <select
                value={caseForm.case_type}
                onChange={(event) => setCaseForm((prev) => ({ ...prev, case_type: event.target.value }))}
              >
                <option value="DOC_PENDING">DOC_PENDING</option>
                <option value="NO_PO">NO_PO</option>
                <option value="INV_PO_MISMATCH">INV_PO_MISMATCH</option>
                <option value="QTY_SHORT">QTY_SHORT</option>
                <option value="QTY_OVER">QTY_OVER</option>
                <option value="WRONG_ITEM">WRONG_ITEM</option>
                <option value="DAMAGED">DAMAGED</option>
                <option value="NG_QA">NG_QA</option>
              </select>
            </label>
            <label className="field">
              <span>Ref PO</span>
              <input
                value={caseForm.ref_po}
                onChange={(event) => setCaseForm((prev) => ({ ...prev, ref_po: event.target.value }))}
                placeholder="PO-123"
              />
            </label>
            <label className="field">
              <span>Ref Invoice</span>
              <input
                value={caseForm.ref_inv}
                onChange={(event) => setCaseForm((prev) => ({ ...prev, ref_inv: event.target.value }))}
                placeholder="INV-2026"
              />
            </label>
            <label className="field">
              <span>Part No</span>
              <input
                value={caseForm.part_no}
                onChange={(event) => setCaseForm((prev) => ({ ...prev, part_no: event.target.value }))}
                placeholder="1E2ASRES0001"
              />
            </label>
            <label className="field">
              <span>Due Date</span>
              <input
                type="date"
                value={caseForm.due_date}
                onChange={(event) => setCaseForm((prev) => ({ ...prev, due_date: event.target.value }))}
              />
            </label>
          </div>
          <div className="panel__row">
            <button type="submit" className="btn" disabled={openCase.isPending}>
              {openCase.isPending ? 'Opening...' : 'Open SCM Case'}
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="panel__row">
          <h2 className="panel__title panel__title--sm">Case Management Inbox</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setCasePage(1); }}>
              <option value="OPEN">OPEN</option>
              <option value="CLOSED">CLOSED</option>
              <option value="">ALL</option>
            </select>
            <button className="btn secondary" onClick={() => casesQuery.refetch()} disabled={casesQuery.isFetching}>
              {casesQuery.isFetching ? 'Reloading...' : 'Reload'}
            </button>
          </div>
        </div>

        {casesQuery.isLoading ? <div className="empty">Loading cases...</div> : null}
        {casesQuery.error ? <div className="notice err">Failed to load cases.</div> : null}

        {(() => {
          const caseData = casesQuery.data || [];
          const totalCasePages = Math.max(1, Math.ceil(caseData.length / CASE_PAGE_SIZE));
          const pagedCases = caseData.slice((casePage - 1) * CASE_PAGE_SIZE, casePage * CASE_PAGE_SIZE);
          return (
            <>
              {!casesQuery.isLoading && !caseData.length ? <div className="empty">No cases found.</div> : null}
              {caseData.length ? (
                <>
                <div className="table-wrap">
                  <table className="table compact">
                    <thead>
                      <tr>
                        <th>Case ID</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Part</th>
                        <th>Ref PO/INV</th>
                        <th>Due Date</th>
                        <th>Opened</th>
                        <th>Disposition</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedCases.map((item) => (
                        <tr key={item.case_id}>
                          <td className="code">{item.case_id}</td>
                          <td>{item.case_type}</td>
                          <td>{item.status}</td>
                          <td>{item.part_no || '-'}</td>
                          <td>
                            PO: {item.ref_po || '-'}
                            <br />
                            INV: {item.ref_inv || '-'}
                          </td>
                          <td>{fmtDateTime(item.due_date)}</td>
                          <td>{fmtDateTime(item.opened_at)}</td>
                          <td>{fmtNum(item.disposition_count || 0)}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              <button className="btn secondary" onClick={() => setDispositionTarget(item)}>
                                Disposition
                              </button>
                              <button
                                className="btn secondary"
                                onClick={() => {
                                  setResolveTarget(item);
                                  setResolutionNote(item.resolution_note || '');
                                }}
                                disabled={item.status === 'CLOSED'}
                              >
                                Resolve
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Paginator page={casePage} totalPages={totalCasePages} onPage={setCasePage} total={caseData.length} />
                </>
              ) : null}
            </>
          );
        })()}
      </section>

      <section className="panel">
        <h2 className="panel__title panel__title--sm">Split Lot SOP Wizard</h2>
        <form className="stack" onSubmit={submitSplitLot}>
          <div className="filters-grid">
            <label className="field">
              <span>Original UID</span>
              <input
                value={splitForm.original_uid}
                onChange={(event) => setSplitForm((prev) => ({ ...prev, original_uid: event.target.value }))}
                placeholder="UID-010126-0001"
              />
            </label>
            <label className="field">
              <span>OK Qty</span>
              <input
                type="number"
                min={0}
                step="0.001"
                value={splitForm.ok_qty}
                onChange={(event) => setSplitForm((prev) => ({ ...prev, ok_qty: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>NG Qty</span>
              <input
                type="number"
                min={0}
                step="0.001"
                value={splitForm.ng_qty}
                onChange={(event) => setSplitForm((prev) => ({ ...prev, ng_qty: event.target.value }))}
              />
            </label>
            <label className="field field--wide">
              <span>Reason</span>
              <input
                value={splitForm.reason}
                onChange={(event) => setSplitForm((prev) => ({ ...prev, reason: event.target.value }))}
                placeholder="Why split this lot?"
              />
            </label>
          </div>
          <div className="panel__row">
            <button className="btn" type="submit" disabled={splitLot.isPending}>
              {splitLot.isPending ? 'Splitting...' : 'Run Split'}
            </button>
          </div>
        </form>

        {splitResult ? (
          <div className="notice ok">
            Split complete | Original: {splitResult.original_uid} ({fmtNum(splitResult.original_qty)}) | OK UID: {splitResult.ok_uid} (
            {fmtNum(splitResult.ok_qty)}) | NG UID: {splitResult.ng_uid} ({fmtNum(splitResult.ng_qty)})
          </div>
        ) : null}
      </section>

      {resolveTarget ? (
        <div className="modal-overlay">
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <h3>Resolve Case: {resolveTarget.case_id}</h3>
            <form
              className="stack"
              onSubmit={(event) => {
                event.preventDefault();
                resolveCase.mutate();
              }}
            >
              <label className="field">
                <span>Resolution Note</span>
                <textarea
                  value={resolutionNote}
                  onChange={(event) => setResolutionNote(event.target.value)}
                  placeholder="How this case was resolved"
                />
              </label>
              <div className="modal-actions">
                <button type="button" className="btn secondary" onClick={() => setResolveTarget(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn" disabled={resolveCase.isPending}>
                  {resolveCase.isPending ? 'Saving...' : 'Confirm Resolve'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {dispositionTarget ? (
        <div className="modal-overlay">
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <h3>Supplier Disposition: {dispositionTarget.case_id}</h3>
            <form
              className="stack"
              onSubmit={(event) => {
                event.preventDefault();
                createDisposition.mutate();
              }}
            >
              <label className="field">
                <span>Action</span>
                <select
                  value={dispositionForm.action}
                  onChange={(event) => setDispositionForm((prev) => ({ ...prev, action: event.target.value }))}
                >
                  <option value="RTV">RTV</option>
                  <option value="SCRAP">SCRAP</option>
                  <option value="REPLACEMENT">REPLACEMENT</option>
                  <option value="USE_AS_IS">USE_AS_IS</option>
                  <option value="REWORK">REWORK</option>
                </select>
              </label>
              <label className="field">
                <span>RMA No</span>
                <input
                  value={dispositionForm.rma_no}
                  onChange={(event) => setDispositionForm((prev) => ({ ...prev, rma_no: event.target.value }))}
                  placeholder="RMA-001 (optional)"
                />
              </label>
              <label className="field">
                <span>Return Qty</span>
                <input
                  type="number"
                  min={0}
                  step="0.001"
                  value={dispositionForm.return_qty}
                  onChange={(event) => setDispositionForm((prev) => ({ ...prev, return_qty: event.target.value }))}
                />
              </label>
              <div className="modal-actions">
                <button type="button" className="btn secondary" onClick={() => setDispositionTarget(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn" disabled={createDisposition.isPending}>
                  {createDisposition.isPending ? 'Submitting...' : 'Submit Disposition'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
