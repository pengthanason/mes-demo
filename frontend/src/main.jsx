import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

import { IS_DEMO } from './lib/config';

async function enableMocking() {
  if (!IS_DEMO) return;
  const { worker } = await import('./mocks/browser');
  return worker.start({ onUnhandledRequest: 'bypass' });
}

// .catch() สำคัญ: ถ้า mock worker โหลดไม่ได้ (ไม่มี mockServiceWorker.js ใน build) ต้องยัง render แอปได้
// ไม่งั้น promise reject → React ไม่ถูก render เลย → หน้าจอขาวทั้งเว็บ โดยไม่มี error ให้ผู้ใช้เห็น
enableMocking()
  .catch((e) => console.warn('[mock] disabling mock mode (worker failed to load):', e?.message || e))
  .finally(() => {
    ReactDOM.createRoot(document.getElementById('root')).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  });
