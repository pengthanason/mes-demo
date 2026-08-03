// ── mermaid flowchart + "AI" จัดหมวดอัตโนมัติ ──
// แยกจาก WorkflowBuilder.tsx เดิม — categorize ใช้ทั้งใน svgBuilders.ts (buildFlowSvg/buildGanttSvg)
// และใน WorkflowBuilder.tsx เอง (FORM_GROUPS) จึงแยกไฟล์ของตัวเองเพื่อไม่ให้ import วนกัน

import { type Step, fmtTime } from './workflowCore';

/* ── mermaid flowchart — สะท้อน disposition ต่อ checkpoint (rework/scrap/hold/back) ── */
export function toMermaid(steps: Step[]): string {
  if (!steps.length) return 'flowchart TD\n  START([Start]) --> DONE([End])';
  const L = ['flowchart TD', '  START([▶ Start line]):::se'];
  steps.forEach((s, i) => {
    const t = s.seconds !== '' ? `<br/>⏱ ${fmtTime(Number(s.seconds))}` : '';
    L.push(`  S${i}["${i + 1}. ${s.process}${t}"]:::${s.kind === 'checkpoint' ? 'chk' : 'proc'}`);
  });
  steps.forEach((s, i) => { if (s.kind === 'checkpoint') L.push(`  D${i}{"Pass?"}:::dec`); });
  L.push('  DONE([■ Done]):::se');
  L.push('  START --> S0');
  // spine + ทาง pass
  steps.forEach((s, i) => {
    const next = i < steps.length - 1 ? `S${i + 1}` : 'DONE';
    if (s.kind === 'checkpoint') { L.push(`  S${i} --> D${i}`); L.push(`  D${i} -->|"✓ Yes"| ${next}`); }
    else L.push(`  S${i} --> ${next}`);
  });
  // ทาง fail (ทุกโอกาส)
  steps.forEach((s, i) => {
    if (s.kind !== 'checkpoint') return;
    const fa = s.failAction || 'rework';
    const tIdx = s.backToId ? steps.findIndex(x => x.id === s.backToId) : -1;
    if (fa === 'back' && tIdx >= 0) {
      L.push(`  D${i} -.->|"✗ Go back"| S${tIdx}`);
    } else if (fa === 'scrap') {
      L.push(`  D${i} -->|"✗ No"| SC${i}["❌ SCRAP (NG)"]:::rw`);
    } else if (fa === 'hold') {
      L.push(`  D${i} -->|"✗ No"| HD${i}["⏸️ HOLD / MRB"]:::hd`);
    } else {
      L.push(`  D${i} -->|"✗ No"| RW${i}["🛠️ REWORK"]:::rw`);
      L.push(`  RW${i} --> F${i}{"Fixable?${Number(s.maxRetry) > 0 ? ` ≤${s.maxRetry}×` : ''}"}:::dec`);
      L.push(`  F${i} -.->|"✓ Yes, retry"| S${i}`);
      L.push(`  F${i} -->|"✗ No"| SC${i}["❌ SCRAP (NG)"]:::rw`);
    }
  });
  L.push('  classDef proc fill:#eef2ff,stroke:#6366f1,stroke-width:2px,color:#1e293b;');
  L.push('  classDef chk fill:#fffbeb,stroke:#d97706,stroke-width:2px,color:#1e293b;');
  L.push('  classDef dec fill:#fef9c3,stroke:#d97706,stroke-width:2px,color:#92400e;');
  L.push('  classDef se fill:#dcfce7,stroke:#16a34a,stroke-width:2px,color:#14532d;');
  L.push('  classDef rw fill:#fef2f2,stroke:#dc2626,color:#991b1b;');
  L.push('  classDef hd fill:#fffbeb,stroke:#d97706,color:#92400e;');
  return L.join('\n');
}

/* ── "AI" จัดหมวดอัตโนมัติ — อ่านชื่อกระบวนการแล้วแยก section เหมือนในฟอร์ม FM 05 ──
   ขั้นตรวจ/ซ่อม (ไม่มีคีย์เวิร์ดหมวด) จะสืบหมวดจากขั้นก่อนหน้า เพื่อให้อยู่กลุ่มเดียวกัน */
const CAT_RULES: { label: string; re: RegExp }[] = [
  { label: 'Receiving / Warehouse',     re: /รับวัตถุดิบ|วัตถุดิบ|คลังสินค้า|เบิกวัตถุดิบ|incoming|material|\bwh\b/i },
  { label: 'SMT (Surface Mount)',       re: /สกรีน|วางอุปกรณ์|หลอมตะกั่ว|reflow|solder ?paste|pick|แผ่นวงจร|แผงวงจร|\bspi\b|\bsmt\b|screen|print/i },
  { label: 'Soldering & Programming',   re: /บัดกรี|ลงโปรแกรม|โปรแกรม|art-?pi|หมายเลขบอร์ด|แยกแย|\btht\b|wave|หน่วยความจำ|program|board|flash|memory/i },
  { label: 'Assembly / Packing',        re: /ประกอบ|บรรจุ|กล่อง|assembl|pack|\bbox\b/i },
  { label: 'Finished Goods / Shipping', re: /สำเร็จรูป|จัดส่ง|เบิกงาน|\bstore\b|ship|\bfg\b|finished/i },
];
export function categorize(steps: { process: string }[]): string[] {
  const out: string[] = [];
  let last = '';
  steps.forEach(s => {
    const hit = CAT_RULES.find(r => r.re.test(s.process || ''));
    const c = hit ? hit.label : (last || 'Production');   // ไม่มีคีย์เวิร์ด → สืบหมวดจากขั้นก่อน
    out.push(c);
    last = c;
  });
  return out;
}
