import { useReworkList, useReworkStatus, type ReworkStatus } from '../lib/qcResultApi';
import { useIsViewer } from '../lib/useMockStore';
import { showToast } from '../lib/toast';
import { ResultBadge } from '../components/ResultBadge';
import { TableState } from '../components/DataStates';

const STATUS_STYLE: Record<ReworkStatus, { label: string; bg: string; text: string; border: string }> = {
  OPEN:        { label: 'Open',        bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
  IN_PROGRESS: { label: 'In Progress', bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
  DONE:        { label: 'Done',        bg: '#dcfce7', text: '#166534', border: '#86efac' },
};
// ปุ่มเลื่อนสถานะถัดไป
const NEXT: Partial<Record<ReworkStatus, { to: ReworkStatus; label: string; color: string }>> = {
  OPEN:        { to: 'IN_PROGRESS', label: 'Start Repair →', color: '#d97706' },
  IN_PROGRESS: { to: 'DONE',        label: 'Close (Done) →', color: '#16a34a' },
};

export function ReworkPage() {
  const isViewer = useIsViewer();
  const { data: tickets = [], isLoading, isError, refetch } = useReworkList();
  const statusMut = useReworkStatus();

  const advance = (id: number, to: ReworkStatus) => {
    statusMut.mutate({ id, status: to }, {
      onSuccess: () => showToast(`Rework #${id} status updated → ${STATUS_STYLE[to].label}`, to === 'DONE' ? 'success' : 'info'),
      onError: (e: any) => showToast(e.message, 'error'),
    });
  };

  const open = tickets.filter(t => t.status !== 'DONE').length;

  return (
    <div className="panel stack-lg">
      <div>
        <h2 className="panel__title">Rework Tickets {tickets.length > 0 && `(Pending ${open}/${tickets.length})`}</h2>
        <p className="panel__subtitle">Track defect repair jobs — opened from failed QC results, then advance status Open → In Progress → Done</p>
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 8 }}>
        <table className="table" style={{ minWidth: 820, width: '100%' }}>
          <thead>
            <tr>
              <th>Date</th><th>WO</th><th>Lot</th><th>QC Result</th><th>Defect Type</th><th>Assigned To</th><th style={{ textAlign: 'center' }}>Due Date</th><th style={{ textAlign: 'center' }}>Status</th>{!isViewer && <th style={{ textAlign: 'center' }}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <TableState colSpan={isViewer ? 8 : 9} state="loading" />
            ) : isError ? (
              <TableState colSpan={isViewer ? 8 : 9} state="error" onRetry={() => refetch()} />
            ) : tickets.length === 0 ? (
              <TableState colSpan={isViewer ? 8 : 9} state="empty" emptyText="No Rework yet — open one from the QC Result tab (rows with FAIL/PARTIAL result)" />
            ) : tickets.map(t => {
              const s = STATUS_STYLE[t.status];
              const next = NEXT[t.status];
              return (
                <tr key={t.id}>
                  <td style={{ whiteSpace: 'nowrap', fontSize: '0.82rem', color: 'var(--text-muted)' }}>{new Date(t.createdAt).toLocaleDateString('en-GB')}</td>
                  <td style={{ fontWeight: 600 }}>{t.woId}</td>
                  <td><code>{t.lotNo}</code></td>
                  <td><ResultBadge value={t.qcOverall} /></td>
                  <td>{t.defectType}</td>
                  <td>{t.assignedTo || '—'}</td>
                  <td style={{ textAlign: 'center', whiteSpace: 'nowrap', fontSize: '0.82rem' }}>{t.dueDate ? new Date(t.dueDate).toLocaleDateString('en-GB') : '—'}</td>
                  <td style={{ textAlign: 'center', width: 110 }}>
                    <span className="status-badge" style={{ minWidth: 78, textAlign: 'center', background: s.bg, color: s.text, border: `1px solid ${s.border}` }}>{s.label}</span>
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
                        ) : <span style={{ color: '#16a34a', fontSize: '0.8rem' }}>✓ Done</span>}
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
