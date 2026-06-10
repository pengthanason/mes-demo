export type StepState = 'done' | 'current' | 'upcoming';

export type StepItem = { 
  key: string; 
  label: string; 
  state: StepState;
  color: string;
};

export const WO_LIFECYCLE = [
  { key: 'DRAFT',        label: 'Draft',       color: '#94a3b8' },
  { key: 'OPEN',         label: 'Released',    color: '#3b82f6' },
  { key: 'READY',        label: 'Kitted',      color: '#8b5cf6' },
  { key: 'RUNNING',      label: 'Running',     color: '#f59e0b' },
  { key: 'WAIT_FAI_QA',  label: 'FAI (QA)',    color: '#ef4444' },
  { key: 'WAIT_FAI_MGR', label: 'FAI (Mgr)',   color: '#dc2626' },
  { key: 'CLOSED',       label: 'Closed',      color: '#10b981' },
];

export function buildSteps(currentStep: string): StepItem[] {
  const currentIndex = WO_LIFECYCLE.findIndex(s => s.key === currentStep);
  
  return WO_LIFECYCLE.map((step, index) => {
    let state: StepState = 'upcoming';
    if (currentIndex !== -1 && index < currentIndex) state = 'done';
    else if (currentIndex !== -1 && index === currentIndex) state = 'current';
    return { ...step, state };
  });
}