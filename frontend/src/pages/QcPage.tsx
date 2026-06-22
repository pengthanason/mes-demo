import { useState } from 'react';
import QcBoard from './quality/index.jsx';
import { QcResultPage } from './QcResultPage';

type Tab = 'board' | 'result';

/* รวม QC Board (สแกนทีละชิ้น) กับ QC Result (สรุปผลตามล็อต + Rework) ไว้ในหน้าเดียว */
export function QcPage() {
  const [tab, setTab] = useState<Tab>('board');
  return (
    <section className="stack-lg">
      <div className="panel">
        <h1 className="panel__title">Quality Control (QC)</h1>
        <p className="panel__subtitle">QC Board (สแกน Serial ทีละชิ้น) · QC Result (สรุปผลตามล็อต + เปิด Rework)</p>
        <div className="mes-module-tabs" style={{ marginTop: '1.25rem' }}>
          <button type="button" className={`mes-module-tab ${tab === 'board' ? 'active' : ''}`} onClick={() => setTab('board')}>✅ QC Board (สแกน)</button>
          <button type="button" className={`mes-module-tab ${tab === 'result' ? 'active' : ''}`} onClick={() => setTab('result')}>🧾 QC Result (ตามล็อต)</button>
        </div>
      </div>
      {tab === 'board' ? <QcBoard /> : <QcResultPage />}
    </section>
  );
}
