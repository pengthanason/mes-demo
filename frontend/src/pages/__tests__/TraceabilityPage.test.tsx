import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TraceabilityPage } from '../TraceabilityPage';
import { useSerialTrace } from '../../lib/traceApi';

// #50 #37: mock hooks → คุม state · หน้า Routing/Scan history ต่อ /api/routing/history/:sn
vi.mock('../../lib/traceApi', () => ({
  useSerialTrace: vi.fn(),
  useSerialList: vi.fn(() => ({ data: [] })),
  useBoxList: vi.fn(() => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() })),
  useBoxDetail: vi.fn(() => ({ data: undefined, isLoading: false, isError: false })),
  useDailyReport: vi.fn(() => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() })),
}));

const TRACE = {
  serial: 'SN-1', product: '', wo: 'WO-1', box: '',
  steps: [{ step: 'ICT · Out', status: 'PASS' as const, at: '2026-07-01T08:00:00Z', operator: 'wichai', station: 'ICT', action: 'SCAN_OUT' as const }],
};

const renderPage = () => render(
  <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><TraceabilityPage /></MemoryRouter>
);

beforeEach(() => {
  vi.mocked(useSerialTrace).mockReturnValue({ data: undefined, isLoading: false, isError: false, error: null } as any);
});

describe('TraceabilityPage (#50)', () => {
  it('render → เห็นหัวข้อ + ช่องค้นหา serial (ไม่ crash ตอนยังไม่ค้น)', () => {
    renderPage();
    expect(screen.getByText('Traceability — Track Item History')).toBeInTheDocument();
    expect(screen.getByLabelText('Search Serial Number')).toBeInTheDocument();
  });

  it('ค้น serial → โชว์ timeline จากข้อมูลจริง', () => {
    vi.mocked(useSerialTrace).mockReturnValue({ data: TRACE, isLoading: false, isError: false, error: null } as any);
    renderPage();
    fireEvent.change(screen.getByLabelText('Search Serial Number'), { target: { value: 'SN-1' } });
    fireEvent.click(screen.getByRole('button', { name: /Search$/ }));
    expect(screen.getByText('1. ICT · Out')).toBeInTheDocument();
  });

  it('fail-soft: serial ไม่พบ / error → โชว์ error ไม่ crash', () => {
    vi.mocked(useSerialTrace).mockReturnValue({ data: undefined, isLoading: false, isError: true, error: new Error('Serial not found') } as any);
    renderPage();
    fireEvent.change(screen.getByLabelText('Search Serial Number'), { target: { value: 'SN-X' } });
    fireEvent.click(screen.getByRole('button', { name: /Search$/ }));
    expect(screen.getByText(/Serial not found/i)).toBeInTheDocument();
  });
});
