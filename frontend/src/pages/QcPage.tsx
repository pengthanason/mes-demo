import { useSearchParams } from 'react-router-dom';
import QcBoard from './quality/index.jsx';
import { QcResultPage } from './QcResultPage';
import { ReworkPage } from './ReworkPage';

type Tab = 'board' | 'result' | 'rework';

/* รวม QC Board (สแกนทีละชิ้น) · QC Result (สรุปผลตามล็อต) · Rework (งานซ่อม) ไว้ในหน้าเดียว */
export function QcPage() {
  const [params, setParams] = useSearchParams();
  const p = params.get('tab');
  const tab: Tab = (p === 'result' || p === 'rework') ? p : 'board';   // แท็บอ่านจาก URL (?tab=)
  const setTab = (t: Tab) => setParams({ tab: t }, { replace: true });
  return (
    <section className="stack-lg">
      <div className="panel">
        <h1 className="panel__title">Quality Control (QC)</h1>
        <p className="panel__subtitle">QC Board (scan each unit) · QC Result (by lot + open Rework) · Rework (track repair jobs)</p>
        <div className="mes-module-tabs" style={{ marginTop: '1.25rem' }}>
          <button type="button" className={`mes-module-tab ${tab === 'board' ? 'active' : ''}`} onClick={() => setTab('board')}>✅ QC Board (Scan)</button>
          <button type="button" className={`mes-module-tab ${tab === 'result' ? 'active' : ''}`} onClick={() => setTab('result')}>🧾 QC Result (By Lot)</button>
          <button type="button" className={`mes-module-tab ${tab === 'rework' ? 'active' : ''}`} onClick={() => setTab('rework')}>🛠️ Rework (Repair Jobs)</button>
        </div>
      </div>
      {tab === 'board' && <QcBoard />}
      {tab === 'result' && <QcResultPage />}
      {tab === 'rework' && <ReworkPage />}
    </section>
  );
}
