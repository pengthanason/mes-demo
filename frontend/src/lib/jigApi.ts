import { useQuery } from '@tanstack/react-query';
import api from './api';

export interface JigProject {
  id: number;
  projectCode: string;
  name: string;
  jigId: string;
  isActive: boolean;
  total: number;
  passCount: number;
  failCount: number;
  passRate: number;
}

export interface JigRecord {
  id: number;
  projectCode: string;
  serial: string;
  result: 'PASS' | 'FAIL';
  testedAt: string;
  voltage: number | null;
  currentMa: number | null;
  tempC: number | null;
  failParam: string | null;
  notes: string | null;
}

export interface JigTimeseries {
  date: string;
  total: number;
  passCount: number;
  failCount: number;
  passRate: number;
}

function mapProject(r: any): JigProject {
  return {
    id: r.id, projectCode: r.project_code, name: r.name, jigId: r.jig_id, isActive: r.is_active,
    total: Number(r.total) || 0, passCount: Number(r.pass_count) || 0,
    failCount: Number(r.fail_count) || 0, passRate: Number(r.pass_rate) || 0,
  };
}

function mapRecord(r: any): JigRecord {
  return {
    id: r.id, projectCode: r.project_code, serial: r.serial, result: r.result,
    testedAt: r.tested_at, voltage: r.voltage ?? null, currentMa: r.current_ma ?? null,
    tempC: r.temp_c ?? null, failParam: r.fail_param ?? null, notes: r.notes ?? null,
  };
}

function mapTs(r: any): JigTimeseries {
  return { date: r.date, total: Number(r.total), passCount: Number(r.pass_count), failCount: Number(r.fail_count), passRate: Number(r.pass_rate) };
}

export function useJigProjects() {
  return useQuery({
    queryKey: ['jig-projects'],
    queryFn: async (): Promise<JigProject[]> => {
      const res = await api.get('/jig/projects');
      return ((res.data as any)?.data ?? []).map(mapProject);
    },
  });
}

export function useJigProject(code: string | undefined) {
  return useQuery({
    queryKey: ['jig-project', code],
    enabled: !!code,
    queryFn: async (): Promise<JigProject> => {
      const res = await api.get(`/jig/projects/${code}`);
      if (res.status === 404) throw new Error('project not found');
      return mapProject((res.data as any)?.data);
    },
  });
}

export function useJigRecords(code: string | undefined, resultFilter?: 'PASS' | 'FAIL' | '') {
  return useQuery({
    queryKey: ['jig-records', code, resultFilter],
    enabled: !!code,
    queryFn: async (): Promise<JigRecord[]> => {
      const params: any = { limit: 100 };
      if (resultFilter) params.result = resultFilter;
      const res = await api.get(`/jig/projects/${code}/records`, { params });
      return ((res.data as any)?.data ?? []).map(mapRecord);
    },
  });
}

export function useJigTimeseries(code: string | undefined) {
  return useQuery({
    queryKey: ['jig-timeseries', code],
    enabled: !!code,
    queryFn: async (): Promise<JigTimeseries[]> => {
      const res = await api.get(`/jig/projects/${code}/timeseries`);
      return ((res.data as any)?.data ?? []).map(mapTs);
    },
  });
}
