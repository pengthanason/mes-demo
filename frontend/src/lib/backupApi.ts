import { useQuery } from '@tanstack/react-query';
import api, { getAccessToken } from './api';
import { API_BASE_URL } from './config';

export type BackupSummary = {
  tables: string[];
  skipped: string[];
  row_counts: Record<string, number>;
  total_rows: number;
  includes_users: boolean;
};

export function useBackupSummary() {
  return useQuery<BackupSummary>({
    queryKey: ['backup', 'summary'],
    queryFn: async () => {
      const res = await api.get('/backup/summary');
      if (res.status >= 400 || res.status === 0) {
        throw new Error((res.data as any)?.message || 'โหลดข้อมูลไม่สำเร็จ');
      }
      return (res.data as any).data as BackupSummary;
    },
    staleTime: 30_000,
  });
}

// ชื่อไฟล์เริ่มต้น: Backup_MES-2026-07-30 (ใช้วันที่เครื่องผู้ใช้ = เวลาไทย)
export function defaultBackupBase(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `Backup_MES-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * ดาวน์โหลดไฟล์ backup ลงเครื่อง
 * ใช้ fetch + blob (ไม่ใช่ <a href>) เพราะต้องแนบ Authorization header ไปด้วย
 * — ลิงก์ธรรมดาแนบ header ไม่ได้ จะโดน 401
 * @param filename ชื่อไฟล์ที่ผู้ใช้ตั้งเองจากป๊อปอัพ (ไม่ส่ง = ใช้ชื่อที่ server ตั้งมา)
 */
export async function downloadBackup(format: 'json' | 'sql', filename?: string): Promise<{ ok: boolean; error?: string; filename?: string }> {
  const token = getAccessToken();
  const url = `${API_BASE_URL || ''}/api/backup/export?format=${format}`;
  try {
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      let msg = `ดาวน์โหลดไม่สำเร็จ (${res.status})`;
      try { const j = await res.json(); if (j?.message) msg = j.message; } catch { /* ไม่ใช่ JSON */ }
      return { ok: false, error: msg };
    }
    // ชื่อไฟล์: ใช้ที่ผู้ใช้ตั้งก่อน → ถ้าไม่ส่งมา ใช้ Content-Disposition ที่ server ตั้งให้
    let name = filename && filename.trim();
    if (!name) {
      const cd = res.headers.get('content-disposition') || '';
      const m = /filename="([^"]+)"/.exec(cd);
      name = m ? m[1] : `${defaultBackupBase()}.${format}`;
    }

    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
    return { ok: true, filename: name };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'เชื่อมต่อไม่สำเร็จ' };
  }
}
