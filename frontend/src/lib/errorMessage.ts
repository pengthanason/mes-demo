// แปลง error/สถานะจาก backend → ข้อความภาษาไทยที่ผู้ใช้เข้าใจ (แทน code/ข้อความดิบอังกฤษ)
// ใช้ได้ทั้งจาก response ของ api.ts ({ status, data }) และจาก Error ที่ throw มา

const BY_CODE: Record<string, string> = {
  AUTH_REQUIRED:         'Please sign in first',
  AUTH_LOGIN_FAILED:     'Login failed — check username/password',
  AUTH_MODE_HEADER_ONLY: 'Auth is configured as header mode — cannot log in this way',
  JWT_SECRET_NOT_READY:  'System not ready (JWT) — please contact the administrator',
  VALIDATION_ERROR:      'Invalid data, please check',
  NOT_FOUND:             'The requested data was not found',
  FORBIDDEN:             'You do not have permission for this action',
  RATE_LIMITED:          'Too many requests, please wait a moment',
};

const BY_STATUS: Record<number, string> = {
  0:   'Cannot connect to server — check your internet connection',
  400: 'Bad request, please check your data',
  401: 'Session expired, please sign in again',
  403: 'You do not have permission for this action',
  404: 'The requested data was not found',
  409: 'Data conflict (it may already exist)',
  422: 'Invalid data, please check',
  429: 'Too many requests, please wait a moment',
  500: 'Server error, please try again',
  502: 'Server error, please try again',
  503: 'Service temporarily unavailable',
};

const FALLBACK = 'An error occurred, please try again';
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
