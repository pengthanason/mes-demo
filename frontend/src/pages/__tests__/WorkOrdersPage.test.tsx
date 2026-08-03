import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkOrdersPage } from '../WorkOrdersPage';

const mocks = vi.hoisted(() => ({
  useWoBoard: vi.fn(),
  useIsViewer: vi.fn(),
  createMock: { mutate: vi.fn(), isPending: false },
}));

vi.mock('../../lib/woApi', () => ({
  useWoBoard: mocks.useWoBoard,
  useWoCreate: () => mocks.createMock,
}));
vi.mock('../../lib/useMockStore', () => ({ useIsViewer: mocks.useIsViewer }));

const WOS = [
  { woId: 'WO-001', productCode: 'PCB-A100', customer: 'Toyota TH', qty: 200, qtyGood: 198, actualQty: 200, expectedDate: '2026-06-11', currentStep: 'CLOSED', station: 'PACK' },
  { woId: 'WO-002', productCode: 'MOT-4500', customer: 'Denso Corp', qty: 500, qtyGood: 250, actualQty: 255, expectedDate: '2026-06-12', currentStep: 'RUNNING', station: 'SMT' },
  { woId: 'WO-003', productCode: 'BMS-9903', customer: 'LG Energy', qty: 120, qtyGood: 0, actualQty: 0, expectedDate: '2026-06-30', currentStep: 'DRAFT', station: '' },
];

const renderPage = () => render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><WorkOrdersPage /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useIsViewer.mockReturnValue(false);
  mocks.useWoBoard.mockReturnValue({ data: WOS, isLoading: false, isError: false, refetch: vi.fn() });
});

describe('WorkOrdersPage search/filter', () => {
  it('renders all WOs with no filter applied', () => {
    renderPage();
    expect(screen.getByText('WO-001')).toBeInTheDocument();
    expect(screen.getByText('WO-002')).toBeInTheDocument();
    expect(screen.getByText('WO-003')).toBeInTheDocument();
  });

  it('search box filters by product code', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByPlaceholderText('WO No / Product / Customer...'), 'MOT-4500');
    expect(screen.getByText('WO-002')).toBeInTheDocument();
    expect(screen.queryByText('WO-001')).toBeNull();
    expect(screen.queryByText('WO-003')).toBeNull();
  });

  it('search box filters by customer name (case-insensitive)', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByPlaceholderText('WO No / Product / Customer...'), 'denso');
    expect(screen.getByText('WO-002')).toBeInTheDocument();
    expect(screen.queryByText('WO-001')).toBeNull();
  });

  it('status dropdown filters to only the selected status', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.selectOptions(screen.getByDisplayValue('All statuses'), 'DRAFT');
    expect(screen.getByText('WO-003')).toBeInTheDocument();
    expect(screen.queryByText('WO-001')).toBeNull();
    expect(screen.queryByText('WO-002')).toBeNull();
  });

  it('shows a filtered empty-state message when search matches nothing', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByPlaceholderText('WO No / Product / Customer...'), 'no-such-wo-xyz');
    expect(screen.getByText('No Work Orders match the search/filter')).toBeInTheDocument();
  });
});
