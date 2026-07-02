import { useSearchParams } from 'react-router-dom';
import { ProjectForm } from '../components/ppParts';
import { WorkflowBuilder } from '../components/WorkflowBuilder';

/* ── Tab: Add Project (ฟอร์มเต็มหน้า) ── */
function AddProjectTab() {
  return (
    <div className="stack" style={{ marginTop: '1.25rem' }}>
      <p className="panel__subtitle">กรอกข้อมูลโปรเจกต์ — บันทึกแล้วไปแสดงที่หน้า Dashboard (ฟอร์มจะเคลียร์ให้กรอกต่อได้เลย)</p>
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
        <p className="panel__subtitle">Add Project · Workflow — ดูภาพรวม/ตารางได้ที่หน้า Dashboard</p>
        <div className="mes-module-tabs" style={{ marginTop: '1.25rem' }}>
          {TABS.map(t => (
            <button key={t.key} className={`mes-module-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </div>
        {tab === 'add' && <AddProjectTab />}
      </div>

      {tab === 'workflow' && <WorkflowBuilder />}
    </section>
  );
}
