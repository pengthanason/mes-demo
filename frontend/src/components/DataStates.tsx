// สถานะข้อมูลมาตรฐาน — ใช้ให้เหมือนกันทุกหน้า (โหลด / ว่าง / error)
// ใช้ในตาราง: <tbody>{isLoading ? <TableState colSpan={N} state="loading" /> : rows.length === 0 ? <TableState colSpan={N} state="empty" emptyText="..." /> : rows.map(...)}</tbody>

type State = 'loading' | 'empty' | 'error';

export function TableState({ colSpan, state, emptyText, onRetry }: {
  colSpan: number; state: State; emptyText?: string; onRetry?: () => void;
}) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ textAlign: 'center', padding: '2.5rem 1rem', color: state === 'error' ? '#dc2626' : 'var(--text-muted)', fontSize: '0.9rem' }}>
        {state === 'loading' && 'กำลังโหลด...'}
        {state === 'empty' && (emptyText || 'ยังไม่มีข้อมูล')}
        {state === 'error' && (
          <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
            <span>⚠️ โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่</span>
            {onRetry && <button type="button" className="btn secondary" style={{ fontSize: '0.82rem' }} onClick={onRetry}>ลองใหม่</button>}
          </span>
        )}
      </td>
    </tr>
  );
}

// สถานะข้อมูลแบบไม่ใช่ตาราง (การ์ด/บล็อก)
export function BlockState({ state, emptyText, onRetry }: { state: State; emptyText?: string; onRetry?: () => void }) {
  return (
    <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: state === 'error' ? '#dc2626' : 'var(--text-muted)', fontSize: '0.9rem' }}>
      {state === 'loading' && 'กำลังโหลด...'}
      {state === 'empty' && (emptyText || 'ยังไม่มีข้อมูล')}
      {state === 'error' && (
        <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
          <span>⚠️ โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่</span>
          {onRetry && <button type="button" className="btn secondary" style={{ fontSize: '0.82rem' }} onClick={onRetry}>ลองใหม่</button>}
        </div>
      )}
    </div>
  );
}
