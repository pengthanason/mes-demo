import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { StatCard, BarRow, ChartCard } from './ppParts';
import { useWorkflowResults } from '../lib/workflowApi';
import { useInventoryLots } from '../lib/inventoryApi';
import { useCrList } from '../lib/crApi';
import { useJigProjects } from '../lib/jigApi';
import { useDailyReport } from '../lib/traceApi';
import { useReworkList } from '../lib/qcResultApi';
import { useObaRecords } from '../lib/recordsApi';

const rate = (pass: number, total: number) => total > 0 ? (pass / total) * 100 : null;
const rateColor = (r: number | null) => r == null ? '#94a3b8' : r >= 95 ? '#16a34a' : r >= 85 ? '#d97706' : '#dc2626';
const pct = (r: number | null) => r == null ? '—' : `${r.toFixed(1)}%`;

/* การ์ดกดได้ → ลิงก์ไปหน้าโมดูล */
function ClickCard({ to, icon, label, value, accent, external }: { to: string; icon: string; label: string; value: number | string; accent: string; external?: string }) {
  const nav = useNavigate();
  return (
    <div onClick={() => external ? window.open(external, '_blank', 'noopener,noreferrer') : nav(to)} style={{ cursor: 'pointer', transition: 'transform 0.12s, box-shadow 0.12s', borderRadius: 12 }} title={external ? 'เปิดระบบ Traceability (แท็บใหม่)' : 'กดเพื่อดูรายละเอียด'}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 18px rgba(0,0,0,0.10)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}>
      <StatCard icon={icon} label={label} value={value} accent={accent} />
    </div>
  );
}

export function FactoryOverview() {
  const { data: daily = [] } = useDailyReport();
  const { data: jig = [] } = useJigProjects();
  const { data: lots = [] } = useInventoryLots();
  const { data: cr = [] } = useCrList();
  const { data: rework = [] } = useReworkList();
  const { data: oba = [] } = useObaRecords();
  const { data: wfResults = [] } = useWorkflowResults();
  const { data: scm = [] } = useQuery({
    queryKey: ['scm-cases-overview'],
    queryFn: async () => {
      const res = await api.get('/scm/cases');
      return ((res.data as any)?.cases ?? []) as { status: string }[];
    },
  });

  const m = useMemo(() => {
    // production (trace daily)
    const prodPass = daily.reduce((s, d) => s + (d.pass || 0), 0);
    const prodTotal = daily.reduce((s, d) => s + (d.total || 0), 0);
    const prodRate = rate(prodPass, prodTotal);
    const trend = [...daily].reverse().slice(-7); // เก่า→ใหม่ 7 วันล่าสุด
    const maxTrend = Math.max(1, ...trend.map(d => d.total || 0));

    // jig
    const jigPass = jig.reduce((s, j) => s + (j.passCount || 0), 0);
    const jigFail = jig.reduce((s, j) => s + (j.failCount || 0), 0);
    const jigRate = rate(jigPass, jigPass + jigFail);
    const jigTop = [...jig].sort((a, b) => (b.passCount + b.failCount) - (a.passCount + a.failCount)).slice(0, 6);

    // inventory lots by status
    const lotPending = lots.filter(l => l.status === 'PENDING').length;
    const lotBy = (s: string) => lots.filter(l => l.status === s).length;

    // 4M (cr)
    const crPending = cr.filter(c => c.state !== 'ACTIVE').length;
    const crStates = ['DRAFT', 'G1_REVIEW', 'G2_APPROVED', 'ACTIVE'] as const;
    const crLabel: Record<string, string> = { DRAFT: 'ร่าง', G1_REVIEW: 'รอ G1', G2_APPROVED: 'อนุมัติ G2', ACTIVE: 'ใช้งาน' };

    // scm
    const scmOpen = scm.filter(s => s.status === 'OPEN').length;
    const scmClosed = scm.filter(s => s.status === 'CLOSED').length;

    // rework
    const reworkOpen = rework.filter(r => r.status !== 'DONE').length;
    const rwBy = (s: string) => rework.filter(r => r.status === s).length;

    // oba
    const obaPass = oba.filter(o => o.result === 'PASS').length;
    const obaRate = rate(obaPass, oba.length);

    // workflow results
    const wfPass = wfResults.filter(r => r.result === 'PASS').length;
    const wfRate = rate(wfPass, wfResults.length);

    return {
      prodRate, trend, maxTrend,
      jigRate, jigTop, jigPass, jigFail,
      lotPending, lotBy,
      crPending, crStates, crLabel,
      scmOpen, scmClosed,
      reworkOpen, rwBy,
      obaRate, wfRate, wfCount: wfResults.length,
    };
  }, [daily, jig, lots, cr, rework, oba, wfResults, scm]);

  const maxCr = Math.max(1, ...m.crStates.map(s => cr.filter(c => c.state === s).length));
  const maxRw = Math.max(1, m.rwBy('OPEN'), m.rwBy('IN_PROGRESS'), m.rwBy('DONE'));
  const maxLot = Math.max(1, m.lotBy('PENDING'), m.lotBy('APPROVED'), m.lotBy('REJECTED'));

  return (
    <section className="stack-lg">
      <div className="panel">
        <h1 className="panel__title">🏭 Factory Overview</h1>
        <p className="panel__subtitle">สรุปข้อมูลทุกโมดูลแบบเรียลไทม์ — ผลิต · QC · Jig · คลัง · 4M · SCM</p>

        {/* KPI ข้ามโมดูล */}
        <div className="dash-grid-4" style={{ marginTop: '1.5rem' }}>
          <ClickCard to="/traceability" external="https://jig-api.syntechnology.com/traceability/knex_gw" icon="✅" label="Production Pass Rate" value={pct(m.prodRate)} accent={rateColor(m.prodRate)} />
          <ClickCard to="/jig-test" icon="🧪" label="Jig Pass Rate" value={pct(m.jigRate)} accent={rateColor(m.jigRate)} />
          <ClickCard to="/production-plan" icon="📑" label="OBA Pass Rate" value={pct(m.obaRate)} accent={rateColor(m.obaRate)} />
          <ClickCard to="/production-plan" icon="🔀" label="เดินสาย Pass Rate" value={pct(m.wfRate)} accent={rateColor(m.wfRate)} />
          <ClickCard to="/incoming" icon="📦" label="Lot รอตรวจ QA" value={m.lotPending} accent="#d97706" />
          <ClickCard to="/4m-change" icon="🔧" label="4M รออนุมัติ" value={m.crPending} accent="#2563eb" />
          <ClickCard to="/scm-cases" icon="📋" label="SCM เปิดอยู่" value={m.scmOpen} accent="#dc2626" />
          <ClickCard to="/qc-result" icon="🛠️" label="Rework ค้าง" value={m.reworkOpen} accent="#7c3aed" />
        </div>
      </div>

      {/* กราฟข้ามโมดูล */}
      <div className="dash-grid-3">
        <ChartCard title="📈 การผลิตรายวัน (7 วันล่าสุด)">
          {m.trend.length ? m.trend.map(d => (
            <BarRow key={d.date} label={`${d.date?.slice(5) ?? ''} · ${pct(rate(d.pass || 0, d.total || 0))}`} value={d.total || 0} max={m.maxTrend} color={rateColor(rate(d.pass || 0, d.total || 0))} />
          )) : <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>ยังไม่มีข้อมูลการสแกน</div>}
        </ChartCard>

        <ChartCard title="🧪 Jig Pass Rate ต่อโปรเจกต์">
          {m.jigTop.length ? m.jigTop.map(j => (
            <BarRow key={j.projectCode} label={j.name || j.projectCode} value={Math.round(j.passRate)} max={100} color={rateColor(j.passRate)} />
          )) : <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>—</div>}
        </ChartCard>

        <ChartCard title="🔧 4M Change ตามสถานะ">
          {m.crStates.map(s => <BarRow key={s} label={m.crLabel[s]} value={cr.filter(c => c.state === s).length} max={maxCr} color="#2563eb" />)}
        </ChartCard>

        <ChartCard title="📦 Inventory Lots ตามสถานะ">
          <BarRow label="รอตรวจ (PENDING)" value={m.lotBy('PENDING')} max={maxLot} color="#d97706" />
          <BarRow label="ผ่าน (APPROVED)" value={m.lotBy('APPROVED')} max={maxLot} color="#16a34a" />
          <BarRow label="ตีกลับ (REJECTED)" value={m.lotBy('REJECTED')} max={maxLot} color="#dc2626" />
        </ChartCard>

        <ChartCard title="📋 SCM Cases">
          <BarRow label="เปิดอยู่ (OPEN)" value={m.scmOpen} max={Math.max(1, m.scmOpen + m.scmClosed)} color="#dc2626" />
          <BarRow label="ปิดแล้ว (CLOSED)" value={m.scmClosed} max={Math.max(1, m.scmOpen + m.scmClosed)} color="#16a34a" />
        </ChartCard>

        <ChartCard title="🛠️ Rework ตามสถานะ">
          <BarRow label="เปิด (OPEN)" value={m.rwBy('OPEN')} max={maxRw} color="#dc2626" />
          <BarRow label="กำลังทำ (IN_PROGRESS)" value={m.rwBy('IN_PROGRESS')} max={maxRw} color="#d97706" />
          <BarRow label="เสร็จ (DONE)" value={m.rwBy('DONE')} max={maxRw} color="#16a34a" />
        </ChartCard>
      </div>
    </section>
  );
}
