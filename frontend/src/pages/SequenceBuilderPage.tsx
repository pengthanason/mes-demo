import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { addLocalHistory } from '../lib/localHistory';

// ข้อมูล Station ตั้งต้น (ดึงมาจาก Prototype เดิม)
const FALLBACK_STATIONS = [
  { id: 'R1', name: 'SMT SETUP' },
  { id: 'R2', name: 'IPQC 1 pcba' },
  { id: 'R3', name: 'Insert manual' },
  { id: 'R4', name: 'Ipqc 2 pcba' },
  { id: 'R5', name: 'Test ict' },
  { id: 'R6', name: 'B/B' },
  { id: 'R7', name: 'Ipqc b/b' },
  { id: 'R8', name: 'Test fct' },
  { id: 'R9', name: 'Test fct b/b' },
  { id: 'R10', name: 'Test system uat' },
  { id: 'R11', name: 'Fqc packing' },
  { id: 'R12', name: 'Fqc packins' },
];

// สร้าง Type สำหรับ Step แต่ละขั้นตอน
type OperationStep = {
  id: string; // สำคัญมากใน React! ต้องมี ID ที่ไม่ซ้ำกันสำหรับการลบ/สลับที่
  stationId: string;
  seconds: number | ''; // อนุญาตให้เป็น string ว่างได้ เผื่อ user ลบตัวเลขทิ้งเพื่อพิมพ์ใหม่
};

// --- Type และ Component สำหรับระบบ Template ---
type SequenceTemplate = {
  id: string;
  name: string;
  steps: Omit<OperationStep, 'id'>[];
};

function TemplateSelect({
  templates,
  onLoad,
  onDelete
}: {
  templates: SequenceTemplate[];
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div style={{ position: 'relative', flexGrow: 1 }}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', background: '#f8fafc', color: '#64748b', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <span>📂 Select preset...</span>
        <span style={{ fontSize: '10px' }}>{isOpen ? '▲' : '▼'}</span>
      </div>

      {isOpen && (
        <>
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9 }} onClick={() => setIsOpen(false)} />
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', background: 'white', border: '1px solid #ccc', borderRadius: '4px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', zIndex: 10, maxHeight: '250px', overflowY: 'auto' }}>
            {templates.map(tpl => (
              <div key={tpl.id} style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #f1f5f9', background: 'white' }}>
                <div style={{ flexGrow: 1, padding: '8px 10px', cursor: 'pointer', color: '#334155' }} onClick={() => { onLoad(tpl.id); setIsOpen(false); }}>
                  {tpl.name}
                </div>
                <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(tpl.id); }} style={{ background: 'transparent', border: 'none', color: '#e74c3c', cursor: 'pointer', padding: '8px 10px', fontSize: '12px', fontWeight: 'bold', flexShrink: 0 }} title="Delete preset" onMouseOver={(e) => e.currentTarget.style.background = '#fee2e2'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}>✕</button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// คอมโพเนนต์สำหรับ Custom Dropdown (เพื่อให้สามารถใส่ปุ่ม X ลงในตัวเลือกได้)
function CustomStationSelect({
  value,
  options,
  customStationIds,
  onChange,
  onAddNew,
  onDeleteCustom
}: {
  value: string;
  options: {id: string, name: string}[];
  customStationIds: string[];
  onChange: (id: string) => void;
  onAddNew: () => void;
  onDeleteCustom: (id: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedName = options.find(o => o.id === value)?.name || '';

  return (
    <div style={{ position: 'relative', flexGrow: 1 }}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', background: '#f8fafc', color: '#334155', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <span>{selectedName}</span>
        <span style={{ fontSize: '10px', color: '#64748b' }}>{isOpen ? '▲' : '▼'}</span>
      </div>

      {isOpen && (
        <>
          {/* ฉากหลังใสๆ เอาไว้ดักเวลาผู้ใช้คลิกที่อื่นให้ปิด Dropdown */}
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9 }} onClick={() => setIsOpen(false)} />
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', background: 'white', border: '1px solid #ccc', borderRadius: '4px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', zIndex: 10, maxHeight: '250px', overflowY: 'auto' }}>
            {options.map(opt => {
              const isCustom = customStationIds.includes(opt.id);
              return (
                <div key={opt.id} style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #f1f5f9', background: value === opt.id ? '#e0f2fe' : 'white' }}>
                  <div style={{ flexGrow: 1, padding: '8px 10px', cursor: 'pointer', color: value === opt.id ? '#0369a1' : '#334155' }} onClick={() => { onChange(opt.id); setIsOpen(false); }}>
                    {opt.name}
                  </div>
                  {isCustom && (
                    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDeleteCustom(opt.id); }} style={{ background: 'transparent', border: 'none', color: '#e74c3c', cursor: 'pointer', padding: '8px 10px', fontSize: '12px', fontWeight: 'bold', flexShrink: 0 }} title="Delete this custom station" onMouseOver={(e) => e.currentTarget.style.background = '#fee2e2'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}>✕</button>
                  )}
                </div>
              );
            })}
            <div style={{ padding: '8px 10px', cursor: 'pointer', fontWeight: 'bold', color: '#0369a1', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }} onClick={() => { setIsOpen(false); onAddNew(); }}>+ Add new station...</div>
          </div>
        </>
      )}
    </div>
  );
}

// คอมโพเนนต์สำหรับ Global Result Dropdown (เพื่อให้หน้าตาเหมือนอันอื่นๆ)
function ResultSelect({
  value,
  onChange
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const options = [
    { id: 'PASS', name: 'PASS (Verified)' },
    { id: 'FAIL', name: 'FAIL (Defect detected)' }
  ];
  const selectedName = options.find(o => o.id === value)?.name || '';

  return (
    <div style={{ position: 'relative', minWidth: '200px' }}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', background: '#f8fafc', color: '#334155', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <span>{selectedName}</span>
        <span style={{ fontSize: '10px', color: '#64748b' }}>{isOpen ? '▲' : '▼'}</span>
      </div>

      {isOpen && (
        <>
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9 }} onClick={() => setIsOpen(false)} />
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', background: 'white', border: '1px solid #ccc', borderRadius: '4px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', zIndex: 10 }}>
            {options.map(opt => (
              <div key={opt.id} style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #f1f5f9', background: value === opt.id ? '#e0f2fe' : 'white' }}>
                <div style={{ flexGrow: 1, padding: '8px 10px', cursor: 'pointer', color: value === opt.id ? '#0369a1' : '#334155' }} onClick={() => { onChange(opt.id); setIsOpen(false); }}>
                  {opt.name}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function SequenceBuilderPage() {
  // --- ก้าวที่ 1 & 2: ดึงข้อมูล Station จาก API แทน Hardcode ---
  const { data: catalog, isLoading: isCatalogLoading } = useQuery({
    queryKey: ['routes-catalog'],
    queryFn: async () => {
      const { data } = await api.get('/mes/routes/catalog');
      return data;
    },
    // แก้ไข 1: ปิดการโหลดใหม่เมื่อสลับหน้าจอ และเก็บ cache ไว้ถาวร ไม่ต้องพยายามโหลดซ้ำถ้าพัง
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: false,
  });

  // นำข้อมูลที่ได้จาก API มากรองเฉพาะ station_name ให้ไม่ซ้ำกัน
  const stationOptions = useMemo(() => {
    if (!catalog?.routes || !Array.isArray(catalog.routes)) return FALLBACK_STATIONS;
    
    const stationMap = new Map<string, string>();
    catalog.routes.filter((r: any) => r.is_active).forEach((route: any) => {
      route.steps.forEach((step: any) => {
        if (step.station_name) {
          stationMap.set(step.station_name, step.station_name); // ใช้ station_name เป็นทั้ง id และ name
        }
      });
    });

    if (stationMap.size === 0) return FALLBACK_STATIONS;

    return Array.from(stationMap.values()).map(name => ({ id: name, name }));
  }, [catalog]);

  // State สำหรับ Custom Stations (เก็บลง LocalStorage เพื่อให้สลับหน้าแล้วไม่หาย)
  const [customStations, setCustomStations] = useState<{id: string, name: string}[]>(() => {
    try {
      const saved = localStorage.getItem('mes_custom_stations');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem('mes_custom_stations', JSON.stringify(customStations));
  }, [customStations]);

  // รวม Station ทั้งหมด (จาก API/Fallback + ที่ User แอดเอง)
  const allStations = useMemo(() => {
    return [...stationOptions, ...customStations];
  }, [stationOptions, customStations]);

  // State สำหรับ Templates
  const [templates, setTemplates] = useState<SequenceTemplate[]>(() => {
    try {
      const saved = localStorage.getItem('mes_sequence_templates');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem('mes_sequence_templates', JSON.stringify(templates));
  }, [templates]);

  // ก้าวที่ 1: เก็บข้อมูล Sequence ทั้งหมดไว้ใน State
  const [steps, setSteps] = useState<OperationStep[]>([
    {
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
      stationId: stationOptions[0]?.id || FALLBACK_STATIONS[0].id,
      seconds: '',
    },
  ]);
  // State สำหรับ Drag and Drop: เก็บ ID ของ step ที่กำลังลาก
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [draggableRowId, setDraggableRowId] = useState<string | null>(null); // State สำหรับเปิด/ปิดการลากเฉพาะจุด

  // State สำหรับฟอร์มส่งข้อมูล (เตรียมไว้สำหรับก้าวที่ 4)
  const [serialNumber, setSerialNumber] = useState('');
  const [globalResult, setGlobalResult] = useState('PASS');

  // --- React Query Client สำหรับ Invalidate ---
  const queryClient = useQueryClient();

  // --- ฟังก์ชันจัดการ State ---

  // ก้าวที่ 3: ปุ่ม "เพิ่ม step"
  function addStep() {
    const newStep: OperationStep = {
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(), // สร้าง ID ไม่ซ้ำ
      stationId: stationOptions[0]?.id || FALLBACK_STATIONS[0].id, // ค่าเริ่มต้น
      seconds: '',
    };
    // ใช้ Spread Operator (...) เอาของเดิมมากาง แล้วต่อท้ายด้วยของใหม่ (กฎ Immutable)
    setSteps([...steps, newStep]);
  }

  // ก้าวที่ 4: ปุ่ม "ลบ step"
  function removeStep(idToRemove: string) {
    // ใช้ filter กรองเอาเฉพาะตัวที่ id ไม่ตรงกับตัวที่จะลบ (ไม่ต้องมานั่ง reindex แบบ JS เดิมเลย!)
    setSteps(steps.filter((step) => step.id !== idToRemove));
  }

  // ก้าวที่ 5: แก้ไขข้อมูลใน step (Controlled Input)
  function updateStep(idToUpdate: string, field: keyof OperationStep, value: any) {
    setSteps(
      steps.map((step) => {
        if (step.id === idToUpdate) {
          return { ...step, [field]: value }; // คืนค่า object ตัวใหม่ที่มีการแก้ฟิลด์นั้นๆ
        }
        return step;
      })
    );
  }

  // --- ฟังก์ชันสำหรับ Add/Delete Custom Station ---
  function handleAddNewStation(stepId: string) {
    const newName = window.prompt('Enter new custom station name:');
    if (newName && newName.trim()) {
      const newId = `C_${Date.now()}`;
      const newStation = { id: newId, name: newName.trim() };
      setCustomStations([...customStations, newStation]);
      updateStep(stepId, 'stationId', newId);
    }
  }

  function deleteCustomStation(stationId: string) {
    if (window.confirm('ยืนยันการลบ Station ที่สร้างเองนี้ใช่หรือไม่?')) {
      setCustomStations(customStations.filter(s => s.id !== stationId));
      // เปลี่ยน step ที่เคยเลือก custom station นี้ให้กลับเป็นค่าเริ่มต้น
      setSteps(steps.map(s => s.stationId === stationId ? { ...s, stationId: stationOptions[0]?.id || FALLBACK_STATIONS[0].id } : s));
    }
  }

  // --- ฟังก์ชันสำหรับ Drag and Drop ---

  function handleDragStart(e: React.DragEvent<HTMLDivElement>, id: string) {
    setDraggedItemId(id);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>, id: string) {
    e.preventDefault(); // ต้องมี เพื่อให้ onDrop ทำงานได้
    if (id !== dragOverId) {
      setDragOverId(id);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>, targetId: string) {
    e.preventDefault();
    if (draggedItemId === null || draggedItemId === targetId) return;

    const draggedIndex = steps.findIndex((step) => step.id === draggedItemId);
    const targetIndex = steps.findIndex((step) => step.id === targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const newSteps = [...steps];
    const [draggedItem] = newSteps.splice(draggedIndex, 1);
    newSteps.splice(targetIndex, 0, draggedItem);
    setSteps(newSteps);
    handleDragEnd();
  }

  function handleDragEnd() {
    setDraggedItemId(null);
    setDragOverId(null);
    setDraggableRowId(null);
  }

  const resetForm = () => {
    setSerialNumber('');
    setSteps([
      {
        id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
        stationId: stationOptions[0]?.id || FALLBACK_STATIONS[0].id,
        seconds: '',
      },
    ]);
  };

  // --- ฟังก์ชันสำหรับ Template ---
  function handleSaveTemplate() {
    const name = window.prompt('Enter preset name to save current setup:');
    if (name && name.trim()) {
      const newTemplate: SequenceTemplate = {
        id: `TPL_${Date.now()}`,
        name: name.trim(),
        steps: steps.map(s => ({ stationId: s.stationId, seconds: s.seconds }))
      };
      setTemplates([...templates, newTemplate]);
    }
  }

  function handleLoadTemplate(templateId: string) {
    const tpl = templates.find(t => t.id === templateId);
    if (tpl) {
      if (steps.some(s => s.seconds !== '') && !window.confirm('การโหลด Preset จะทำการลบทับข้อมูลที่คุณกำลังพิมพ์อยู่ทั้งหมด ยืนยันหรือไม่?')) {
        return;
      }
      setSteps(tpl.steps.map((s, idx) => ({ id: `step_${Date.now()}_${idx}`, stationId: s.stationId, seconds: s.seconds })));
    }
  }

  function handleDeleteTemplate(templateId: string) {
    if (window.confirm('ยืนยันการลบ Preset นี้ทิ้งใช่หรือไม่?')) {
      setTemplates(templates.filter(t => t.id !== templateId));
    }
  }

  // --- ฟังก์ชันสำหรับการส่งข้อมูล (Record) ก้าวที่ 4 & 5 ---
  const recordMutation = useMutation({
    mutationFn: async () => {
      if (!serialNumber.trim()) throw new Error('Serial Number is required.');
      if (steps.some((step) => !step.stationId || String(step.seconds).trim() === '')) {
        throw new Error('All steps must have a station and a valid cycle time.');
      }

      // จำลองการโหลดให้ดูสมจริงนิดนึง (0.5 วินาที)
      await new Promise(resolve => setTimeout(resolve, 500));

      // รวมข้อมูล Cycle Time และข้อความ Sequence
      const totalSec = steps.reduce((sum, step) => sum + (Number(step.seconds) || 0), 0);
      const sequenceStr = steps.map(s => {
        const stationName = allStations.find(opt => opt.id === s.stationId)?.name || s.stationId;
        return `${stationName}(${s.seconds}s)`;
      }).join(' → ');

      // --- ก้าวที่ 4: ส่งข้อมูลเข้า API ของ MES จริง ---
      try {
        for (const step of steps) {
          const stationName = allStations.find(opt => opt.id === step.stationId)?.name || step.stationId;
          
          // 1. ยิง Scan-In (สแกนเข้าสถานี)
          await api.post('/routing/scan-in', {
            woId: 1, // <-- Work Order ID เบื้องต้นใส่ 1 ไปก่อนตามที่ระบบมี
            unit_sn: serialNumber.trim(),
            station_name: stationName
          });

          // 2. ยิง Scan-Out (สแกนออกสถานี พร้อมผลลัพธ์)
          await api.post('/routing/scan-out', {
            woId: 1,
            unit_sn: serialNumber.trim(),
            station_name: stationName,
            status: globalResult // PASS หรือ FAIL
          });
        }
      } catch (err) {
        console.warn("⚠️ Backend is not ready or returned an error. Falling back to Mock LocalStorage.", err);
      }

      // (ทางเลือก) บันทึกลง LocalStorage เผื่อเอาไว้โชว์เป็นประวัติหน้าเว็บเราเองด้วย
      addLocalHistory({
        ts: new Date().toLocaleString('en-GB', { hour12: false }).replace(',', ''),
        serial: serialNumber.trim(),
        sequence: sequenceStr,
        result: globalResult,
        totalSec: totalSec
      });
    },
    onSuccess: () => {
      alert('Process recorded successfully!');
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['routing-history'] });
    },
    onError: (error: Error) => {
      alert(`Failed to record process: ${error.message}`);
    },
  });

  // --- ฟังก์ชันคำนวณ ---

  // ก้าวที่ 6: โชว์ Total Cycle Time รวม
  const totalSeconds = steps.reduce((sum, step) => sum + (Number(step.seconds) || 0), 0);
  const formatTime = (totalSec: number) => {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return m > 0 ? `${m} Min ${s} Sec` : `${s} Sec`;
  };

  return (
    <div className="panel stack-lg" style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div className="mes-module-head">
        <span className="mes-module-code">M06</span>
        <div>
          <h2 className="panel__title">Manufacturing Sequence Builder</h2>
          <p className="panel__subtitle">Record Routing Process Log (API Connected)</p>
        </div>
      </div>

      {/* ส่วนกรอกข้อมูล SN */}
      <div className="filters-grid" style={{ alignItems: 'flex-end', marginBottom: '15px' }}>
        <label className="field">
          <span>Serial Number:</span>
          <input type="text" value={serialNumber} onChange={e => setSerialNumber(e.target.value)} placeholder="Enter SN..." required />
        </label>
      </div>

      {/* ส่วนจัดการ Preset */}
      <div style={{ marginBottom: '15px', display: 'flex', gap: '10px', alignItems: 'center', background: 'var(--bg-panel)', padding: '15px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
        <strong style={{ fontSize: '0.9rem', color: 'var(--text-muted)', minWidth: '80px' }}>⚙️ Presets:</strong>
        <button type="button" className="btn secondary" onClick={handleSaveTemplate} disabled={steps.length === 0}>
          💾 Save as Preset
        </button>
        {templates.length > 0 && (
          <div style={{ width: '250px' }}>
            <TemplateSelect 
              templates={templates} 
              onLoad={handleLoadTemplate} 
              onDelete={handleDeleteTemplate} 
            />
          </div>
        )}
      </div>

      {/* บริเวณกล่องใส่ Sequence */}
      <div style={{ background: '#f8f9fa', padding: '20px', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
        {isCatalogLoading ? (
          <div style={{ textAlign: 'center', color: '#7f8c8d', padding: '20px 0' }}>กำลังโหลดรายชื่อ Station จาก Server... ⏳</div>
        ) : (
          <>
            {/* ย้ายปุ่ม Add Operation Step มาไว้ด้านบนซ้าย */}
            <div style={{ marginBottom: '15px', display: 'flex', justifyContent: 'flex-start' }}>
              <button type="button" className="btn" onClick={addStep} style={{ background: '#3498db', color: '#ffffff', border: 'none' }}>
                + Add Operation Step
              </button>
            </div>

            {steps.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#7f8c8d', fontStyle: 'italic', padding: '20px 0' }}>
                ⚠️ No operational steps configured. Please click the button above to add routing steps.
              </div>
            ) : (
              <div className="stack">
                {/* ก้าวที่ 2: Map ข้อมูล State ออกมาเป็น UI */}
                {steps.map((step, index) => (
                  <div 
                    key={step.id} 
                    draggable={draggableRowId === step.id}
                    onDragStart={(e) => handleDragStart(e, step.id)}
                    onDragOver={(e) => handleDragOver(e, step.id)}
                    onDragLeave={() => setDragOverId(null)}
                    onDrop={(e) => handleDrop(e, step.id)}
                    onDragEnd={handleDragEnd}
                    style={{ 
                      display: 'flex', alignItems: 'center', gap: '15px', padding: '10px', borderRadius: '4px', borderLeft: '4px solid #3498db',
                      opacity: draggedItemId === step.id ? 0.5 : 1,
                      background: dragOverId === step.id && draggedItemId !== step.id ? '#e0f2fe' : 'white',
                      boxShadow: dragOverId === step.id && draggedItemId !== step.id ? '0 0 0 2px #3b82f6' : '0 1px 3px rgba(0,0,0,0.05)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div 
                        style={{ cursor: 'grab', color: '#94a3b8', padding: '5px' }}
                        onMouseEnter={() => setDraggableRowId(step.id)}
                        onMouseLeave={() => setDraggableRowId(null)}
                      >☰</div>
                      <div style={{ background: '#3498db', color: 'white', padding: '4px 10px', borderRadius: '20px', fontSize: '14px', fontWeight: 'bold', minWidth: '70px', textAlign: 'center' }}>
                        Step {index + 1}
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', flexGrow: 1, gap: '5px' }}>
                      <CustomStationSelect
                        value={step.stationId}
                        options={allStations}
                        customStationIds={customStations.map(s => s.id)}
                        onChange={(newId) => updateStep(step.id, 'stationId', newId)}
                        onAddNew={() => handleAddNewStation(step.id)}
                        onDeleteCustom={deleteCustomStation}
                      />
                    </div>

                    <input 
                      type="number" 
                      min="0"
                      placeholder="Time (Sec)" 
                      style={{ width: '120px', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                      value={step.seconds}
                      onChange={(e) => updateStep(step.id, 'seconds', e.target.value)}
                    />

                    <div style={{ display: 'flex', gap: '5px' }}>
                      <button className="btn danger" onClick={() => removeStep(step.id)}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        </div>

        {/* แถบสรุปเวลา */}
      <div style={{ padding: '15px', background: '#e0f2fe', borderRadius: '6px', border: '1px solid #bae6fd', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 'bold', color: '#0369a1' }}>Total Cycle Time:</span>
        <strong style={{ fontSize: '1.25rem', color: '#0284c7' }}>{formatTime(totalSeconds)}</strong>
      </div>

      {/* ส่วนกรอกข้อมูลหลัก (ย้ายมาไว้ล่างสุด) */}
      <div style={{ marginTop: '1.5rem', display: 'flex', gap: '10px', alignItems: 'center', background: 'var(--bg-panel)', padding: '15px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
        <strong style={{ fontSize: '0.9rem', color: 'var(--text-muted)', minWidth: '150px' }}>📋 Global Flow Result:</strong>
        <ResultSelect value={globalResult} onChange={setGlobalResult} />
      </div>

      {/* ปุ่มบันทึก */}
      <div style={{ marginTop: '20px' }}>
        <button
          type="button"
          className="btn"
          onClick={() => recordMutation.mutate()}
          style={{ width: '100%', padding: '15px', fontSize: '16px', background: '#27ae60' }}
          disabled={!serialNumber || steps.length === 0 || recordMutation.isPending}
        >
          {recordMutation.isPending ? 'Recording...' : '💾 Record Routing Process Log'}
        </button>
      </div>

    </div>
  );
}