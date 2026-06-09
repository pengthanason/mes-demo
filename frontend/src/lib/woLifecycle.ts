export type StepState = 'done' | 'current' | 'upcoming';

export type StepItem = { 
  key: string; 
  label: string; 
  state: StepState;
  color: string;
};

// ลำดับขั้นทั้งหมดของ WO
export const WO_LIFECYCLE = [
  { key: 'DRAFT',    label: 'ร่าง',           color: '#64748b' }, // เทาเข้ม
  { key: 'OPEN',     label: 'เปิดงาน',        color: '#3b82f6' }, // ฟ้า
  { key: 'READY',    label: 'พร้อมผลิต',      color: '#8b5cf6' }, // ม่วง
  { key: 'WAIT_FAI', label: 'รอตรวจชิ้นแรก',  color: '#f59e0b' }, // ส้ม
  { key: 'RUNNING',  label: 'กำลังผลิต',      color: '#0ea5e9' }, // ฟ้าสว่าง
  { key: 'CLOSED',   label: 'ปิดงาน',         color: '#10b981' }, // เขียว
];

// Helper: แปลง Current Step ให้เป็น Array ของ StepItem พร้อมบอก State
export function buildSteps(currentStep: string): StepItem[] {
  const currentIndex = WO_LIFECYCLE.findIndex(s => s.key === currentStep);
  
  return WO_LIFECYCLE.map((step, index) => {
    let state: StepState = 'upcoming'; // ค่าเริ่มต้นเป็นสีเทา (ยังไม่ถึง)
    if (currentIndex !== -1 && index < currentIndex) state = 'done';
    else if (currentIndex !== -1 && index === currentIndex) state = 'current';
    return { ...step, state };
  });
}