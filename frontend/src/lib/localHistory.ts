// ไฟล์จำลองฐานข้อมูลด้วย LocalStorage

export type MockHistoryRecord = {
  ts: string;
  serial: string;
  sequence: string;
  result: string;
  totalSec: number;
};

const STORAGE_KEY = 'mes_mock_routing_history';

export function getLocalHistory(): MockHistoryRecord[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function addLocalHistory(record: MockHistoryRecord) {
  const current = getLocalHistory();
  // เอาข้อมูลใหม่ล่าสุดไปต่อไว้ข้างบนสุดของ Array
  const updated = [record, ...current]; 
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}