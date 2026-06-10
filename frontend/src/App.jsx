import React from 'react';
import { HashRouter, Routes, Route, Link, Navigate } from 'react-router-dom';
import { MesWorkspacePage } from './pages/MesWorkspacePage.tsx';
import { MesBackbonePage } from './pages/MesBackbonePage.tsx';
import { MesAuthPage } from './pages/MesAuthPage.tsx';
import { PmCoreFlowPage } from './pages/PmCoreFlowPage.tsx';
import { ScmCasesPage } from './pages/ScmCasesPage.tsx';
import BomEditorPage from './pages/BomEditorPage.tsx';
import WebCheckPage from './pages/WebCheckPage.tsx';
import { RouteAdminPage } from './pages/RouteAdminPage.tsx';
import SyncMonitorPage from './pages/SyncMonitorPage.tsx';
import QcBoard from './pages/quality/index.jsx';
import { RoutingHistoryPage } from './pages/RoutingHistoryPage.tsx';
import { SequenceBuilderPage } from './pages/SequenceBuilderPage.tsx';
import { ProductionReportPage } from './pages/ProductionReportPage.tsx';
import { WoDashboardPage } from './pages/WoDashboardPage.tsx';
import { CloseWoPage } from './pages/CloseWoPage.tsx';
import { ObaPage } from './pages/ObaPage.tsx';
import { FaiPage } from './pages/FaiPage.tsx';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("UI Error caught:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="panel notice err" style={{ margin: '2rem' }}>
          <h3>โอ๊ะ! มีบางอย่างผิดพลาดในหน้านี้ 😅</h3>
          <p style={{ color: 'red' }}>{this.state.error?.message || 'Unknown render error'}</p>
          <button className="btn" onClick={() => this.setState({ hasError: false })} style={{ marginTop: '1rem' }}>ลองโหลดหน้านี้ใหม่</button>
        </div>
      );
    }
    return this.props.children;
  }
}

function Shell({ children }) {
  return (
    <div style={{ padding: '1.5rem', maxWidth: 1400, margin: '0 auto' }}>
      
      <style>{`
        .field input, .field select, .field textarea {
          width: 100%;
          padding: 0.6rem 0.8rem;
          border: 1px solid var(--border-color, #cbd5e1);
          border-radius: 6px;
          font-size: 0.95rem;
          background-color: #f8fafc;
          color: #334155;
          transition: all 0.2s ease;
          box-sizing: border-box;
          outline: none;
        }
        .field input:focus, .field select:focus, .field textarea:focus {
          border-color: var(--primary, #3b82f6);
          background-color: #ffffff;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
        }
        .field span {
          display: block;
          margin-bottom: 0.4rem;
          font-weight: 600;
          color: #475569;
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .filters-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1.25rem;
          margin-bottom: 1.5rem;
          background: white;
          padding: 1.25rem;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        .table { width: 100%; border-collapse: collapse; }
        .table th {
          background-color: #f1f5f9; color: #475569; font-weight: 600;
          padding: 0.85rem 1rem; text-align: left; border-bottom: 2px solid #cbd5e1;
        }
        .table td { padding: 0.85rem 1rem; border-bottom: 1px solid #e2e8f0; vertical-align: middle; color: #334155; }
        .table tbody tr:nth-child(odd) { background-color: #ffffff; }
        .table tbody tr:nth-child(even) { background-color: #f8fafc; }
        .table tbody tr:hover { background-color: #f1f5f9; }
        
        .table.table-readonly tbody tr:nth-child(odd):hover { background-color: #ffffff !important; }
        .table.table-readonly tbody tr:nth-child(even):hover { background-color: #f8fafc !important; }
        .table.table-readonly tbody tr:hover td { background-color: transparent !important; }

        .mes-module-tabs { display: flex; gap: 1.5rem; border-bottom: 2px solid #e2e8f0; margin-bottom: 1.5rem; }
        .mes-module-tab { padding: 0.75rem 0; background: none; border: none; font-weight: 600; font-size: 1rem; color: #64748b; cursor: pointer; border-bottom: 3px solid transparent; margin-bottom: -2px; transition: all 0.2s; }
        .mes-module-tab:hover { color: #3b82f6; }
        .mes-module-tab.active { color: #3b82f6; border-bottom-color: #3b82f6; }

        .mes-light-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 2rem;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
          margin-bottom: 2rem;
        }
        .mes-module-head {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1rem;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 1rem;
        }
        .mes-module-code {
          background: var(--primary, #3b82f6);
          color: white;
          padding: 0.35rem 0.85rem;
          border-radius: 999px;
          font-weight: bold;
          font-size: 0.85rem;
          letter-spacing: 0.05em;
        }
        .mes-endpoints {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          margin: 1.5rem 0;
          padding: 1rem 1.5rem;
          background: #f8fafc;
          border-radius: 8px;
          border-left: 4px solid var(--primary, #3b82f6);
        }
        .mes-endpoints a {
          color: #2563eb;
          text-decoration: none;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 0.9rem;
        }
        .mes-endpoints a:hover { text-decoration: underline; }
        
        .mes-case-context {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1.5rem;
          background: #f1f5f9;
          padding: 1.5rem;
          border-radius: 8px;
          margin: 1.5rem 0;
          border: 1px dashed #cbd5e1;
        }
        
        .mes-module-presets {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
          margin: 1.5rem 0;
        }
        .mes-preset-chip {
          background: #f8fafc;
          border: 1px solid #cbd5e1;
          padding: 0.5rem 1rem;
          border-radius: 20px;
          cursor: pointer;
          font-size: 0.85rem;
          font-weight: 600;
          color: #475569;
          transition: all 0.2s;
        }
        .mes-preset-chip:hover:not(:disabled) {
          background: #e2e8f0;
          color: #0f172a;
        }
        .mes-preset-chip.active {
          background: var(--primary, #3b82f6);
          color: white;
          border-color: var(--primary, #3b82f6);
          box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3);
        }
        .mes-actions {
          display: flex;
          gap: 1rem;
          margin-top: 1.5rem;
          flex-wrap: wrap;
          align-items: center;
        }
      `}</style>
      <header style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <Link to="/" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1.25rem' }}>
            S
            MES
          </div>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 600 }}>SYNTECH MES</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Shop Floor Control</p>
          </div>
        </Link>
        <nav style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.875rem' }}>
          <NavLink to="/">Workspace</NavLink>
          <NavLink to="/wo-dashboard">WO Board</NavLink>
          <NavLink to="/mes-backbone">Backbone</NavLink>
          <NavLink to="/mes-auth">Auth</NavLink>
          <NavLink to="/pm-core-flow">PM</NavLink>
          <NavLink to="/scm-cases">SCM</NavLink>
          <NavLink to="/sync-monitor">Sync</NavLink>
          <NavLink to="/qc-board">QC</NavLink>
          <NavLink to="/bom-editor">BOM</NavLink>
          <NavLink to="/route-admin">Routes</NavLink>
          <NavLink to="/web-check">Health</NavLink>
          <NavLink to="/routing-history">History</NavLink>
          <NavLink to="/sequence-builder">Builder</NavLink>
          <NavLink to="/production-report">Report</NavLink>
          <NavLink to="/wo/WO-2026-001/close">Close WO</NavLink>
          <NavLink to="/oba">OBA</NavLink>
          <NavLink to="/fai/WO-2026-001">FAI</NavLink>
        </nav>
      </header>
      <main>{children}</main>
      <footer 
        style={{ 
          marginTop: '3rem', 
          paddingTop: '1.5rem', 
          borderTop: '1px solid var(--border-color)', 
          textAlign: 'center', 
          color: 'var(--text-muted)',
          fontSize: '0.85rem'
        }}>
        © 2026 Synergy Technology
      </footer>
    </div>
  );
}

function NavLink({ to, children }) {
  return (
    <Link
      to={to}
      style={{
        padding: '0.4rem 0.8rem',
        borderRadius: 6,
        background: 'var(--bg-panel)',
        color: 'var(--text-main)',
        textDecoration: 'none',
        border: '1px solid var(--border-color)',
      }}
    >
      {children}
    </Link>
  );
}

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <Shell>
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<MesWorkspacePage />} />
              <Route path="/mes-backbone" element={<MesBackbonePage />} />
              <Route path="/mes-auth" element={<MesAuthPage />} />
              <Route path="/pm-core-flow" element={<PmCoreFlowPage />} />
              <Route path="/scm-cases" element={<ScmCasesPage />} />
              <Route path="/sync-monitor" element={<SyncMonitorPage />} />
              <Route path="/qc-board" element={<QcBoard />} />
              <Route path="/bom-editor" element={<BomEditorPage />} />
              <Route path="/route-admin" element={<RouteAdminPage />} />
              <Route path="/web-check" element={<WebCheckPage />} />
              <Route path="/routing-history" element={<RoutingHistoryPage />} />
              <Route path="/sequence-builder" element={<SequenceBuilderPage />} />
              <Route path="/production-report" element={<ProductionReportPage />} />
              <Route path="/wo-dashboard" element={<WoDashboardPage />} />
              <Route path="/wo/:woId/close" element={<CloseWoPage />} />
              <Route path="/oba" element={<ObaPage />} />
              <Route path="/fai/:woId" element={<FaiPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ErrorBoundary>
        </Shell>
      </HashRouter>
    </QueryClientProvider>
  );
}
