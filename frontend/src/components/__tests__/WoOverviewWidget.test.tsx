import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WoOverviewWidget } from '../WoOverviewWidget';
import { useWoOverview } from '../../lib/planningApi';

// #54 #37: mock hook → คุม state (data / error / empty)
vi.mock('../../lib/planningApi', () => ({ useWoOverview: vi.fn() }));

const WO = {
  id: 1, woNumber: 'WO-2026-001', partNo: 'PCB-A100', qtyTarget: 500, qtyStarted: 480,
  qtyGood: 470, status: 'IN_PROGRESS', yieldPct: 94, openedAt: '2026-07-01T08:00:00Z', closedAt: null,
};

beforeEach(() => {
  vi.mocked(useWoOverview).mockReturnValue({
    data: { workOrders: [WO], summary: [{ status: 'IN_PROGRESS', count: 1 }] },
    isLoading: false, isError: false,
  } as any);
});

describe('WoOverviewWidget (#54)', () => {
  it('render พร้อมข้อมูลจริง → เห็นหัวข้อ + WO + product + yield', () => {
    render(<WoOverviewWidget />);
    expect(screen.getByText('Work Orders')).toBeInTheDocument();
    expect(screen.getByText('WO-2026-001')).toBeInTheDocument();
    expect(screen.getByText('PCB-A100')).toBeInTheDocument();
    expect(screen.getByText('94.0%')).toBeInTheDocument();
  });

  it('fail-soft: API error → โชว์ error ไม่ crash', () => {
    vi.mocked(useWoOverview).mockReturnValue({ data: undefined, isLoading: false, isError: true } as any);
    render(<WoOverviewWidget />);
    expect(screen.getByText(/Cannot reach the work-order overview/i)).toBeInTheDocument();
    expect(screen.getByText('Work Orders')).toBeInTheDocument();
  });

  it('fail-soft: ไม่มี WO → empty state', () => {
    vi.mocked(useWoOverview).mockReturnValue({ data: { workOrders: [], summary: [] }, isLoading: false, isError: false } as any);
    render(<WoOverviewWidget />);
    expect(screen.getByText('No work orders.')).toBeInTheDocument();
  });
});
