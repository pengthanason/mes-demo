type PaginatorProps = {
  page: number;
  totalPages: number;
  onPage: (n: number) => void;
  total: number;
};

// แสดงหน้าแบบมีหน้าต่าง: 1 … (p-1) p (p+1) … last — กันปุ่มล้นจอบนมือถือ
function pageWindow(page: number, totalPages: number): (number | '…')[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const out: (number | '…')[] = [1];
  const start = Math.max(2, page - 1);
  const end   = Math.min(totalPages - 1, page + 1);
  if (start > 2) out.push('…');
  for (let n = start; n <= end; n++) out.push(n);
  if (end < totalPages - 1) out.push('…');
  out.push(totalPages);
  return out;
}

export function Paginator({ page, totalPages, onPage, total }: PaginatorProps) {
  if (totalPages <= 1) return null;
  const items = pageWindow(page, totalPages);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', marginTop: '1rem' }}>
      <button type="button" className="btn secondary" onClick={() => onPage(Math.max(1, page - 1))} disabled={page === 1} style={{ padding: '0.4rem 0.7rem' }}>
        ‹
      </button>
      {items.map((n, i) =>
        n === '…' ? (
          <span key={`gap-${i}`} style={{ padding: '0 0.25rem', color: 'var(--text-muted)' }}>…</span>
        ) : (
          <button key={n} type="button" className={`btn ${n === page ? '' : 'secondary'}`} onClick={() => onPage(n)} style={{ padding: '0.4rem 0.6rem', minWidth: 34 }}>
            {n}
          </button>
        )
      )}
      <button type="button" className="btn secondary" onClick={() => onPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} style={{ padding: '0.4rem 0.7rem' }}>
        ›
      </button>
      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginLeft: '0.5rem', width: '100%', textAlign: 'center' }}>
        {total} รายการ
      </span>
    </div>
  );
}
