import React, { useState } from 'react';
import { Play, Pause } from 'lucide-react';
import SyncLogTable from '../components/SyncLogTable';
import JigResultTable from '../components/JigResultTable';

export default function SyncMonitorPage() {
  const [activeTab, setActiveTab] = useState<'sync' | 'jig'>('sync');
  const [isPaused, setIsPaused] = useState(false);

  return (
    <section className="stack-lg">
      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 className="panel__title">Sync Monitor</h1>
            <p className="panel__subtitle">Admin visibility for cross-system sync events and test results.</p>
          </div>
          <button
            className={`btn ${isPaused ? 'secondary' : ''}`}
            onClick={() => setIsPaused(!isPaused)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            {isPaused ? <Play size={16} /> : <Pause size={16} />}
            {isPaused ? 'Auto-refresh Paused' : 'Auto-refresh Active (30s)'}
          </button>
        </div>

        <div className="mes-module-tabs" style={{ marginTop: '1.5rem' }}>
          <button
            type="button"
            className={`mes-module-tab ${activeTab === 'sync' ? 'active' : ''}`}
            onClick={() => setActiveTab('sync')}
          >
            Sync Log
          </button>
          <button
            type="button"
            className={`mes-module-tab ${activeTab === 'jig' ? 'active' : ''}`}
            onClick={() => setActiveTab('jig')}
          >
            Jig Results
          </button>
        </div>
      </div>

      {activeTab === 'sync' && <SyncLogTable isPaused={isPaused} />}
      {activeTab === 'jig' && <JigResultTable isPaused={isPaused} />}
    </section>
  );
}