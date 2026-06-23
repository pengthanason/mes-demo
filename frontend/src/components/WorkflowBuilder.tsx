import { useState, useEffect } from 'react';
import {
  PROCESSES, useWorkflows, useWorkflowCreate, useWorkflowDelete,
  useWorkflowResults, useWorkflowResultCreate, useWorkflowResultDelete,
  type Workflow,
} from '../lib/workflowApi';
import { useIsViewer } from '../lib/useMockStore';
import { showToast } from '../lib/toast';
import { ResultBadge } from './ResultBadge';

type Step = { id: string; process: string; seconds: number | ''; pass: boolean };
const CUSTOM_PROC_KEY = 'mes_custom_processes';

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `s_${Date.now()}_${Math.round(performance.now())}`);
const newStep = (): Step => ({ id: uid(), process: PROCESSES[0], seconds: '', pass: true });
const fmtTime = (sec: number) => { const m = Math.floor(sec / 60); const s = sec % 60; return m > 0 ? `${m} นาที ${s} วิ` : `${s} วิ`; };

/* ── custom dropdown (สไตล์เดิม) ── */
function Dropdown({ value, options, onChange, disabled }: {
  value: string; options: { id: string; name: string }[]; onChange: (id: string) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.id === value)?.name ?? value;
  return (
    <div style={{ position: 'relative', flexGrow: 1, minWidth: 0 }}>
      <div
        onClick={() => !disabled && setOpen(o => !o)}
        style={{ minHeight: 40, boxSizing: 'border-box', padding: '0 12px', border: '1px solid #ccc', borderRadius: 4, background: disabled ? '#f1f5f9' : '#f8fafc', color: '#334155', cursor: disabled ? 'default' : 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1, position: 'relative', top: 3 }}>{selected}</span>
        {!disabled && <span style={{ fontSize: 10, color: '#64748b' }}>{open ? '▲' : '▼'}</span>}
      </div>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: '#fff', border: '1px solid #ccc', borderRadius: 4, boxShadow: '0 4px 6px rgba(0,0,0,0.1)', zIndex: 10, maxHeight: 260, overflowY: 'auto' }}>
            {options.map(opt => (
              <div key={opt.id}
                onClick={() => { onChange(opt.id); setOpen(false); }}
                style={{ padding: '8px 10px', cursor: 'pointer', color: value === opt.id ? '#0369a1' : '#334155', background: value === opt.id ? '#e0f2fe' : '#fff', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}
                onMouseEnter={e => { if (value !== opt.id) e.currentTarget.style.background = '#f8fafc'; }}
                onMouseLeave={e => { if (value !== opt.id) e.currentTarget.style.background = '#fff'; }}
              >{opt.name}</div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── dropdown เลือกกระบวนการ: หลัก(A-Z) → custom(ลบได้) → "+ เพิ่มกระบวนการ" ── */
function ProcessSelect({ value, main, custom, onChange, onAdd, onDeleteCustom, disabled }: {
  value: string; main: string[]; custom: string[];
  onChange: (v: string) => void; onAdd: () => void; onDeleteCustom: (name: string) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const row = (p: string, isCustom: boolean) => (
    <div key={p} style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #f1f5f9', background: value === p ? '#e0f2fe' : '#fff' }}>
      <div style={{ flexGrow: 1, padding: '8px 10px', cursor: 'pointer', color: value === p ? '#0369a1' : '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        onClick={() => { onChange(p); setOpen(false); }}>{p}</div>
      {isCustom && (
        <button type="button" onClick={e => { e.stopPropagation(); onDeleteCustom(p); }}
          style={{ background: 'transparent', border: 'none', color: '#e74c3c', cursor: 'pointer', padding: '8px 10px', fontSize: 12, fontWeight: 'bold', flexShrink: 0 }}
          title="ลบกระบวนการนี้" onMouseOver={e => e.currentTarget.style.background = '#fee2e2'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>✕</button>
      )}
    </div>
  );
  return (
    <div style={{ position: 'relative', flexGrow: 1, minWidth: 0 }}>
      <div onClick={() => !disabled && setOpen(o => !o)}
        style={{ padding: '8px 10px', border: '1px solid #ccc', borderRadius: 4, background: disabled ? '#f1f5f9' : '#f8fafc', color: '#334155', cursor: disabled ? 'default' : 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
        {!disabled && <span style={{ fontSize: 10, color: '#64748b' }}>{open ? '▲' : '▼'}</span>}
      </div>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: '#fff', border: '1px solid #ccc', borderRadius: 4, boxShadow: '0 4px 6px rgba(0,0,0,0.1)', zIndex: 10, maxHeight: 280, overflowY: 'auto' }}>
            {main.map(p => row(p, false))}
            {custom.length > 0 && <div style={{ padding: '4px 10px', fontSize: '0.7rem', color: '#94a3b8', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>กระบวนการที่เพิ่มเอง</div>}
            {custom.map(p => row(p, true))}
            <div onClick={() => { setOpen(false); onAdd(); }}
              style={{ padding: '8px 10px', cursor: 'pointer', fontWeight: 'bold', color: '#0369a1', background: '#f0f9ff', borderTop: '1px solid #e2e8f0' }}>+ เพิ่มกระบวนการ...</div>
          </div>
        </>
      )}
    </div>
  );
}

/* ── โหลด preset ── */
function PresetSelect({ workflows, onLoad, onDelete, canDelete }: {
  workflows: Workflow[]; onLoad: (w: Workflow) => void; onDelete: (id: number) => void; canDelete: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative', flexGrow: 1, minWidth: 0 }}>
      <div onClick={() => setOpen(o => !o)}
        style={{ padding: '8px 10px', border: '1px solid #ccc', borderRadius: 4, background: '#f8fafc', color: '#64748b', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>📂 โหลด Preset ที่บันทึกไว้...</span>
        <span style={{ fontSize: 10 }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: '#fff', border: '1px solid #ccc', borderRadius: 4, boxShadow: '0 4px 6px rgba(0,0,0,0.1)', zIndex: 10, maxHeight: 260, overflowY: 'auto' }}>
            {workflows.length === 0 && <div style={{ padding: '10px', color: '#94a3b8', fontSize: '0.85rem' }}>ยังไม่มี preset ที่บันทึก</div>}
            {workflows.map(w => (
              <div key={w.id} style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ flexGrow: 1, padding: '8px 10px', cursor: 'pointer', color: '#334155', minWidth: 0 }} onClick={() => { onLoad(w); setOpen(false); }}>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{w.name || `${w.customer || '—'} · ${w.model || '—'}`}</div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.steps.map(s => s.process).join(' → ')}</div>
                </div>
                {canDelete && (
                  <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (confirm('ลบ preset นี้?')) onDelete(w.id); }}
                    style={{ background: 'transparent', border: 'none', color: '#e74c3c', cursor: 'pointer', padding: '8px 10px', fontSize: 12, fontWeight: 'bold', flexShrink: 0 }}
                    title="ลบ" onMouseOver={e => e.currentTarget.style.background = '#fee2e2'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>✕</button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── mermaid flowchart — START→steps→END, FAIL = self-loop จริง, เวลาบนลูกศร PASS ── */
function toMermaid(steps: Step[]): string {
  if (!steps.length) return 'flowchart TD\n  START([เริ่ม]) --> END([จบ])';
  const L = ['flowchart TD', '  START([▶ เริ่มสายผลิต]):::se'];
  steps.forEach((s, i) => {
    const t = s.seconds !== '' ? `<br/>⏱ ${s.seconds}s` : '';
    L.push(`  S${i}["${i + 1}. ${s.process}${t}"]:::${s.pass ? 'ok' : 'ng'}`);
  });
  L.push('  DONE([■ เสร็จ]):::se');
  // เส้นหลักก่อน (ให้ flow ตรงลงมาปกติ) START → ทุกขั้น → DONE
  L.push('  START --> S0');
  steps.forEach((s, i) => {
    const next = i < steps.length - 1 ? `S${i + 1}` : 'DONE';
    const t = s.seconds !== '' ? `${s.seconds}s · ` : '';
    L.push(`  S${i} -->|"${t}✓ PASS"| ${next}`);
  });
  // self-loop ไว้ท้ายสุด — วนตัวเองเล็กๆ ที่ขั้น FAIL โดยไม่ไปดัน layout เส้นหลัก
  steps.forEach((s, i) => { if (!s.pass) L.push(`  S${i} -->|FAIL| S${i}`); });
  L.push('  classDef ok fill:#eef2ff,stroke:#6366f1,stroke-width:2px,color:#1e293b;');
  L.push('  classDef ng fill:#fef2f2,stroke:#dc2626,stroke-width:2px,color:#1e293b;');
  L.push('  classDef se fill:#dcfce7,stroke:#16a34a,stroke-width:2px,color:#14532d;');
  return L.join('\n');
}

/* ── วาด flowchart เป็น SVG เอง — เส้นหลักตรงลงมา + self-loop เล็กๆ ที่ขั้น FAIL ── */
function buildFlowSvg(steps: Step[]): string {
  const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const Wsvg = 380, BX = 60, BW = 240, BH = 54, PILLW = 180, PILLH = 34, GAP = 46;
  const cx = BX + BW / 2;
  type Item = { pill?: boolean; label: string; sub?: string; fail?: boolean; stepIdx?: number };
  const items: Item[] = [
    { pill: true, label: '▶ เริ่มสายผลิต' },
    ...steps.map((s, i) => ({ label: `${i + 1}. ${s.process}`, sub: s.seconds !== '' ? `⏱ ${s.seconds}s` : '', fail: !s.pass, stepIdx: i })),
    { pill: true, label: '■ เสร็จ' },
  ];
  const parts: string[] = [];
  let y = 8;
  items.forEach((it, idx) => {
    const h = it.pill ? PILLH : BH;
    const top = y, bottom = y + h, midY = y + h / 2;
    if (it.pill) {
      parts.push(`<rect x="${cx - PILLW / 2}" y="${top}" width="${PILLW}" height="${h}" rx="${h / 2}" fill="#dcfce7" stroke="#16a34a" stroke-width="2"/>`);
      parts.push(`<text x="${cx}" y="${midY}" text-anchor="middle" dominant-baseline="central" font-size="13" font-weight="700" fill="#14532d">${esc(it.label)}</text>`);
    } else {
      const stroke = it.fail ? '#dc2626' : '#6366f1', fill = it.fail ? '#fef2f2' : '#eef2ff';
      parts.push(`<rect x="${BX}" y="${top}" width="${BW}" height="${h}" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`);
      parts.push(`<text x="${cx}" y="${it.sub ? midY - 7 : midY}" text-anchor="middle" dominant-baseline="central" font-size="13" font-weight="600" fill="#1e293b">${esc(it.label)}</text>`);
      if (it.sub) parts.push(`<text x="${cx}" y="${midY + 10}" text-anchor="middle" dominant-baseline="central" font-size="11" fill="#0369a1">${esc(it.sub)}</text>`);
      // self-loop เล็กๆ ด้านขวา (ขั้น FAIL)
      if (it.fail) {
        const rx = BX + BW, y1 = midY - 9, y2 = midY + 9;
        parts.push(`<path d="M ${rx} ${y1} C ${rx + 30} ${y1 - 4}, ${rx + 30} ${y2 + 4}, ${rx} ${y2}" fill="none" stroke="#dc2626" stroke-width="2" marker-end="url(#ahr)"/>`);
        parts.push(`<text x="${rx + 36}" y="${midY}" text-anchor="start" dominant-baseline="central" font-size="10" font-weight="700" fill="#dc2626">FAIL</text>`);
      }
    }
    // ลูกศรเส้นหลักไปโหนดถัดไป + ป้ายเวลา (PASS)
    if (idx < items.length - 1) {
      const nextTop = bottom + GAP;
      parts.push(`<line x1="${cx}" y1="${bottom}" x2="${cx}" y2="${nextTop}" stroke="#94a3b8" stroke-width="2" marker-end="url(#ah)"/>`);
      if (it.stepIdx != null) {
        const s = steps[it.stepIdx];
        const t = s.seconds !== '' ? `${s.seconds}s · PASS` : 'PASS';
        parts.push(`<text x="${cx + 10}" y="${bottom + GAP / 2}" text-anchor="start" dominant-baseline="central" font-size="10" font-weight="600" fill="#16a34a">✓ ${esc(t)}</text>`);
      }
    }
    y = bottom + GAP;
  });
  const totalH = y - GAP + 8;
  const defs = `<defs>`
    + `<marker id="ah" markerWidth="8" markerHeight="8" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#94a3b8"/></marker>`
    + `<marker id="ahr" markerWidth="8" markerHeight="8" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#dc2626"/></marker>`
    + `</defs>`;
  return `<svg viewBox="0 0 ${Wsvg} ${totalH}" width="${Wsvg}" height="${totalH}" xmlns="http://www.w3.org/2000/svg" font-family="'Segoe UI',Tahoma,sans-serif">${defs}${parts.join('')}</svg>`;
}

/* ── flowchart (SVG) → พิมพ์ (Save as PDF) ── */
function exportFlowchartPdf(customer: string, model: string, svg: string) {
  const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (!svg) { showToast('ยังไม่มี FlowChart ให้พิมพ์ — กด Gen FlowChart ก่อน', 'error'); return; }
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Workflow</title>
    <style>
      body{font-family:'Segoe UI',Tahoma,sans-serif;padding:32px;color:#1e293b;text-align:center}
      h1{font-size:20px;margin-bottom:2px}.sub{color:#64748b;margin-bottom:24px;font-size:13px}
      .diagram svg{max-width:100%;height:auto}
    </style></head>
    <body><h1>Manufacturing Workflow</h1>
    <div class="sub">Customer: ${esc(customer || '-')} &nbsp;|&nbsp; Model: ${esc(model || '-')}</div>
    <div class="diagram">${svg}</div>
    <script>window.onload=()=>window.print()</script></body></html>`;
  const w = window.open('', '_blank');
  if (!w) { showToast('เบราว์เซอร์บล็อก popup — อนุญาตก่อนพิมพ์', 'error'); return; }
  w.document.write(html); w.document.close();
}

const RESULT_OPTS = [{ id: 'PASS', name: 'PASS (ผ่าน)' }, { id: 'FAIL', name: 'FAIL (ไม่ผ่าน)' }];
const fmtDateTime = (s: string) => { try { return new Date(s).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }); } catch { return s; } };

export function WorkflowBuilder() {
  const isViewer = useIsViewer();
  const [serial, setSerial] = useState('');
  const [customer, setCustomer] = useState('');
  const [model, setModel] = useState('');
  const [steps, setSteps] = useState<Step[]>([newStep()]);
  const [globalResult, setGlobalResult] = useState('PASS');
  const [failedIds, setFailedIds] = useState<string[]>([]);   // ขั้นตอนที่เฟล (เมื่อ Result = FAIL)
  const [showFlow, setShowFlow] = useState(false);
  // กระบวนการที่เพิ่มเอง — เก็บใน localStorage ของบราวเซอร์
  const [customProcs, setCustomProcs] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(CUSTOM_PROC_KEY) || '[]'); } catch { return []; }
  });
  useEffect(() => { localStorage.setItem(CUSTOM_PROC_KEY, JSON.stringify(customProcs)); }, [customProcs]);
  // drag-drop
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [grabId, setGrabId] = useState<string | null>(null);

  const create = useWorkflowCreate();
  const del = useWorkflowDelete();
  const { data: saved = [] } = useWorkflows();
  const recordResult = useWorkflowResultCreate();
  const delResult = useWorkflowResultDelete();
  const { data: results = [] } = useWorkflowResults();

  const totalSec = steps.reduce((sum, s) => sum + (Number(s.seconds) || 0), 0);
  const flowSvg = buildFlowSvg(steps);
  const sequenceStr = steps.map(s => `${s.process}${s.seconds !== '' ? `(${s.seconds}s)` : ''}`).join(' → ');

  const setStep = (id: string, patch: Partial<Step>) => setSteps(s => s.map(x => x.id === id ? { ...x, ...patch } : x));
  const addStep = () => setSteps(s => [...s, newStep()]);
  const removeStep = (id: string) => setSteps(s => s.length > 1 ? s.filter(x => x.id !== id) : s);

  function onDrop(targetId: string) {
    if (draggedId == null || draggedId === targetId) return;
    setSteps(s => {
      const from = s.findIndex(x => x.id === draggedId);
      const to = s.findIndex(x => x.id === targetId);
      if (from < 0 || to < 0) return s;
      const next = [...s];
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      return next;
    });
    setDraggedId(null); setDragOverId(null); setGrabId(null);
  }

  /* บันทึก Preset — เด้ง prompt ให้ตั้งชื่อ */
  function savePreset() {
    if (!steps.length) return;
    const name = window.prompt('ตั้งชื่อ Preset:', customer && model ? `${customer} - ${model}` : '');
    if (name == null) return;            // กดยกเลิก
    if (!name.trim()) { showToast('ต้องตั้งชื่อ Preset', 'error'); return; }
    create.mutate({
      name: name.trim(), customer: customer.trim(), model: model.trim(),
      steps: steps.map(s => ({ process: s.process, seconds: s.seconds === '' ? null : Number(s.seconds) })),
    }, {
      onSuccess: () => showToast(`บันทึก Preset "${name.trim()}" สำเร็จ`, 'success'),
      onError: (e: any) => showToast(e.message, 'error'),
    });
  }

  function loadPreset(w: Workflow) {
    setCustomer(w.customer); setModel(w.model);
    const ws = w.steps.length ? w.steps : [{ process: PROCESSES[0], seconds: null }];
    setSteps(ws.map(s => ({ id: uid(), process: s.process, seconds: (s.seconds == null ? '' : s.seconds) as number | '', pass: true })));
    // กระบวนการ custom ที่อยู่ใน preset แต่ยังไม่มีในลิสต์ → เพิ่มเข้า list ให้เลือกได้
    const extra = ws.map(s => s.process).filter(p => p && !PROCESSES.includes(p) && !customProcs.includes(p));
    if (extra.length) setCustomProcs(prev => [...new Set([...prev, ...extra])]);
    setShowFlow(false);
    showToast(`โหลด Preset "${w.name || w.customer}"`, 'info');
  }

  /* เพิ่มกระบวนการ custom (เด้ง prompt) แล้วเซ็ตให้ step นั้น */
  function addCustomProcess(stepId: string) {
    const name = window.prompt('ชื่อกระบวนการใหม่:');
    if (name == null) return;
    const t = name.trim();
    if (!t) { showToast('ต้องใส่ชื่อกระบวนการ', 'error'); return; }
    if (PROCESSES.includes(t) || customProcs.includes(t)) {
      showToast('มีกระบวนการนี้อยู่แล้ว — เลือกได้เลย', 'info');
    } else {
      setCustomProcs(prev => [...prev, t]);
      showToast(`เพิ่มกระบวนการ "${t}" แล้ว`, 'success');
    }
    setStep(stepId, { process: t });
  }

  function deleteCustomProcess(name: string) {
    if (!confirm(`ลบกระบวนการ "${name}"?\n(ออกจากลิสต์ของบราวเซอร์นี้)`)) return;
    setCustomProcs(prev => prev.filter(n => n !== name));
    setSteps(prev => prev.map(s => s.process === name ? { ...s, process: PROCESSES[0] } : s));
  }

  /* บันทึกผล (Record) — บังคับ SN + เวลาทุก step + ถ้า FAIL ต้องเลือกขั้นที่เฟล */
  function record() {
    if (!serial.trim()) { showToast('กรุณากรอก Serial Number', 'error'); return; }
    if (!steps.length) { showToast('ต้องมีกระบวนการอย่างน้อย 1', 'error'); return; }
    if (steps.some(s => s.seconds === '' || Number(s.seconds) <= 0)) {
      showToast('กรุณากรอกเวลา (วินาที) ให้ครบทุกกระบวนการ', 'error'); return;
    }
    if (globalResult === 'FAIL' && failedIds.length === 0) {
      showToast('เลือกขั้นตอนที่ Fail อย่างน้อย 1 ขั้น', 'error'); return;
    }
    // ผลรายขั้น: เฟลเฉพาะขั้นที่เลือก (เมื่อ Result=FAIL) ที่เหลือ PASS
    const perStep = steps.map(s => ({
      process: s.process,
      result: (globalResult === 'FAIL' && failedIds.includes(s.id)) ? 'FAIL' : 'PASS',
    }));
    const overall = perStep.some(p => p.result === 'FAIL') ? 'FAIL' : 'PASS';
    const seqStr = steps.map(s => {
      const failed = globalResult === 'FAIL' && failedIds.includes(s.id);
      return `${s.process}${failed ? '❌' : ''}${s.seconds !== '' ? `(${s.seconds}s)` : ''}`;
    }).join(' → ');
    recordResult.mutate(
      { serial: serial.trim(), customer: customer.trim(), model: model.trim(), sequence: seqStr, result: overall, total_sec: totalSec, steps: perStep },
      {
        onSuccess: () => { showToast(`บันทึกผล ${serial.trim()} (${overall}) สำเร็จ`, 'success'); setSerial(''); setFailedIds([]); setGlobalResult('PASS'); },
        onError: (e: any) => showToast(e.message, 'error'),
      }
    );
  }

  return (
    <div className="panel stack-lg">
      <div className="mes-module-head">
        <span className="mes-module-code">1.3</span>
        <div>
          <h2 className="panel__title">Manufacturing Sequence Builder</h2>
          <p className="panel__subtitle">กำหนดลำดับกระบวนการ → บันทึก Preset / สร้าง FlowChart / บันทึกผลเดินสายผลิต</p>
        </div>
      </div>

      {/* Serial Number (ข้างบน) + Customer + Model */}
      <div className="filters-grid" style={{ marginBottom: 15 }}>
        <label className="field"><span>Serial Number</span>
          <input value={serial} onChange={e => setSerial(e.target.value)} placeholder="กรอก SN..." disabled={isViewer} />
        </label>
        <label className="field"><span>Customer</span>
          <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="ชื่อลูกค้า" disabled={isViewer} />
        </label>
        <label className="field"><span>Model</span>
          <input value={model} onChange={e => setModel(e.target.value)} placeholder="ชื่อรุ่น" disabled={isViewer} />
        </label>
      </div>

      {/* presets bar */}
      <div style={{ marginBottom: 15, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: 'var(--bg-panel)', padding: 15, borderRadius: 6, border: '1px solid var(--border-color)' }}>
        <strong style={{ fontSize: '0.9rem', color: 'var(--text-muted)', minWidth: 80 }}>⚙️ Preset:</strong>
        {!isViewer && (
          <button type="button" className="btn secondary" onClick={savePreset} disabled={create.isPending || steps.length === 0}>
            {create.isPending ? 'กำลังบันทึก...' : '💾 บันทึกเป็น Preset'}
          </button>
        )}
        <div style={{ width: 280, maxWidth: '100%' }}>
          <PresetSelect workflows={saved} onLoad={loadPreset} onDelete={(id) => del.mutate(id)} canDelete={!isViewer} />
        </div>
      </div>

      {/* steps */}
      <div style={{ background: '#f8f9fa', padding: 20, border: '1px solid #e2e8f0', borderRadius: 6 }}>
        {!isViewer && (
          <div style={{ marginBottom: 15 }}>
            <button type="button" className="btn" onClick={addStep} style={{ background: '#3498db', color: '#fff', border: 'none' }}>
              + เพิ่มกระบวนการ
            </button>
          </div>
        )}

        {steps.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#7f8c8d', fontStyle: 'italic', padding: '20px 0' }}>⚠️ ยังไม่มีกระบวนการ — กดปุ่มด้านบนเพื่อเพิ่ม</div>
        ) : (
          <div className="stack">
            {steps.map((step, index) => (
              <div key={step.id}
                draggable={grabId === step.id}
                onDragStart={e => { setDraggedId(step.id); e.dataTransfer.effectAllowed = 'move'; }}
                onDragOver={e => { e.preventDefault(); if (step.id !== dragOverId) setDragOverId(step.id); }}
                onDragLeave={() => setDragOverId(null)}
                onDrop={e => { e.preventDefault(); onDrop(step.id); }}
                onDragEnd={() => { setDraggedId(null); setDragOverId(null); setGrabId(null); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: 10, borderRadius: 4, borderLeft: '4px solid #3498db', flexWrap: 'wrap',
                  opacity: draggedId === step.id ? 0.5 : 1,
                  background: dragOverId === step.id && draggedId !== step.id ? '#e0f2fe' : '#fff',
                  boxShadow: dragOverId === step.id && draggedId !== step.id ? '0 0 0 2px #3b82f6' : '0 1px 3px rgba(0,0,0,0.05)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  {!isViewer && (
                    <div style={{ cursor: 'grab', color: '#94a3b8', padding: 5, fontSize: '1.1rem' }}
                      onMouseEnter={() => setGrabId(step.id)} onMouseLeave={() => setGrabId(null)} title="ลากเพื่อจัดลำดับ">☰</div>
                  )}
                  <div style={{ background: '#3498db', color: '#fff', padding: '4px 10px', borderRadius: 20, fontSize: 14, fontWeight: 'bold', minWidth: 70, textAlign: 'center' }}>Step {index + 1}</div>
                </div>

                {/* process dropdown: หลัก(A-Z) + custom + เพิ่มกระบวนการ */}
                <div style={{ display: 'flex', flexGrow: 1, gap: 8, minWidth: 200 }}>
                  <ProcessSelect value={step.process} main={PROCESSES} custom={customProcs}
                    onChange={v => setStep(step.id, { process: v })}
                    onAdd={() => addCustomProcess(step.id)}
                    onDeleteCustom={deleteCustomProcess}
                    disabled={isViewer} />
                </div>

                {/* cycle time (บังคับกรอก) */}
                <input type="number" min="1" placeholder="เวลา (วินาที)" value={step.seconds} disabled={isViewer}
                  onChange={e => setStep(step.id, { seconds: e.target.value === '' ? '' : Number(e.target.value) })}
                  style={{ width: 130, padding: 8, borderRadius: 4, border: '1px solid #ccc' }} />

                {/* PASS/FAIL รายขั้น (ใช้กับ FlowChart — FAIL จะวนลูปจนผ่าน) */}
                <button type="button" onClick={() => !isViewer && setStep(step.id, { pass: !step.pass })} disabled={isViewer}
                  title="กำหนดว่ากระบวนการนี้ผ่าน/ไม่ผ่าน — ถ้า FAIL FlowChart จะวนลูปจนกว่าจะผ่าน"
                  style={{ padding: '7px 12px', borderRadius: 6, border: `1px solid ${step.pass ? '#16a34a' : '#dc2626'}`, background: step.pass ? '#dcfce7' : '#fee2e2', color: step.pass ? '#166534' : '#991b1b', fontWeight: 700, cursor: isViewer ? 'default' : 'pointer', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                  {step.pass ? '✓ PASS' : '✗ FAIL'}
                </button>

                {!isViewer && <button className="btn danger" onClick={() => removeStep(step.id)} disabled={steps.length === 1}>ลบ</button>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* total cycle time */}
      <div style={{ padding: 15, background: '#e0f2fe', borderRadius: 6, border: '1px solid #bae6fd', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 'bold', color: '#0369a1' }}>⏱️ Total Cycle Time:</span>
        <strong style={{ fontSize: '1.25rem', color: '#0284c7' }}>{fmtTime(totalSec)}</strong>
      </div>

      {/* บันทึกผลเดินสายผลิต (Result PASS/FAIL ยาว + ปุ่มบันทึก) */}
      {!isViewer && (
        <div style={{ padding: 15, background: 'var(--bg-panel)', borderRadius: 6, border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label className="field" style={{ flex: '1 1 320px', minWidth: 240 }}><span>ผลรวม (Result)</span>
              <div><Dropdown value={globalResult} options={RESULT_OPTS} onChange={v => { setGlobalResult(v); if (v !== 'FAIL') setFailedIds([]); }} /></div>
            </label>
            <button type="button" className="btn" onClick={record} disabled={!serial.trim() || steps.length === 0 || recordResult.isPending}
              style={{ background: '#27ae60', borderColor: '#27ae60', color: '#fff', fontWeight: 600, minHeight: 42, padding: '0 24px' }}>
              {recordResult.isPending ? 'กำลังบันทึก...' : '💾 บันทึกผล'}
            </button>
          </div>

          {/* เลือกขั้นที่ FAIL (เมื่อ Result = FAIL) */}
          {globalResult === 'FAIL' && (
            <div style={{ marginTop: 12, padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6 }}>
              <div style={{ fontWeight: 700, color: '#991b1b', fontSize: '0.85rem', marginBottom: 8 }}>❌ เลือกขั้นตอนที่ Fail (เลือกได้หลายขั้น):</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {steps.map((s, i) => {
                  const on = failedIds.includes(s.id);
                  return (
                    <button key={s.id} type="button"
                      onClick={() => setFailedIds(prev => on ? prev.filter(x => x !== s.id) : [...prev, s.id])}
                      style={{ padding: '6px 12px', borderRadius: 999, border: `1px solid ${on ? '#dc2626' : '#cbd5e1'}`, background: on ? '#fee2e2' : '#fff', color: on ? '#991b1b' : '#475569', fontWeight: on ? 700 : 500, cursor: 'pointer', fontSize: '0.82rem' }}>
                      {on ? '✗ ' : ''}Step {i + 1}: {s.process}
                    </button>
                  );
                })}
              </div>
              {failedIds.length === 0 && <div style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: 8 }}>* ต้องเลือกอย่างน้อย 1 ขั้น</div>}
            </div>
          )}
        </div>
      )}

      {/* Gen FlowChart */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" className="btn" onClick={() => setShowFlow(v => !v)} disabled={steps.length === 0}
          style={{ background: '#6366f1', borderColor: '#6366f1', color: '#fff', fontWeight: 600 }}>
          {showFlow ? 'ซ่อน FlowChart' : '🔀 Gen FlowChart'}
        </button>
      </div>

      {showFlow && (
        <div style={{ padding: 20, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <h3 className="panel__title panel__title--sm" style={{ margin: 0 }}>FlowChart</h3>
            <button type="button" className="btn secondary" style={{ fontSize: '0.82rem' }} onClick={() => exportFlowchartPdf(customer, model, flowSvg)}>🖨️ Export PDF</button>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 16 }}>Customer: <strong>{customer || '—'}</strong> · Model: <strong>{model || '—'}</strong> · <span style={{ color: '#16a34a' }}>เขียว</span>=ผ่าน · <span style={{ color: '#dc2626' }}>แดง</span>=มีลูปแก้ไข (FAIL)</p>
          <div style={{ display: 'flex', justifyContent: 'center', overflowX: 'auto', padding: '8px 0' }} dangerouslySetInnerHTML={{ __html: flowSvg }} />
          <details style={{ marginTop: 24 }}>
            <summary style={{ cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-muted)' }}>Mermaid</summary>
            <pre style={{ background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: 8, padding: 12, fontSize: '0.8rem', overflowX: 'auto', marginTop: 8 }}>{toMermaid(steps)}</pre>
          </details>
        </div>
      )}

      {/* ตารางผล (Result) */}
      <div>
        <h3 className="panel__title panel__title--sm" style={{ marginBottom: 10 }}>📋 ผลการบันทึก {results.length > 0 && `(${results.length})`}</h3>
        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
          <table className="table" style={{ minWidth: 760 }}>
            <thead>
              <tr>
                <th>วันที่/เวลา</th><th>Serial</th><th>Customer</th><th>Model</th><th>ลำดับกระบวนการ</th><th>Cycle</th><th>ผล</th>{!isViewer && <th></th>}
              </tr>
            </thead>
            <tbody>
              {results.length === 0 ? (
                <tr><td colSpan={isViewer ? 7 : 8} style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>ยังไม่มีผลที่บันทึก — กรอก Serial + กระบวนการ + เวลา แล้วกด “บันทึกผล”</td></tr>
              ) : results.map(r => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap', fontSize: '0.82rem', color: '#64748b' }}>{fmtDateTime(r.created_at)}</td>
                  <td style={{ fontWeight: 600 }}>{r.serial}</td>
                  <td>{r.customer || '—'}</td>
                  <td>{r.model || '—'}</td>
                  <td style={{ fontSize: '0.8rem', color: '#475569', minWidth: 260, maxWidth: 360, whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.5 }}>{r.sequence || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtTime(r.total_sec)}</td>
                  <td><ResultBadge value={r.result} /></td>
                  {!isViewer && (
                    <td><button className="btn danger" style={{ padding: '4px 10px', fontSize: '0.78rem' }} onClick={() => { if (confirm(`ลบผล ${r.serial}?`)) delResult.mutate(r.id); }}>ลบ</button></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
