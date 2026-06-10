type KpiCardProps = {
  label: string;
  value: number;
  tone: 'neutral' | 'busy' | 'warn' | 'done';
};

const TONE_COLOR: Record<KpiCardProps['tone'], string> = {
  busy:    '#3b82f6',
  warn:    '#f59e0b',
  done:    '#10b981',
  neutral: '#94a3b8',
};

export function KpiCard({ label, value, tone }: KpiCardProps) {
  return (
    <div className="glass-panel" style={{ padding: '1.2rem', borderLeft: `4px solid ${TONE_COLOR[tone]}`, background: 'var(--bg-panel)' }}>
      <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.5rem' }}>
        {label}
      </div>
      <strong style={{ fontSize: '2rem', color: 'var(--text-main)', lineHeight: 1 }}>{value}</strong>
    </div>
  );
}
