// แปลง error/สถานะจาก backend → ข้อความภาษาไทยที่ผู้ใช้เข้าใจ (แทน code/ข้อความดิบอังกฤษ)
// ใช้ได้ทั้งจาก response ของ api.ts ({ status, data }) และจาก Error ที่ throw มา

const BY_CODE: Record<string, string> = {
  AUTH_REQUIRED:         'ต้องเข้าสู่ระบบก่อน',
  AUTH_LOGIN_FAILED:     'เข้าสู่ระบบไม่สำเร็จ — ตรวจสอบ username/password',
  AUTH_MODE_HEADER_ONLY: 'ระบบตั้งค่า auth แบบ header — ล็อกอินวิธีนี้ไม่ได้',
  JWT_SECRET_NOT_READY:  'ระบบยังไม่พร้อม (JWT) — แจ้งผู้ดูแลระบบ',
  VALIDATION_ERROR:      'ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบ',
  NOT_FOUND:             'ไม่พบข้อมูลที่ต้องการ',
  FORBIDDEN:             'ไม่มีสิทธิ์ทำรายการนี้',
  RATE_LIMITED:          'ทำรายการถี่เกินไป กรุณารอสักครู่',
};

const BY_STATUS: Record<number, string> = {
  0:   'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจสอบอินเทอร์เน็ต',
  400: 'คำขอไม่ถูกต้อง กรุณาตรวจสอบข้อมูล',
  401: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่',
  403: 'ไม่มีสิทธิ์ทำรายการนี้',
  404: 'ไม่พบข้อมูลที่ต้องการ',
  409: 'ข้อมูลขัดแย้ง (อาจซ้ำกับที่มีอยู่แล้ว)',
  422: 'ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบ',
  429: 'ทำรายการถี่เกินไป กรุณารอสักครู่',
  500: 'เซิร์ฟเวอร์มีปัญหา กรุณาลองใหม่',
  502: 'เซิร์ฟเวอร์มีปัญหา กรุณาลองใหม่',
  503: 'ระบบไม่พร้อมให้บริการชั่วคราว',
};

const FALLBACK = 'เกิดข้อผิดพลาด กรุณาลองใหม่';
const hasThai = (s: string) => /[฀-๿]/.test(s);

// จาก response ของ api.ts: apiErrorMessage(res.status, res.data)
export function apiErrorMessage(status: number, data?: any): string {
  const code = data?.code;
  if (code && BY_CODE[code]) return BY_CODE[code];
  const msg = data?.message ?? data?.error;
  if (typeof msg === 'string' && hasThai(msg)) return msg;   // backend ส่งไทยมาแล้ว → ใช้เลย
  return BY_STATUS[status] ?? FALLBACK;
}

// จาก Error/unknown ที่ throw มา (เช่น catch ใน mutation)
export function toThaiMessage(err: unknown, fallback = FALLBACK): string {
  if (err && typeof err === 'object') {
    const e = err as any;
    const code = e.code ?? e?.response?.data?.code;
    if (code && BY_CODE[code]) return BY_CODE[code];
    const m = e.message ?? e?.response?.data?.message ?? e?.response?.data?.error;
    if (typeof m === 'string' && hasThai(m)) return m;
    const st = typeof e.status === 'number' ? e.status : e?.response?.status;
    if (typeof st === 'number' && BY_STATUS[st]) return BY_STATUS[st];
  }
  if (typeof err === 'string' && hasThai(err)) return err;
  return fallback;
}
