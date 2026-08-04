import { describe, it, expect, beforeEach } from 'vitest';
import { isChunkLoadError, shouldReloadForChunkError, clearChunkReloadFlag } from '../lazyPage';

// storage ปลอมแบบคุมได้ — เทสตรรกะ reload โดยไม่ต้องพึ่ง jsdom sessionStorage จริง
function fakeStorage(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return {
    store: m,
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
  };
}

// ข้อความจริงจากเบราว์เซอร์ต่างค่าย เวลา chunk หายหลัง deploy
const CHUNK_ERRORS = [
  new Error('Failed to fetch dynamically imported module: https://x/assets/DashboardPage-abc123.js'),  // Chrome
  new Error('error loading dynamically imported module'),                                              // Firefox
  new Error('Importing a module script failed.'),                                                      // Safari
  new Error('Loading chunk 42 failed.'),                                                               // webpack-style
  Object.assign(new Error('boom'), { name: 'ChunkLoadError' }),
];

describe('lazyPage — chunk หายหลัง deploy (QA followup 2026-08-03)', () => {
  let storage: ReturnType<typeof fakeStorage>;
  beforeEach(() => { storage = fakeStorage(); });

  it('รู้จัก error ของ chunk หาย ทุกเบราว์เซอร์', () => {
    for (const e of CHUNK_ERRORS) expect(isChunkLoadError(e)).toBe(true);
  });

  it('error อื่น (โค้ดในหน้าพังเอง) ไม่ใช่ chunk error — ต้องไม่ reload', () => {
    const real = new TypeError("Cannot read properties of undefined (reading 'map')");
    expect(isChunkLoadError(real)).toBe(false);
    expect(shouldReloadForChunkError(real, storage)).toBe(false);
    expect(storage.store.size).toBe(0);
  });

  it('chunk หายครั้งแรก → reload (และจดธงกันวนซ้ำ)', () => {
    expect(shouldReloadForChunkError(CHUNK_ERRORS[0], storage)).toBe(true);
    expect(storage.store.size).toBe(1);
  });

  it('🔑 chunk หายอีกหลัง reload → ต้องไม่ reload ซ้ำ (กันวนไม่สิ้นสุด) ให้ error โผล่', () => {
    expect(shouldReloadForChunkError(CHUNK_ERRORS[0], storage)).toBe(true);
    expect(shouldReloadForChunkError(CHUNK_ERRORS[0], storage)).toBe(false);
    expect(shouldReloadForChunkError(CHUNK_ERRORS[1], storage)).toBe(false);
  });

  it('โหลดผ่านแล้วล้างธง → deploy รอบหน้า reload ได้อีก', () => {
    shouldReloadForChunkError(CHUNK_ERRORS[0], storage);
    clearChunkReloadFlag(storage);
    expect(shouldReloadForChunkError(CHUNK_ERRORS[0], storage)).toBe(true);
  });

  it('storage ใช้ไม่ได้ (private mode) → ไม่ reload เลย ดีกว่าเสี่ยงวน', () => {
    const broken = { getItem: () => null, setItem: () => { throw new Error('denied'); } };
    expect(shouldReloadForChunkError(CHUNK_ERRORS[0], broken)).toBe(false);
  });
});
