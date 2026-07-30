type PaginatorProps = {
  page: number;
  totalPages: number;
  onPage: (n: number) => void;
  total: number;
};

const SLOTS = 7;   // จำนวนช่องเลขหน้าที่โชว์ — คงที่เสมอ ปุ่มจะไม่ขยับซ้ายขวาเวลาเปลี่ยนหน้า

/**
 * หน้าต่างเลขหน้า — คืนจำนวนช่อง "เท่ากันทุกครั้ง" (min(totalPages, SLOTS))
 * เดิม: หน้า 1 ได้ [1,2,…,20] = 4 ช่อง · หน้า 8 ได้ [1,…,7,8,9,…,20] = 7 ช่อง
 *       → จำนวนปุ่มเปลี่ยน = แถวปุ่มขยับ → กดรัวๆ แล้วพลาด
 * ใหม่: 20 หน้า → ได้ 7 ช่องเสมอ
 *       หน้า 1  : 1 2 3 4 5 … 20
 *       หน้า 8  : 1 … 7 8 9 … 20
 *       หน้า 20 : 1 … 16 17 18 19 20
 */
function pageWindow(page: number, totalPages: number): (number | '…')[] {
  if (totalPages <= SLOTS) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const edge = 4;                                    // ใกล้ขอบแค่ไหนถึงกางเลขติดกัน
  if (page <= edge) return [1, 2, 3, 4, 5, '…', totalPages];
  if (page >= totalPages - edge + 1) {
    return [1, '…', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }
  return [1, '…', page - 1, page, page + 1, '…', totalPages];
}

export function Paginator({ page, totalPages, onPage, total }: PaginatorProps) {
  if (totalPages <= 1) return null;
  const items = pageWindow(page, totalPages);
  // ทุกช่องกว้างเท่ากัน (รวม "…") → ตำแหน่งปุ่มนิ่ง กดรัวๆ ได้ไม่พลาด
  // transition/transform/boxShadow = none : ปิด animation ของ .btn
  //   ไม่งั้นตอนเปลี่ยนหน้า ปุ่มหน้าเก่าจะค่อยๆ ไล่สีเขียว→ขาว (0.15s) เห็นเป็น "สีกระพริบ"
  //   และ hover ของ .btn ยกปุ่มขึ้น 1px ทำให้แถวปุ่มกระเพื่อมตอนกดรัวๆ
  const slot = {
    padding: '0.4rem 0.6rem', minWidth: 34, textAlign: 'center' as const,
    transition: 'none', transform: 'none', boxShadow: 'none',
  };
  const arrow = { padding: '0.4rem 0.7rem', transition: 'none', transform: 'none', boxShadow: 'none' };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', marginTop: '1rem' }}>
      <button type="button" className="btn secondary" onClick={() => onPage(Math.max(1, page - 1))} disabled={page === 1} style={arrow}>
        ‹
      </button>
      {items.map((n, i) =>
        n === '…' ? (
          <span key={`gap-${i}`} style={{ ...slot, color: 'var(--text-muted)', lineHeight: '2.1' }}>…</span>
        ) : (
          <button key={n} type="button" className={`btn ${n === page ? '' : 'secondary'}`} onClick={() => onPage(n)} style={slot}>
            {n}
          </button>
        )
      )}
      <button type="button" className="btn secondary" onClick={() => onPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} style={arrow}>
        ›
      </button>
      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginLeft: '0.5rem', width: '100%', textAlign: 'center' }}>
        {total} items
      </span>
    </div>
  );
}
