import { useState } from 'react';
import {
  PROCESSES, useWorkflows, useWorkflowCreate, useWorkflowDelete,
  useWorkflowResults, useWorkflowResultCreate, useWorkflowResultDelete,
  type Workflow,
} from '../lib/workflowApi';
import { useIsViewer } from '../lib/useMockStore';
import { showToast } from '../lib/toast';

type Step = { id: string; process: string; seconds: number | '' };

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `s_${Date.now()}_${Math.round(performance.now())}`);
const newStep = (): Step => ({ id: uid(), process: PROCESSES[0], seconds: '' });
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
        style={{ padding: '8px 10px', border: '1px solid #ccc', borderRadius: 4, background: disabled ? '#f1f5f9' : '#f8fafc', color: '#334155', cursor: disabled ? 'default' : 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected}</span>
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
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.steps.join(' → ')}</div>
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

/* ── mermaid (ก๊อปไปใช้ต่อ) ── */
function toMermaid(steps: Step[]): string {
  if (!steps.length) return '';
  const nodes = steps.map((s, i) => `  S${i}["${s.process}"]`).join('\n');
  const edges = steps.slice(1).map((_, i) => `  S${i} --> S${i + 1}`).join('\n');
  return `flowchart TD\n${nodes}\n${edges}`;
}

/* ── flowchart → HTML แล้วสั่งพิมพ์ (Save as PDF) ── */
function exportFlowchartPdf(customer: string, model: string, steps: Step[]) {
  const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const boxes = steps.map((s, i) =>
    `<div class="node">${i + 1}. ${esc(s.process)}</div>${i < steps.length - 1 ? '<div class="arrow">▼</div>' : ''}`
  ).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Workflow</title>
    <style>
      body{font-family:'Segoe UI',Tahoma,sans-serif;padding:32px;color:#1e293b;text-align:center}
      h1{font-size:20px;margin-bottom:2px}.sub{color:#64748b;margin-bottom:24px;font-size:13px}
      .node{display:inline-block;min-width:240px;padding:12px 18px;border:2px solid #6366f1;border-radius:10px;background:#eef2ff;font-weight:600;font-size:14px}
      .arrow{color:#6366f1;font-size:18px;margin:6px 0}
    </style></head>
    <body><h1>Manufacturing Workflow</h1>
    <div class="sub">Customer: ${esc(customer || '-')} &nbsp;|&nbsp; Model: ${esc(model || '-')}</div>
    ${boxes}
    <script>window.onload=()=>window.print()</script></body></html>`;
  const w = window.open('', '_blank');
  if (!w) { showToast('เบราว์เซอร์บล็อก popup — อนุญาตก่อนพิมพ์', 'error'); return; }
  w.document.write(html); w.document.close();
}

const PROC_OPTS = PROCESSES.map(p => ({ id: p, name: p }));
const RESULT_OPTS = [{ id: 'PASS', name: 'PASS (ผ่าน)' }, { id: 'FAIL', name: 'FAIL (ไม่ผ่าน)' }];
const fmtDateTime = (s: string) => { try { return new Date(s).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }); } catch { return s; } };

export function WorkflowBuilder() {
  const isViewer = useIsViewer();
  const [serial, setSerial] = useState('');
  const [customer, setCustomer] = useState('');
  const [model, setModel] = useState('');
  const [steps, setSteps] = useState<Step[]>([newStep()]);
  const [globalResult, setGlobalResult] = useState('PASS');
  const [showFlow, setShowFlow] = useState(false);
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
    create.mutate({ name: name.trim(), customer: customer.trim(), model: model.trim(), steps: steps.map(s => s.process) }, {
      onSuccess: () => showToast(`บันทึก Preset "${name.trim()}" สำเร็จ`, 'success'),
      onError: (e: any) => showToast(e.message, 'error'),
    });
  }

  function loadPreset(w: Workflow) {
    setCustomer(w.customer); setModel(w.model);
    setSteps((w.steps.length ? w.steps : [PROCESSES[0]]).map(p => ({ id: uid(), process: p, seconds: '' as number | '' })));
    setShowFlow(false);
    showToast(`โหลด Preset "${w.name || w.customer}"`, 'info');
  }

  /* บันทึกผล (Record) — บังคับ SN + เวลาทุก step */
  function record() {
    if (!serial.trim()) { showToast('กรุณากรอก Serial Number', 'error'); return; }
    if (!steps.length) { showToast('ต้องมีกระบวนการอย่างน้อย 1', 'error'); return; }
    if (steps.some(s => s.seconds === '' || Number(s.seconds) <= 0)) {
      showToast('กรุณากรอกเวลา (วินาที) ให้ครบทุกกระบวนการ', 'error'); return;
    }
    recordResult.mutate(
      { serial: serial.trim(), customer: customer.trim(), model: model.trim(), sequence: sequenceStr, result: globalResult, total_sec: totalSec },
      {
        onSuccess: () => { showToast(`บันทึกผล ${serial.trim()} (${globalResult}) สำเร็จ`, 'success'); setSerial(''); },
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

                {/* process dropdown (เรียง A-Z) */}
                <div style={{ display: 'flex', flexGrow: 1, gap: 8, minWidth: 200 }}>
                  <Dropdown value={step.process} options={PROC_OPTS} onChange={v => setStep(step.id, { process: v })} disabled={isViewer} />
                </div>

                {/* cycle time (บังคับกรอก) */}
                <input type="number" min="1" placeholder="เวลา (วินาที)" value={step.seconds} disabled={isViewer}
                  onChange={e => setStep(step.id, { seconds: e.target.value === '' ? '' : Number(e.target.value) })}
                  style={{ width: 130, padding: 8, borderRadius: 4, border: '1px solid #ccc' }} />

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
        <div style={{ padding: 15, background: 'var(--bg-panel)', borderRadius: 6, border: '1px solid var(--border-color)', display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label className="field" style={{ flex: '1 1 320px', minWidth: 240 }}><span>ผลรวม (Result)</span>
            <div><Dropdown value={globalResult} options={RESULT_OPTS} onChange={setGlobalResult} /></div>
          </label>
          <button type="button" className="btn" onClick={record} disabled={!serial.trim() || steps.length === 0 || recordResult.isPending}
            style={{ background: '#27ae60', borderColor: '#27ae60', color: '#fff', fontWeight: 600, minHeight: 42, padding: '0 24px' }}>
            {recordResult.isPending ? 'กำลังบันทึก...' : '💾 บันทึกผล'}
          </button>
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
            <button type="button" className="btn secondary" style={{ fontSize: '0.82rem' }} onClick={() => exportFlowchartPdf(customer, model, steps)}>🖨️ Export PDF</button>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 16 }}>Customer: <strong>{customer || '—'}</strong> · Model: <strong>{model || '—'}</strong></p>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
            {steps.map((s, i) => (
              <div key={s.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ minWidth: 240, padding: '0.7rem 1.1rem', border: '2px solid #6366f1', borderRadius: 10, background: '#eef2ff', fontWeight: 600, textAlign: 'center', color: '#1e293b' }}>{i + 1}. {s.process}</div>
                {i < steps.length - 1 && <div style={{ color: '#6366f1', fontSize: '1.3rem', lineHeight: 1, margin: '4px 0' }}>▼</div>}
              </div>
            ))}
          </div>
          <details style={{ marginTop: 24 }}>
            <summary style={{ cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-muted)' }}>โค้ด Mermaid (ก๊อปไปใช้ต่อได้)</summary>
            <pre style={{ background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: 8, padding: 12, fontSize: '0.8rem', overflowX: 'auto', marginTop: 8 }}>{toMermaid(steps)}</pre>
          </details>
          <p style={{ marginTop: 16, fontSize: '0.78rem', color: '#94a3b8' }}>* Export เป็น Excel / Image (1.3.6) ไว้ตกลงกันภายหลัง — ตอนนี้รองรับ PDF + Mermaid</p>
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
                <tr><td colSpan={isViewer ? 7 : 8} style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>ยังไม่มีผลที่บันทึก</td></tr>
              ) : results.map(r => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap', fontSize: '0.82rem', color: '#64748b' }}>{fmtDateTime(r.created_at)}</td>
                  <td style={{ fontWeight: 600 }}>{r.serial}</td>
                  <td>{r.customer || '—'}</td>
                  <td>{r.model || '—'}</td>
                  <td style={{ fontSize: '0.8rem', color: '#475569', minWidth: 260, maxWidth: 360, whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.5 }}>{r.sequence || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtTime(r.total_sec)}</td>
                  <td>
                    <span style={{ background: r.result === 'PASS' ? '#dcfce7' : '#fee2e2', color: r.result === 'PASS' ? '#166534' : '#991b1b', border: `1px solid ${r.result === 'PASS' ? '#86efac' : '#fca5a5'}`, padding: '2px 10px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700 }}>{r.result}</span>
                  </td>
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
