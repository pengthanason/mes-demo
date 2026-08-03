import { useEffect } from 'react';

/** กด Escape แล้วเรียก onEscape — ใช้ปิด modal/popup ทุกจุดในแอปให้ behavior เหมือนกัน (active = เปิดอยู่ไหม) */
export function useEscapeKey(active: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onEscape(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [active, onEscape]);
}
