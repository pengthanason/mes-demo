import { useState, useMemo } from 'react';
import { useObaRecords, useObaCreate } from '../lib/recordsApi';
import { showToast } from '../lib/toast';
import { Paginator } from '../components/Paginator';
import { ROW_H, fillerCount, FillerRows } from '../components/TableFill';
import { WoInput } from '../components/WoInput';
import { ComboBoxInput } from '../components/ComboBoxInput';
import { useWoLots } from '../lib/lookups';
import { ResultBadge } from '../components/ResultBadge';
import { BlockState } from '../components/DataStates';

export function ObaPage() {
  const { data, isLoading, isError, refetch } = useObaRecords();
  const createMut = useObaCreate();
  const records = data ?? [];

  const [histPage, setHistPage] = useState(1);
  const HIST_PAGE_SIZE = 10;
  const [histQ, setHistQ] = useState('');
  const [histResult, setHistResult] = useState<'' | 'PASS' | 'FAIL'>('');
  const filteredRecords = useMemo(() => {
    let list = records;
    if (histResult) list = list.filter(r => r.result === histResult);
    const s = histQ.trim().toLowerCase();
    if (s) list = list.filter(r =>
      r.woId.toLowerCase().includes(s) ||
      r.lotNo.toLowerCase().includes(s) ||
      (r.defectNote || '').toLowerCase().includes(s)
    );
    return list;
  }, [records, histQ, histResult]);
  const totalHistPages = Math.max(1, Math.ceil(filteredRecords.length / HIST_PAGE_SIZE));
  const pagedRecords = filteredRecords.slice((histPage - 1) * HIST_PAGE_SIZE, histPage * HIST_PAGE_SIZE);

  const [woId,       setWoId]       = useState('');
  const [lotNo,      setLotNo]      = useState('');
  const { data: woLots = [] } = useWoLots(woId.trim() || undefined);
  const [sampleQty,  setSampleQty]  = useState('');
  const [result,     setResult]     = useState<'PASS' | 'FAIL' | ''>('');
  const [defectNote, setDefectNote] = useState('');
  const [error,      setError]      = useState('');
  const [saved,      setSaved]      = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (result === 'FAIL' && !defectNote.trim()) {
      setError('Please provide a Defect Note when the result is FAIL');
      return;
    }
    createMut.mutate(
      { woId, lotNo, sampleQty: Number(sampleQty), result: result as 'PASS' | 'FAIL', defectNote },
      {
        onSuccess: () => {
          showToast(`OBA ${result}: ${woId} / ${lotNo}`, result === 'PASS' ? 'success' : 'error');
          setWoId(''); setLotNo(''); setSampleQty(''); setResult(''); setDefectNote('');
          setSaved(true);
          setTimeout(() => setSaved(false), 2500);
        },
        onError: () => setError('Save failed — please try again'),
      }
    );
  }

  return (
    <div className="stack-lg">
      {/* ── Form ── */}
      <div className="panel stack">
        <h2 className="panel__title">Out-of-Box Audit</h2>
        <p className="panel__subtitle">Record out-of-box sampling inspection before delivery</p>

        {error  && <div className="notice err">{error}</div>}
        {saved  && <div className="notice ok">✅ Saved successfully!</div>}

        <style>{`.oba-input::placeholder { color: var(--ink-5); opacity: 1; }`}</style>

        <form className="stack" onSubmit={handleSubmit}>
          <label className="field">
            <span>Work Order</span>
            <WoInput value={woId} onChange={setWoId} placeholder="Select or type WO…" required />
          </label>
          <label className="field">
            <span>Lot No.</span>
            <ComboBoxInput className="oba-input" value={lotNo} onChange={setLotNo} options={woLots} ariaLabel="Lot No."
              placeholder={woId.trim() ? 'Select/type Lot' : 'Enter WO first'} disabled={!woId.trim()} required />
          </label>
          <label className="field">
            <span>Sample Qty</span>
            <input className="oba-input" type="number" min="1" value={sampleQty} onChange={e => setSampleQty(e.target.value)} placeholder="e.g. 5" required />
          </label>
          <label className="field">
            <span>Result</span>
            <select value={result} onChange={e => setResult(e.target.value as 'PASS' | 'FAIL')} style={{ padding: '0.75rem', fontSize: '1rem' }} required>
              <option value="">-- Select result --</option>
              <option value="PASS">✅ PASS</option>
              <option value="FAIL">❌ FAIL</option>
            </select>
          </label>
          {result === 'FAIL' && (
            <label className="field">
              <span>Defect Note <span style={{ color: 'var(--danger)' }}>*</span></span>
              <textarea className="oba-input" value={defectNote} onChange={e => setDefectNote(e.target.value)} placeholder="Describe the defect..." required />
            </label>
          )}
          <button className="btn" type="submit" disabled={!woId || !lotNo || !sampleQty || !result || createMut.isPending}
            style={{ marginTop: '0.5rem', padding: '1rem', fontSize: '1rem' }}>
            {createMut.isPending ? 'Saving...' : 'Save OBA Result'}
          </button>
        </form>
      </div>

      {/* ── History table ── */}
      <div className="panel">
        <h3 className="panel__title panel__title--sm" style={{ marginBottom: '1rem' }}>
          OBA History {records.length > 0 && `(${records.length} items)`}
        </h3>
        {records.length > 0 && (
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <label className="field" style={{ flex: '1 1 220px' }}>
              <span>Search</span>
              <input value={histQ} onChange={e => { setHistQ(e.target.value); setHistPage(1); }} placeholder="WO / Lot No / Defect note..." />
            </label>
            <label className="field" style={{ flex: '0 1 160px' }}>
              <span>Result</span>
              <select value={histResult} onChange={e => { setHistResult(e.target.value as '' | 'PASS' | 'FAIL'); setHistPage(1); }}>
                <option value="">All results</option>
                <option value="PASS">✅ PASS</option>
                <option value="FAIL">❌ FAIL</option>
              </select>
            </label>
          </div>
        )}
        {isLoading ? (
          <BlockState state="loading" />
        ) : isError ? (
          <BlockState state="error" onRetry={() => refetch()} />
        ) : records.length === 0 ? (
          <BlockState state="empty" emptyText="No history yet — save an OBA record to add data" />
        ) : filteredRecords.length === 0 ? (
          <BlockState state="empty" emptyText="No OBA records match the search/filter" />
        ) : (
          <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
            {/* tableLayout fixed + colgroup = คอลัมน์/ความสูงนิ่งเวลาเปลี่ยนหน้า (ดู components/TableFill.tsx) */}
            <table className="table table-readonly" style={{ minWidth: '850px', width: '100%', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '19%' }} />{/* WO ID */}
                <col style={{ width: '14%' }} />{/* Lot No. */}
                <col style={{ width: '9%' }} />{/* Sample Qty */}
                <col style={{ width: '12%' }} />{/* Result */}
                <col style={{ width: '20%' }} />{/* Defect Note */}
                <col style={{ width: '26%' }} />{/* Timestamp */}
              </colgroup>
              <thead>
                <tr>
                  <th>WO ID</th>
                  <th>Lot No.</th>
                  <th style={{ textAlign: 'center' }}>Sample Qty</th>
                  <th style={{ textAlign: 'center' }}>Result</th>
                  <th>Defect Note</th>
                  <th style={{ textAlign: 'center' }}>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {pagedRecords.map(r => (
                  <tr key={r.id}>
                    <td style={{ height: ROW_H, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.woId}>{r.woId}</td>
                    <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.lotNo}>{r.lotNo}</td>
                    <td style={{ textAlign: 'center' }}>{r.sampleQty}</td>
                    <td style={{ textAlign: 'center' }}><ResultBadge value={r.result} /></td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.defectNote || undefined}>{r.defectNote || '—'}</td>
                    <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {new Date(r.timestamp).toLocaleString()}
                    </td>
                  </tr>
                ))}
                <FillerRows count={fillerCount(pagedRecords.length, HIST_PAGE_SIZE, totalHistPages)} cols={6} />
              </tbody>
            </table>
          </div>
        )}
        <Paginator page={histPage} totalPages={totalHistPages} onPage={setHistPage} total={filteredRecords.length} />
      </div>
    </div>
  );
}
