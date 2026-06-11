export type ToastType = 'success' | 'error' | 'info';

export function showToast(msg: string, type: ToastType = 'success') {
  window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg, type } }));
}
