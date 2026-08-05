import { useMemo, useState, useEffect, useRef } from 'react';
import { useDriftReport, type DriftRow } from '../lib/driftApi';
import { SYNTECH_LOGO_PNG_BASE64 } from '../assets/syntechLogo';
import { TableState } from '../components/DataStates';
import { useEscapeKey } from '../lib/useEscapeKey';
import { useFocusTrap } from '../lib/useFocusTrap';

// ระดับความรุนแรง — คิดเป็น "สัดส่วน %" ของ Odoo (ยุติธรรมกว่าค่าสัมบูรณ์ เพราะ 20 ชิ้นของ 60 = เยอะ แต่ของ 5000 = จิ๋ว)
type Sev = 'ok' | 'warn' | 'crit';
const CRIT_PCT = 10;   // ต่าง ≥10% = แดง (crit) · >0 & <10% = เหลือง (warn) · 0 = เขียว (ok)
const driftPct = (r: { diff: number; odoo_qty: number }) => r.odoo_qty ? Math.abs(r.diff) / r.odoo_qty * 100 : (r.diff !== 0 ? 100 : 0);
const sevOf = (r: { diff: number; odoo_qty: number }): Sev => { const p = driftPct(r); return p === 0 ? 'ok' : p < CRIT_PCT ? 'warn' : 'crit'; };
const SEV: Record<Sev, { color: string; bg: string; border: string }> = {
  ok:   { color: '#16a34a', bg: 'transparent', border: 'transparent' },
  warn: { color: '#b45309', bg: '#fffbeb', border: '#f59e0b' },
  crit: { color: '#b91c1c', bg: '#fef2f2', border: '#dc2626' },
};
const fmtDiff = (d: number) => (d > 0 ? `+${d.toLocaleString()}` : d.toLocaleString());

/* ── Export Excel (.xlsx) — เทมเพลต SYNTECH: โลโก้ + หัวเรื่อง + หัวตารางสีเขียว + ลงสีเซลล์ diff ตามความรุนแรง + แถวสรุป ── */
async function exportDriftXlsx(rows: DriftRow[], filename: string) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Stock vs Odoo', { views: [{ state: 'frozen', ySplit: 3, showGridLines: false }] });
  const COLS = [
    { h: 'Item Code', w: 18 }, { h: 'Item Name', w: 32 }, { h: 'Location', w: 13 },
    { h: 'Ours', w: 13 }, { h: 'Odoo', w: 13 }, { h: 'Diff', w: 15 },
  ];
  const N = COLS.length;
  ws.columns = COLS.map(c => ({ width: c.w }));

  // แถว 1 — โลโก้ + หัวเรื่อง
  ws.getRow(1).height = 42;
  const logoId = wb.addImage({ base64: SYNTECH_LOGO_PNG_BASE64, extension: 'png' });
  ws.addImage(logoId, { tl: { col: 0.15, row: 0.15 }, ext: { width: 200, height: 46 } });
  ws.mergeCells(1, 3, 1, N);
  ws.getCell(1, 3).value = 'Stock Drift — Our Stock vs Odoo';

  // แถว 2 — คำบรรยาย/วันที่
  ws.mergeCells(2, 1, 2, N);
  ws.getCell(2, 1).value = `Stock drift report · ${new Date().toLocaleDateString('en-GB')} · ${rows.length} items · shaded by %: diff≥10%=red · <10%=yellow`;
  ws.getRow(2).height = 16;

  // แถว 3 — หัวตาราง
  COLS.forEach((c, i) => { ws.getCell(3, i + 1).value = c.h; });
  ws.getRow(3).height = 20;

  // ข้อมูล (row 4+) + แถวสรุป
  rows.forEach(r => ws.addRow([r.item_code, r.item_name, r.location, r.our_qty, r.odoo_qty, r.diff]));
  const dataLast = 3 + rows.length;
  const sumRow = dataLast + 1;
  ws.mergeCells(sumRow, 1, sumRow, N - 1);
  ws.getCell(sumRow, 1).value = 'Total difference (|diff|)';
  ws.getCell(sumRow, N).value = rows.reduce((s, r) => s + Math.abs(r.diff), 0);

  const thin = { style: 'thin' as const, color: { argb: 'FFB0B8C4' } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  for (let rr = 1; rr <= sumRow; rr++) {
    const row = ws.getRow(rr);
    if (rr >= 4 && rr <= dataLast) row.height = 15;
    for (let c = 1; c <= N; c++) {
      const cell = row.getCell(c);
      if (!(rr === 1 && c <= 2)) cell.border = border;
      if (rr === 1) {
        cell.font = { bold: true, size: 16, color: { argb: 'FF2E7D32' } };
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
        if (c <= 2) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
      } else if (rr === 2) {
        cell.font = { size: 9, italic: true, color: { argb: 'FF64748B' } };
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      } else if (rr === 3) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9EAD3' } };
        cell.font = { bold: true, size: 10, color: { argb: 'FF1B4332' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      } else if (rr === sumRow) {
        cell.font = { bold: true, size: 10, color: { argb: 'FF0369A1' } };
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        if (c === N) cell.numFmt = '#,##0';
      } else {
        const r = rows[rr - 4];
        const pct = r.odoo_qty ? Math.abs(r.diff) / r.odoo_qty * 100 : (r.diff !== 0 ? 100 : 0);   // สัดส่วน % ของ Odoo
        cell.font = { size: 10, color: { argb: 'FF1E293B' } };
        cell.alignment = { vertical: 'middle', horizontal: c >= 4 ? 'right' : 'left' };
        if (c >= 4) cell.numFmt = c === N ? '+#,##0;-#,##0;0' : '#,##0';
        if (c === N) {   // เซลล์ diff — ลงสีตามความรุนแรง (สัดส่วน %)
          if (pct >= 10) { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } }; cell.font = { size: 10, bold: true, color: { argb: 'FFB91C1C' } }; }
          else if (pct > 0) { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }; cell.font = { size: 10, bold: true, color: { argb: 'FFB45309' } }; }
          else { cell.font = { size: 10, bold: true, color: { argb: 'FF16A34A' } }; }
        }
      }
    }
  }
  ws.getCell(1, 3).font = { bold: true, size: 16, color: { argb: 'FF2E7D32' } };   // re-apply หลัง merge

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

/* ── ป็อปอัพตั้งชื่อไฟล์ก่อนดาวน์โหลด (คลุมไฮไลต์เฉพาะชื่อ ไม่รวม .xlsx) ── */
function FileNamePromptModal({ defaultBase, onCancel, onConfirm }: { defaultBase: string; onCancel: () => void; onConfirm: (name: string) => void }) {
  const [name, setName] = useState(`${defaultBase}.xlsx`);
  const ref = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  useEscapeKey(true, onCancel);
  useFocusTrap(true, modalRef);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    el.focus(); const dot = name.lastIndexOf('.'); el.setSelectionRange(0, dot > 0 ? dot : name.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const confirm = () => { let n = name.trim(); if (!n) return; if (!/\.xlsx$/i.test(n)) n += '.xlsx'; onConfirm(n); };
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }} onClick={onCancel}>
      <div ref={modalRef} className="panel" role="dialog" aria-modal="true" aria-label="Save as Excel" style={{ width: 'min(100%, 440px)' }} onClick={e => e.stopPropagation()}>
        <h3 className="panel__title panel__title--sm" style={{ marginTop: 0 }}>⬇️ Save as Excel</h3>
        <p className="panel__subtitle" style={{ marginBottom: '1rem' }}>Enter a file name and click “OK” to download</p>
        <input ref={ref} value={name} onChange={e => setName(e.target.value)} aria-label="File name" placeholder="filename.xlsx"
          onKeyDown={e => { if (e.key === 'Enter') confirm(); }}
          style={{ width: '100%', padding: '0.6rem 0.75rem', border: '1px solid var(--border-color)', borderRadius: 8, fontSize: '0.95rem' }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: '1.2rem' }}>
          <button type="button" className="btn secondary" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn" onClick={confirm}>OK</button>
        </div>
      </div>
    </div>
  );
}

type SortKey = 'code' | 'location' | 'our' | 'odoo' | 'diff';   // คอลัมน์ที่กดหัวตารางเพื่อเรียง

export function DriftViewerPage() {
  // hook คืน { rows, meta } — meta บอกว่าเลขที่เห็น "สด" หรือ "snapshot" ต้องโชว์ให้ผู้ใช้รู้
  const { data, isLoading, isError, refetch } = useDriftReport();
  const rows = data?.rows ?? [];
  const meta = data?.meta ?? null;
  const [q, setQ] = useState('');
  const [loc, setLoc] = useState('');
  const [onlyDiff, setOnlyDiff] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('diff');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');   // เรียงจากกดหัวตาราง
  const [saveAs, setSaveAs] = useState(false);   // ป็อปอัพตั้งชื่อไฟล์ Excel
  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));   // คอลัมน์เดิม → สลับทิศ
    else { setSortKey(k); setSortDir(k === 'code' || k === 'location' ? 'asc' : 'desc'); }
  };

  const locations = useMemo(() => [...new Set(rows.map(r => r.location))].sort(), [rows]);

  // สรุปหัวตาราง (จากข้อมูลทั้งหมด ไม่ขึ้นกับ filter)
  const summary = useMemo(() => {
    const drift = rows.filter(r => r.diff !== 0);
    const totalAbs = rows.reduce((s, r) => s + Math.abs(r.diff), 0);
    const crit = rows.filter(r => sevOf(r) === 'crit').length;
    return { total: rows.length, driftCount: drift.length, totalAbs, crit };
  }, [rows]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = rows.filter(r => {
      if (onlyDiff && r.diff === 0) return false;
      if (loc && r.location !== loc) return false;
      if (needle && !`${r.item_code} ${r.item_name}`.toLowerCase().includes(needle)) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      let v = 0;
      if (sortKey === 'code') v = a.item_code.localeCompare(b.item_code);
      else if (sortKey === 'location') v = a.location.localeCompare(b.location) || a.item_code.localeCompare(b.item_code);
      else if (sortKey === 'our') v = a.our_qty - b.our_qty;
      else if (sortKey === 'odoo') v = a.odoo_qty - b.odoo_qty;
      else v = a.diff - b.diff;   // 'diff' = เรียงตามค่าจริง (ติดลบ→บวก) · asc = ติดลบมาก่อน · desc = บวกมากมาก่อน
      return sortDir === 'asc' ? v : -v;
    });
    return list;
  }, [rows, q, loc, onlyDiff, sortKey, sortDir]);

  return (
    <section className="stack-lg">
      <div className="panel">
        <h1 className="panel__title">Stock Drift — Our Stock vs Odoo</h1>

        {/* ที่มาของเลข — ต้องบอกตรงๆ ว่าสดหรือ snapshot ไม่ให้เข้าใจผิดว่าเป็นเลข ณ วินาทีนี้
            (เลขชุดนี้มาจากรายงานตัวเดียวกับที่ WMS ใช้ — ไม่ได้คิดใหม่ที่ MES) */}
        {meta && (
          <div style={{
            marginTop: 10, padding: '8px 12px', borderRadius: 8, fontSize: '0.78rem',
            background: meta.source === 'live' && !meta.live_unavailable ? '#f0fdf4' : '#fff7ed',
            border: `1px solid ${meta.source === 'live' && !meta.live_unavailable ? '#bbf7d0' : '#fed7aa'}`,
            color: meta.source === 'live' && !meta.live_unavailable ? '#166534' : '#9a3412',
          }}>
            {meta.source === 'live' && !meta.live_unavailable
              ? <>✅ อ่านสดจาก Odoo · เทียบ {meta.items_compared?.toLocaleString()} รายการ</>
              : <>⚠️ เลขนี้เป็น snapshot{meta.snapshot_date ? ` ของวันที่ ${meta.snapshot_date}` : ''} ไม่ใช่ค่าสด{meta.live_unavailable ? ` — อ่าน Odoo สดไม่ได้: ${meta.live_unavailable}` : ''}</>}
            {meta.fetched_at && <> · ดึงเมื่อ {new Date(meta.fetched_at).toLocaleTimeString('th-TH')}{meta.cached ? ' (จากแคช 2 นาที)' : ''}</>}
            {meta.truncated && <> · <b>แสดงไม่ครบ</b> (ตัดที่ {rows.length} แถวแรก เรียงตามส่วนต่างมากสุด)</>}
            {meta.level === 'item' && <> · ไม่มีข้อมูลแยกตามสถานที่ — คอลัมน์ Location จะเป็น (all)</>}
          </div>
        )}

        {/* แถบสรุป */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginTop: '1.1rem' }}>
          <SummaryCard label="Total items" value={summary.total} />
          <SummaryCard label="Mismatched with Odoo" value={summary.driftCount} accent="#b45309" />
          <SummaryCard label="Large difference (critical)" value={summary.crit} accent="#dc2626" />
          <SummaryCard label="Total difference |diff|" value={summary.totalAbs.toLocaleString()} accent="#0369a1" />
        </div>

        {/* ตัวกรอง */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: '1.25rem' }}>
          <input value={q} onChange={e => setQ(e.target.value)} aria-label="Search item (code/name)" placeholder="🔍 Search item (code/name)"
            style={{ flex: '1 1 200px', minWidth: 0, padding: '0.5rem 0.7rem', border: '1px solid var(--border-color)', borderRadius: 8, fontSize: '0.9rem' }} />
          <select value={loc} onChange={e => setLoc(e.target.value)} aria-label="Filter by location" style={{ padding: '0.5rem 2rem 0.5rem 0.7rem', borderRadius: 8, border: '1px solid var(--border-color)', minWidth: 130 }}>
            <option value="">All locations</option>
            {locations.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', color: '#475569', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={onlyDiff} onChange={e => setOnlyDiff(e.target.checked)} style={{ width: 16, height: 16 }} />
            Only differences
          </label>
          <button type="button" className="btn" style={{ fontSize: '0.82rem', marginLeft: 'auto' }} disabled={shown.length === 0} onClick={() => setSaveAs(true)}>⬇️ Export to Excel</button>
        </div>

        {/* ตาราง / states */}
        <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 8, marginTop: '1rem' }}>
          <table className="table" style={{ minWidth: 640, width: '100%' }}>
            <thead>
              <tr>
                <SortTh k="code" label="Item" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh k="location" label="Location" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh k="our" label="Ours" right sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh k="odoo" label="Odoo" right sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh k="diff" label="Diff" right sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <TableState colSpan={5} state="loading" />
              ) : isError ? (
                <TableState colSpan={5} state="error" onRetry={() => refetch()} />
              ) : shown.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2.5rem', color: '#16a34a' }}>
                  ✓ {onlyDiff && rows.length > 0 ? 'No items differ from Odoo for this filter' : 'No data'}
                </td></tr>
              ) : shown.map(r => {
                const s = SEV[sevOf(r)];
                return (
                  <tr key={r.item_code} style={{ boxShadow: s.border !== 'transparent' ? `inset 3px 0 0 ${s.border}` : undefined, background: s.bg }}>
                    <td style={{ textAlign: 'left' }}>
                      <div style={{ fontWeight: 600, color: 'var(--brand)' }}>{r.item_code}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{r.item_name}</div>
                    </td>
                    <td style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>{r.location}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{r.our_qty.toLocaleString()}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{r.odoo_qty.toLocaleString()}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700, color: s.color }}>{fmtDiff(r.diff)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!isLoading && !isError && <div style={{ marginTop: 8, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Showing {shown.length} items</div>}
      </div>

      {saveAs && (
        <FileNamePromptModal
          defaultBase={`stock-drift-vs-odoo-${new Date().toISOString().slice(0, 10)}`}
          onCancel={() => setSaveAs(false)}
          onConfirm={(name) => { setSaveAs(false); exportDriftXlsx(shown, name); }}
        />
      )}
    </section>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: 10, padding: '0.75rem 0.9rem' }}>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: '1.4rem', fontWeight: 800, color: accent || '#1e293b', marginTop: 2 }}>{value}</div>
    </div>
  );
}

// หัวตารางกดเรียงได้ — active โชว์ ▲/▼ · ที่เหลือโชว์ ↕ (บอกว่ากดได้)
function SortTh({ k, label, right, sortKey, sortDir, onSort }: {
  k: SortKey; label: string; right?: boolean; sortKey: SortKey; sortDir: 'asc' | 'desc'; onSort: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  return (
    <th onClick={() => onSort(k)} title="Click to sort" style={{ textAlign: right ? 'right' : 'left', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
      {label}
      <span style={{ marginLeft: 4, color: active ? 'var(--brand)' : '#cbd5e1', fontSize: '0.75rem' }}>{active ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
    </th>
  );
}
