import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StationMonitorWidget } from '../StationMonitorWidget';
import { useStationMonitor } from '../../lib/stationApi';

// #52 #37: mock hook → คุม state (data / error / empty) ไม่ยิง network
vi.mock('../../lib/stationApi', () => ({ useStationMonitor: vi.fn() }));

const ST = {
  routeCode: 'WO-1', stationName: 'SMT', unitsInStation: 10, unitsReadyNext: 9,
  unitsReworkRequired: 1, unitsCompleted: 9, scanInCount: 10, scanOutPassCount: 9,
  scanOutFailCount: 1, lastScanAt: '2026-07-01T08:00:00Z',
};

beforeEach(() => {
  vi.mocked(useStationMonitor).mockReturnValue({ data: [ST], isLoading: false, isError: false, isFetching: false } as any);
});

describe('StationMonitorWidget (#52)', () => {
  it('render พร้อมข้อมูลจริง → เห็นหัวข้อ + ชื่อสถานี', () => {
    render(<StationMonitorWidget />);
    expect(screen.getByText('Station Status')).toBeInTheDocument();
    expect(screen.getByText('SMT')).toBeInTheDocument();
  });

  it('fail-soft: API error → โชว์ error ไม่ crash (หัวข้อยังอยู่)', () => {
    vi.mocked(useStationMonitor).mockReturnValue({ data: [], isLoading: false, isError: true, isFetching: false } as any);
    render(<StationMonitorWidget />);
    expect(screen.getByText(/Cannot reach the station monitor/i)).toBeInTheDocument();
    expect(screen.getByText('Station Status')).toBeInTheDocument();
  });

  it('fail-soft: ไม่มีข้อมูล → แสดง empty state', () => {
    vi.mocked(useStationMonitor).mockReturnValue({ data: [], isLoading: false, isError: false, isFetching: false } as any);
    render(<StationMonitorWidget />);
    expect(screen.getByText('No station activity.')).toBeInTheDocument();
  });
});
