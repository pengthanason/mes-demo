import { useMemo, useRef, useState } from 'react';
import { useProductionUnits, useProductionScans, useScan } from '../lib/productionApi';
import { useMockAuth } from '../lib/useMockStore';
import { showToast } from '../lib/toast';
import { WoInput } from '../components/WoInput';

// สถานีตาม DEFAULT_PD_CHAIN (R1–R13)
const STATIONS = [
  'R1 SMT Setup', 'R2 IPQC PCBA', 'R3 Insert Manual', 'R4 Wave Solder', 'R5 Touch-up',
  'R6 Assembly', 'R7 Function Test', 'R8 Calibration', 'R9 Aging', 'R10 Final QC',
  'R11 Packing', 'R12 OBA', 'R13 Rework',
];

export function ProductionScanPage() {
  const { role } = useMockAuth();
  const isViewer = role === 'viewer';

  const [woId,     setWoId]     = useState('');
  const [station,  setStation]  = useState(STATIONS[0]);
  const [operator, setOperator] = useState('');
  const [serial,   setSerial]   = useState('');
  const serialRef = useRef<HTMLInputElement>(null);

  const scanMut = useScan();
  const { data: units = [] } = useProductionUnits(woId || undefined);
  const { data: scans = [] } = useProductionScans({ woId: woId || undefined, limit: 20 });

  const ready = !!woId.trim() && !!station && !isViewer;

  const kpis = useMemo(() => {
    const pass = units.filter(u => u.lastResult === 'PASS').length;
    const fail = units.filter(u => u.lastResult === 'FAIL').length;
    const total = units.length;
    return { total, pass, fail, rate: total ? (pass / total) * 100 : 0 };
  }, [units]);

  function doScan(result: 'PASS' | 'FAIL') {
    if (!ready || !serial.trim()) return;
    scanMut.mutate(
      { woId: woId.trim(), serial: serial.trim(), station, result, operator: operator.trim() },
      {
        onSuccess: () => {
          showToast(`${result === 'PASS' ? '✅' : '❌'} ${serial.trim()} @ ${station}`, result === 'PASS' ? 'success' : 'error');
          setSerial('');
          serialRef.current?.focus();
        },
        onError: (err: any) => showToast(err.message, 'error'),
      }
    );
  }

  return (
    <section className="stack-lg">
      <div className="panel">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
          <span style={{ width: 48, height: 48, flexShrink: 0, borderRadius: 12, fontSize: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(34,197,94,0.12)' }}>📡</span>
          <div>
            <h1 className="panel__title" style={{ margin: 0 }}>สแกนผลิต (Production Scan)</h1>
            <p className="panel__subtitle" style={{ margin: 0 }}>สแกน Serial ทีละชิ้นที่แต่ละสถานี บันทึก PASS/FAIL — เหมือนยิงบาร์โค้ดหน้างาน</p>
          </div>
        </div>

        {/* ── ตั้งค่าสถานี ── */}
        <div className="filters-grid" style={{ marginTop: '1.5rem', marginBottom: 0 }}>
          <label className="field">
            <span>Work Order *</span>
            <WoInput value={woId} onChange={setWoId} />
          </label>
          <label className="field">
            <span>สถานี (Station) *</span>
            <select value={station} onChange={e => setStation(e.target.value)}>
              {STATIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="field">
            <span>ผู้ปฏิบัติงาน</span>
            <input value={operator} onChange={e => setOperator(e.target.value)} placeholder="ชื่อ operator" />
          </label>
        </div>
      </div>

      {/* ── จุดสแกน ── */}
      <div className="panel" style={{ borderLeft: '4px solid #22c55e' }}>
        {isViewer ? (
          <p style={{ color: 'var(--text-muted)' }}>👁 Viewer ดูได้อย่างเดียว สแกนไม่ได้</p>
        ) : !woId.trim() ? (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>⤴ กรอก Work Order ด้านบนก่อนเริ่มสแกน</p>
        ) : (
          <>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
              กำลังสแกนที่: <strong style={{ color: '#1e293b' }}>{station}</strong> · WO <strong style={{ color: '#1e293b' }}>{woId}</strong>
            </div>
            <form onSubmit={e => { e.preventDefault(); doScan('PASS'); }}>
              <input
                ref={serialRef}
                value={serial}
                onChange={e => setSerial(e.target.value)}
                placeholder="ยิง/พิมพ์ Serial Number แล้ว Enter = PASS"
                autoFocus
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '1rem 1.15rem', fontSize: '1.4rem',
                  fontFamily: 'ui-monospace, monospace', letterSpacing: '0.04em',
                  border: '2px solid #cbd5e1', borderRadius: 12, outline: 'none', textAlign: 'center',
                }}
              />
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.85rem' }}>
                <button type="submit" disabled={!serial.trim() || scanMut.isPending}
                  style={{ flex: 1, padding: '1.1rem', fontSize: '1.2rem', fontWeight: 800, color: '#fff', background: '#22c55e', border: 'none', borderRadius: 12, cursor: 'pointer', opacity: !serial.trim() ? 0.5 : 1 }}>
                  ✓ PASS
                </button>
                <button type="button" disabled={!serial.trim() || scanMut.isPending} onClick={() => doScan('FAIL')}
                  style={{ flex: 1, padding: '1.1rem', fontSize: '1.2rem', fontWeight: 800, color: '#fff', background: '#ef4444', border: 'none', borderRadius: 12, cursor: 'pointer', opacity: !serial.trim() ? 0.5 : 1 }}>
                  ✕ FAIL
                </button>
              </div>
            </form>
          </>
        )}
      </div>

      {/* ── สรุป + ประวัติ ── */}
      {woId.trim() && (
        <div className="panel">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <StatBox label="ชิ้นที่สแกน" value={kpis.total} color="#0369a1" />
            <StatBox label="PASS" value={kpis.pass} color="#16a34a" />
            <StatBox label="FAIL" value={kpis.fail} color="#dc2626" />
            <StatBox label="Pass Rate" value={`${kpis.rate.toFixed(1)}%`} color="#7c3aed" />
          </div>

          <h3 className="panel__title panel__title--sm" style={{ marginBottom: '0.75rem' }}>การสแกนล่าสุด</h3>
          {scans.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>ยังไม่มีการสแกนใน WO นี้</div>
          ) : (
            <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 8 }}>
              <table className="table table-readonly" style={{ minWidth: 520, width: '100%' }}>
                <thead>
                  <tr>
                    <th>Serial</th>
                    <th>สถานี</th>
                    <th style={{ textAlign: 'center' }}>ผล</th>
                    <th>ผู้สแกน</th>
                    <th style={{ textAlign: 'center' }}>เวลา</th>
                  </tr>
                </thead>
                <tbody>
                  {scans.map(s => (
                    <tr key={s.id}>
                      <td style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600 }}>{s.serial}</td>
                      <td style={{ fontSize: '0.85rem' }}>{s.station}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{
                          padding: '2px 10px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 700,
                          background: s.result === 'PASS' ? '#dcfce7' : '#fee2e2',
                          color: s.result === 'PASS' ? '#15803d' : '#b91c1c',
                          border: `1px solid ${s.result === 'PASS' ? '#86efac' : '#fca5a5'}`,
                        }}>{s.result}</span>
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{s.operator || '—'}</td>
                      <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                        {new Date(s.scannedAt).toLocaleTimeString('th-TH')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function StatBox({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: 12, padding: '0.9rem 1rem', textAlign: 'center' }}>
      <div style={{ fontSize: '1.6rem', fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>{label}</div>
    </div>
  );
}
