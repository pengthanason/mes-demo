import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Home } from 'lucide-react';

export function NotFoundPage() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '65vh',
      textAlign: 'center',
      padding: '2rem',
    }}>
      <div style={{
        padding: '1.25rem',
        background: 'rgba(245, 158, 11, 0.12)',
        borderRadius: '20px',
        marginBottom: '1.5rem',
        border: '1px solid rgba(245, 158, 11, 0.3)',
      }}>
        <AlertTriangle color="#f59e0b" size={48} />
      </div>

      <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--text-main)' }}>
        404 — ไม่พบหน้าที่คุณต้องการ (Page Not Found)
      </h1>

      <p style={{ maxWidth: 480, fontSize: '1rem', color: 'var(--text-muted)', marginBottom: '2rem', lineHeight: 1.6 }}>
        ที่อยู่เว็บที่คุณพิมพ์เข้ามาอาจไม่ถูกต้อง หรือหน้านี้อาจถูกย้ายไปแล้ว
        โปรดตรวจสอบการพิมพ์ URL อีกครั้ง หรือกดปุ่มด้านล่างเพื่อกลับสู่หน้าหลัก
      </p>

      <Link to="/dashboard" className="btn primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.5rem', fontSize: '1rem' }}>
        <Home size={20} />
        กลับสู่หน้า Dashboard
      </Link>
    </div>
  );
}
