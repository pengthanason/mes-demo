import { useQuery } from '@tanstack/react-query';
import api from './api';

// #52 FE-CONNECT-5: Station Status Live Widget
//   GET /api/mes/stations/monitor?route_code=<optional>&lookback_hours=<optional>
//   → WIP ต่อสถานี (คำนวณสดทุกครั้งที่เรียก) · poll ทุก ~8 วิ แทน Node-RED/event-bus
export interface StationWip {
  routeCode: string;
  stationName: string;
  unitsInStation: number;
  unitsReadyNext: number;
  unitsReworkRequired: number;
  unitsCompleted: number;
  scanInCount: number;
  scanOutPassCount: number;
  scanOutFailCount: number;
  lastScanAt: string | null;
}

export function useStationMonitor(routeCode?: string) {
  return useQuery({
    queryKey: ['station-monitor', routeCode ?? ''],
    refetchInterval: 8000,               // live: ดึงซ้ำทุก 8 วิ
    refetchIntervalInBackground: false,
    queryFn: async (): Promise<StationWip[]> => {
      const res = await api.get('/mes/stations/monitor', routeCode ? { params: { route_code: routeCode } } : undefined);
      const rows: any[] = (res.data as any)?.data ?? (res.data as any)?.stations ?? [];
      return rows.map(r => ({
        routeCode:           r.route_code ?? '',
        stationName:         r.station_name ?? r.station ?? '—',
        unitsInStation:      Number(r.units_in_station ?? 0),
        unitsReadyNext:      Number(r.units_ready_next ?? 0),
        unitsReworkRequired: Number(r.units_rework_required ?? 0),
        unitsCompleted:      Number(r.units_completed ?? 0),
        scanInCount:         Number(r.scan_in_count ?? 0),
        scanOutPassCount:    Number(r.scan_out_pass_count ?? 0),
        scanOutFailCount:    Number(r.scan_out_fail_count ?? 0),
        lastScanAt:          r.last_scan_at ?? null,
      }));
    },
  });
}
