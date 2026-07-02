import { setupWorker } from 'msw/browser';
import { handlers, recordApiActivity } from './handlers';

export const worker = setupWorker(...handlers);

// บันทึกทุก mutation ที่สำเร็จเป็น Activity (เดโม) — รับ event จาก api.ts (ยิงแน่นอนทุก request)
if (typeof window !== 'undefined') {
  window.addEventListener('mes:mutation', (e) => {
    const d = (e as CustomEvent).detail || {};
    recordApiActivity(d.method, d.url, d.status, d.auth, d.data);
  });
}
