import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/context/AuthContext';
import { lostApi, type LostItemDto } from '@/features/lost/api';

type LostValue = {
  /** The board: open items, those returned this week, and all of mine; null until loaded. */
  items: LostItemDto[] | null;
  refresh: () => Promise<void>;
  /** Puts a new or changed item in the list at once (before the next refresh). */
  upsert: (item: LostItemDto) => void;
};

const LostContext = createContext<LostValue | null>(null);

const REFRESH_MS = 60_000;

/** Lost and found from the backend, refreshed every minute while the app is open (students only). */
export function LostProvider({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const enabled = status === 'signedIn' && !!user?.studentId;
  const [items, setItems] = useState<LostItemDto[] | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      setItems((await lostApi.list()).items);
    } catch {
      // Offline: keep what's shown.
      setItems((list) => list ?? []);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setItems(null);
      return;
    }
    refresh();
    const timer = setInterval(() => AppState.currentState === 'active' && refresh(), REFRESH_MS);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [enabled, refresh]);

  const upsert = useCallback((item: LostItemDto) => setItems((list) => [item, ...(list ?? []).filter((i) => i.id !== item.id)]), []);

  const value = useMemo(() => ({ items, refresh, upsert }), [items, refresh, upsert]);
  return <LostContext.Provider value={value}>{children}</LostContext.Provider>;
}

export function useLost() {
  const ctx = useContext(LostContext);
  if (!ctx) throw new Error('useLost must be used inside LostProvider');
  return ctx;
}
