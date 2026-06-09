import { Link } from 'react-router-dom';
import { MES_MODULES } from '../lib/mesModules';

const quickActions = [
  {
    to: '/wo-dashboard',
    title: 'WO Dashboard (FE-5)',
    description: 'ภาพรวมสถานะงานผลิต (Work Order) ทั้งโรงงานแบบ Real-time',
  },
  {
    to: '/mes-auth',
    title: 'MES Login',
    description: 'ล็อกอิน JWT ก่อนใช้งานโมดูลที่ต้องตรวจสิทธิ์',
  },
  {
    to: '/mes-backbone?module=01',
    title: 'เริ่มที่ Module 01',
    description: 'เริ่ม flow จริงจาก Planning + BOM และไล่ต่อจนครบทุกโมดูล',
  },
  {
    to: '/mes-backbone',
    title: 'MES Backbone',
    description: 'หน้าหลักสำหรับทดสอบและเดิน flow MES รายโมดูล',
  },
  {
    to: '/pm-core-flow',
    title: 'PM Core Flow (M11)',
    description: 'บริหาร Lead, Gate Review และ CR Log แบบหน้าเดียว',
  },
  {
    to: '/scm-cases',
    title: 'SCM Cases (M12)',
    description: 'จัดการ Case inbox, split lot และ supplier disposition',
  },
  {
    to: '/bom-editor',
    title: 'Online BOM Editor',
    description: 'สร้าง Draft BOM และแก้ไข detail line ผ่านหน้าเว็บ',
  },
  {
    to: '/route-admin',
    title: 'Route Admin',
    description: 'แก้ route master, station steps และเช็ก route/station overlap จาก DB จริง',
  },
  {
    to: '/web-check',
    title: 'Web Check',
    description: 'เช็กความพร้อมระบบผ่านหน้าเว็บได้ทันที',
  },
  {
    to: '/production-report',
    title: 'Production Report (FE-4)',
    description: 'ดูตารางรายงานสรุปการผลิตรายวัน กรองตามลูกค้าและดูสถานะกำหนดส่ง',
  },
];

function moduleLink(code: string) {
  return `/mes-backbone?module=${code}`;
}

export function MesWorkspacePage() {
  return (
    <section className="stack-lg home-flow">
      <div className="panel home-hero">
        <p className="home-kicker">SYNTECH MES FLOW</p>
        <h1 className="panel__title">MES Main: {MES_MODULES.length} Modules</h1>
        <p className="panel__subtitle">รวมโมดูล MES 01 {'->'} {MES_MODULES[MES_MODULES.length - 1]?.code || '--'} ตามสายการผลิต</p>

        <div className="home-mes-bar-wrap">
          <div className="home-mes-bar" role="navigation" aria-label="MES module flow">
            {MES_MODULES.map((module, index) => (
              <Link key={module.code} to={moduleLink(module.code)} className="home-mes-segment">
                <span className="home-mes-segment__order">{index + 1}</span>
                <span className="home-mes-segment__code">M{module.code}</span>
                <span className="home-mes-segment__title">{module.title}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <section className="panel">
        <h2 className="panel__title">Module Detail (MES Backbone)</h2>
        <p className="panel__subtitle">เลือกโมดูล ระบบจะพาไปหน้า MES Backbone พร้อมกำหนด `module` ให้แล้ว</p>
        <div className="home-module-grid mt-4">
          {MES_MODULES.map((module) => (
            <Link key={module.code} to={moduleLink(module.code)} className="home-module-card">
              <div className="home-module-card__head">
                <span className="home-module-card__chip">Module {module.code}</span>
              </div>
              <h3>{module.title}</h3>
              <p>{module.objective}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2 className="panel__title">Quick Start</h2>
        <div className="quick-grid mt-4">
          {quickActions.map((action) => (
            <Link key={action.to} to={action.to} className="home-quick-card">
              <h3>{action.title}</h3>
              <p>{action.description}</p>
            </Link>
          ))}
        </div>
      </section>
    </section>
  );
}
