import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdminPanelPage } from '../AdminPanelPage';

// spies/hook mocks (hoisted เพื่อให้ vi.mock factory ใช้ได้)
const mocks = vi.hoisted(() => ({
  useAdminUsers: vi.fn(),
  useMockAuth: vi.fn(),
  createMock: { mutateAsync: vi.fn(), isPending: false },
  updateMock: { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false },
  deleteMock: { mutate: vi.fn() },
}));

vi.mock('../../lib/adminApi', () => ({
  useAdminUsers: mocks.useAdminUsers,
  useAdminUserCreate: () => mocks.createMock,
  useAdminUserUpdate: () => mocks.updateMock,
  useAdminUserDelete: () => mocks.deleteMock,
  useAuditLogs: () => ({ data: [], isLoading: false }),
}));
vi.mock('../../lib/useMockStore', () => ({ useMockAuth: mocks.useMockAuth }));

const USER = { id: 1, username: 'somchai', fullName: 'สมชาย ใจดี', role: 'MEMBER', isActive: true, permissions: [], createdAt: '2026-01-01T00:00:00Z' };

const renderPage = () => render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><AdminPanelPage /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createMock.isPending = false;
  mocks.createMock.mutateAsync.mockResolvedValue({});
  mocks.useAdminUsers.mockReturnValue({ data: [USER], isLoading: false });
  mocks.useMockAuth.mockReturnValue({ role: 'admin', isLoggedIn: true, username: 'admin' });
});

describe('AdminPanelPage', () => {
  it('render แล้วเห็นรายชื่อผู้ใช้ (user list)', () => {
    renderPage();
    expect(screen.getByText('somchai')).toBeInTheDocument();
    expect(screen.getByText('สมชาย ใจดี')).toBeInTheDocument();
  });

  it('กดปุ่ม "+ เพิ่มผู้ใช้" → ฟอร์มสร้างผู้ใช้โผล่', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(screen.queryByText('เพิ่มผู้ใช้ใหม่')).toBeNull();
    await user.click(screen.getByRole('button', { name: '+ เพิ่มผู้ใช้' }));
    expect(screen.getByText('เพิ่มผู้ใช้ใหม่')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('เช่น somchai')).toBeInTheDocument();
  });

  it('ปุ่มสร้างถูกปิดถ้ารหัสผ่านสั้นกว่า 4 ตัว (validation)', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: '+ เพิ่มผู้ใช้' }));
    const submit = screen.getByRole('button', { name: 'สร้างผู้ใช้' }) as HTMLButtonElement;
    expect(submit).toBeDisabled();                          // รหัสว่าง → ปิด
    await user.type(screen.getByPlaceholderText('*******'), '12');
    expect(submit).toBeDisabled();                          // 2 ตัว → ยังปิด
    await user.type(screen.getByPlaceholderText('*******'), '34');
    expect(submit).toBeEnabled();                           // ครบ 4 ตัว → เปิด
  });

  it('กรอกครบ + submit → เรียก create API ด้วยข้อมูลที่กรอก', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: '+ เพิ่มผู้ใช้' }));
    await user.type(screen.getByPlaceholderText('เช่น somchai'), 'newbie');
    await user.type(screen.getByPlaceholderText('สมชาย ใจดี'), 'น้องใหม่');
    await user.type(screen.getByPlaceholderText('*******'), '1234');
    await user.click(screen.getByRole('button', { name: 'สร้างผู้ใช้' }));
    expect(mocks.createMock.mutateAsync).toHaveBeenCalledTimes(1);
    expect(mocks.createMock.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ username: 'newbie', fullName: 'น้องใหม่', password: '1234' }));
  });

  it('กดลบ → ถาม confirm แล้วเรียก delete API ตาม id', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    await user.click(screen.getByRole('button', { name: 'ลบ' }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(mocks.deleteMock.mutate).toHaveBeenCalledWith(1);
    confirmSpy.mockRestore();
  });
});
