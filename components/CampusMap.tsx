import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polygon, Polyline, type Region } from 'react-native-maps';

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
// The whole world, minus the campus: everything outside it is dimmed.
const WORLD = [
  { latitude: 17, longitude: -17.5 },
  { latitude: 17, longitude: -15.5 },
  { latitude: 15, longitude: -15.5 },
  { latitude: 15, longitude: -17.5 },
];
// Names show once zoomed in enough to read them.
const NAMES_BELOW = 0.006;

const INK = '#0E131B';
const PANEL = '#161C26';
const SAND = '#E2BE7E';

/**
 * The university's map, dark and framed on the UGB campus only: the outline from OpenStreetMap, the outside dimmed,
 * the camera kept on the campus. Villages are written on the map, places are icons (named when zoomed in), restaurants
 * and shops too. Tapping one shows its card: directions, or open it. Native only (see CampusMap.web.tsx).
 */
export function CampusMap({ pins, campus, onOpen, style, insetTop = 0 }: { pins: MapPin[]; campus?: Campus | null; onOpen: (pin: MapPin) => void; style?: object; insetTop?: number }) {
  const ref = useRef<MapView>(null);
  // Satellite first: the buildings and their names (G1, G2…) are what students recognise.
  const [satellite, setSatellite] = useState(true);
  const [selected, setSelected] = useState<MapPin | null>(null);
  const [named, setNamed] = useState(false);
  // Markers are pictures: redrawn only while their look changes, then frozen (smooth scrolling with 80 of them).
  const [drawn, setDrawn] = useState('');
  const box = campus?.bounds ?? FALLBACK;
  const corners = useMemo(
    () => [
      { latitude: box.north, longitude: box.west },
      { latitude: box.south, longitude: box.east },
    ],
    [box.north, box.west, box.south, box.east],
  );
  const outline = useMemo(() => campus?.outline.map((p) => ({ latitude: p.lat, longitude: p.lng })) ?? [], [campus]);
  // Refit only when the set of pins changes, not on every render.
  const ids = pins.map((p) => p.id).join(',');

  // Opens on the backend's start view (Village D, close up). It arrives after the map: go there once.
  const started = useRef(false);
  useEffect(() => {
    if (!campus || started.current) return;
    started.current = true;
    ref.current?.animateToRegion({ latitude: campus.start.lat, longitude: campus.start.lng, latitudeDelta: campus.start.delta, longitudeDelta: campus.start.delta }, 500);
  }, [campus]);

  // A search with one result: zoom on it. Filters and layers don't move the camera.
  useEffect(() => {
    if (pins.length === 1) ref.current?.animateToRegion({ latitude: pins[0]!.lat, longitude: pins[0]!.lng, latitudeDelta: 0.0025, longitudeDelta: 0.0025 }, 400);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the ids on purpose
  }, [ids]);

  const look = `${ids}|${named}|${satellite}`;
  const drawing = drawn !== look;
  useEffect(() => {
    const t = setTimeout(() => setDrawn(look), 800);
    return () => clearTimeout(t);
  }, [look]);

  // Android stops the camera at the campus box itself; iOS is brought back after a gesture.
  const keepOnCampus = () => ref.current?.setMapBoundaries({ latitude: box.north + 0.004, longitude: box.east + 0.004 }, { latitude: box.south - 0.004, longitude: box.west - 0.004 });
  const onRegion = (r: Region) => {
    const zoomedIn = r.latitudeDelta < NAMES_BELOW;
    if (zoomedIn !== named) setNamed(zoomedIn);
    if (Platform.OS !== 'ios') return;
    const lat = Math.min(Math.max(r.latitude, box.south), box.north);
    const lng = Math.min(Math.max(r.longitude, box.west), box.east);
    if (lat !== r.latitude || lng !== r.longitude) ref.current?.animateToRegion({ ...r, latitude: lat, longitude: lng }, 250);
  };
  const recenter = () => {
    setSelected(null);
    ref.current?.fitToCoordinates(corners, { edgePadding: { ...PADDING, top: PADDING.top + insetTop }, animated: true });
  };

  const shown = selected && pins.find((p) => p.id === selected.id);
  // The place's card is pinned at the bottom of the map: the space button rises above it.
  useLiftSpaceButton(shown ? 190 : 0);

  return (
    <View style={[styles.wrap, style]}>
      <MapView
        ref={ref}
        style={StyleSheet.absoluteFill}
        // Full screen under translucent controls: the camera centres on the visible part.
        mapPadding={{ top: insetTop, right: 0, bottom: 0, left: 0 }}
        initialRegion={
          campus
            ? { latitude: campus.start.lat, longitude: campus.start.lng, latitudeDelta: campus.start.delta, longitudeDelta: campus.start.delta }
            : { latitude: (box.north + box.south) / 2, longitude: (box.west + box.east) / 2, latitudeDelta: 0.018, longitudeDelta: 0.018 }
        }
        mapType={satellite ? 'hybrid' : 'standard'}
        userInterfaceStyle="dark"
        customMapStyle={DARK}
        minZoomLevel={14}
        cameraZoomRange={{ maxCenterCoordinateDistance: 5000, animated: true }}
        showsPointsOfInterests={false}
        showsBuildings={false}
        showsTraffic={false}
        showsIndoors={false}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        onMapReady={keepOnCampus}
        onRegionChangeComplete={onRegion}
        onPress={() => setSelected(null)}>
        {outline.length > 2 && (
          <>
            <Polygon coordinates={WORLD} holes={[outline]} fillColor={satellite ? 'rgba(8,11,16,0.55)' : 'rgba(8,11,16,0.78)'} strokeWidth={0} tappable={false} />
            <Polyline coordinates={outline} strokeColor={SAND} strokeWidth={2} lineDashPattern={[10, 6]} />
          </>
        )}
        {pins.map((p) => {
          const on = shown?.id === p.id;
          const kind = p.look ?? 'pin';
          return (
            <Marker
              key={`${p.kind}-${p.id}-${named ? 'n' : ''}`}
              coordinate={{ latitude: p.lat, longitude: p.lng }}
              onPress={(e) => (e.stopPropagation(), setSelected(p))}
              anchor={{ x: 0.5, y: 0.5 }}
              zIndex={on ? 3 : kind === 'dot' ? 0 : kind === 'zone' ? 1 : 2}
              tracksViewChanges={drawing || on}>
              {kind === 'zone' ? (
                <Text style={[styles.zone, on && styles.zoneOn]}>{p.name.toUpperCase()}</Text>
              ) : kind === 'dot' ? (
                <View style={[styles.dot, { backgroundColor: p.color }, on && styles.dotOn]} />
              ) : (
                // The empty band above balances the name below: the icon stays exactly on the spot.
                <View style={styles.pinBox}>
                  <View style={styles.pinBand} />
                  <View style={[styles.pin, { backgroundColor: p.color }, on && styles.pinOn]}>
                    <Ionicons name={p.icon} size={on ? 12 : 9} color="#fff" />
                  </View>
                  <Text style={[styles.pinName, !(named || on) && styles.hidden]} numberOfLines={2}>
                    {p.name}
                  </Text>
                </View>
              )}
            </Marker>
          );
        })}
      </MapView>

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

      {!shown && <Text style={styles.credit}>{campus?.attribution ?? '© OpenStreetMap'}</Text>}

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

// Google Maps (Android) dark plan, without its own points of interest: only the campus places show.
const DARK = [
  { elementType: 'geometry', stylers: [{ color: '#1A212C' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#7D8796' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1A212C' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#212936' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2B3442' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1A212C' }] },
  { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3A4352' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0B1E2D' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3D5A73' }] },
];

const shade = { textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 } as const;

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: INK, minHeight: 440 },
  zone: { fontSize: 9, fontWeight: '800', letterSpacing: 1, color: SAND, paddingHorizontal: 2, ...shade },
  zoneOn: { fontSize: 11, color: '#fff' },
  dot: { width: 7, height: 7, borderRadius: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.85)' },
  dotOn: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#fff' },
  pinBox: { width: 90, alignItems: 'center' },
  pinBand: { height: 22 },
  pin: { width: 17, height: 17, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)' },
  pinOn: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#fff', marginVertical: -3.5 },
  pinName: { height: 22, marginTop: 1, fontSize: 8.5, lineHeight: 10, fontWeight: '700', color: '#F3F5F8', textAlign: 'center', ...shade },
  hidden: { opacity: 0 },
  title: { position: 'absolute', top: 14, left: 14, right: 130 },
  titleText: { fontSize: 15, fontWeight: '800', color: '#fff', ...shade },
  titleSub: { ...typo.small, color: SAND, marginTop: 1, ...shade },
  tools: { position: 'absolute', top: 12, right: 12, gap: 8, alignItems: 'flex-end' },
  tool: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, minWidth: 38, paddingHorizontal: 10, borderRadius: 19, backgroundColor: 'rgba(22,28,38,0.92)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', justifyContent: 'center' },
  toolText: { ...typo.smallStrong, color: '#fff' },
  credit: { position: 'absolute', left: 10, bottom: 8, fontSize: 10, color: 'rgba(255,255,255,0.55)' },
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
