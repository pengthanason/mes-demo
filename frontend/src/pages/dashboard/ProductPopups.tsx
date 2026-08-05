import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { usePpImage, usePpImageSave, PP_STATUS_LABEL, ppYield, type PpProject } from '../../lib/ppApi';
import { showToast } from '../../lib/toast';
import { useEscapeKey } from '../../lib/useEscapeKey';
import { useFocusTrap } from '../../lib/useFocusTrap';
import { STATUS_STYLE, StatusBadge, statusView, EditHistory, PROCESS_STEPS } from '../../components/ppParts';

// ย่อรูปก่อนเก็บ (max 1000px, JPEG 0.85) → ไฟล์เล็ก เก็บ DB/โหลดเร็ว ไม่ว่าไฟล์ต้นทางใหญ่แค่ไหน
function downscaleImage(file: File, maxSize: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read failed'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('decode failed'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSize || height > maxSize) { const s = maxSize / Math.max(width, height); width = Math.round(width * s); height = Math.round(height * s); }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('no ctx'));
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height);   // กันพื้นโปร่งใส (PNG) กลายเป็นดำตอนแปลง JPEG
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// ป๊อปอัพขยายรูปใหญ่ (Lightbox Modal) — สามารถซูมเข้า/ออก (+/-), ลากย้ายตำแหน่ง (Pan/Drag), และ Reset ได้
function ImageLightboxModal({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const posStartRef = useRef({ x: 0, y: 0 });

  const zoomIn = () => setScale(s => Math.min(10, Number((s + 0.5).toFixed(1))));
  const zoomOut = () => setScale(s => {
    const next = Math.max(1, Number((s - 0.5).toFixed(1)));
    if (next === 1) setPosition({ x: 0, y: 0 });
    return next;
  });
  const resetZoom = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    posStartRef.current = { ...position };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPosition({
      x: posStartRef.current.x + dx,
      y: posStartRef.current.y + dy,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  // เทียบเท่า mouse pan สำหรับแท็บเล็ต/มือถือ (นิ้วเดียว) — เดิมมีแค่ mouse event เลื่อนรูปที่ซูมค้างด้วยนิ้วไม่ได้เลย
  const handleTouchStart = (e: React.TouchEvent) => {
    if (scale <= 1 || e.touches.length !== 1) return;
    const t = e.touches[0];
    setIsDragging(true);
    dragStartRef.current = { x: t.clientX, y: t.clientY };
    posStartRef.current = { ...position };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - dragStartRef.current.x;
    const dy = t.clientY - dragStartRef.current.y;
    setPosition({
      x: posStartRef.current.x + dx,
      y: posStartRef.current.y + dy,
    });
  };

  const handleTouchEnd = () => setIsDragging(false);

  const handleWheel = (e: React.WheelEvent) => {
    if (e.deltaY < 0) {
      zoomIn();
    } else {
      zoomOut();
    }
  };

  const modalRef = useRef<HTMLDivElement>(null);
  useEscapeKey(true, onClose);
  useFocusTrap(true, modalRef);

  return createPortal(
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        background: 'rgba(15, 23, 42, 0.88)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Image viewer"
        style={{
          position: 'relative',
          width: '90vw',
          height: '85vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Header Toolbar — แถบเครื่องมือซูม/ควบคุม */}
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: 10,
            // จอแคบ (มือถือ/แท็บเล็ต) — เดิมไม่ตั้ง left/right เลย ปุ่ม 7 ตัวในแถวเดียวล้นออกนอก 90vw ได้
            // ล็อกกลางจอด้วย left+translateX แทนพึ่ง static position + จำกัดความกว้าง + ห่อบรรทัดถ้าไม่พอ
            left: '50%',
            transform: 'translateX(-50%)',
            maxWidth: 'calc(100vw - 16px)',
            zIndex: 2010,
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: 10,
            background: 'rgba(15, 23, 42, 0.85)',
            padding: '8px 16px',
            borderRadius: 999,
            border: '1px solid rgba(255, 255, 255, 0.15)',
            boxShadow: '0 10px 25px rgba(0,0,0,0.4)',
            cursor: 'default',
          }}
        >
          <span style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 700, minWidth: 85 }}>
            🔍 {Math.round(scale * 100)}%
          </span>
          <div style={{ height: 16, width: 1, background: 'rgba(255,255,255,0.2)' }} />
          <button
            type="button"
            className="btn secondary"
            onClick={zoomOut}
            disabled={scale <= 1}
            title="Zoom Out (-)"
            style={{ padding: '4px 12px', fontSize: '0.9rem', fontWeight: 800, minWidth: 36 }}
          >
            -
          </button>
          <button
            type="button"
            className="btn secondary"
            onClick={zoomIn}
            disabled={scale >= 10}
            title="Zoom In (+)"
            style={{ padding: '4px 12px', fontSize: '0.9rem', fontWeight: 800, minWidth: 36 }}
          >
            +
          </button>
          <button
            type="button"
            className="btn secondary"
            onClick={resetZoom}
            title="Reset Zoom"
            style={{ padding: '4px 12px', fontSize: '0.8rem' }}
          >
            🔄 Reset
          </button>
          <div style={{ height: 16, width: 1, background: 'rgba(255,255,255,0.2)' }} />
          <button
            type="button"
            className="btn danger"
            onClick={onClose}
            title="Close (Esc)"
            style={{ padding: '4px 14px', fontSize: '0.85rem' }}
          >
            ✕ Close
          </button>
        </div>

        {/* Viewing Window — พื้นที่แสดงรูปที่ซูมและจับลากย้ายได้ */}
        <div
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onWheel={handleWheel}
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
            userSelect: 'none',
          }}
        >
          <img
            src={src}
            alt={alt}
            draggable={false}
            onClick={e => e.stopPropagation()}
            style={{
              maxHeight: '100%',
              maxWidth: '100%',
              objectFit: 'contain',
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
              transition: isDragging ? 'none' : 'transform 0.15s ease-out',
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
              borderRadius: 8,
              cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'pointer',
            }}
          />
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: 12,
            color: 'rgba(255,255,255,0.7)',
            fontSize: '0.78rem',
            textAlign: 'center',
            pointerEvents: 'none',
          }}
        >
          💡 Press +/- or scroll to zoom · once zoomed, drag (or touch and drag) to pan the image
        </div>
      </div>
    </div>,
    document.body
  );
}

// กล่องรูปสินค้าใน popup — คลิกเพื่อแนบไฟล์ · โหลด/บันทึกผ่าน endpoint /image (optimistic)
function ProductImageBox({ p }: { p: PpProject }) {
  const { data: image, isLoading } = usePpImage(p.id);
  const save = usePpImageSave();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);

  const setLocal = (img: string | null) => qc.setQueryData(['pp-image', p.id], img);   // optimistic
  const pick = async (file: File) => {
    if (!file.type.startsWith('image/')) { showToast('Please choose an image file', 'error'); return; }
    setBusy(true);
    try {
      const dataUrl = await downscaleImage(file, 1000, 0.85);
      setLocal(dataUrl);
      save.mutate({ id: p.id, image: dataUrl }, {
        onSuccess: () => showToast('Image attached', 'success'),
        onError: (e: any) => { showToast(e?.message || 'Save failed', 'error'); void qc.invalidateQueries({ queryKey: ['pp-image', p.id] }); },
      });
    } catch { showToast('Cannot read this image', 'error'); }
    finally { setBusy(false); }
  };
  const remove = () => {
    setLocal(null);
    save.mutate({ id: p.id, image: null }, { onSuccess: () => showToast('Image removed', 'info'), onError: (e: any) => { showToast(e?.message || 'Failed', 'error'); void qc.invalidateQueries({ queryKey: ['pp-image', p.id] }); } });
  };
  return (
    <div style={{ marginTop: 14 }}>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = ''; }} />
      {image ? (
        <div style={{ position: 'relative' }}>
          <div
            onClick={() => setShowLightbox(true)}
            title="Click to enlarge image"
            style={{
              position: 'relative',
              cursor: 'pointer',
              borderRadius: 10,
              overflow: 'hidden',
              border: '1px solid var(--border-color)',
              background: '#f8fafc',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <img src={image} alt={p.product_pn || 'product'} style={{ display: 'block', width: '100%', maxHeight: 340, objectFit: 'contain' }} />
            <span
              style={{
                position: 'absolute',
                bottom: 10,
                left: 10,
                background: 'rgba(15, 23, 42, 0.75)',
                color: '#fff',
                fontSize: '0.75rem',
                fontWeight: 600,
                padding: '4px 12px',
                borderRadius: 999,
                backdropFilter: 'blur(4px)',
              }}
            >
              🔍 Click to view fullscreen & zoom
            </span>
          </div>

          <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6, zIndex: 12 }}>
            <button type="button" className="btn secondary" style={{ padding: '3px 10px', fontSize: '0.75rem' }} disabled={busy} onClick={() => inputRef.current?.click()}>Change</button>
            <button type="button" className="btn danger" style={{ padding: '3px 10px', fontSize: '0.75rem' }} disabled={busy} onClick={remove}>Remove</button>
          </div>

          {showLightbox && (
            <ImageLightboxModal
              src={image}
              alt={p.product_pn || 'product'}
              onClose={() => setShowLightbox(false)}
            />
          )}
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy || isLoading}
          onMouseEnter={e => { if (busy || isLoading) return; e.currentTarget.style.borderColor = 'var(--brand)'; e.currentTarget.style.background = '#f0fdf4'; e.currentTarget.style.color = 'var(--brand)'; e.currentTarget.style.boxShadow = '0 6px 18px rgba(46,125,79,0.14)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.background = 'linear-gradient(135deg,#f8fafc,#eef2f7)'; e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
          style={{ width: '100%', height: 190, borderRadius: 10, border: '2px dashed #cbd5e1', background: 'linear-gradient(135deg,#f8fafc,#eef2f7)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 9, color: '#94a3b8', cursor: 'pointer', font: 'inherit', transition: 'all 0.15s' }}>
          <span style={{ fontSize: 38, lineHeight: 1 }}>{busy ? '⏳' : '🖼️'}</span>
          <span style={{ fontSize: '0.95rem', fontWeight: 700 }}>{busy ? 'Uploading…' : isLoading ? 'Loading…' : 'Attach a product image'}</span>
          {!busy && !isLoading && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 14px', borderRadius: 999, background: 'var(--brand)', color: '#fff', fontSize: '0.82rem', fontWeight: 700, boxShadow: '0 2px 6px rgba(46,125,79,0.25)' }}>📎 Choose file</span>
          )}
          <span style={{ fontSize: '0.72rem' }}>or click anywhere in this box · PNG / JPG · auto-resized</span>
        </button>
      )}
    </div>
  );
}

/* ── Popup รายละเอียดสินค้า — คลิก Product P/N ในตาราง → รูป (แนบไฟล์ได้) + ข้อมูลทั้งหมดของรายการ ── */
export function ProductDetailModal({ p, onClose }: { p: PpProject; onClose: () => void }) {
  const modalRef = useRef<HTMLDivElement>(null);
  useEscapeKey(true, onClose);
  useFocusTrap(true, modalRef);
  const y = ppYield(p);
  const fmtD = (v: string | null | undefined) => { if (!v) return '—'; const d = new Date(String(v).slice(0, 10) + 'T00:00:00'); return isNaN(+d) ? String(v) : d.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' }); };
  const val = (v: any) => (v === null || v === undefined || v === '' ? '—' : v);
  const groups: { title: string; items: [string, React.ReactNode][] }[] = [
    { title: '📋 Job Info', items: [
      ['Customer', val(p.customer)], ['Qty', p.qty ? p.qty.toLocaleString() : '—'], ['Week (WK)', val(p.wk)], ['Date record', fmtD(p.date_record)],
      ['WO', val(p.work_order)], ['Owner', val(p.syn_requestor)],
    ] },
    { title: '👤 Responsible', items: [
      ['PD PIC', val(p.pd_pic)], ['PIC Responsible', val(p.pic_responsible)], ['CAP / day', p.target_per_day || '—'],
    ] },
    { title: '📅 Schedule', items: [
      ['PD Start', fmtD(p.pd_start_date)], ['PD Finish', fmtD(p.pd_finish_date)], ['Expected', fmtD(p.expected_date)], ['Revised date', fmtD(p.revised_date)],
      ['CAP / day', p.target_per_day || '—'], ['Store Received', fmtD(p.store_received)], ['QA Finish', fmtD(p.qa_finish_date)], ['QA Test Rate', val(p.qa_test_rate)],
      ['QA Status', p.qa_status ? <StatusBadge status={p.qa_status} /> : '—'],
    ] },
    { title: '📊 Output', items: [
      ['Produce', (p.produce || 0).toLocaleString()], ['Balance', ((p.qty || 0) - (p.produce || 0)).toLocaleString()],
      ['Total FG', <span style={{ color: '#16a34a', fontWeight: 700 }}>{p.total_ok || 0}</span>],
      ['Total NG', <span style={{ color: '#dc2626', fontWeight: 700 }}>{p.total_ng || 0}</span>],
      ['Yield', y == null ? '—' : <span style={{ fontWeight: 700, color: y >= 95 ? '#16a34a' : y >= 80 ? '#d97706' : '#dc2626' }}>{y.toFixed(2)}%</span>],
    ] },
  ];
  const sectionTitle: React.CSSProperties = { fontSize: '0.8rem', fontWeight: 700, color: '#475569', margin: '16px 0 8px' };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div ref={modalRef} className="modal" role="dialog" aria-modal="true" aria-label={`Product details: ${p.product_pn || p.model || ''}`} onClick={e => e.stopPropagation()} style={{ width: 'min(100%, 680px)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', wordBreak: 'break-word' }}>{p.product_pn || '—'}</div>
            <div style={{ fontSize: '0.9rem', color: '#64748b', marginTop: 2 }}>{[p.model, p.customer].filter(Boolean).join(' · ') || '—'}</div>
          </div>
          <button type="button" aria-label="Close" className="btn secondary" style={{ padding: '4px 12px', flexShrink: 0 }} onClick={onClose}>✕</button>
        </div>
        <div style={{ marginTop: 10 }}><StatusBadge status={statusView(p).colorKey} label={statusView(p).label} /></div>
        {/* รูปสินค้า — คลิกเพื่อแนบไฟล์ (เก็บถาวรผ่าน endpoint /image) */}
        <ProductImageBox p={p} />
        {groups.map(g => (
          <div key={g.title}>
            <div style={sectionTitle}>{g.title}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px 16px' }}>
              {g.items.map(([label, value], i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <span style={{ fontSize: '0.68rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</span>
                  <span style={{ fontSize: '0.9rem', color: '#1e293b', fontWeight: 500, wordBreak: 'break-word' }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div style={sectionTitle}>🔧 Process (status per step)</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {PROCESS_STEPS.map(s => { const v = (p as any)[s.key] as string; const stl = v ? STATUS_STYLE[v] : null; return (
            <span key={s.key as string} style={{ padding: '3px 11px', borderRadius: 999, fontSize: '0.78rem', fontWeight: 600, border: `1px solid ${stl ? stl.border : '#e5e9f0'}`, background: stl ? stl.bg : '#f8fafc', color: stl ? stl.text : '#94a3b8' }}>{s.label}{v ? `: ${PP_STATUS_LABEL[v] ?? v}` : ''}</span>
          ); })}
        </div>
        {p.special_request && (<><div style={sectionTitle}>⭐ Special request</div><div style={{ fontSize: '0.9rem', color: '#475569', whiteSpace: 'pre-wrap' }}>{p.special_request}</div></>)}
        {p.remark && (<><div style={sectionTitle}>📝 Remark</div><div style={{ fontSize: '0.9rem', color: '#475569', whiteSpace: 'pre-wrap' }}>{p.remark}</div></>)}
        <div style={sectionTitle}>🕑 Edit history</div>
        <EditHistory id={p.id} />
        <div style={{ marginTop: 18, paddingTop: 10, borderTop: '1px solid #eef2f7', fontSize: '0.72rem', color: '#94a3b8', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {p.created_at && <span>Created: {fmtD(p.created_at)}</span>}
          {p.updated_at && <span>Updated: {fmtD(p.updated_at)}</span>}
        </div>
      </div>
    </div>
  );
}
