import { useEffect, useRef, useState } from 'react';

/* ── เอฟเฟกต์ตอนเปิดหน้า: ตัวเลข/กราฟ วิ่งจาก 0 ไปค่าจริง (กิมมิกให้หน้าดูมีชีวิต) ── */
// นับเลขจากค่าเดิม → ค่าใหม่ (ครั้งแรก = จาก 0) ด้วย easeOutCubic; ตอน poll ข้อมูลก็ glide นุ่มๆ ไม่วิ่งใหม่จาก 0
function useCountUp(value: number, duration = 900) {
  const [n, setN] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    let raf = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      if (start === null) start = now;
      const p = Math.min(1, (now - start) / duration);
      const e = 1 - Math.pow(1 - p, 3); // easeOutCubic
      const cur = from + (to - from) * e;
      fromRef.current = cur;
      setN(cur);
      if (p < 1) raf = requestAnimationFrame(tick);
      else { fromRef.current = to; setN(to); }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return n;
}

// true หลัง mount 1 เฟรม — ใช้ทริกเกอร์ CSS transition ให้แท่ง/โดนัทโตจาก 0 ตอนเข้าหน้า
function useMounted() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return on;
}

/* ── Donut chart (SVG) ── */
export function Donut({ data, size = 170 }: { data: { label: string; value: number; color: string }[]; size?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const sw = 18;
  const r = size / 2 - sw / 2 - 2;
  const c = size / 2;
  const C = 2 * Math.PI * r;
  const mounted = useMounted();
  const count = useCountUp(total);
  let offset = 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', justifyContent: 'center' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="#eef2f7" strokeWidth={sw} />
        {total > 0 && data.filter(d => d.value > 0).map((d, i) => {
          const len = (d.value / total) * C;
          const drawn = mounted ? len : 0; // ตอน mount = 0 → โตเป็น len ผ่าน CSS transition
          const seg = (
            <circle key={i} cx={c} cy={c} r={r} fill="none" stroke={d.color} strokeWidth={sw}
              strokeDasharray={`${drawn} ${C - drawn}`} strokeDashoffset={-offset} transform={`rotate(-90 ${c} ${c})`}
              style={{ transition: 'stroke-dasharray 0.85s cubic-bezier(0.22,1,0.36,1)' }} />
          );
          offset += len;
          return seg;
        })}
        <text x={c} y={c - 2} textAnchor="middle" fontSize="24" fontWeight="800" fill="#1e293b">{Math.round(count)}</text>
        <text x={c} y={c + 16} textAnchor="middle" fontSize="10" fill="#64748b">Total</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 130 }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem' }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: d.color, flexShrink: 0 }} />
            <span style={{ color: 'var(--text-muted)' }}>{d.label}</span>
            <strong style={{ marginLeft: 'auto', color: '#1e293b' }}>{d.value}</strong>
            <span style={{ color: '#94a3b8', fontSize: '0.72rem', width: 38, textAlign: 'right' }}>{total > 0 ? `${Math.round(d.value / total * 100)}%` : '—'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── chart bits ── */
export function StatCard({ icon, label, value, accent }: { icon: string; label: string; value: number | string; accent: string }) {
  const isNum = typeof value === 'number';
  const animated = useCountUp(isNum ? value : 0); // นับเลขวิ่งเฉพาะค่าตัวเลข (ข้อความ เช่น "—"/"85%" โชว์ตรงๆ)
  const display = isNum ? Math.round(animated).toLocaleString() : value;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', background: '#fff', border: '1px solid var(--border-color)', borderRadius: 12, padding: '0.9rem 1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <span style={{ width: 42, height: 42, flexShrink: 0, borderRadius: 11, fontSize: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', background: accent + '1a', color: accent }}>{icon}</span>
      <div style={{ lineHeight: 1.2 }}>
        <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#1e293b' }}>{display}</div>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>{label}</div>
      </div>
    </div>
  );
}

export function BarRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const target = max > 0 ? (value / max) * 100 : 0;
  const mounted = useMounted();      // แท่งโตจาก 0 → target ตอนเข้าหน้า (และ glide ตอนค่าเปลี่ยน)
  const num = useCountUp(value, 800); // เลขท้ายแท่งวิ่งตามไปด้วย
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.82rem' }}>
      <div style={{ flex: '0 1 130px', minWidth: 64, textAlign: 'right', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={label}>{label}</div>
      <div style={{ flex: 1, background: 'var(--border-color)', borderRadius: 99, height: 18, overflow: 'hidden' }}>
        <div style={{ width: `${mounted ? target : 0}%`, height: '100%', background: color, borderRadius: 99, minWidth: value > 0 && mounted ? 6 : 0, transition: 'width 0.8s cubic-bezier(0.22,1,0.36,1)' }} />
      </div>
      <div style={{ width: 44, fontWeight: 700, color: '#1e293b' }}>{Math.round(num).toLocaleString()}</div>
    </div>
  );
}

export function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pp-chart-card" style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: 12, padding: '1.15rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.9rem' }}>{title}</div>
      <div className="stack" style={{ gap: '0.55rem' }}>{children}</div>
    </div>
  );
}
