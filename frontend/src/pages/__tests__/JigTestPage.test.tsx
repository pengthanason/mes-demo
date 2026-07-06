import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JigTestPage } from '../JigTestPage';
import { useJigProjects } from '../../lib/jigApi';
import { useIsViewer } from '../../lib/useMockStore';

// mock data-hooks → ไม่ยิง network จริง ควบคุม state ได้
vi.mock('../../lib/jigApi', () => ({
  useJigProjects: vi.fn(),
  useJigProjectCreate: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useJigProjectDelete: () => ({ mutate: vi.fn() }),
}));
vi.mock('../../lib/useMockStore', () => ({ useIsViewer: vi.fn(() => false) }));

const P = { id: 1, name: 'PCB-A100 Test', projectCode: 'PCB-A100', jigId: 'JIG-1', isActive: true, total: 100, passCount: 95, failCount: 5, passRate: 95, testType: 'ICT' };

const renderPage = () => render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><JigTestPage /></MemoryRouter>);

beforeEach(() => {
  vi.mocked(useJigProjects).mockReturnValue({ data: [P], isLoading: false, error: null } as any);
  vi.mocked(useIsViewer).mockReturnValue(false);
});

describe('JigTestPage', () => {
  it('render แล้วเห็นรายการ project + หัวข้อ ICT นับถูก', () => {
    renderPage();
    expect(screen.getByText('PCB-A100 Test')).toBeInTheDocument();
    expect(screen.getByText('ICT Test (1)')).toBeInTheDocument();
  });

  it('pass rate bar แสดงสัดส่วนถูกต้อง (passCount/total × 100)', () => {
    renderPage();
    // ตรวจตรรกะ: 95/100*100 = 95
    expect(Math.round((P.passCount / P.total) * 100)).toBe(P.passRate);
    // ตรวจ DOM: PassRateBar แสดง "95.0%"
    expect(screen.getByText('95.0%')).toBeInTheDocument();
  });

  it('API error → แสดง error state ไม่ crash', () => {
    vi.mocked(useJigProjects).mockReturnValue({ data: [], isLoading: false, error: new Error('boom') } as any);
    renderPage();
    expect(screen.getByText('เกิดข้อผิดพลาด')).toBeInTheDocument();
    // ไม่ crash → หัวข้อหน้ายังอยู่
    expect(screen.getByText('Jig Test')).toBeInTheDocument();
  });

  it('viewer ไม่เห็นปุ่ม "+ เพิ่มโปรเจกต์"', () => {
    vi.mocked(useIsViewer).mockReturnValue(true);
    renderPage();
    expect(screen.queryByText('+ เพิ่มโปรเจกต์')).toBeNull();
  });
});
