// สถานะข้อมูลมาตรฐาน — ใช้ให้เหมือนกันทุกหน้า (โหลด / ว่าง / กำลังพัฒนา / error)
// - ในตาราง:        <TableState colSpan={N} state="loading|empty|coming-soon|error" emptyText="..." onRetry={fn} />
// - บล็อก/การ์ด:     <BlockState state="..." emptyText="..." onRetry={fn} />
// - เต็มหน้า/section:  <EmptyState state="coming-soon" />  ·  <EmptyState state="error" onRetry={refetch} />
//                    (มีไอคอน + หัวข้อ + คำอธิบาย + ปุ่ม — ใช้แทน "หน้าว่างเปล่า" ที่ผู้ใช้งงว่าพังหรือยังไม่มีข้อมูล)
import type { CSSProperties, ReactNode } from 'react';

// Skeleton placeholder (shimmer) — ใช้ตอนโหลด แทนข้อความ · ใช้ซ้ำได้ทุกที่ (card/ตาราง)
export function Skeleton({ width = '100%', height = 14, radius = 6, style }: {
  width?: number | string; height?: number | string; radius?: number; style?: CSSProperties;
}) {
  return <div className="skeleton" style={{ width, height, borderRadius: radius, ...style }} />;
}

export type DataState = 'loading' | 'empty' | 'coming-soon' | 'error';

// ข้อความสั้น (ใช้ในตาราง/บล็อก) — error มีปุ่มลองใหม่จึงแยก render ต่างหาก
function shortText(state: DataState, emptyText?: string): ReactNode {
  if (state === 'loading') return 'Loading...';
  if (state === 'coming-soon') return '🚧 This feature is in development';
  if (state === 'empty') return emptyText || 'No data';
  return null; // 'error' → ใช้ ErrorInline
}

function ErrorInline({ onRetry }: { onRetry?: () => void }) {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
      <span>⚠️ Failed to load data, please retry</span>
      {onRetry && <button type="button" className="btn secondary" style={{ fontSize: '0.82rem' }} onClick={onRetry}>Retry</button>}
    </span>
  );
}

// สถานะข้อมูลในตาราง (แถวเดียวกินเต็มความกว้าง)
export function TableState({ colSpan, state, emptyText, onRetry }: {
  colSpan: number; state: DataState; emptyText?: string; onRetry?: () => void;
}) {
  // โหลด → แถว skeleton shimmer (ความกว้างสลับ ให้ดูเป็นธรรมชาติ)
  if (state === 'loading') {
    return (
      <>
        {[82, 68, 90, 74, 60].map((w, i) => (
          <tr key={i}>
            <td colSpan={colSpan} style={{ padding: '0.7rem 1rem' }}><Skeleton height={14} width={`${w}%`} /></td>
          </tr>
        ))}
      </>
    );
  }
  return (
    <tr>
      <td colSpan={colSpan} style={{ textAlign: 'center', padding: '2.5rem 1rem', color: state === 'error' ? '#dc2626' : 'var(--text-muted)', fontSize: '0.9rem' }}>
        {state === 'error' ? <ErrorInline onRetry={onRetry} /> : shortText(state, emptyText)}
      </td>
    </tr>
  );
}

// สถานะข้อมูลแบบไม่ใช่ตาราง (การ์ด/บล็อก)
export function BlockState({ state, emptyText, onRetry }: { state: DataState; emptyText?: string; onRetry?: () => void }) {
  // โหลด → เส้น skeleton shimmer หลายบรรทัด
  if (state === 'loading') {
    return (
      <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[88, 96, 72, 84].map((w, i) => <Skeleton key={i} height={14} width={`${w}%`} />)}
      </div>
    );
  }
  return (
    <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: state === 'error' ? '#dc2626' : 'var(--text-muted)', fontSize: '0.9rem' }}>
      {state === 'error' ? <ErrorInline onRetry={onRetry} /> : shortText(state, emptyText)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EmptyState — สถานะเต็มหน้า/section แบบมีไอคอน + หัวข้อ + คำอธิบาย + ปุ่ม
// ใช้แทนหน้าว่างเปล่า: endpoint ยังไม่มี → coming-soon, api พัง → error, ไม่มีข้อมูล → empty
// ---------------------------------------------------------------------------

const PRESETS: Record<DataState, { icon: ReactNode; title: string; message: string }> = {
  loading:       { icon: <Spinner />, title: 'Loading...',                  message: '' },
  empty:         { icon: '📭',        title: 'No data',                     message: '' },
  'coming-soon': { icon: '🚧',        title: 'This feature is in development', message: 'This section is not available yet — currently in development' },
  error:         { icon: '⚠️',        title: 'Failed to load data',         message: 'Could not connect or an error occurred, please retry' },
};

export function EmptyState({ state = 'empty', title, message, icon, onRetry, action, compact = false }: {
  state?: DataState;
  title?: string;                 // แทนหัวข้อ default
  message?: string;               // แทนคำอธิบาย default (ส่ง '' เพื่อซ่อน)
  icon?: ReactNode;               // แทนไอคอน default
  onRetry?: () => void;           // ถ้าใส่ → โชว์ปุ่ม "ลองใหม่"
  action?: ReactNode;             // ปุ่ม/ลิงก์เองแบบกำหนดเอง (ทับ onRetry)
  compact?: boolean;              // ขนาดเล็กลง (ใช้ในการ์ด/บล็อกเล็ก)
}) {
  const p = PRESETS[state] ?? PRESETS.empty;
  const showIcon = icon ?? p.icon;
  const msg = message ?? p.message;
  return (
    <div style={{ textAlign: 'center', padding: compact ? '2rem 1rem' : '3.5rem 1.5rem', color: 'var(--text-muted)' }}>
      {showIcon && <div style={{ fontSize: compact ? '1.9rem' : '2.7rem', lineHeight: 1, marginBottom: 12 }}>{showIcon}</div>}
      <div style={{ fontSize: compact ? '0.95rem' : '1.05rem', fontWeight: 700, color: state === 'error' ? '#dc2626' : '#1e293b', marginBottom: msg ? 6 : 0 }}>
        {title ?? p.title}
      </div>
      {msg && <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: 420, margin: '0 auto', lineHeight: 1.5 }}>{msg}</div>}
      {(action || onRetry) && (
        <div style={{ marginTop: 18 }}>
          {action ?? (onRetry && <button type="button" className="btn secondary" style={{ fontSize: '0.85rem' }} onClick={onRetry}>Retry</button>)}
        </div>
      )}
    </div>
  );
}

// สปินเนอร์เล็ก (SVG self-animate ผ่าน SMIL — ไม่ต้องพึ่ง @keyframes ใน CSS)
function Spinner() {
  return (
    <svg width="30" height="30" viewBox="0 0 50 50" style={{ display: 'block', margin: '0 auto' }} role="img" aria-label="loading">
      <circle cx="25" cy="25" r="20" fill="none" stroke="#e2e8f0" strokeWidth="5" />
      <circle cx="25" cy="25" r="20" fill="none" stroke="#3b82f6" strokeWidth="5" strokeLinecap="round" strokeDasharray="80 130">
        <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="0.9s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}
