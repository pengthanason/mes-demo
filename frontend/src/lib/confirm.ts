// popup ยืนยัน (แทน window.confirm ของเบราว์เซอร์) — คืน Promise<boolean> · ใช้คู่กับ <ConfirmContainer/> ใน App
export type ConfirmOpts = { title?: string; confirmText?: string; cancelText?: string; danger?: boolean };

export function confirmDialog(message: string, opts: ConfirmOpts = {}): Promise<boolean> {
  return new Promise((resolve) => {
    window.dispatchEvent(new CustomEvent('app:confirm', { detail: { message, opts, resolve } }));
  });
}
