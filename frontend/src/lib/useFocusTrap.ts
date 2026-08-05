import { useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * ดัก Tab ให้วนอยู่แค่ใน modal เดียว (เดิม Tab/Shift+Tab หลุดออกไปกดพื้นหลังได้ทั้งที่ modal เปิดอยู่ — modal ไม่ modal จริงสำหรับคนใช้คีย์บอร์ด)
 * + จำ element ที่ focus อยู่ก่อนเปิด แล้วคืน focus กลับให้ตอนปิด (เดิม focus หายเฉยๆ ไปอยู่ที่ <body>)
 * ใช้คู่กับ useEscapeKey ทุก modal — containerRef ต้องชี้ที่กล่อง modal เอง (ไม่ใช่ backdrop เต็มจอ)
 */
export function useFocusTrap(active: boolean, containerRef: React.RefObject<HTMLElement>) {
  const prevFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    prevFocusRef.current = document.activeElement as HTMLElement | null;

    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const root = containerRef.current;
      if (!root) return;
      const focusables = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => el.offsetParent !== null);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const activeInside = root.contains(document.activeElement);
      if (e.shiftKey) {
        if (!activeInside || document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (!activeInside || document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      prevFocusRef.current?.focus?.();
    };
  }, [active, containerRef]);
}
