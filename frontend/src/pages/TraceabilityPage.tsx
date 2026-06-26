// หน้า Traceability — ระบบจริงอยู่ที่ jig-api (knex_gw) ซึ่งฝัง iframe ไม่ได้ (เซิร์ฟเวอร์บล็อก X-Frame-Options)
// จึงทำเป็นหน้า landing + ปุ่มเปิดระบบจริงในแท็บใหม่
import { SYNTECH_LOGO_PNG_BASE64 } from '../assets/syntechLogo';

const TRACE_URL = 'https://jig-api.syntechnology.com/traceability/knex_gw';

export function TraceabilityPage() {
  return (
    <section className="stack-lg">
      <div
        className="panel"
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
          gap: '1.25rem', padding: '3rem 1.5rem', maxWidth: 560, margin: '0 auto',
        }}
      >
        {/* ไอคอน + โลโก้แบรนด์ */}
        <div
          style={{
            width: 84, height: 84, borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '2.4rem', background: 'linear-gradient(135deg, var(--brand), var(--brand-dark))',
            boxShadow: '0 10px 28px rgba(46,125,79,0.32)',
          }}
        >
          🧬
        </div>

        <div>
          <h1 className="panel__title" style={{ marginBottom: '0.4rem' }}>Traceability</h1>
          <p className="panel__subtitle" style={{ margin: 0 }}>
            ค้นหา Serial · ดูประวัติการผลิตทุกสเตชัน · รายงานรายวัน — ระบบจริงจาก jig-api (knex_gw)
          </p>
        </div>

        {/* ปุ่มเปิดระบบจริงในแท็บใหม่ */}
        <a
          href={TRACE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="btn"
          style={{
            background: 'var(--brand)', borderColor: 'var(--brand)', color: '#fff', fontWeight: 700,
            padding: '0.85rem 1.6rem', fontSize: '0.95rem', textDecoration: 'none',
          }}
        >
          เปิดระบบ Traceability ↗
        </a>

        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0, maxWidth: 380 }}>
          ระบบ Traceability เปิดในแท็บใหม่ (ฝังในหน้านี้ไม่ได้เพราะเซิร์ฟเวอร์ตั้งค่าความปลอดภัยห้ามฝัง)
        </p>

        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: '0.5rem', opacity: 0.55 }}>
          <img src={`data:image/png;base64,${SYNTECH_LOGO_PNG_BASE64}`} alt="SYNTECH" style={{ height: 20 }} />
        </span>
      </div>
    </section>
  );
}
