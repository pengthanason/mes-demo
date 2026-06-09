import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { HistoryRow } from '../components/HistoryRow';
import api from '../lib/api';
import { getLocalHistory } from '../lib/localHistory';

export function RoutingHistoryPage() {
  // ก้าวที่ 3 - ดึงข้อมูล History จาก API จริง
  const {
    data: history = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['routing-history'],
    queryFn: async () => {
      // เปลี่ยนจาก LocalStorage เป็นดึงจาก API จริง
      // (ลองถามพี่เลี้ยงอีกทีว่าใช้ Endpoint ไหนนะครับ สมมติว่าเป็น /routing/history)
      try {
        const { data } = await api.get('/routing/history'); // <-- รอ Endpoint จริงจากพี่เลี้ยง
        return data || [];
      } catch (err) {
        // ถ้า API จริงยังไม่พร้อม ให้ดึง LocalHistory เดิมมาโชว์แก้ขัดไปก่อน
        return getLocalHistory();
      }
    },
  });

  return (
    <div className="mes-light-card">
      <div className="mes-module-head">
        <span className="mes-module-code">HIS</span>
        <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#1e293b' }}>Routing History</h2>
      </div>

      <div style={{ marginTop: '1.5rem', overflowX: 'auto' }}>
        {isLoading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Loading history... ⏳</div>
        ) : isError ? (
          <div className="notice err">Error fetching history: {error.message}</div>
        ) : history.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
            No production execution history found
          </div>
        ) : (
          /* ก้าวที่ 3 - โครงสร้างตารางและวนลูปข้อมูล */
          <table className="table table-readonly">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Serial</th>
                <th>Sequence</th>
                <th>Result</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row: any) => (
                /* 
                  ใช้ key ที่ unique จริงๆ แทนการใช้ index (i) 
                  เพื่อป้องกัน React จับคู่ Component ผิดพลาดเวลาตารางมีการเรียง สลับที่ หรือลบข้อมูล
                */
                <HistoryRow key={row.id || `${row.serial}-${row.ts}`} row={row} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}