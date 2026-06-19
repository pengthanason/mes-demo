// Badge กลางสำหรับผลตรวจ PASS / FAIL / PARTIAL — ใช้สีเดียวกันทุกหน้า
const STYLE: Record<string, { bg: string; text: string; border: string }> = {
  PASS:    { bg: '#dcfce7', text: '#166534', border: '#86efac' },
  FAIL:    { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
  PARTIAL: { bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
  PENDING: { bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
};

export function ResultBadge({ value }: { value: string }) {
  const s = STYLE[value] ?? { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' };
  return (
    <span style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}`, padding: '2px 10px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
      {value}
    </span>
  );
}
