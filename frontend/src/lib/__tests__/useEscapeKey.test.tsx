import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useEscapeKey } from '../useEscapeKey';

function Harness({ active, onEscape }: { active: boolean; onEscape: () => void }) {
  useEscapeKey(active, onEscape);
  return <div>harness</div>;
}

describe('useEscapeKey', () => {
  it('calls onEscape when Escape is pressed while active', () => {
    const onEscape = vi.fn();
    render(<Harness active onEscape={onEscape} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('does not call onEscape for other keys', () => {
    const onEscape = vi.fn();
    render(<Harness active onEscape={onEscape} />);
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onEscape).not.toHaveBeenCalled();
  });

  it('does not call onEscape when inactive', () => {
    const onEscape = vi.fn();
    render(<Harness active={false} onEscape={onEscape} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onEscape).not.toHaveBeenCalled();
  });

  it('stops listening after unmount', () => {
    const onEscape = vi.fn();
    const { unmount } = render(<Harness active onEscape={onEscape} />);
    unmount();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onEscape).not.toHaveBeenCalled();
  });
});
