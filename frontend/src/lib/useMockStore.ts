import { useState, useEffect } from 'react';
import { getAuth, getWoList, getObaRecords } from './mockStore';
import type { AuthState, MockWO, ObaRecord } from './mockStore';

function useStoreValue<T>(getter: () => T): T {
  const [value, setValue] = useState<T>(() => getter());
  useEffect(() => {
    const update = () => setValue(getter());
    window.addEventListener('mockstore', update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener('mockstore', update);
      window.removeEventListener('storage', update);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return value;
}

export function useMockAuth(): AuthState {
  return useStoreValue(getAuth);
}

export function useMockWoList(): MockWO[] {
  return useStoreValue(getWoList);
}

export function useMockObaRecords(): ObaRecord[] {
  return useStoreValue(getObaRecords);
}
