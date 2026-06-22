import { useReworkList, useReworkStatus, type ReworkStatus } from '../lib/qcResultApi';
import { useIsViewer } from '../lib/useMockStore';
import { showToast } from '../lib/toast';
import { ResultBadge } from '../components/ResultBadge';

const STATUS_STYLE: Record<ReworkStatus, { label: string; bg: string; text: string; border: string }> = {
  OPEN:        { label: 'เปิด',       bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
  IN_PROGRESS: { label: 'กำลังซ่อม',  bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
  DONE:        { label: 'เสร็จ',      bg: '#dcfce7', text: '#166534', border: '#86efac' },
};
// ปุ่มเลื่อนสถานะถัดไป
const NEXT: Partial<Record<ReworkStatus, { to: ReworkStatus; label: string; color: string }>> = {
  OPEN:        { to: 'IN_PROGRESS', label: 'เริ่มซ่อม →', color: '#d97706' },
  IN_PROGRESS: { to: 'DONE',        label: 'ปิดงาน (เสร็จ) →', color: '#16a34a' },
};

export function ReworkPage() {
  const isViewer = useIsViewer();
  const { data: tickets = [], isLoading } = useReworkList();
  const statusMut = useReworkStatus();

  const advance = (id: number, to: ReworkStatus) => {
    statusMut.mutate({ id, status: to }, {
      onSuccess: () => showToast(`อัปเดตสถานะ Rework #${id} → ${STATUS_STYLE[to].label}`, to === 'DONE' ? 'success' : 'info'),
      onError: (e: any) => showToast(e.message, 'error'),
    });
  };

  const open = tickets.filter(t => t.status !== 'DONE').length;

  return (
    <div className="panel stack-lg">
      <div>
        <h2 className="panel__title">Rework Tickets {tickets.length > 0 && `(ค้าง ${open}/${tickets.length})`}</h2>
        <p className="panel__subtitle">ติดตามงานซ่อมแก้ของเสีย — เปิดจากผล QC ที่ไม่ผ่าน แล้วเลื่อนสถานะ เปิด → กำลังซ่อม → เสร็จ</p>
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 8 }}>
        <table className="table" style={{ minWidth: 820, width: '100%' }}>
          <thead>
            <tr>
              <th>วันที่</th><th>WO</th><th>Lot</th><th>ผล QC</th><th>ประเภทของเสีย</th><th>ผู้รับผิดชอบ</th><th style={{ textAlign: 'center' }}>กำหนดเสร็จ</th><th style={{ textAlign: 'center' }}>สถานะ</th>{!isViewer && <th style={{ textAlign: 'center' }}>จัดการ</th>}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={isViewer ? 8 : 9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>กำลังโหลด...</td></tr>
            ) : tickets.length === 0 ? (
              <tr><td colSpan={isViewer ? 8 : 9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>ยังไม่มี Rework — เปิดได้จากแท็บ QC Result (แถวที่ผล FAIL/PARTIAL)</td></tr>
            ) : tickets.map(t => {
              const s = STATUS_STYLE[t.status];
              const next = NEXT[t.status];
              return (
                <tr key={t.id}>
                  <td style={{ whiteSpace: 'nowrap', fontSize: '0.82rem', color: 'var(--text-muted)' }}>{new Date(t.createdAt).toLocaleDateString('th-TH')}</td>
                  <td style={{ fontWeight: 600 }}>{t.woId}</td>
                  <td><code>{t.lotNo}</code></td>
                  <td><ResultBadge value={t.qcOverall} /></td>
                  <td>{t.defectType}</td>
                  <td>{t.assignedTo || '—'}</td>
                  <td style={{ textAlign: 'center', whiteSpace: 'nowrap', fontSize: '0.82rem' }}>{t.dueDate ? new Date(t.dueDate).toLocaleDateString('th-TH') : '—'}</td>
                  <td style={{ textAlign: 'center', width: 110 }}>
                    <span style={{ display: 'inline-block', minWidth: 78, textAlign: 'center', background: s.bg, color: s.text, border: `1px solid ${s.border}`, padding: '2px 10px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{s.label}</span>
                  </td>
                  {!isViewer && (
                    <td style={{ textAlign: 'center', width: 170 }}>
                      <div style={{ width: 150, margin: '0 auto' }}>
                        {next ? (
                          <button type="button" className="btn" disabled={statusMut.isPending}
                            onClick={() => advance(t.id, next.to)}
                            style={{ width: '100%', background: next.color, borderColor: next.color, color: '#fff', fontWeight: 600, fontSize: '0.78rem', padding: '4px 8px', whiteSpace: 'nowrap' }}>
                            {next.label}
                          </button>
                        ) : <span style={{ color: '#16a34a', fontSize: '0.8rem' }}>✓ เสร็จแล้ว</span>}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
