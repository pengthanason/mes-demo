import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { StatusStepper } from '../StatusStepper';
import { buildSteps, type StepItem } from '../../lib/woLifecycle';

const steps: StepItem[] = [
  { key: 'a', label: 'Alpha',   state: 'done',     color: '#111' },
  { key: 'b', label: 'Bravo',   state: 'current',  color: '#222' },
  { key: 'c', label: 'Charlie', state: 'upcoming', color: '#333' },
];

describe('StatusStepper', () => {
  it('step ที่ complete (done) แสดง checkmark ✓', () => {
    const { container } = render(<StatusStepper steps={steps} />);
    const done = container.querySelector('.stepper-item.done');
    expect(done).toBeTruthy();
    expect(done!.querySelector('.step-marker')!.textContent).toBe('✓');
  });

  it('step active (current) ถูก highlight ที่ step ที่ถูกต้อง', () => {
    const { container } = render(<StatusStepper steps={steps} />);
    const current = container.querySelector('.stepper-item.current');
    expect(current).toBeTruthy();
    expect(current!.querySelector('.step-label')!.textContent).toBe('Bravo');
    // done กับ upcoming ต้องไม่ถูกจับเป็น current
    expect(container.querySelectorAll('.stepper-item.current').length).toBe(1);
  });

  it('step ที่ยังไม่ถึง (upcoming) แสดงเลขลำดับ ไม่ใช่ ✓', () => {
    const { container } = render(<StatusStepper steps={steps} />);
    const marker = container.querySelector('.stepper-item.upcoming .step-marker');
    expect(marker!.textContent).toBe('3');
    expect(marker!.textContent).not.toBe('✓');
  });

  it('buildSteps() คำนวณ state ตาม currentStep ถูกต้อง (before=done, ปัจจุบัน=current, after=upcoming)', () => {
    const s = buildSteps('RUNNING'); // index 3 ใน WO_LIFECYCLE
    expect(s[0].state).toBe('done');
    expect(s[2].state).toBe('done');
    expect(s[3].key).toBe('RUNNING');
    expect(s[3].state).toBe('current');
    expect(s[4].state).toBe('upcoming');
  });

  it('mini mode: marker ว่าง + มี title (tooltip) = label', () => {
    const { container } = render(<StatusStepper steps={steps} size="mini" />);
    const li = container.querySelector('.stepper-item')!;
    expect(li.getAttribute('title')).toBe('Alpha');
    expect(container.querySelector('.step-marker')!.textContent).toBe('');
  });
});
