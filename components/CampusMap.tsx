import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { campusMapHtml, type MapEvent } from '@/components/campusMapHtml';
import { useLiftSpaceButton } from '@/components/SpaceSwitcher';
import { radii, typo } from '@/constants/theme';
import { openDirections } from '@/lib/maps';

/** Something on the campus map: a place, a private restaurant, a shop. */
export type MapPin = {
  id: string;
  kind: 'place' | 'restaurant' | 'shop';
  name: string;
  subtitle: string;
  lat: number;
  lng: number;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** zone: an area written on the map (a village); dot: a discreet point; pin (default): an icon, named when zoomed in. */
  look?: 'pin' | 'zone' | 'dot';
};

type LatLng = { lat: number; lng: number };
type Campus = { outline: LatLng[]; bounds: { south: number; west: number; north: number; east: number }; start: { lat: number; lng: number; delta: number }; attribution: string };

// Until the outline arrives (or offline): the UGB box (Sanar).
const FALLBACK = { south: 16.0554, west: -16.4291, north: 16.0714, east: -16.4172 };
const PADDING = { top: 60, right: 24, bottom: 40, left: 24 };

const INK = '#0E131B';
const PANEL = '#161C26';
const SAND = '#E2BE7E';
const HTML = campusMapHtml({ ink: INK, sand: SAND });
const CREDIT = '© OpenFreeMap © OpenMapTiles © OpenStreetMap';

/**
 * The university's map, dark and framed on the UGB campus only: the outline from OpenStreetMap, the outside dimmed,
 * the camera kept on the campus. Villages are written on the map, places are icons (named when zoomed in), restaurants
 * and shops too. Tapping one shows its card: directions, or open it. Drawn by MapLibre GL in a WebView with free
 * tiles (campusMapHtml.ts): no Google Maps key, and it works on phones without Google services. Native only (see
 * CampusMap.web.tsx).
 */
export function CampusMap({ pins, campus, onOpen, style, insetTop = 0 }: { pins: MapPin[]; campus?: Campus | null; onOpen: (pin: MapPin) => void; style?: object; insetTop?: number }) {
  const web = useRef<ComponentRef<typeof WebView>>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  // Satellite first: the buildings and their names (G1, G2…) are what students recognise.
  const [satellite, setSatellite] = useState(true);
  const [selected, setSelected] = useState<MapPin | null>(null);
  const box = campus?.bounds ?? FALLBACK;
  // Refit only when the set of pins changes, not on every render.
  const ids = pins.map((p) => p.id).join(',');

  /** Runs `window.ugb.<fn>(...args)` in the page (JSON: names and subtitles can hold any character). */
  const call = (fn: string, ...args: unknown[]) => web.current?.injectJavaScript(`window.ugb && window.ugb.${fn}(${args.map((a) => JSON.stringify(a)).join(',')}); true;`);

  // The campus: its outline, the box the camera stays in, the view it opens on (once).
  const started = useRef(false);
  useEffect(() => {
    if (!ready) return;
    call('campus', { outline: campus?.outline ?? [], box, start: !started.current && campus ? campus.start : null });
    if (campus) started.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the page only needs the campus and the box
  }, [ready, campus, box.north, box.south, box.east, box.west]);

  // The pins as the page draws them (only what it needs).
  const drawn = useMemo(() => pins.map(({ id, kind, name, lat, lng, color, icon, look }) => ({ id, kind, name, lat, lng, color, icon, look })), [pins]);
  useEffect(() => {
    if (ready) call('pins', drawn);
     
  }, [ready, drawn]);

  // A search with one result: zoom on it. Filters and layers don't move the camera.
  useEffect(() => {
    if (ready && pins.length === 1) call('fly', pins[0]!.lat, pins[0]!.lng, 17.5);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the ids on purpose
  }, [ready, ids]);

  const shown = selected && pins.find((p) => p.id === selected.id);
  useEffect(() => {
    if (ready) call('select', shown?.id ?? null);
     
  }, [ready, shown?.id]);
  useEffect(() => {
    if (ready) call('satellite', satellite);
     
  }, [ready, satellite]);
  // Full screen under translucent controls: the camera centres on the visible part.
  useEffect(() => {
    if (ready) call('padding', insetTop);
     
  }, [ready, insetTop]);

  // Where the student is, when they already allowed it (the map never asks by itself).
  useEffect(() => {
    if (!ready) return;
    let sub: Location.LocationSubscription | null = null;
    let live = true;
    Location.getForegroundPermissionsAsync()
      .then(({ granted }) =>
        granted ? Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, distanceInterval: 10 }, (p) => call('me', { lat: p.coords.latitude, lng: p.coords.longitude })) : null,
      )
      .then((s) => {
        if (live) sub = s;
        else s?.remove();
      })
      .catch(() => undefined);
    return () => {
      live = false;
      sub?.remove();
    };
     
  }, [ready]);

  const onMessage = (e: WebViewMessageEvent) => {
    let m: MapEvent;
    try {
      m = JSON.parse(e.nativeEvent.data) as MapEvent;
    } catch {
      return;
    }
    if (m.type === 'ready') setReady(true);
    else if (m.type === 'error') setFailed(true);
    else if (m.type === 'tap') setSelected(null);
    else if (m.type === 'select') setSelected(pins.find((p) => p.id === m.id) ?? null);
  };

  const recenter = () => {
    setSelected(null);
    call('fit', box, { ...PADDING, top: PADDING.top + insetTop });
  };

  // The place's card is pinned at the bottom of the map: the space button rises above it.
  useLiftSpaceButton(shown ? 190 : 0);

  return (
    <View style={[styles.wrap, style]}>
      <WebView
        ref={web}
        style={[StyleSheet.absoluteFill, styles.web]}
        source={{ html: HTML, baseUrl: 'https://ugb-connect.app/' }}
        originWhitelist={['*']}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        setSupportMultipleWindows={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        // A tap must reach the map, not select text.
        textInteractionEnabled={false}
        onError={() => setFailed(true)}
      />
      {!ready && !failed && <ActivityIndicator color={SAND} style={StyleSheet.absoluteFill} />}
      {failed && (
        <View style={[StyleSheet.absoluteFill, styles.offline]}>
          <Ionicons name="cloud-offline-outline" size={26} color={SAND} />
          <Text style={styles.offlineText}>Carte indisponible : vérifie ta connexion.</Text>
          <Pressable
            style={styles.tool}
            onPress={() => {
              setFailed(false);
              setReady(false);
              started.current = false;
              web.current?.reload();
            }}
            accessibilityRole="button">
            <Text style={styles.toolText}>Réessayer</Text>
          </Pressable>
        </View>
      )}

      <View style={[styles.title, { top: 14 + insetTop }]} pointerEvents="none">
        <Text style={styles.titleText}>Université Gaston Berger</Text>
        <Text style={styles.titleSub}>Campus de Sanar · Saint-Louis</Text>
      </View>

      <View style={[styles.tools, { top: 12 + insetTop }]}>
        <Pressable style={styles.tool} onPress={() => setSatellite((s) => !s)} accessibilityRole="button" accessibilityLabel={satellite ? 'Vue plan' : 'Vue satellite'}>
          <Ionicons name={satellite ? 'map-outline' : 'earth-outline'} size={18} color="#fff" />
          <Text style={styles.toolText}>{satellite ? 'Plan' : 'Satellite'}</Text>
        </Pressable>
        <Pressable style={styles.tool} onPress={recenter} accessibilityRole="button" accessibilityLabel="Tout le campus">
          <Ionicons name="scan-outline" size={18} color="#fff" />
        </Pressable>
      </View>

      {/* Required by the tiles' licences: OpenMapTiles and OpenStreetMap (and Esri for the satellite view). */}
      {!shown && <Text style={styles.credit}>{satellite ? `Imagerie © Esri · ${CREDIT}` : CREDIT}</Text>}

      {shown && (
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View style={[styles.cardIcon, { backgroundColor: shown.color }]}>
              <Ionicons name={shown.icon} size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardKind}>{shown.kind === 'restaurant' ? 'Restaurant' : shown.kind === 'shop' ? 'Boutique' : 'Lieu'}</Text>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {shown.name}
              </Text>
              <Text style={styles.cardSub} numberOfLines={2}>
                {shown.subtitle}
              </Text>
            </View>
            <Pressable onPress={() => setSelected(null)} hitSlop={10} style={styles.close} accessibilityRole="button" accessibilityLabel="Fermer">
              <Ionicons name="close" size={16} color="#AAB4C3" />
            </Pressable>
          </View>
          <View style={styles.cardActions}>
            <Pressable style={[styles.action, styles.actionGo]} onPress={() => openDirections({ lat: shown.lat, lng: shown.lng }, shown.name)} accessibilityRole="button" accessibilityLabel={`Y aller : ${shown.name}`}>
              <Ionicons name="location" size={16} color={INK} />
              <Text style={[styles.actionText, { color: INK }]}>Y aller</Text>
            </Pressable>
            <Pressable style={styles.action} onPress={() => onOpen(shown)} accessibilityRole="button" accessibilityLabel={`Voir ${shown.name}`}>
              <Text style={styles.actionText}>{shown.kind === 'place' ? 'Voir le lieu' : 'Voir la carte'}</Text>
              <Ionicons name="chevron-forward" size={16} color="#fff" />
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const shade = { textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 } as const;

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: INK, minHeight: 440 },
  web: { backgroundColor: INK },
  offline: { alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: INK },
  offlineText: { ...typo.small, color: '#AAB4C3' },
  title: { position: 'absolute', top: 14, left: 14, right: 130 },
  titleText: { fontSize: 15, fontWeight: '800', color: '#fff', ...shade },
  titleSub: { ...typo.small, color: SAND, marginTop: 1, ...shade },
  tools: { position: 'absolute', top: 12, right: 12, gap: 8, alignItems: 'flex-end' },
  tool: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, minWidth: 38, paddingHorizontal: 10, borderRadius: 19, backgroundColor: 'rgba(22,28,38,0.92)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', justifyContent: 'center' },
  toolText: { ...typo.smallStrong, color: '#fff' },
  credit: { position: 'absolute', left: 10, bottom: 8, right: 10, fontSize: 9, color: 'rgba(255,255,255,0.55)' },
  card: { position: 'absolute', left: 12, right: 12, bottom: 12, padding: 14, gap: 12, borderRadius: radii.xl, backgroundColor: PANEL, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  cardKind: { ...typo.label, color: SAND, textTransform: 'uppercase', letterSpacing: 0.5 },
  cardTitle: { ...typo.title, color: '#fff', marginTop: 1 },
  cardSub: { ...typo.small, color: '#AAB4C3', marginTop: 2 },
  close: { alignSelf: 'flex-start', width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  cardActions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 46, borderRadius: radii.pill, backgroundColor: 'rgba(255,255,255,0.1)' },
  actionGo: { backgroundColor: SAND },
  actionText: { ...typo.bodyStrong, color: '#fff' },
});
