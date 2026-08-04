import React from 'react';

// ── โหลดหน้าแบบ lazy ให้ทนการ deploy ────────────────────────────────────────────
// ปัญหาที่แก้ (พบตอน QA gate 2026-08-03): พอเปิด code-splitting แล้ว แต่ละหน้าถูกแยกเป็น
// chunk ที่มี hash ในชื่อไฟล์ · เวลา deploy ใหม่ ชื่อไฟล์เปลี่ยน ⇒ คนที่ "เปิดหน้าเว็บค้างไว้"
// ยังถือ index เก่าอยู่ พอกดเข้าหน้าที่ยังไม่เคยโหลด เบราว์เซอร์จะไปขอ chunk เก่าที่หายไปแล้ว
// → 404 → React.lazy reject → ErrorBoundary ขึ้น "Something went wrong" ทั้งหน้า
// ทั้งที่ของจริงแค่ "เวอร์ชันหน้าเว็บเก่า" ไม่ใช่โค้ดพัง
//
// ทางแก้: chunk หาย = reload หน้าเดียวจบ (ได้ index ใหม่ + chunk ใหม่)
// กติกาที่ต้องระวัง 2 ข้อ:
//   1. reload ได้ครั้งเดียว — ถ้า reload แล้วยังโหลดไม่ได้ (เช่น เน็ตหลุด/ไฟล์หายจริง)
//      ต้องปล่อยให้ error โผล่ ห้ามวน reload ไม่สิ้นสุด
//   2. error ที่ "ไม่ใช่" chunk หาย (โค้ดในหน้านั้น throw ตอน import) ต้อง rethrow ทันที
//      ห้ามกลบด้วยการ reload — ไม่งั้นบั๊กจริงจะกลายเป็นหน้าเว็บกระพริบแล้วหายไปเงียบๆ
//
// 🔧 คู่กันฝั่ง deploy: ตอน docker cp bundle ใหม่ **อย่าลบ asset เก่าทันที** เก็บไว้อีก
//    1–2 วันให้ session ที่เปิดค้างหมดไปก่อน แล้วค่อยลบ (ตัวนี้เป็นตัวกันชั้นสุดท้าย)

const RELOAD_FLAG = 'syntech.mes.chunk_reloaded';

// ข้อความ error ของ "chunk โหลดไม่ได้" ต่างกันตามเบราว์เซอร์/บันเดิลเลอร์
const CHUNK_ERROR_RE = /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk|ChunkLoadError|Failed to fetch/i;

export function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return CHUNK_ERROR_RE.test(msg);
}

/** true = ควร reload หนึ่งครั้ง (และจดธงไว้แล้ว) · false = ให้ error ลอยไปหา ErrorBoundary */
export function shouldReloadForChunkError(err: unknown, storage: Pick<Storage, 'getItem' | 'setItem'>): boolean {
  if (!isChunkLoadError(err)) return false;          // โค้ดพังจริง → ห้ามกลบ
  try {
    if (storage.getItem(RELOAD_FLAG)) return false;  // reload ไปแล้วยังไม่หาย → หยุด ไม่วนซ้ำ
    storage.setItem(RELOAD_FLAG, String(Date.now()));
  } catch {
    return false;                                    // storage ใช้ไม่ได้ (private mode) → อย่าเสี่ยงวน reload
  }
  return true;
}

export function clearChunkReloadFlag(storage: Pick<Storage, 'removeItem'>): void {
  try { storage.removeItem(RELOAD_FLAG); } catch { /* ignore */ }
}

/** ใช้แทน React.lazy ทุกหน้า — ทำงานเหมือนกันเป๊ะ ต่างแค่จัดการ chunk หายหลัง deploy */
export function lazyPage<T extends React.ComponentType<any>>(
  loader: () => Promise<{ default: T }>
): React.LazyExoticComponent<T> {
  return React.lazy(() =>
    loader()
      .then((mod) => {
        clearChunkReloadFlag(sessionStorage);   // โหลดผ่านแล้ว → เปิดสิทธิ์ reload ให้ deploy รอบหน้า
        return mod;
      })
      .catch((err) => {
        if (!shouldReloadForChunkError(err, sessionStorage)) throw err;
        window.location.reload();
        // ค้าง promise ไว้ระหว่างรอ reload — ให้ Suspense โชว์ spinner ต่อ ไม่ใช่โชว์ error แวบนึง
        return new Promise<{ default: T }>(() => {});
      })
  );
}
