// สถานะข้อมูลมาตรฐาน — ใช้ให้เหมือนกันทุกหน้า (โหลด / ว่าง / กำลังพัฒนา / error)
// - ในตาราง:        <TableState colSpan={N} state="loading|empty|coming-soon|error" emptyText="..." onRetry={fn} />
// - บล็อก/การ์ด:     <BlockState state="..." emptyText="..." onRetry={fn} />
// - เต็มหน้า/section:  <EmptyState state="coming-soon" />  ·  <EmptyState state="error" onRetry={refetch} />
//                    (มีไอคอน + หัวข้อ + คำอธิบาย + ปุ่ม — ใช้แทน "หน้าว่างเปล่า" ที่ผู้ใช้งงว่าพังหรือยังไม่มีข้อมูล)
import type { ReactNode } from 'react';

export type DataState = 'loading' | 'empty' | 'coming-soon' | 'error';

// ข้อความสั้น (ใช้ในตาราง/บล็อก) — error มีปุ่มลองใหม่จึงแยก render ต่างหาก
function shortText(state: DataState, emptyText?: string): ReactNode {
  if (state === 'loading') return 'กำลังโหลด...';
  if (state === 'coming-soon') return '🚧 ฟีเจอร์นี้กำลังพัฒนา';
  if (state === 'empty') return emptyText || 'ยังไม่มีข้อมูล';
  return null; // 'error' → ใช้ ErrorInline
}

function ErrorInline({ onRetry }: { onRetry?: () => void }) {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
      <span>⚠️ โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่</span>
      {onRetry && <button type="button" className="btn secondary" style={{ fontSize: '0.82rem' }} onClick={onRetry}>ลองใหม่</button>}
    </span>
  );
}

// สถานะข้อมูลในตาราง (แถวเดียวกินเต็มความกว้าง)
export function TableState({ colSpan, state, emptyText, onRetry }: {
  colSpan: number; state: DataState; emptyText?: string; onRetry?: () => void;
}) {
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
  loading:       { icon: <Spinner />, title: 'กำลังโหลด...',       message: '' },
  empty:         { icon: '📭',        title: 'ยังไม่มีข้อมูล',       message: '' },
  'coming-soon': { icon: '🚧',        title: 'ฟีเจอร์นี้กำลังพัฒนา',  message: 'ส่วนนี้ยังไม่เปิดให้ใช้งาน — กำลังพัฒนาอยู่' },
  error:         { icon: '⚠️',        title: 'โหลดข้อมูลไม่สำเร็จ',   message: 'เชื่อมต่อไม่ได้หรือเกิดข้อผิดพลาด กรุณาลองใหม่' },
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
          {action ?? (onRetry && <button type="button" className="btn secondary" style={{ fontSize: '0.85rem' }} onClick={onRetry}>ลองใหม่</button>)}
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
