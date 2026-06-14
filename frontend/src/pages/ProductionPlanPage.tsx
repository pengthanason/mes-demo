import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getWoList, getPreWoList, getBomList, getBomDetail,
  approveBom, createPreWo, approvePreWo, convertPreWo,
  type WoItem, type PreWoItem, type BomHeader, type WoStatus,
} from '../lib/planningApi';
import { showToast } from '../lib/toast';
import { useMockAuth } from '../lib/useMockStore';

// ── Status badge ───────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  PENDING:     { bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
  IN_PROGRESS: { bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd' },
  DONE:        { bg: '#dcfce7', text: '#166534', border: '#86efac' },
  CANCELLED:   { bg: '#f1f5f9', text: '#64748b', border: '#cbd5e1' },
  APPROVED:    { bg: '#dcfce7', text: '#166534', border: '#86efac' },
  CONVERTED:   { bg: '#ede9fe', text: '#5b21b6', border: '#c4b5fd' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.CANCELLED;
  return (
    <span style={{
      background: s.bg, color: s.text, border: `1px solid ${s.border}`,
      padding: '2px 10px', borderRadius: 999,
      fontSize: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap',
    }}>
      {status}
    </span>
  );
}

// ── Empty state ────────────────────────────────────────────────────

function EmptyRow({ cols, text = 'ไม่มีข้อมูล' }: { cols: number; text?: string }) {
  return (
    <tr>
      <td colSpan={cols} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
        {text}
      </td>
    </tr>
  );
}

// ── Tab 1: WO List ─────────────────────────────────────────────────

function WoListTab() {
  const [statusFilter, setStatusFilter] = useState<WoStatus | ''>('');
  const { data, isLoading } = useQuery({
    queryKey: ['wo-list'],
    queryFn: getWoList,
    select: r => (r.data as any)?.data ?? [],
  });

  const list: WoItem[] = data ?? [];
  const filtered = statusFilter ? list.filter(w => w.status === statusFilter) : list;

  return (
    <div className="stack">
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <label className="field" style={{ marginBottom: 0, minWidth: 180 }}>
          <span>Filter Status</span>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}>
            <option value="">All</option>
            <option value="PENDING">PENDING</option>
            <option value="IN_PROGRESS">IN_PROGRESS</option>
            <option value="DONE">DONE</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>
        </label>
        <span style={{ marginLeft: 'auto', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          {filtered.length} รายการ
        </span>
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 8 }}>
        <table className="table table-readonly" style={{ minWidth: 600, width: '100%' }}>
          <thead>
            <tr>
              <th>WO No.</th>
              <th>Product</th>
              <th style={{ textAlign: 'center' }}>Qty</th>
              <th style={{ textAlign: 'center' }}>Status</th>
              <th style={{ textAlign: 'center' }}>Due Date</th>
              <th style={{ textAlign: 'center' }}>Created</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <EmptyRow cols={6} text="กำลังโหลด..." />
            ) : filtered.length === 0 ? (
              <EmptyRow cols={6} text="ไม่มี Work Order — ลอง backend ยังไม่ได้ connect หรือยังไม่มีข้อมูล" />
            ) : (
              filtered.map(wo => (
                <tr key={wo.wo_id}>
                  <td style={{ fontWeight: 600 }}>{wo.wo_no}</td>
                  <td>{wo.product_name}</td>
                  <td style={{ textAlign: 'center' }}>{wo.qty.toLocaleString()}</td>
                  <td style={{ textAlign: 'center' }}><StatusBadge status={wo.status} /></td>
                  <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    {wo.due_date ? new Date(wo.due_date).toLocaleDateString('th-TH') : '—'}
                  </td>
                  <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    {new Date(wo.created_at).toLocaleDateString('th-TH')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Tab 2: Pre-WO Request ──────────────────────────────────────────

function PreWoTab() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [bomId, setBomId]       = useState('');
  const [qty, setQty]           = useState('');
  const [dueDate, setDueDate]   = useState('');

  const { data: preWoData, isLoading } = useQuery({
    queryKey: ['pre-wo-list'],
    queryFn: getPreWoList,
    select: r => (r.data as any)?.data ?? [],
  });

  const { data: bomData } = useQuery({
    queryKey: ['bom-list'],
    queryFn: getBomList,
    select: r => (r.data as any)?.data ?? [],
  });

  const list: PreWoItem[]  = preWoData ?? [];
  const boms: BomHeader[]  = bomData ?? [];

  const createMut = useMutation({
    mutationFn: createPreWo,
    onSuccess: () => {
      showToast('สร้าง Pre-WO สำเร็จ', 'success');
      qc.invalidateQueries({ queryKey: ['pre-wo-list'] });
      setShowForm(false);
      setBomId(''); setQty(''); setDueDate('');
    },
    onError: () => showToast('เกิดข้อผิดพลาด', 'error'),
  });

  const approveMut = useMutation({
    mutationFn: (reqId: string | number) => approvePreWo(reqId),
    onSuccess: () => {
      showToast('Approve Pre-WO สำเร็จ', 'success');
      qc.invalidateQueries({ queryKey: ['pre-wo-list'] });
    },
    onError: () => showToast('Approve ไม่สำเร็จ', 'error'),
  });

  const convertMut = useMutation({
    mutationFn: convertPreWo,
    onSuccess: () => {
      showToast('Convert เป็น WO สำเร็จ', 'success');
      qc.invalidateQueries({ queryKey: ['pre-wo-list'] });
      qc.invalidateQueries({ queryKey: ['wo-list'] });
    },
    onError: () => showToast('Convert ไม่สำเร็จ', 'error'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!bomId || !qty || !dueDate) return;
    createMut.mutate({ bom_id: bomId, qty: Number(qty), due_date: dueDate });
  }

  return (
    <div className="stack">
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn" onClick={() => setShowForm(v => !v)}>
          {showForm ? '✕ ยกเลิก' : '+ สร้าง Pre-WO ใหม่'}
        </button>
      </div>

      {showForm && (
        <div className="panel" style={{ borderLeft: '4px solid #6366f1' }}>
          <h3 className="panel__title panel__title--sm">สร้าง Pre-WO Request</h3>
          <form onSubmit={handleSubmit} className="stack" style={{ maxWidth: 480 }}>
            <label className="field">
              <span>เลือก BOM</span>
              <select value={bomId} onChange={e => setBomId(e.target.value)} required>
                <option value="">-- เลือก BOM --</option>
                {boms.map(b => (
                  <option key={b.bom_id} value={b.bom_id}>
                    {b.name} v{b.version}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Qty</span>
              <input type="number" min={1} value={qty} onChange={e => setQty(e.target.value)} required placeholder="จำนวน" />
            </label>
            <label className="field">
              <span>วันที่ต้องการ</span>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} required />
            </label>
            <button
              type="submit"
              className="btn"
              style={{ background: '#6366f1', borderColor: '#6366f1', color: '#fff', fontWeight: 600 }}
              disabled={createMut.isPending}
            >
              {createMut.isPending ? 'กำลังบันทึก...' : 'ยืนยันสร้าง Pre-WO'}
            </button>
          </form>
        </div>
      )}

      <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 8 }}>
        <table className="table table-readonly" style={{ minWidth: 640, width: '100%' }}>
          <thead>
            <tr>
              <th>Req ID</th>
              <th>BOM</th>
              <th style={{ textAlign: 'center' }}>Qty</th>
              <th style={{ textAlign: 'center' }}>Due Date</th>
              <th style={{ textAlign: 'center' }}>Status</th>
              <th style={{ textAlign: 'center' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <EmptyRow cols={6} text="กำลังโหลด..." />
            ) : list.length === 0 ? (
              <EmptyRow cols={6} />
            ) : (
              list.map(req => (
                <tr key={req.req_id}>
                  <td style={{ fontWeight: 600 }}>{req.req_id}</td>
                  <td>{req.bom_name ?? req.bom_id}</td>
                  <td style={{ textAlign: 'center' }}>{req.qty.toLocaleString()}</td>
                  <td style={{ textAlign: 'center', fontSize: '0.85rem' }}>
                    {new Date(req.due_date).toLocaleDateString('th-TH')}
                  </td>
                  <td style={{ textAlign: 'center' }}><StatusBadge status={req.status} /></td>
                  <td style={{ textAlign: 'center' }}>
                    {req.status === 'PENDING' && (
                      <button
                        className="btn"
                        style={{ background: '#10b981', borderColor: '#10b981', color: '#fff', fontSize: '0.8rem', padding: '0.3rem 0.75rem' }}
                        onClick={() => approveMut.mutate(req.req_id)}
                        disabled={approveMut.isPending}
                      >
                        Approve
                      </button>
                    )}
                    {req.status === 'APPROVED' && (
                      <button
                        className="btn"
                        style={{ background: '#6366f1', borderColor: '#6366f1', color: '#fff', fontSize: '0.8rem', padding: '0.3rem 0.75rem' }}
                        onClick={() => convertMut.mutate({ req_id: req.req_id })}
                        disabled={convertMut.isPending}
                      >
                        ปล่อย WO ลงไลน์
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Tab 3: BOM Review ──────────────────────────────────────────────

function BomReviewTab() {
  const qc = useQueryClient();
  const auth = useMockAuth();
  const isPm = auth.role === 'admin' || auth.role === 'member';
  const [selectedBom, setSelectedBom] = useState<string | null>(null);

  const { data: bomListData, isLoading: listLoading } = useQuery({
    queryKey: ['bom-list'],
    queryFn: getBomList,
    select: r => (r.data as any)?.data ?? [],
  });

  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ['bom-detail', selectedBom],
    queryFn: () => getBomDetail(selectedBom!),
    enabled: !!selectedBom,
    select: r => (r.data as any)?.data ?? null,
  });

  const approveMut = useMutation({
    mutationFn: () => approveBom(selectedBom!),
    onSuccess: () => {
      showToast('Approve BOM สำเร็จ', 'success');
      qc.invalidateQueries({ queryKey: ['bom-list'] });
      qc.invalidateQueries({ queryKey: ['bom-detail', selectedBom] });
    },
    onError: () => showToast('Approve ไม่สำเร็จ', 'error'),
  });

  const boms: BomHeader[] = bomListData ?? [];

  return (
    <div className="stack">
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '1.5rem', alignItems: 'start' }}>
        {/* BOM list */}
        <div className="panel" style={{ padding: '1rem' }}>
          <div className="panel__title panel__title--sm" style={{ marginBottom: '0.75rem' }}>รายการ BOM</div>
          {listLoading ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>กำลังโหลด...</p>
          ) : boms.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>ไม่มีข้อมูล BOM</p>
          ) : (
            <div className="stack" style={{ gap: '0.4rem' }}>
              {boms.map(b => (
                <button
                  key={b.bom_id}
                  type="button"
                  onClick={() => setSelectedBom(b.bom_id)}
                  style={{
                    width: '100%', textAlign: 'left', padding: '0.5rem 0.75rem',
                    borderRadius: 6, border: '1px solid',
                    borderColor: selectedBom === b.bom_id ? '#6366f1' : 'var(--border-color)',
                    background: selectedBom === b.bom_id ? '#eef2ff' : '#fff',
                    cursor: 'pointer', fontSize: '0.875rem',
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{b.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    v{b.version} · {b.approved ? '✅ Approved' : '⏳ Pending'}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* BOM detail */}
        <div className="panel">
          {!selectedBom ? (
            <p style={{ color: 'var(--text-muted)', padding: '1rem' }}>เลือก BOM จากรายการทางซ้าย</p>
          ) : detailLoading ? (
            <p style={{ color: 'var(--text-muted)', padding: '1rem' }}>กำลังโหลด...</p>
          ) : !detailData ? (
            <p style={{ color: 'var(--text-muted)', padding: '1rem' }}>ไม่พบข้อมูล BOM</p>
          ) : (
            <div className="stack">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                  <h3 className="panel__title panel__title--sm">{detailData.name}</h3>
                  <p className="panel__subtitle">Version {detailData.version}</p>
                </div>
                {isPm && (
                  detailData.approved ? (
                    <span style={{
                      background: '#dcfce7', color: '#166534', border: '1px solid #86efac',
                      padding: '0.4rem 1rem', borderRadius: 6, fontSize: '0.85rem', fontWeight: 600,
                    }}>
                      ✓ Approved แล้ว
                    </span>
                  ) : (
                    <button
                      className="btn"
                      style={{ background: '#10b981', borderColor: '#10b981', color: '#fff', fontWeight: 600 }}
                      onClick={() => approveMut.mutate()}
                      disabled={approveMut.isPending}
                    >
                      {approveMut.isPending ? 'กำลัง Approve...' : 'Approve BOM'}
                    </button>
                  )
                )}
              </div>

              <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 8 }}>
                <table className="table table-readonly" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>Part No.</th>
                      <th>ชื่อชิ้นส่วน</th>
                      <th style={{ textAlign: 'center' }}>Qty/Unit</th>
                      <th style={{ textAlign: 'center' }}>Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detailData.lines ?? []).length === 0 ? (
                      <EmptyRow cols={4} text="ไม่มี line items" />
                    ) : (
                      (detailData.lines ?? []).map((line: any) => (
                        <tr key={line.line_id}>
                          <td style={{ fontWeight: 600 }}>{line.part_no}</td>
                          <td>{line.part_name}</td>
                          <td style={{ textAlign: 'center' }}>{line.qty_per}</td>
                          <td style={{ textAlign: 'center' }}>{line.unit}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────

type Tab = 'wo-list' | 'pre-wo' | 'bom';

const TABS: { key: Tab; label: string }[] = [
  { key: 'wo-list', label: 'WO List' },
  { key: 'pre-wo', label: 'Pre-WO Request' },
  { key: 'bom',    label: 'BOM Review' },
];

export function ProductionPlanPage() {
  const [tab, setTab] = useState<Tab>('wo-list');

  return (
    <section className="stack-lg">
      <div className="panel">
        <h1 className="panel__title">Production Plan</h1>
        <p className="panel__subtitle">PM Dashboard — วางแผน WO / Pre-WO / BOM Approval</p>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: '0.25rem', marginTop: '1.25rem', borderBottom: '2px solid var(--border-color)' }}>
          {TABS.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              style={{
                padding: '0.5rem 1.25rem', border: 'none', cursor: 'pointer',
                background: 'transparent', fontWeight: tab === t.key ? 700 : 400,
                fontSize: '0.9rem',
                color: tab === t.key ? '#6366f1' : 'var(--text-muted)',
                borderBottom: tab === t.key ? '2px solid #6366f1' : '2px solid transparent',
                marginBottom: -2, transition: 'color 0.15s',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="panel">
        {tab === 'wo-list' && <WoListTab />}
        {tab === 'pre-wo'  && <PreWoTab />}
        {tab === 'bom'     && <BomReviewTab />}
      </div>
    </section>
  );
}
