import { useEffect, useRef, useState } from 'react';
import { usePpCreate, usePpUpdate, usePpHistory, usePicNames, PP_STATUS, PP_STATUS_LABEL, ppYield, type PpProject } from '../../lib/ppApi';
import { showToast } from '../../lib/toast';
import { confirmDialog } from '../../lib/confirm';
import { WoInput } from '../WoInput';
import { MultiPicInput } from '../MultiPicInput';
import { useWoBoard } from '../../lib/woApi';
import { useEscapeKey } from '../../lib/useEscapeKey';
import { isoWeek, PROCESS_STEPS } from './ppColumns';
import { DATE_INPUT_MIN, DATE_INPUT_MAX } from '../../lib/dateRange';

/* ── Add/Edit Project Form (modal) — ปิดได้เฉพาะปุ่มยกเลิก ── */
const EMPTY: Partial<PpProject> = {
  status: 'ON_PROCESS', work_order: '', model: '', product_pn: '', customer: '', syn_requestor: '',
  // qty/produce/total_ng/total_ok/target_per_day: ไม่ตั้งไว้ (undefined) ให้ฟอร์มใหม่ว่างจริงๆ แทนที่จะโชว์ 0 ค้าง
  qa_test_rate: '', qa_status: '', pd_pic: '', pic_responsible: '',
  pc_prpo: '', pc_wait: '', pc_incoming: '', pc_smt: '', pc_thr: '', pc_test: '', pc_bbas: '', pc_packing: '', process_log: [],
  special_request: '', remark: '',
};

/* ── ช่องตัวเลขที่ปล่อยว่างได้ตอนพิมพ์ (state = undefined) ─────────────────
   ต้อง coerce เป็น 0 "ก่อนส่ง" ทุกครั้ง เพราะ JSON.stringify ตัด key ที่เป็น undefined ทิ้ง
   → ตอนแก้ไข: ล้างช่อง 5 ให้ว่างแล้วเซฟ จะได้ body ที่ไม่มี field นั้น = server คงค่า 5 ไว้
     แต่ frontend เด้ง "Updated" (ข้อมูลไม่ถูกบันทึกแบบไม่มีใครรู้)
   → ถ้าล้างแต่ช่องตัวเลขช่องเดียว body จะว่างจนเหลือ edit_note = server ตอบ 400 "no data"
   ⚠️ ต้องเป็น 0 ไม่ใช่ '' — คอลัมน์เป็น INTEGER ('' → invalid input syntax → 500) */
const NUM_KEYS = ['qty', 'produce', 'total_ok', 'total_ng', 'target_per_day'] as const;
const zeroBlankNums = <T extends Record<string, any>>(o: T): T => {
  const out: any = { ...o };
  for (const k of NUM_KEYS) if (out[k] === undefined || out[k] === '' || Number.isNaN(out[k])) out[k] = 0;
  return out;
};

// วันที่ "วันนี้" ตามเวลาท้องถิ่น (YYYY-MM-DD) — เลี่ยง toISOString() ที่เป็น UTC ทำให้คนไทย (UTC+7) กรอกตอนดึกได้วันผิด
export const todayLocal = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ฟอร์มเปล่าสำหรับสร้างใหม่ — เติม Date record = วันนี้ + คำนวณ WW ให้อัตโนมัติ
const blankForm = (): Partial<PpProject> => { const today = todayLocal(); return { ...EMPTY, date_record: today, wk: isoWeek(today) }; };

// ประวัติการแก้ไขของ record นี้ (ตาราง) — วันเวลา · ใคร · ตำแหน่ง · แก้อะไร (field diff) · หมายเหตุ
export function EditHistory({ id }: { id: number }) {
  const { data: rows = [], isLoading } = usePpHistory(id);
  const fmtDT = (v: string) => { try { return new Date(v).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return v; } };
  const actLabel = (a: string) => a.startsWith('CREATE') ? 'Created' : a.startsWith('DELETE') ? 'Deleted' : 'Updated';
  if (isLoading) return <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', padding: '4px 0' }}>Loading history…</div>;
  if (!rows.length) return <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', padding: '4px 0' }}>No edit history yet</div>;
  const th: React.CSSProperties = { textAlign: 'left', padding: '6px 8px', fontSize: '0.72rem', color: '#64748b', fontWeight: 700, background: '#f1f5f9', whiteSpace: 'nowrap', position: 'sticky', top: 0, border: '1px solid var(--border-color)' };
  const td: React.CSSProperties = { padding: '6px 8px', fontSize: '0.8rem', color: '#334155', verticalAlign: 'top', border: '1px solid var(--border-color)' };
  return (
    <div style={{ maxHeight: 300, overflow: 'auto', border: '1px solid var(--border-color)', borderRadius: 8 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
        <thead>
          <tr>
            <th style={th}>Name</th>
            <th style={th}>Role</th>
            <th style={th}>Date / Time</th>
            <th style={th}>Action</th>
            <th style={th}>Remark</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(h => (
            <tr key={h.id}>
              <td style={{ ...td, fontWeight: 600, whiteSpace: 'nowrap' }}>{h.actor_name || h.actor}</td>
              <td style={{ ...td, whiteSpace: 'nowrap', color: '#64748b' }}>{h.actor_role || '—'}</td>
              <td style={{ ...td, whiteSpace: 'nowrap', color: '#64748b' }}>{fmtDT(h.created_at)}</td>
              <td style={{ ...td, wordBreak: 'break-word' }}><span style={{ color: '#2563eb', fontWeight: 600 }}>{actLabel(h.action)}</span>{h.detail ? ` — ${h.detail}` : ''}</td>
              <td style={{ ...td, wordBreak: 'break-word', color: h.note ? '#334155' : '#cbd5e1' }}>{h.note || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** ฟอร์มกรอกข้อมูลโปรเจกต์ (ใช้ทั้ง inline ในหน้า Add Project และในป๊อปอัพแก้ไข) */
// แปลงค่าวันที่จาก API (ISO datetime เช่น 2026-06-03T00:00:00.000Z) → YYYY-MM-DD ให้ <input type="date"> โชว์ค่าเดิมได้
const DATE_KEYS: (keyof PpProject)[] = ['date_record', 'pd_start_date', 'pd_finish_date', 'qa_finish_date', 'store_received', 'expected_date', 'revised_date', 'bom_rec_date', 'delivery_date' as keyof PpProject];
const initForm = (p: PpProject): Partial<PpProject> => {
  const out: any = { ...p };
  for (const k of DATE_KEYS) if (out[k]) out[k] = String(out[k]).slice(0, 10);
  return out;
};
export function ProjectForm({ initial, onSaved, onCancel, onDirtyChange, defaultType }: { initial: PpProject | null; onSaved?: () => void; onCancel?: () => void; onDirtyChange?: (dirty: boolean) => void; defaultType?: string }) {
  const [f, setF] = useState<Partial<PpProject>>(() => initial ? initForm(initial) : { ...blankForm(), pp_type: defaultType || 'internal' });
  const [err, setErr] = useState('');
  const [askRemark, setAskRemark] = useState(false);   // แก้ไข: กด Save → เด้ง popup ให้กรอกหมายเหตุก่อน
  const [bad, setBad] = useState<Record<string, boolean>>({});   // ช่องที่ validate ไม่ผ่าน → ไฮไลต์ขอบแดง
  const [dirty, setDirty] = useState(false);           // มีการแก้ไขค้างไว้ไหม (กันปิดแล้วข้อมูลหาย)
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  const create = usePpCreate();
  const update = usePpUpdate();
  const { data: picNames = [] } = usePicNames();   // รายชื่อ PIC ที่มีอยู่ → เติม dropdown (เพิ่มชื่อใหม่เองได้)
  const { data: woBoard = [] } = useWoBoard();     // WO ที่มีอยู่ → เลือกแล้ว autofill ข้อมูลลงฟอร์ม
  const editing = !!initial;
  const set = (k: keyof PpProject, v: any) => { setF(p => ({ ...p, [k]: v })); setDirty(true); };
  // เลือก WO ที่มีอยู่ → ดึง product/customer/qty/expected จาก WO นั้นมาเติมให้อัตโนมัติ (พิมพ์เอง/WO ใหม่ = ไม่ autofill)
  const applyWoFrom = (v: string) => {
    const wo = woBoard.find(w => w.woId === v);
    setF(prev => {
      const next: Partial<PpProject> = { ...prev, work_order: v };
      if (wo) {
        if (wo.productCode) { next.product_pn = wo.productCode; next.wo_name = wo.productCode; }
        if (wo.customer && wo.customer !== '—') next.customer = wo.customer;
        if (wo.qty != null) next.qty = wo.qty;
        if (wo.expectedDate) next.expected_date = String(wo.expectedDate).slice(0, 10);
      }
      return next;
    });
    setDirty(true);
    if (wo) showToast(`Autofilled from ${v}`, 'info');
  };

  // ยิงบันทึกจริง — editNote = หมายเหตุการแก้ไข (เฉพาะตอนแก้ไข ส่งไปเก็บใน history)
  function doSave(editNote?: string) {
    const mut = editing ? update : create;
    const today = todayLocal();
    const status = f.status || 'ON_PROCESS';
    const status_color = f.status_color || ((PP_STATUS as readonly string[]).includes(status) ? status : '');
    // แก้ไข → ส่งเฉพาะ field ที่เปลี่ยนจริง (ไม่ยัดค่าเดิมทั้งฟอร์ม)
    // เหตุผล: server มีกฎ "ปิดงานได้ต่อเมื่อผลิตครบ" ที่ trigger เมื่อ body ส่ง pd_finish_date/status=DONE มา
    // ถ้าส่งค่าเดิมไปด้วยทุกครั้ง แถวที่มี pd_finish_date ค้างแต่ produce ยังไม่ครบ จะแก้ field อื่นไม่ได้เลย (ติด 400)
    let payload: any;
    if (editing) {
      const base: any = initForm(initial!);
      const next: any = zeroBlankNums({ ...f, status, status_color });   // ช่องตัวเลขที่ล้างให้ว่าง = 0 (ไม่ใช่ undefined ที่จะหลุดหายตอน stringify)
      const changed: any = {};
      const cmp = (v: any) => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
      for (const k of Object.keys(next)) if (cmp(next[k]) !== cmp(base[k])) changed[k] = next[k];
      if (!Object.keys(changed).length) {   // ไม่มีอะไรเปลี่ยน → ไม่ต้องยิง API
        showToast('No changes made', 'info');
        setAskRemark(false); setDirty(false); onSaved?.();
        return;
      }
      payload = { id: initial!.id, ...changed, ...(editNote ? { edit_note: editNote } : {}) };
    } else {
      payload = zeroBlankNums({ ...f, status, status_color, date_record: f.date_record || today, wk: f.wk ?? isoWeek(f.date_record || today) });
    }
    mut.mutate(payload, {
      onSuccess: () => {
        showToast(editing ? 'Updated' : 'Project added', 'success');
        if (!editing) { setF(blankForm()); window.scrollTo({ top: 0, behavior: 'smooth' }); }   // create → เคลียร์ฟอร์ม (วันนี้) + เลื่อนขึ้นบนสุด
        setAskRemark(false); setDirty(false);
        onSaved?.();
      },
      onError: (e: any) => { setErr(e.message); setAskRemark(false); },
    });
  }

  // ตรวจความถูกต้องก่อนบันทึก — คืนรายการ error + ชุด field ที่ผิด (ไว้ไฮไลต์ขอบแดง)
  function validate(): { errs: string[]; bad: Record<string, boolean> } {
    const errs: string[] = []; const bad: Record<string, boolean> = {};
    if (!f.product_pn?.trim() && !f.model?.trim()) { errs.push('Product P/N or Model is required'); bad.product_pn = true; bad.model = true; }
    const ds = f.pd_start_date || '', df = f.pd_finish_date || '', ex = f.expected_date || '';   // 'YYYY-MM-DD' เทียบ string ได้
    if (ds && df && df < ds) { errs.push('PD Done must be on/after PD Start'); bad.pd_finish_date = true; }
    if (ds && ex && ex < ds) { errs.push('Expected date must be on/after PD Start'); bad.expected_date = true; }
    // (เอาออก) PD Done หลัง Expected ได้ = ดีเลย์ — ไม่บล็อก
    if (df && df > todayLocal()) { errs.push('PD Done cannot be a future date'); bad.pd_finish_date = true; }   // วันเสร็จจริง ห้ามอนาคต
    const qty = Number(f.qty) || 0, prod = Number(f.produce) || 0;
    if (qty < 0) { errs.push('Quantity cannot be negative'); bad.qty = true; }
    if (prod < 0) { errs.push('Produced cannot be negative'); bad.produce = true; }
    if (prod > qty) { errs.push('Produced cannot exceed Quantity'); bad.produce = true; }
    const fg = Number(f.total_ok) || 0, ng = Number(f.total_ng) || 0;
    if (ng < 0) { errs.push('Total NG cannot be negative'); bad.total_ng = true; }
    if (fg < 0) { errs.push('Total FG cannot be negative'); bad.total_ok = true; }
    if (fg > prod) { errs.push('Total FG cannot exceed Produced'); bad.total_ok = true; }   // FG ≤ Produced
    if (ng > prod) { errs.push('Total NG cannot exceed Produced'); bad.total_ng = true; }   // NG ≤ Produced
    // ปิดงาน (status DONE หรือมี PD Done) ได้ต่อเมื่อผลิตครบ
    if ((f.status === 'DONE' || !!f.pd_finish_date) && prod < qty) { errs.push('Produced must be complete (= Quantity) before marking Done'); bad.produce = true; }
    return { errs, bad };
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    const { errs, bad } = validate();
    setBad(bad);
    if (errs.length) return setErr(errs.join(' · '));
    if (editing) { setAskRemark(true); return; }   // แก้ไข → ถามหมายเหตุก่อนบันทึก
    doSave();                                        // สร้างใหม่ → บันทึกเลย
  }

  // ไฮไลต์ขอบแดงช่องที่ผิด · เคลียร์สถานะผิดของช่องนั้นเมื่อผู้ใช้เริ่มพิมพ์แก้
  const errBorder = { borderColor: '#dc2626', boxShadow: '0 0 0 2px rgba(220,38,38,0.15)' } as React.CSSProperties;
  const eb = (k: string): React.CSSProperties | undefined => (bad[k] ? errBorder : undefined);
  // ปล่อยว่างได้ตอนพิมพ์ (ไม่บังคับเป็น 0 ทันที) — ค่อยกลายเป็น 0 ตอน validate/save ถ้ายังว่างอยู่
  const num = (k: keyof PpProject) => (e: any) => { set(k, e.target.value === '' ? undefined : Number(e.target.value)); if (bad[k]) setBad(b => ({ ...b, [k]: false })); };
  const txt = (k: keyof PpProject) => (e: any) => { set(k, e.target.value); if (bad[k]) setBad(b => ({ ...b, [k]: false })); };
  // เลือก Date Record → คำนวณ WW (ISO week) ให้อัตโนมัติ
  const onDateRecord = (e: any) => {
    const v = e.target.value;
    setF(p => ({ ...p, date_record: v, wk: v ? isoWeek(v) : null })); setDirty(true);
  };
  const Section = ({ title }: { title: string }) => (
    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: '0.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: 4, userSelect: 'none', cursor: 'default' }}>{title}</div>
  );

  return (
      <>
        <form onSubmit={submit} className="stack" style={{ gap: '0.7rem' }}>
          <Section title="Main info" />
          {/* WO + Type (Internal/External) บนสุด */}
          <div className="grid-3col">
            <label className="field" style={{ gridColumn: 'span 2' }}><span>WO</span><WoInput value={f.work_order ?? ''} onChange={applyWoFrom} placeholder="Select or type WO…" /></label>
            <label className="field"><span>Type</span>
              <select value={(f as any).pp_type ?? 'internal'} onChange={txt('pp_type' as keyof PpProject)}>
                <option value="internal">Internal</option>
                <option value="external">External</option>
              </select>
            </label>
          </div>
          <div className="grid-3col">
            <label className="field"><span>Model</span><input value={f.model ?? ''} onChange={txt('model')} placeholder="Water Level Rice..." style={eb('model')} /></label>
            <label className="field"><span>Product P/N</span><input value={f.product_pn ?? ''} onChange={txt('product_pn')} placeholder="1E7D..." style={eb('product_pn')} /></label>
            <label className="field"><span>Status</span>
              <select value={f.status} onChange={txt('status')}>
                {PP_STATUS.map(s => <option key={s} value={s}>{PP_STATUS_LABEL[s]}</option>)}
                {PROCESS_STEPS.map(s => <option key={s.key as string} value={s.label}>{s.label}</option>)}
              </select>
            </label>
            <label className="field"><span>Date record</span><input type="date" min={DATE_INPUT_MIN} max={DATE_INPUT_MAX} value={f.date_record ?? ''} onChange={onDateRecord} /></label>
            <label className="field"><span>WW (Work Week)</span><input type="number" value={f.wk ?? ''} readOnly title="Auto-calculated from Date Record (ISO week)" placeholder="auto" style={{ background: '#f1f5f9' }} /></label>
            <label className="field"><span>Bom Rec (BOM received date)</span><input type="date" min={DATE_INPUT_MIN} max={DATE_INPUT_MAX} value={(f as any).bom_rec_date ?? ''} onChange={txt('bom_rec_date' as keyof PpProject)} /></label>
          </div>

          <Section title="Production Record" />
          <div className="grid-3col">
            <label className="field"><span>Quantity</span><input type="number" value={f.qty ?? ''} onChange={num('qty')} placeholder="0" style={eb('qty')} /></label>
            <label className="field"><span>Produced</span><input type="number" min="0" value={f.produce ?? ''} onChange={num('produce')} placeholder="0" style={eb('produce')} /></label>
            <label className="field"><span>Balance</span><input value={(Number(f.qty) || 0) - (Number(f.produce) || 0)} readOnly title="Quantity − Produced (auto)" style={{ background: '#f1f5f9' }} /></label>
            <label className="field"><span>Total FG</span><input type="number" value={f.total_ok ?? ''} onChange={num('total_ok')} placeholder="0" style={eb('total_ok')} /></label>
            <label className="field"><span>Total NG</span><input type="number" value={f.total_ng ?? ''} onChange={num('total_ng')} placeholder="0" style={eb('total_ng')} /></label>
            <label className="field"><span>Yield (FG ÷ (FG+NG) × 100)</span><input value={ppYield({ total_ok: f.total_ok ?? 0, total_ng: f.total_ng ?? 0 })?.toFixed(2) ?? '—'} readOnly style={{ background: '#f1f5f9' }} /></label>
          </div>

          <Section title="PD PLAN" />
          <div className="grid-3col">
            <label className="field"><span>PD Start</span><input type="date" min={DATE_INPUT_MIN} max={DATE_INPUT_MAX} value={f.pd_start_date ?? ''} onChange={txt('pd_start_date')} style={eb('pd_start_date')} /></label>
            <label className="field"><span>PD Done</span><input type="date" min={DATE_INPUT_MIN} max={DATE_INPUT_MAX} value={f.pd_finish_date ?? ''} onChange={txt('pd_finish_date')} style={eb('pd_finish_date')} /></label>
            <label className="field"><span>Expected date</span><input type="date" min={DATE_INPUT_MIN} max={DATE_INPUT_MAX} value={f.expected_date ?? ''} onChange={txt('expected_date')} style={eb('expected_date')} /></label>
            <label className="field"><span>CAP / DAY</span><input type="number" min="0" value={f.target_per_day ?? ''} onChange={num('target_per_day')} placeholder="e.g. 40" /></label>
          </div>

          <Section title="Owner / Customer" />
          <div className="grid-3col">
            <label className="field"><span>Owner</span><input value={f.syn_requestor ?? ''} onChange={txt('syn_requestor')} placeholder="Owner / assignee" /></label>
            <label className="field"><span>Customer</span><input value={f.customer ?? ''} onChange={txt('customer')} /></label>
          </div>

          <Section title="Process (check which steps exist)" />
          {/* ติ๊ก = มีขั้นนี้ → ขึ้นสีเทา (Waiting) ที่แดชบอร์ด แล้วค่อยเลือกสถานะจริงในตาราง · ไม่ติ๊ก = ไม่มี (No process, ว่างไม่มีสี) */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 20px', padding: '2px 2px 4px' }}>
            {PROCESS_STEPS.map(s => {
              const has = !!(f as any)[s.key];
              return (
                <label key={s.key as string} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.875rem', color: 'var(--text-body)' }}>
                  <input type="checkbox" checked={has} onChange={e => set(s.key, e.target.checked ? 'WAIT' : '')} />
                  {s.label}
                </label>
              );
            })}
          </div>

          <Section title="QA" />
          <div className="grid-3col">
            <label className="field"><span>Sampling rate</span>
              <input type="text" value={f.qa_test_rate ?? ''} onChange={txt('qa_test_rate')} />
            </label>
            <label className="field"><span>QA Finish date</span><input type="date" min={DATE_INPUT_MIN} max={DATE_INPUT_MAX} value={f.qa_finish_date ?? ''} onChange={txt('qa_finish_date')} /></label>
            <label className="field"><span>QA Status</span>
              <select value={f.qa_status ?? ''} onChange={txt('qa_status')} title="QA status — separate from the job status">
                <option value="">— None —</option>
                {PP_STATUS.map(s => <option key={s} value={s}>{PP_STATUS_LABEL[s]}</option>)}
              </select>
            </label>
          </div>

          <Section title="Store" />
          <div className="grid-3col">
            <label className="field"><span>Received date</span><input type="date" min={DATE_INPUT_MIN} max={DATE_INPUT_MAX} value={f.store_received ?? ''} onChange={txt('store_received')} /></label>
          </div>

          <Section title="PIC" />
          <div className="grid-3col">
            <label className="field"><span>PIC Name</span>
              <MultiPicInput value={f.pd_pic ?? ''} onChange={v => set('pd_pic', v)} options={picNames} placeholder="Select or add people…" />
            </label>
          </div>

          <div className="grid-3col">
            <label className="field"><span>Revised date</span><input type="date" min={DATE_INPUT_MIN} max={DATE_INPUT_MAX} value={f.revised_date ?? ''} onChange={txt('revised_date')} /></label>
            <label className="field"><span>Delivery date</span><input type="date" min={DATE_INPUT_MIN} max={DATE_INPUT_MAX} value={f.delivery_date ?? ''} onChange={txt('delivery_date')} /></label>
          </div>
          {/* วันยังไม่ finalize → ใส่รายละเอียด/เหตุผลไว้ตรงนี้ โผล่เป็นดอกจัน (*) ให้เอาเมาส์ไปชี้ดูที่ช่อง Delivery date ในตาราง */}
          <label className="field"><span>Delivery remark <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(date not finalized yet? Add details here — shows as * to hover over in the table)</span></span>
            <textarea value={f.delivery_remark ?? ''} onChange={txt('delivery_remark')} rows={2} placeholder="e.g. Awaiting customer confirmation, rough target not locked yet" /></label>
          <label className="field"><span>Special request</span><textarea value={f.special_request ?? ''} onChange={txt('special_request')} rows={2} placeholder="e.g. urgent, QA first, etc." /></label>
          <label className="field"><span>Remark</span><textarea value={f.remark ?? ''} onChange={txt('remark')} rows={4} /></label>

          {editing && initial && <><Section title="Edit history" /><EditHistory id={initial.id} /></>}

          {err && <div className="notice err">{err}</div>}
          <div className="modal-actions">
            {onCancel && <button type="button" className="btn secondary" onClick={onCancel}>Cancel</button>}
            <button type="submit" className="btn" disabled={create.isPending || update.isPending}>
              {editing ? 'Save changes' : 'Add project'}
            </button>
          </div>
        </form>
        {askRemark && <SaveRemarkPopup saving={update.isPending} onCancel={() => setAskRemark(false)} onConfirm={note => doSave(note)} />}
      </>
  );
}

// popup กรอกหมายเหตุตอนกด Save (แก้ไข) — หมายเหตุจะไปอยู่ในประวัติของ record ชิ้นนี้เท่านั้น
function SaveRemarkPopup({ saving, onCancel, onConfirm }: { saving: boolean; onCancel: () => void; onConfirm: (note: string) => void }) {
  useEscapeKey(true, onCancel);
  const [note, setNote] = useState('');
  return (
    <div className="modal-overlay" style={{ zIndex: 1200 }} onClick={onCancel}>
      <div className="modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} style={{ width: 'min(100%, 420px)' }}>
        <h2 className="panel__title" style={{ marginBottom: '0.3rem' }}>Save — add a remark</h2>
        <p className="panel__subtitle" style={{ marginBottom: '1rem' }}>Note what/why you changed (kept in this item's edit history). You can leave it blank.</p>
        <label className="field"><span>Remark (this edit)</span>
          <textarea autoFocus value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="e.g. moved expected date after customer request" />
        </label>
        <div className="modal-actions" style={{ marginTop: '1.2rem' }}>
          <button type="button" className="btn secondary" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="button" className="btn" onClick={() => onConfirm(note.trim())} disabled={saving}>{saving ? 'Saving…' : 'Confirm & Save'}</button>
        </div>
      </div>
    </div>
  );
}

/** ป๊อปอัพแก้ไข (wrap ProjectForm) — ปิดแล้วเตือนถ้ามีข้อมูลค้าง (unsaved) */
export function ProjectFormModal({ initial, onClose, defaultType }: { initial: PpProject | null; onClose: () => void; defaultType?: string }) {
  const dirtyRef = useRef(false);
  const guardedClose = async () => {
    if (dirtyRef.current && !(await confirmDialog('Discard unsaved changes?', { title: 'Discard changes', confirmText: 'Discard', danger: true }))) return;
    onClose();
  };
  useEscapeKey(true, guardedClose);
  return (
    <div className="modal-overlay" onClick={guardedClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} style={{ width: 'min(100%, 860px)', maxHeight: '94vh', overflowY: 'auto' }}>
        <h2 className="panel__title" style={{ marginBottom: '1rem' }}>{initial ? 'Edit Project' : `Add Project${defaultType === 'external' ? ' — External' : ''}`}</h2>
        <ProjectForm initial={initial} defaultType={defaultType} onSaved={onClose} onCancel={guardedClose} onDirtyChange={d => { dirtyRef.current = d; }} />
      </div>
    </div>
  );
}
