import { render, fireEvent, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ComboBoxInput } from '../ComboBoxInput';

describe('ComboBoxInput', () => {
  it('does not open the suggestion panel when autoFocus triggers the initial focus', () => {
    render(<ComboBoxInput value="" onChange={vi.fn()} options={['Apple', 'Banana']} autoFocus placeholder="pick" />);
    expect(screen.queryByText('Apple')).not.toBeInTheDocument();
  });

  it('opens the suggestion panel on a real click after the suppressed autoFocus', () => {
    render(<ComboBoxInput value="" onChange={vi.fn()} options={['Apple', 'Banana']} autoFocus placeholder="pick" />);
    fireEvent.click(screen.getByPlaceholderText('pick'));
    expect(screen.getByText('Apple')).toBeInTheDocument();
  });

  it('opens the suggestion panel on focus when autoFocus is not set (unchanged prior behavior)', () => {
    render(<ComboBoxInput value="" onChange={vi.fn()} options={['Apple', 'Banana']} placeholder="pick" />);
    fireEvent.focus(screen.getByPlaceholderText('pick'));
    expect(screen.getByText('Apple')).toBeInTheDocument();
  });

  it('picking an option calls onChange with that value and closes the panel', () => {
    const onChange = vi.fn();
    render(<ComboBoxInput value="" onChange={onChange} options={['Apple', 'Banana']} placeholder="pick" />);
    fireEvent.focus(screen.getByPlaceholderText('pick'));
    fireEvent.mouseDown(screen.getByText('Banana'));
    expect(onChange).toHaveBeenCalledWith('Banana');
    expect(screen.queryByText('Apple')).not.toBeInTheDocument();
  });
});
