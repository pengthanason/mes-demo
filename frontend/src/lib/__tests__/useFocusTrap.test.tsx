import { useRef } from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import { describe, it, expect, beforeAll } from 'vitest';
import { useFocusTrap } from '../useFocusTrap';

// jsdom ไม่มี layout engine จริง — offsetParent เป็น null เสมอ (ต่างจาก browser จริงที่ null เฉพาะ
// element ที่ซ่อนอยู่) ทำให้ hook กรอง element ที่มองเห็นได้ทิ้งหมดในเทสต์ — stub ให้เหมือนมองเห็นได้เสมอ
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get() { return document.body; },
  });
});

function Harness({ active }: { active: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(active, containerRef);
  return (
    <div>
      <button>Outside</button>
      <div ref={containerRef}>
        <button>First</button>
        <button>Second</button>
        <button>Last</button>
      </div>
    </div>
  );
}

describe('useFocusTrap', () => {
  it('wraps Tab from the last focusable element back to the first', () => {
    render(<Harness active />);
    screen.getByText('Last').focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByText('First'));
  });

  it('wraps Shift+Tab from the first focusable element back to the last', () => {
    render(<Harness active />);
    screen.getByText('First').focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByText('Last'));
  });

  it('redirects focus into the container if Tab is pressed while focus is outside it', () => {
    render(<Harness active />);
    screen.getByText('Outside').focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByText('First'));
  });

  it('does not trap Tab when inactive', () => {
    render(<Harness active={false} />);
    screen.getByText('Last').focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    // ไม่ active → ไม่มี handler ดัก ไม่มีการเปลี่ยน focus เอง (jsdom เองก็ไม่ auto-advance ตาม Tab)
    expect(document.activeElement).toBe(screen.getByText('Last'));
  });

  it('restores focus to the previously-focused element when the trap deactivates', () => {
    const { rerender } = render(<Harness active={false} />);
    const outside = screen.getByText('Outside');
    outside.focus();
    rerender(<Harness active />);
    screen.getByText('First').focus();
    rerender(<Harness active={false} />);
    expect(document.activeElement).toBe(outside);
  });

  it('restores focus to the previously-focused element on unmount', () => {
    const outside = document.createElement('button');
    outside.textContent = 'PageButton';
    document.body.appendChild(outside);
    outside.focus();
    const { unmount } = render(<Harness active />);
    screen.getByText('First').focus();
    unmount();
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
});
