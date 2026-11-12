import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CampusMap, type MapPin } from '@/components/CampusMap';
import { PrimaryButton, TextButton } from '@/components/ui';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useCampusOutline } from '@/features/places/api';
import { openInMapsApp } from '@/lib/maps';

/** `fit`: frame it on the map (a new route); not at each step of the walk. */
type Walk = { coords: [number, number][]; meters: number; dashed: boolean; fit: boolean };
type State = { kind: 'locating' } | { kind: 'denied' } | { kind: 'ready'; walk: Walk } | { kind: 'arrived' } | { kind: 'failed' };

/** Off the line by more than this: a new route is asked for (at most every REROUTE_MS). */
const OFF_ROUTE_M = 40;
const REROUTE_MS = 15_000;
/** This close to the place: arrived. */
const ARRIVED_M = 20;

/** A walk at an easy pace on campus: about 80 m a minute. */
const minutes = (m: number) => Math.max(1, Math.round(m / 80));
const distance = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`);

/** As the crow flies, in metres. */
function crow(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

type Point = { lat: number; lng: number };
/** The last position found, kept for the next itinerary (a fresh GPS fix each time fails on many phones, indoors). */
let lastFix: { at: number; point: Point } | null = null;
const FRESH_MS = 2 * 60_000;

/** A promise that gives up after `ms` (null): a GPS fix can hang. */
const within = <T,>(ms: number, p: Promise<T>) => Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);

/**
 * Where the student is, without making them wait or fail: a position found under 2 minutes ago (here, or the phone's
 * last known one), else a fresh fix (10 s at most), else one at low accuracy (network, Wi-Fi: works indoors).
 */
async function whereAmI(): Promise<Point | null> {
  if (lastFix && Date.now() - lastFix.at < FRESH_MS) return lastFix.point;
  const keep = (c: { latitude: number; longitude: number } | undefined | null) => {
    if (!c) return null;
    lastFix = { at: Date.now(), point: { lat: c.latitude, lng: c.longitude } };
    return lastFix.point;
  };
  const known = await Location.getLastKnownPositionAsync({ maxAge: FRESH_MS, requiredAccuracy: 300 }).catch(() => null);
  if (known) return keep(known.coords);
  const fresh = await within(10_000, Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null));
  if (fresh) return keep(fresh.coords);
  const rough = await within(8_000, Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }).catch(() => null));
  if (rough) return keep(rough.coords);
  // Nothing new: an older last known position is better than nothing.
  const old = await Location.getLastKnownPositionAsync().catch(() => null);
  return keep(old?.coords);
}

/**
 * The walk along the paths, from OpenStreetMap's foot routing (FOSSGIS). Not reachable (offline, service down): null,
 * and the screen shows the straight line instead, dashed.
 */
async function walkBetween(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<Walk | null> {
  try {
    const res = await fetch(`https://routing.openstreetmap.de/routed-foot/route/v1/foot/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`);
    if (!res.ok) return null;
    const body = (await res.json()) as { routes?: { distance: number; geometry: { coordinates: [number, number][] } }[] };
    const r = body.routes?.[0];
    return r && r.geometry.coordinates.length > 1 ? { coords: r.geometry.coordinates, meters: r.distance, dashed: false, fit: true } : null;
  } catch {
    return null;
  }
}

/**
 * « Y aller », inside the app: the UGB map with the line to walk from where the student is to the place, how far and
 * how long. Without their position (refused): the place on the map, and a way to allow it. The phone's map app stays
 * one tap away.
 */
export default function Itineraire() {
  const params = useLocalSearchParams<{ lat: string; lng: string; name?: string }>();
  const to = useMemo(() => ({ lat: Number(params.lat), lng: Number(params.lng) }), [params.lat, params.lng]);
  const name = params.name ?? 'Destination';
  const campus = useCampusOutline();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<State>({ kind: 'locating' });
  // The whole route as found (the line shown is what's left of it), and when it was last asked for.
  const base = useRef<Walk | null>(null);
  const routedAt = useRef(0);
  const routing = useRef(false);

  /** A route from `from`: the paths, else the straight line (dashed). */
  const routeFrom = useCallback(
    async (from: Point) => {
      routedAt.current = Date.now();
      const walk = (await walkBetween(from, to)) ?? { coords: [[from.lng, from.lat], [to.lng, to.lat]] as [number, number][], meters: crow(from, to), dashed: true, fit: true };
      base.current = walk;
      return walk;
    },
    [to],
  );

  const locate = useCallback(async (ask: boolean) => {
    setState({ kind: 'locating' });
    try {
      // The first time, it asks (the student asked for the way); after a refusal, the button asks again.
      let perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted && (ask || perm.canAskAgain)) perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        setState({ kind: 'denied' });
        return;
      }
      const from = await whereAmI();
      if (!from) {
        setState({ kind: 'failed' });
        return;
      }
      if (crow(from, to) < ARRIVED_M) {
        setState({ kind: 'arrived' });
        return;
      }
      setState({ kind: 'ready', walk: await routeFrom(from) });
    } catch {
      setState({ kind: 'failed' });
    }
  }, [to, routeFrom]);

  useEffect(() => {
    // Deferred: the screen shows (the map loads) while the position is found.
    const t = setTimeout(() => locate(false), 0);
    return () => clearTimeout(t);
  }, [locate]);

  // On the way: follows the student. The line shrinks from their side, the time and distance left update; off the
  // line, a new route (now and then); close to the place, arrived.
  const following = state.kind === 'ready';
  useEffect(() => {
    if (!following) return;
    let sub: Location.LocationSubscription | null = null;
    let live = true;
    Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 5 }, async (p) => {
      const here = { lat: p.coords.latitude, lng: p.coords.longitude };
      lastFix = { at: Date.now(), point: here };
      const full = base.current;
      if (!live || !full) return;
      if (crow(here, to) < ARRIVED_M) {
        setState({ kind: 'arrived' });
        return;
      }
      if (full.dashed) {
        setState({ kind: 'ready', walk: { coords: [[here.lng, here.lat], [to.lng, to.lat]], meters: crow(here, to), dashed: true, fit: false } });
        return;
      }
      // The nearest point of the route: how far from it, and what's left after it.
      let near = 0;
      let off = Infinity;
      full.coords.forEach(([lng, lat], i) => {
        const d = crow(here, { lat, lng });
        if (d < off) [off, near] = [d, i];
      });
      if (off > OFF_ROUTE_M && Date.now() - routedAt.current > REROUTE_MS && !routing.current) {
        routing.current = true;
        const walk = await routeFrom(here).finally(() => (routing.current = false));
        if (live) setState({ kind: 'ready', walk });
        return;
      }
      const rest = full.coords.slice(near + 1);
      let meters = rest.length ? crow(here, { lat: rest[0]![1], lng: rest[0]![0] }) : crow(here, to);
      for (let i = 1; i < rest.length; i++) meters += crow({ lat: rest[i - 1]![1], lng: rest[i - 1]![0] }, { lat: rest[i]![1], lng: rest[i]![0] });
      setState({ kind: 'ready', walk: { coords: [[here.lng, here.lat], ...rest], meters, dashed: false, fit: false } });
    })
      .then((s) => {
        if (live) sub = s;
        else s.remove();
      })
      .catch(() => undefined);
    return () => {
      live = false;
      sub?.remove();
    };
  }, [following, to, routeFrom]);

  const pin: MapPin = { id: 'destination', kind: 'place', name, subtitle: '', lat: to.lat, lng: to.lng, color: colors.accent, icon: 'flag' };
  const walk = state.kind === 'ready' ? state.walk : null;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const CARD_H = 170;

  return (
    <View style={styles.root}>
      <CampusMap pins={[pin]} campus={campus} onOpen={() => undefined} insetTop={insets.top + 56} insetBottom={CARD_H + insets.bottom} route={walk ? { coords: walk.coords, dashed: walk.dashed, fit: walk.fit } : null} style={StyleSheet.absoluteFill} />

      <Pressable style={[styles.back, { top: insets.top + 10 }]} onPress={back} accessibilityRole="button" accessibilityLabel="Retour">
        <Ionicons name="chevron-back" size={22} color={colors.navy} />
      </Pressable>

      <View style={[styles.card, shadow.raised, { paddingBottom: 16 + insets.bottom }]}>
        <View style={styles.head}>
          <View style={styles.flag}>
            <Ionicons name="flag" size={18} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            {state.kind === 'locating' && <Text style={styles.muted}>Recherche de ta position…</Text>}
            {walk && (
              <Text style={styles.muted}>
                {walk.dashed ? 'À vol d’oiseau (trajet indisponible)' : 'À pied'} · {distance(walk.meters)}
              </Text>
            )}
            {state.kind === 'arrived' && <Text style={[styles.muted, { color: colors.successText, fontWeight: '700' }]}>Tu es arrivé 🎉</Text>}
            {state.kind === 'denied' && <Text style={styles.muted}>Autorise ta position pour voir le trajet.</Text>}
            {state.kind === 'failed' && <Text style={styles.muted}>Position introuvable : vérifie que la localisation est activée.</Text>}
          </View>
          {state.kind === 'locating' && <ActivityIndicator color={colors.primary} />}
          {walk && (
            <View style={styles.time}>
              <Text style={styles.timeValue}>{minutes(walk.meters)}</Text>
              <Text style={styles.timeUnit}>min</Text>
            </View>
          )}
        </View>
        {(state.kind === 'denied' || state.kind === 'failed') && <PrimaryButton size="sm" icon="locate" label={state.kind === 'denied' ? 'Autoriser ma position' : 'Réessayer'} onPress={() => locate(true)} />}
        <TextButton label="Ouvrir dans l’app Plans / Maps" icon="open-outline" onPress={() => openInMapsApp(to, name)} style={{ alignSelf: 'center' }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.navy },
  back: { position: 'absolute', left: 16, width: 42, height: 42, borderRadius: 21, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...shadow.card },
  card: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: 12, padding: 16, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, backgroundColor: colors.card },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flag: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  name: { ...typo.title, color: colors.navy },
  muted: { ...typo.caption, color: colors.muted2, marginTop: 2 },
  time: { alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.md, backgroundColor: colors.accentSoft },
  timeValue: { ...typo.h3, color: colors.orangeText, fontVariant: ['tabular-nums'] },
  timeUnit: { ...typo.label, color: colors.orangeText },
});
