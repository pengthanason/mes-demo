import React from 'react';

// กำหนดโครงสร้างข้อมูล (TypeScript Interface) เพื่อให้เขียนโค้ดได้ง่ายและลดข้อผิดพลาด
export interface HistoryData {
  id?: string | number;
  ts: string;
  serial: string;
  sequence: string;
  result: string;
  totalSec: number;
}

export interface HistoryRowProps {
  row: HistoryData;
}

export function HistoryRow({ row }: HistoryRowProps) {
  // ก้าวที่ 5 - ฟังก์ชันสำหรับทำ Badge สี (PASS = เขียว, FAIL = แดง)
  const isPass = row.result.toUpperCase() === 'PASS';
  const badgeStyle = {
    backgroundColor: isPass ? '#dcfce7' : '#fee2e2',
    color: isPass ? '#166534' : '#991b1b',
    padding: '0.25rem 0.75rem',
    borderRadius: '999px',
    fontSize: '0.85rem',
    fontWeight: 'bold' as const,
    display: 'inline-block'
  };

  return (
    <tr>
      <td>{row.ts}</td>
      <td>{row.serial}</td>
      <td>{row.sequence}</td>
      <td><span style={badgeStyle}>{row.result}</span></td>
      <td>{row.totalSec}s</td>
    </tr>
  );
}