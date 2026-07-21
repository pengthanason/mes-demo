import { useSearchParams } from 'react-router-dom';
import { ProjectForm } from '../components/ppParts';
import { WorkflowBuilder } from '../components/WorkflowBuilder';

/* ── Tab: Add Project (ฟอร์มเต็มหน้า) ── */
function AddProjectTab() {
  return (
    <div className="stack" style={{ marginTop: '1.25rem' }}>
      <ProjectForm initial={null} />
    </div>
  );
}

/* ── Main ── */
type Tab = 'add' | 'workflow';
const TABS: { key: Tab; label: string }[] = [
  { key: 'add', label: 'Add Project' },
  { key: 'workflow', label: 'Workflow' },
];

export function ProductionPlanPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'workflow' ? 'workflow' : 'add';   // แท็บอ่านจาก URL (?tab=) → เมนูย่อยใน sidebar ลิงก์มาได้
  const setTab = (t: Tab) => setParams({ tab: t }, { replace: true });
  return (
    <section className="stack-lg">
      <div className="panel">
        <h1 className="panel__title">Production Plan</h1>
        {/* ลบแค่ subtitle คำอธิบายออก (หัวข้อ + แท็บคงเดิม) */}
        <div className="mes-module-tabs" style={{ marginTop: '1.25rem' }}>
          {TABS.map(t => (
            <button key={t.key} type="button" className={`mes-module-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </div>
        {tab === 'add' && <AddProjectTab />}
        {tab === 'workflow' && (
          <div className="stack" style={{ marginTop: '1.25rem' }}>
            <WorkflowBuilder />
          </div>
        )}
      </div>
    </section>
  );
}
