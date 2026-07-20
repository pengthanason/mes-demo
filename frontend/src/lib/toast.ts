export type ToastType = 'success' | 'error' | 'info';
export type ToastAction = { label: string; onClick: () => void };

// action = ปุ่มในตัว toast (เช่น "Undo") — onClick ส่งผ่าน CustomEvent detail ได้ (อยู่ใน memory ไม่ได้ serialize)
export function showToast(msg: string, type: ToastType = 'success', action?: ToastAction) {
  window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg, type, action } }));
}
