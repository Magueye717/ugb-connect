import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/context/AuthContext';
import { bannersApi, type LiveBannerDto } from '@/features/banners/api';
import { eventsApi, type EventDto } from '@/features/events/api';
import { restosApi, type AlertDto, type RestosDayDto } from '@/features/restos/api';

type CampusValue = {
  /** Today's menus of the university restaurants; null until loaded. */
  restos: RestosDayDto | null;
  /** The home screen's alert strip and "À la une": what's for this student. */
  alerts: AlertDto[];
  /** The home carousel: sponsored ads and promoted events running now. */
  banners: LiveBannerDto[];
  /** Events on sale for this student (their UFR, campus, village, region), soonest first. */
  events: EventDto[];
  refresh: () => Promise<void>;
};

const CampusContext = createContext<CampusValue | null>(null);

const REFRESH_MS = 60_000;

/**
 * Campus life from the backend: the public restaurants' menus with their stock levels, and the alerts. Refreshed
 * every minute while the app is open (a "rupture" shows within a minute; the push tells the others).
 */
export function CampusProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const enabled = status === 'signedIn';
  const [restos, setRestos] = useState<RestosDayDto | null>(null);
  const [alerts, setAlerts] = useState<AlertDto[]>([]);
  const [banners, setBanners] = useState<LiveBannerDto[]>([]);
  const [events, setEvents] = useState<EventDto[]>([]);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const [day, list, ads, evs] = await Promise.allSettled([restosApi.day(), restosApi.alerts(), bannersApi.live(), eventsApi.list()]);
    // Offline: keep what's shown.
    if (day.status === 'fulfilled') setRestos(day.value);
    if (list.status === 'fulfilled') setAlerts(list.value.items);
    if (ads.status === 'fulfilled') setBanners(ads.value.items);
    if (evs.status === 'fulfilled') setEvents(evs.value.items);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setRestos(null);
      setAlerts([]);
      setBanners([]);
      setEvents([]);
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

  const value = useMemo(() => ({ restos, alerts, banners, events, refresh }), [restos, alerts, banners, events, refresh]);
  return <CampusContext.Provider value={value}>{children}</CampusContext.Provider>;
}

export function useCampus() {
  const ctx = useContext(CampusContext);
  if (!ctx) throw new Error('useCampus must be used inside CampusProvider');
  return ctx;
}
