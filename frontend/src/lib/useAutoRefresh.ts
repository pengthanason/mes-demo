import { useEffect, useRef } from 'react';

export function useAutoRefresh(callback: () => void, intervalMs: number = 30000) {
  const savedCallback = useRef(callback);

  // จดจำ callback ล่าสุดเสมอ
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    let intervalId: number | undefined;

    const tick = () => {
      // ดึงข้อมูลใหม่ก็ต่อเมื่อหน้าเว็บถูกเปิดดูอยู่ (visible) และต่อเน็ตอยู่เท่านั้น
      if (document.visibilityState === 'visible' && navigator.onLine) {
        savedCallback.current();
      }
    };

    const start = () => { if (!intervalId) intervalId = window.setInterval(tick, intervalMs); };
    const stop = () => { if (intervalId) { window.clearInterval(intervalId); intervalId = undefined; } };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        tick(); // พอกลับมาที่แท็บนี้ ให้โหลดข้อมูลใหม่ทันที
        start();
      } else {
        stop(); // ซ่อนแท็บอยู่ ให้หยุดทำงาน
      }
    };

    if (document.visibilityState === 'visible') start();

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', start);
    window.addEventListener('offline', stop);

    return () => { stop(); document.removeEventListener('visibilitychange', handleVisibilityChange); window.removeEventListener('online', start); window.removeEventListener('offline', stop); };
  }, [intervalMs]);
}