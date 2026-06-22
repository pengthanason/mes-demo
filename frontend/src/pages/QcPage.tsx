import { useState } from 'react';
import QcBoard from './quality/index.jsx';
import { QcResultPage } from './QcResultPage';
import { ReworkPage } from './ReworkPage';

type Tab = 'board' | 'result' | 'rework';

/* รวม QC Board (สแกนทีละชิ้น) · QC Result (สรุปผลตามล็อต) · Rework (งานซ่อม) ไว้ในหน้าเดียว */
export function QcPage() {
  const [tab, setTab] = useState<Tab>('board');
  return (
    <section className="stack-lg">
      <div className="panel">
        <h1 className="panel__title">Quality Control (QC)</h1>
        <p className="panel__subtitle">QC Board (สแกนทีละชิ้น) · QC Result (ตามล็อต + เปิด Rework) · Rework (ติดตามงานซ่อม)</p>
        <div className="mes-module-tabs" style={{ marginTop: '1.25rem' }}>
          <button type="button" className={`mes-module-tab ${tab === 'board' ? 'active' : ''}`} onClick={() => setTab('board')}>✅ QC Board (สแกน)</button>
          <button type="button" className={`mes-module-tab ${tab === 'result' ? 'active' : ''}`} onClick={() => setTab('result')}>🧾 QC Result (ตามล็อต)</button>
          <button type="button" className={`mes-module-tab ${tab === 'rework' ? 'active' : ''}`} onClick={() => setTab('rework')}>🛠️ Rework (งานซ่อม)</button>
        </div>
      </div>
      {tab === 'board' && <QcBoard />}
      {tab === 'result' && <QcResultPage />}
      {tab === 'rework' && <ReworkPage />}
    </section>
  );
}
