import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { NotFoundPage } from '../NotFoundPage';

describe('NotFoundPage', () => {
  it('renders English-only 404 copy and a link back to the dashboard', () => {
    render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><NotFoundPage /></MemoryRouter>);
    expect(screen.getByText('404 — Page Not Found')).toBeInTheDocument();
    expect(screen.getByText(/this page may have moved/i)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Back to Dashboard/i });
    expect(link).toHaveAttribute('href', '/dashboard');
  });
});
