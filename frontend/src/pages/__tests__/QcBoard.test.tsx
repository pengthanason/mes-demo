import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import QcBoard from '../quality/index.jsx';
import { useQcHistory } from '../../lib/recordsApi';
import { useIsViewer } from '../../lib/useMockStore';

// #51 #37: mock hooks → คุม state · QC Board ดึงจาก useQcHistory (/api/qc/history)
vi.mock('../../lib/recordsApi', () => ({
  useQcHistory: vi.fn(),
  useQcCreate: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('../../lib/useMockStore', () => ({ useIsViewer: vi.fn(() => false) }));
vi.mock('../../lib/toast', () => ({ showToast: vi.fn() }));

const ROW = { sn: 'SN-001', woNumber: 'WO-1', partNo: 'PCB-A100', status: 'PASS', station: 'ICT', updatedAt: '2026-07-01T08:00:00Z' };

beforeEach(() => {
  vi.mocked(useQcHistory).mockReturnValue({ data: [ROW], isLoading: false, isError: false } as any);
  vi.mocked(useIsViewer).mockReturnValue(false);
});

describe('QcBoard (#51)', () => {
  it('render พร้อมข้อมูลจริง → เห็นตาราง Unit Status + serial', () => {
    render(<QcBoard />);
    expect(screen.getByText('Unit Status (latest)')).toBeInTheDocument();
    expect(screen.getByText('SN-001')).toBeInTheDocument();
  });

  it('fail-soft: ไม่มีข้อมูล/endpoint ยังไม่มา → ไม่ crash แสดง empty', () => {
    vi.mocked(useQcHistory).mockReturnValue({ data: undefined, isLoading: false, isError: false } as any);
    render(<QcBoard />);
    expect(screen.getByText('No units yet.')).toBeInTheDocument();
  });

  it('viewer → ไม่โชว์ปุ่มส่งผล (read-only)', () => {
    vi.mocked(useIsViewer).mockReturnValue(true);
    render(<QcBoard />);
    // viewer เห็นข้อความ read-only
    expect(screen.getByText(/Viewer mode/i)).toBeInTheDocument();
  });
});
