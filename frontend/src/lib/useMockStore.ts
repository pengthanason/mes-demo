import { useState, useEffect, useCallback } from 'react';
import { getAuth, getWoList, getObaRecords, getRoutingHistory, getQcRecords, getProductionReports } from './mockStore';
import type { AuthState, MockWO, ObaRecord, RoutingRecord, QcRecord, ProductionReport } from './mockStore';

// Auth stays synchronous (localStorage)
export function useMockAuth(): AuthState {
  const [value, setValue] = useState<AuthState>(() => getAuth());
  useEffect(() => {
    const update = () => setValue(getAuth());
    window.addEventListener('mockstore', update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener('mockstore', update);
      window.removeEventListener('storage', update);
    };
  }, []);
  return value;
}

// Generic async hook for Supabase-backed stores
function useAsyncStore<T>(fetcher: () => Promise<T>, initial: T): T {
  const [value, setValue] = useState<T>(initial);
  const fetch = useCallback(() => { fetcher().then(setValue); }, [fetcher]);

  useEffect(() => {
    fetch();
    window.addEventListener('mockstore', fetch);
    return () => window.removeEventListener('mockstore', fetch);
  }, [fetch]);

  return value;
}

export function useMockWoList(): MockWO[] {
  return useAsyncStore(getWoList, []);
}

export function useMockObaRecords(): ObaRecord[] {
  return useAsyncStore(getObaRecords, []);
}

export function useRoutingHistory(): RoutingRecord[] {
  return useAsyncStore(getRoutingHistory, []);
}

export function useMockQcRecords(): QcRecord[] {
  return useAsyncStore(getQcRecords, []);
}

export function useProductionReports(): ProductionReport[] {
  return useAsyncStore(getProductionReports, []);
}

export function useIsViewer(): boolean {
  const auth = useMockAuth();
  return auth.role === 'viewer';
}
