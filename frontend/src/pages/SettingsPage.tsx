import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useBackupSummary, downloadBackup, defaultBackupBase } from '../lib/backupApi';
import { FileNamePromptModal } from '../components/FileNamePromptModal';
import { showToast } from '../lib/toast';
import { useMockAuth } from '../lib/useMockStore';

// ปุ่มเล็กแบบหน้า setting (ไม่ใช่ปุ่มใหญ่เต็มความกว้าง)
const smallBtn: React.CSSProperties = { fontSize: '0.8rem', padding: '0.35rem 0.8rem', minHeight: 32, whiteSpace: 'nowrap' };

/** 1 แถวของหน้า setting: ชื่อ + คำอธิบายซ้าย · ปุ่ม/ค่าขวา */
function Row({ label, desc, children }: { label: string; desc?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
      padding: '0.95rem 0', borderBottom: '1px solid #eef2f7',
    }}>
      <div style={{ flex: '1 1 260px', minWidth: 0 }}>
        <div style={{ fontSize: '0.92rem', fontWeight: 600, color: '#1e293b' }}>{label}</div>
        {desc && <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 3, lineHeight: 1.7 }}>{desc}</div>}
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>{children}</div>
    </div>
  );
}

export function SettingsPage() {
  const { username, role, fullName } = useMockAuth() as any;
  const { data, isLoading, isError, refetch } = useBackupSummary();
  const [ask, setAsk] = useState<null | 'json' | 'sql'>(null);   // ป๊อปอัพตั้งชื่อไฟล์เปิดอยู่ไหม (รูปแบบไหน)
  const [busy, setBusy] = useState(false);

  async function run(format: 'json' | 'sql', filename: string) {
    setAsk(null);
    setBusy(true);
    const r = await downloadBackup(format, filename);
    setBusy(false);
    if (r.ok) showToast(`ดาวน์โหลดแล้ว: ${r.filename}`, 'success');
    else showToast(r.error || 'ดาวน์โหลดไม่สำเร็จ', 'error');
  }

  const roleUpper = String(role || '').toUpperCase();

  return (
    <section className="stack-lg" style={{ maxWidth: 760, margin: '0 auto' }}>
      <div className="panel">
        <h1 className="panel__title">⚙️ Settings</h1>
        <p className="panel__subtitle">ตั้งค่าระบบ · สำรองข้อมูล</p>

        <div style={{ marginTop: '1.25rem' }}>
          {/* ── สำรองข้อมูล ── */}
          <Row
            label="สำรองข้อมูล (Backup)"
            desc={
              isLoading ? 'กำลังตรวจข้อมูล...'
              : isError ? <span style={{ color: '#b91c1c' }}>โหลดข้อมูลไม่สำเร็จ · <button type="button" onClick={() => void refetch()} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: 0, font: 'inherit' }}>ลองใหม่</button></span>
              : data ? <>ดาวน์โหลดข้อมูลทั้งระบบเก็บไว้ในเครื่อง — {data.tables.length} ตาราง · {data.total_rows.toLocaleString()} แถว</>
              : null
            }
          >
            {busy && <span style={{ fontSize: '0.78rem', color: '#64748b' }}>กำลังสร้างไฟล์...</span>}
            <button type="button" className="btn" style={smallBtn} disabled={!data || busy} onClick={() => setAsk('json')}>
              ⬇️ JSON
            </button>
            <button type="button" className="btn secondary" style={smallBtn} disabled={!data || busy} onClick={() => setAsk('sql')}>
              ⬇️ SQL
            </button>
          </Row>

          {/* คำเตือนเมื่อไฟล์มีรหัสผ่าน (ADMIN) */}
          {data?.includes_users && (
            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca', borderLeft: '3px solid #ef4444',
              borderRadius: 6, padding: '0.6rem 0.8rem', margin: '0.7rem 0 0',
              fontSize: '0.79rem', lineHeight: 1.7, color: '#7f1d1d',
            }}>
              🔐 ไฟล์ backup ของสิทธิ์ ADMIN <strong>มีรหัสผ่าน (hash) ของผู้ใช้ทุกคน</strong> — เก็บในที่ปลอดภัย ห้ามส่งต่อในแชท/อีเมล
            </div>
          )}
          {data && !data.includes_users && (
            <div style={{ fontSize: '0.78rem', color: '#15803d', margin: '0.6rem 0 0' }}>
              ✅ สิทธิ์ {roleUpper} — ไฟล์จะไม่มีตารางผู้ใช้/รหัสผ่าน ({data.skipped.join(', ')})
            </div>
          )}

          {/* ── รูปแบบไฟล์ (อธิบายสั้น) ── */}
          <Row
            label="รูปแบบไฟล์"
            desc={<><strong>JSON</strong> — เปิดอ่านได้ เอาไปใช้ต่อง่าย (แนะนำ) · <strong>SQL</strong> — ใช้กู้ระบบตอนฉุกเฉินด้วย <code>psql -f ไฟล์</code></>}
          />

          {/* ── บัญชีที่ใช้งาน ── */}
          <Row
            label="บัญชีที่ล็อกอิน"
            desc={`${fullName || username || '-'} (${username || '-'}) · สิทธิ์ ${roleUpper}`}
          />

          {/* ── ลิงก์ไปจัดการผู้ใช้ (ADMIN) ── */}
          {roleUpper === 'ADMIN' && (
            <Row label="ผู้ใช้และรหัสผ่าน" desc="เพิ่ม/แก้ผู้ใช้ · เปลี่ยนรหัสผ่าน · กำหนดสิทธิ์รายหน้า">
              <Link to="/admin/panel?tab=users" className="btn secondary" style={{ ...smallBtn, textDecoration: 'none' }}>
                Admin Panel
              </Link>
            </Row>
          )}
        </div>

        <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '1rem', lineHeight: 1.7 }}>
          💡 backup ที่ยังไม่เคยลองกู้คืน = ยังไม่ใช่ backup — ควรทดลองกู้ลง DB ทดสอบ 1 ครั้งให้แน่ใจว่าใช้ได้จริง
        </p>
      </div>

      {/* ป๊อปอัพตั้งชื่อไฟล์ (ใช้ตัวเดียวกับหน้า export อื่น) */}
      {ask && (
        <FileNamePromptModal
          title={ask === 'json' ? '💾 Backup ข้อมูล (JSON)' : '💾 Backup ข้อมูล (SQL)'}
          subtitle="ตั้งชื่อไฟล์ แล้วกด “OK” เพื่อดาวน์โหลด"
          defaultBase={defaultBackupBase()}
          ext={ask}
          onCancel={() => setAsk(null)}
          onConfirm={(name) => void run(ask, name)}
        />
      )}
    </section>
  );
}
