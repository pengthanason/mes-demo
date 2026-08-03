import { useState } from 'react';
import { useBackupSummary, downloadBackup, defaultBackupBase } from '../lib/backupApi';
import { FileNamePromptModal } from '../components/FileNamePromptModal';
import { showToast } from '../lib/toast';

// ── ชิ้นส่วนหน้า setting: แถวรายการ (ป้าย+คำอธิบายซ้าย · ตัวควบคุมขวา) ──
// เพิ่มหัวข้ออื่นในอนาคตแค่เพิ่ม <Row> ต่อท้าย

function Row({ label, desc, children }: { label: string; desc?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
      padding: '0.6rem 0', borderTop: '1px solid var(--border)', marginTop: '0.35rem',
    }}>
      <div style={{ flex: '1 1 280px', minWidth: 0 }}>
        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)', lineHeight: 1.4 }}>{label}</div>
        {desc && <div style={{ fontSize: '0.79rem', color: 'var(--text-muted)', marginTop: 1, lineHeight: 1.5 }}>{desc}</div>}
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>{children}</div>
    </div>
  );
}

const ctrl: React.CSSProperties = { fontSize: '0.83rem', padding: '0.35rem 0.8rem', minHeight: 32, whiteSpace: 'nowrap' };

export function SettingsPage() {
  const { data } = useBackupSummary();
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);

  async function runBackup(filename: string) {
    setAsk(false);
    setBusy(true);
    const r = await downloadBackup('json', filename);
    setBusy(false);
    if (r.ok) showToast(`Downloaded: ${r.filename}`, 'success');
    else showToast(r.error || 'Download failed', 'error');
  }

  return (
    <section className="stack-lg" style={{ maxWidth: 960, margin: '0 auto' }}>
      <div className="panel">
        <h1 className="panel__title" style={{ marginBottom: '1.1rem' }}>Settings</h1>

        <Row
          label="Backup"
          desc={data
            ? `Download all system data to your computer — ${data.tables.length} tables · ${data.total_rows.toLocaleString()} rows`
            : 'Download all system data to your computer'}
        >
          <button type="button" className="btn" style={ctrl} disabled={busy} onClick={() => setAsk(true)}>
            {busy ? 'Preparing file...' : '💾 Backup'}
          </button>
        </Row>
      </div>

      {ask && (
        <FileNamePromptModal
          title="💾 Backup"
          subtitle={data?.includes_users
            ? 'This file contains every user’s password hash — keep it confidential'
            : 'Name the file, then click “OK” to download'}
          defaultBase={defaultBackupBase()}
          ext="json"
          onCancel={() => setAsk(false)}
          onConfirm={(name) => void runBackup(name)}
        />
      )}
    </section>
  );
}
