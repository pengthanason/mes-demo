import { useMockAuth } from '../lib/useMockStore';
import { WoDashboardPage } from './WoDashboardPage';
import { ProductionReportPage } from './ProductionReportPage';
import { RoutingHistoryPage } from './RoutingHistoryPage';
import { JigTestPage } from './JigTestPage';
import { ScmCasesPage } from './ScmCasesPage';

function SectionDivider({ title }: { title: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.75rem',
      margin: '2.5rem 0 1.25rem',
    }}>
      <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
      <span style={{
        fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: '#94a3b8', whiteSpace: 'nowrap',
      }}>
        {title}
      </span>
      <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
    </div>
  );
}

export function DashboardPage() {
  const { role } = useMockAuth();
  const isViewer = role === 'viewer';

  return (
    <section>
      <div style={{ marginBottom: '0.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: '#1e293b' }}>Dashboard</h1>
        <p style={{ margin: '0.2rem 0 0', color: '#64748b', fontSize: '0.85rem' }}>ศูนย์รวมข้อมูลการผลิต</p>
      </div>

      <SectionDivider title="WO Status" />
      <WoDashboardPage />

      <SectionDivider title="Production Report" />
      <ProductionReportPage />

      <SectionDivider title="Routing History" />
      <RoutingHistoryPage />

      <SectionDivider title="Jig Test" />
      <JigTestPage />

      {!isViewer && (
        <>
          <SectionDivider title="SCM Cases" />
          <ScmCasesPage />
        </>
      )}
    </section>
  );
}
