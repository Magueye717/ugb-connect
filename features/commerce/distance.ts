import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

/**
 * The phone's last known position, only if the student already allowed it (lists never ask): the distance to each
 * business. Null otherwise.
 */
export function useMyPosition() {
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { granted } = await Location.getForegroundPermissionsAsync();
        if (!granted) return;
        const last = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000 });
        if (alive && last) setPos({ lat: last.coords.latitude, lng: last.coords.longitude });
      } catch {
        // No position: the campus is shown instead.
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  return pos;
}

/** Metres between two points (haversine). */
export function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** "350 m", "1,2 km". */
export const distanceLabel = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`);
