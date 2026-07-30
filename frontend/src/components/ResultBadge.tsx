// Badge กลางสำหรับผลตรวจ PASS / FAIL / PARTIAL — ใช้สีเดียวกันทุกหน้า
const STYLE: Record<string, { bg: string; text: string; border: string }> = {
  PASS:    { bg: '#dcfce7', text: '#166534', border: '#86efac' },
  FAIL:    { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
  PARTIAL: { bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
  PENDING: { bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
};

export function ResultBadge({ value }: { value: string }) {
  const s = STYLE[value] ?? { bg: 'var(--surface-2)', text: 'var(--ink-3)', border: 'var(--line-3)' };
  return (
    <span className="status-badge" style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}` }}>
      {value}
    </span>
  );
}
