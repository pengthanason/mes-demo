import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { GanttChart } from '../ppParts';
import type { PpProject } from '../../lib/ppApi';

// ── INC 2026-08-03 17:40 — Dashboard พังทั้งหน้า "Maximum call stack size exceeded" ────────
// ต้นตอ: WO 102026 มี revised_date = '0001-04-11' (ปีพิมพ์ตกใน <input type="date">)
//   → ช่วงของ Gantt = ปี 1 ถึงปีนี้ = 739,741 วัน
//   → Math.max(1, ...dayActive) spread argument 7.4 แสนตัว = RangeError
// เทสนี้ล็อกไว้ว่า: วันที่ปีหลุดช่วงต้องไม่ทำให้ component throw และต้องเตือนให้เห็น
// -----------------------------------------------------------------------------------------

const base: PpProject = {
  id: 4, pp_type: 'internal', status: 'DELAY', status_color: 'DELAY', wk: 32,
  date_record: '2026-08-03', product_pn: '1E7D25410002', model: 'Water Level Rice', customer: 'IS',
  qty: 32, produce: 30, syn_requestor: 'Satapon N.', work_order: '102026', wo_name: '', matl_coming: '',
  chk_man: false, chk_mac: false, chk_med: false, chk_mat: false, chk_env: false,
  pd_pcba: false, pd_bbas: false, pd_test: false, pd_modified: false, pd_rma: false, pd_prep: false,
  pd_start_date: '2026-06-03', pd_finish_date: null, target_per_day: 0,
  qa_test_rate: 'AQL 0.4', qa_finish_date: '2026-06-22', qa_status: '', store_received: '2026-06-22',
  expected_date: '2026-06-17', revised_date: null, bom_rec_date: null, done: false,
  pd_pic: 'Kiert', pic_responsible: '', team_member: 0, ok_per_day: 0, total_ng: 1, total_ok: 29,
  special_request: '',
  pc_prpo: 'DONE', pc_wait: 'DONE', pc_incoming: 'DONE', pc_smt: 'DONE',
  pc_thr: 'DONE', pc_test: 'ON_PROCESS', pc_bbas: 'DELAY', pc_packing: 'DELAY',
  process_log: [{ date: '2026-06-03', step: 'pc_prpo', status: 'DONE' }],
  remark: 'รอทดสอบ',
  st_pr_po: false, st_wait_mat: false, st_incoming: false, st_create_bo: false,
  st_test: false, st_rework: false, st_smt: false, st_thr: false, st_bbas: false,
  created_at: '2026-08-03T17:35:56+07:00', updated_at: '2026-08-03T17:36:57+07:00',
};

describe('GanttChart — วันที่ปีหลุดช่วง (INC 2026-08-03)', () => {
  it('revised_date = 0001-04-11 → render ได้ ไม่ throw RangeError', () => {
    // ของจริงตอนพัง: throw RangeError ตรงนี้ทันที
    expect(() => render(<GanttChart rows={[{ ...base, revised_date: '0001-04-11' }]} />)).not.toThrow();
  });

  it('revised_date = 0001-04-11 → ต้องเตือนให้เห็น ไม่ใช่เงียบ', () => {
    render(<GanttChart rows={[{ ...base, revised_date: '0001-04-11' }]} />);
    expect(screen.getByText(/have a date outside/i)).toBeInTheDocument();
    expect(screen.getByText(/102026/)).toBeInTheDocument();   // บอก WO ที่ต้องไปแก้
  });

  it('ปีมากเกินไป (9999) ก็ต้องกันเหมือนกัน', () => {
    expect(() => render(<GanttChart rows={[{ ...base, expected_date: '9999-01-01' }]} />)).not.toThrow();
    expect(screen.getByText(/have a date outside/i)).toBeInTheDocument();
  });

  it('วันที่ปกติ → ไม่ขึ้นคำเตือน', () => {
    render(<GanttChart rows={[{ ...base, revised_date: '2026-06-20' }]} />);
    expect(screen.queryByText(/have a date outside/i)).toBeNull();
    expect(screen.queryByText(/trimmed/i)).toBeNull();
  });
});
