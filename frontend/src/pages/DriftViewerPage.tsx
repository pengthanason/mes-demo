import { useMemo, useState } from 'react';
import { useDriftReport, type DriftRow } from '../lib/driftApi';

// ระดับความรุนแรงของส่วนต่าง: ตรงกัน / ต่างเล็กน้อย / ต่างมาก
type Sev = 'ok' | 'warn' | 'crit';
const sevOf = (diff: number): Sev => { const a = Math.abs(diff); return a === 0 ? 'ok' : a < 20 ? 'warn' : 'crit'; };
const SEV: Record<Sev, { color: string; bg: string; border: string }> = {
  ok:   { color: '#16a34a', bg: 'transparent', border: 'transparent' },
  warn: { color: '#b45309', bg: '#fffbeb', border: '#f59e0b' },
  crit: { color: '#b91c1c', bg: '#fef2f2', border: '#dc2626' },
};
const fmtDiff = (d: number) => (d > 0 ? `+${d.toLocaleString()}` : d.toLocaleString());

type Sort = 'diff-desc' | 'diff-asc' | 'code';

export function DriftViewerPage() {
  const { data: rows = [], isLoading, isError, refetch } = useDriftReport();
  const [q, setQ] = useState('');
  const [loc, setLoc] = useState('');
  const [onlyDiff, setOnlyDiff] = useState(true);
  const [sort, setSort] = useState<Sort>('diff-desc');

  const locations = useMemo(() => [...new Set(rows.map(r => r.location))].sort(), [rows]);

  // สรุปหัวตาราง (จากข้อมูลทั้งหมด ไม่ขึ้นกับ filter)
  const summary = useMemo(() => {
    const drift = rows.filter(r => r.diff !== 0);
    const totalAbs = rows.reduce((s, r) => s + Math.abs(r.diff), 0);
    const crit = rows.filter(r => sevOf(r.diff) === 'crit').length;
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
    list = [...list].sort((a, b) =>
      sort === 'code' ? a.item_code.localeCompare(b.item_code)
      : sort === 'diff-asc' ? Math.abs(a.diff) - Math.abs(b.diff)
      : Math.abs(b.diff) - Math.abs(a.diff),
    );
    return list;
  }, [rows, q, loc, onlyDiff, sort]);

  const exportCsv = () => {
    const head = ['item_code', 'item_name', 'location', 'our_qty', 'odoo_qty', 'diff'];
    const body = shown.map((r: DriftRow) => [r.item_code, `"${r.item_name}"`, r.location, r.our_qty, r.odoo_qty, r.diff]);
    const csv = [head, ...body].map(row => row.join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'stock-drift-vs-odoo.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <section className="stack-lg">
      <div className="panel">
        <h1 className="panel__title">Stock Drift — เทียบสต็อก เรา vs Odoo</h1>
        <p className="panel__subtitle">ดูว่าวันนี้ของชิ้นไหนจำนวนไม่ตรงกับ Odoo — ต่างมาก = แดง, ต่างเล็กน้อย = เหลือง</p>

        {/* แถบสรุป */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginTop: '1.1rem' }}>
          <SummaryCard label="รายการทั้งหมด" value={summary.total} />
          <SummaryCard label="ไม่ตรงกับ Odoo" value={summary.driftCount} accent="#b45309" />
          <SummaryCard label="ต่างมาก (รุนแรง)" value={summary.crit} accent="#dc2626" />
          <SummaryCard label="ผลรวมส่วนต่าง |diff|" value={summary.totalAbs.toLocaleString()} accent="#0369a1" />
        </div>

        {/* ตัวกรอง */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: '1.25rem' }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 ค้นหา item (รหัส/ชื่อ)"
            style={{ flex: '1 1 200px', minWidth: 0, padding: '0.5rem 0.7rem', border: '1px solid var(--border-color)', borderRadius: 8, fontSize: '0.9rem' }} />
          <select value={loc} onChange={e => setLoc(e.target.value)} style={{ padding: '0.5rem 0.7rem', borderRadius: 8, border: '1px solid var(--border-color)' }}>
            <option value="">ทุกคลัง</option>
            {locations.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <select value={sort} onChange={e => setSort(e.target.value as Sort)} style={{ padding: '0.5rem 0.7rem', borderRadius: 8, border: '1px solid var(--border-color)' }}>
            <option value="diff-desc">ต่างมาก → น้อย</option>
            <option value="diff-asc">ต่างน้อย → มาก</option>
            <option value="code">เรียงตามรหัส</option>
          </select>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', color: '#475569', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={onlyDiff} onChange={e => setOnlyDiff(e.target.checked)} style={{ width: 16, height: 16 }} />
            เฉพาะที่ต่าง
          </label>
          <button type="button" className="btn secondary" style={{ fontSize: '0.82rem', marginLeft: 'auto' }} disabled={shown.length === 0} onClick={exportCsv}>⬇️ Export CSV</button>
        </div>

        {/* ตาราง / states */}
        <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 8, marginTop: '1rem' }}>
          <table className="table" style={{ minWidth: 640, width: '100%' }}>
            <thead>
              <tr>
                <th>Item</th><th>คลัง</th>
                <th style={{ textAlign: 'right' }}>ของเรา</th>
                <th style={{ textAlign: 'right' }}>Odoo</th>
                <th style={{ textAlign: 'right' }}>ส่วนต่าง</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>กำลังโหลด...</td></tr>
              ) : isError ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>
                  <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 10, alignItems: 'center', color: '#dc2626' }}>
                    <span>⚠️ โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่</span>
                    <button type="button" className="btn secondary" style={{ fontSize: '0.82rem' }} onClick={() => refetch()}>ลองใหม่</button>
                  </div>
                </td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2.5rem', color: '#16a34a' }}>
                  ✓ {onlyDiff && rows.length > 0 ? 'ไม่มีรายการที่ต่างจาก Odoo ตามตัวกรอง' : 'ไม่มีข้อมูล'}
                </td></tr>
              ) : shown.map(r => {
                const s = SEV[sevOf(r.diff)];
                return (
                  <tr key={r.item_code} style={{ boxShadow: s.border !== 'transparent' ? `inset 3px 0 0 ${s.border}` : undefined, background: s.bg }}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--brand)' }}>{r.item_code}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{r.item_name}</div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{r.location}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{r.our_qty.toLocaleString()}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{r.odoo_qty.toLocaleString()}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700, color: s.color }}>{fmtDiff(r.diff)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!isLoading && !isError && <div style={{ marginTop: 8, fontSize: '0.8rem', color: 'var(--text-muted)' }}>แสดง {shown.length} รายการ</div>}
      </div>
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
