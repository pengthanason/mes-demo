export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// เวลาแบบเข้าใจง่าย "เมื่อสักครู่ / 5 นาทีที่แล้ว / 2 ชม.ที่แล้ว / 3 วันที่แล้ว"
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 0) return fmtDateTime(iso);
  if (sec < 60) return 'เมื่อสักครู่';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} นาทีที่แล้ว`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ชม.ที่แล้ว`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} วันที่แล้ว`;
  return fmtDateTime(iso);
}

export function fmtNum(n: number | string | null | undefined, digits = 0): string {
  if (n === null || n === undefined || n === '') return '-';
  const num = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(num)) return '-';
  return num.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function normalizeText(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  return String(raw).trim();
}

export function parseNumber(raw: unknown, fallback = 0): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return fallback;
    const n = Number(trimmed);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}
