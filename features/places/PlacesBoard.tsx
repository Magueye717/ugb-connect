import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CampusMap, type MapPin } from '@/components/CampusMap';
import { LivePulse } from '@/components/motion';
import { EmptyState, ErrorState, SkeletonCard } from '@/components/states';
import { useImmersive } from '@/components/TabScreen';
import { Field, FilterChips, TextButton } from '@/components/ui';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { commerceApi, type ListedBusiness } from '@/features/commerce/api';
import { openDirections } from '@/lib/maps';
import { matches } from '@/lib/search';
import { PLACE_CATEGORIES, placeIcon, placeTone, useCampusOutline, usePlaces, type PlaceDto } from './api';

const FILTERS = ['Tout', ...PLACE_CATEGORIES] as const;
type Filter = (typeof FILTERS)[number];
type View_ = 'list' | 'map';
type Layer = 'place' | 'restaurant' | 'shop';
const LAYERS: { key: Layer; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { key: 'place', label: 'Lieux', icon: 'location', color: colors.primary },
  { key: 'restaurant', label: 'Restos', icon: 'restaurant', color: colors.orange },
  { key: 'shop', label: 'Boutiques', icon: 'storefront', color: colors.green },
];

/**
 * The campus places: a searchable list (with directions in one tap), or the university's map with the places, the
 * private restaurants and the shops. Screen content without header or safe area.
 */
export function PlacesBoard() {
  const { places, failed: placesFailed, refresh } = usePlaces();
  const campus = useCampusOutline();
  const [view, setView] = useState<View_>('list');
  const [filter, setFilter] = useState<Filter>('Tout');
  const [query, setQuery] = useState('');
  // From the home's « Où se trouve… ? »: the search opens ready to type (again at each tap: `n` changes).
  const { chercher, n } = useLocalSearchParams<{ chercher?: string; n?: string }>();
  const [layers, setLayers] = useState<Layer[]>(['place', 'restaurant', 'shop']);
  const [businesses, setBusinesses] = useState<ListedBusiness[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  // The map takes the whole screen, the header and the search over it, translucent.
  const immersive = useImmersive();
  const [controls, setControls] = useState(0);
  const q = query.trim();

  // Restaurants and shops are on the map too.
  useFocusEffect(
    useCallback(() => {
      Promise.all([commerceApi.list('restaurant'), commerceApi.list('shop')]).then(([r, s]) => setBusinesses([...r.items, ...s.items]), () => undefined);
    }, []),
  );

  const list = (places ?? []).filter((p) => (filter === 'Tout' || p.category === filter) && matches(q, [p.name, p.area, p.category, p.description]));
  const open = (id: string) => router.push(`/lieu/${id}`);
  const pins: MapPin[] = [
    ...(layers.includes('place')
      ? list.map((p) => ({
          id: p.id, kind: 'place' as const, name: p.name, subtitle: [p.category, p.area].filter(Boolean).join(' · '), lat: p.location.lat, lng: p.location.lng, color: placeTone(p.category).tint, icon: placeIcon(p.icon),
          // Villages are areas (a label on the map); the many small village mosques stay discreet.
          look: p.category === 'Logement' ? ('zone' as const) : p.category === 'Culte' && p.area.startsWith('Village') ? ('dot' as const) : ('pin' as const),
        }))
      : []),
    ...businesses
      .filter((b) => b.location && layers.includes(b.kind) && matches(q, [b.name, b.specialty, b.address]))
      .map((b) => ({
        id: b.id, kind: b.kind, name: b.name, subtitle: [b.specialty, b.statusLabel].join(' · '), lat: b.location!.lat, lng: b.location!.lng,
        color: b.kind === 'restaurant' ? colors.orange : colors.green, icon: (b.kind === 'restaurant' ? 'restaurant' : 'storefront') as keyof typeof Ionicons.glyphMap,
      })),
  ];
  const toggle = (l: Layer) => setLayers((cur) => (cur.includes(l) ? cur.filter((x) => x !== l) : [...cur, l]));

  const switchView = (v: View_) => {
    setView(v);
    immersive.set(v === 'map');
  };

  const search = (
    <View style={styles.search}>
      <View style={{ flex: 1 }}>
        <Field
          key={chercher ? `search-${n ?? ''}` : 'search'}
          autoFocus={!!chercher}
          icon="search"
          placeholder="BU, Rectorat, Village E…"
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Rechercher un lieu"
          right={
            query ? (
              <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Effacer la recherche">
                <Ionicons name="close-circle" size={18} color={colors.muted} />
              </Pressable>
            ) : null
          }
        />
      </View>
      {/* List or map: one button, it shows where it takes you. Solid and breathing: the campus map is the tab's best
          part, it must not pass for a decoration (still when the system reduces motion). */}
      <Pressable
        style={({ pressed }) => [styles.viewBtn, view === 'map' ? styles.viewBtnOn : styles.viewBtnMap, shadow.card, pressed && { transform: [{ scale: 0.97 }] }]}
        onPress={() => switchView(view === 'map' ? 'list' : 'map')}
        accessibilityRole="button"
        accessibilityLabel={view === 'map' ? 'Voir la liste' : 'Voir la carte du campus'}>
        <View style={styles.viewBtnIcon}>
          <LivePulse color="rgba(255,255,255,0.6)" size={28} />
          <Ionicons name={view === 'map' ? 'list' : 'map'} size={16} color={view === 'map' ? colors.primary : colors.accent} />
        </View>
        <Text style={styles.viewBtnText}>{view === 'map' ? 'Liste' : 'Carte'}</Text>
      </Pressable>
    </View>
  );

  return (
    <>
      {view === 'map' ? (
        <View style={{ flex: 1 }}>
          <CampusMap pins={pins} campus={campus} insetTop={immersive.top + controls} style={StyleSheet.absoluteFill} onOpen={(pin) => (pin.kind === 'place' ? open(pin.id) : router.push(`/resto/${pin.id}`))} />
          <View style={[styles.overlay, { top: immersive.top }]} onLayout={(e) => setControls(e.nativeEvent.layout.height)}>
            {search}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.layers}>
              {LAYERS.map((l) => {
                const on = layers.includes(l.key);
                return (
                  <Pressable key={l.key} onPress={() => toggle(l.key)} style={[styles.layer, on && { backgroundColor: l.color, borderColor: l.color }]} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                    <Ionicons name={l.icon} size={14} color={on ? '#fff' : l.color} />
                    <Text style={[styles.layerText, on && { color: '#fff' }]}>{l.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      ) : (
        <>
          {search}
          <View style={{ marginTop: 12 }}>
            <FilterChips options={FILTERS} value={filter} onChange={setFilter} />
          </View>
          <ScrollView
            contentContainerStyle={styles.body}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => (setRefreshing(true), refresh().finally(() => setRefreshing(false)))} />}>
            <View style={styles.sectionRow}>
              <Text style={styles.section}>{q ? `${list.length} résultat${list.length > 1 ? 's' : ''}` : 'Lieux incontournables'}</Text>
              {(q || filter !== 'Tout') && (
                <TextButton label="Tout voir" onPress={() => (setFilter('Tout'), setQuery(''))} />
              )}
            </View>

            {!places && !placesFailed && (
              <View style={{ gap: 10 }} accessibilityLabel="Chargement">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </View>
            )}
            {!places && placesFailed && <ErrorState onRetry={refresh} />}
            {places && list.length === 0 && (
              <EmptyState
                icon="search-outline"
                title={q ? `Aucun lieu pour « ${q} »${filter !== 'Tout' ? ` dans ${filter}` : ''}` : 'Aucun lieu ici'}
                text={q ? 'Vérifie l’orthographe ou cherche un autre mot.' : undefined}
                action={{ label: 'Tout afficher', onPress: () => (setQuery(''), setFilter('Tout')) }}
              />
            )}

            {list.map((p) => (
              <PlaceCard key={p.id} p={p} onOpen={() => open(p.id)} />
            ))}
          </ScrollView>
        </>
      )}
    </>
  );
}

function PlaceCard({ p, onOpen }: { p: PlaceDto; onOpen: () => void }) {
  const tone = placeTone(p.category);
  return (
    <Pressable
      style={({ pressed }) => [styles.card, shadow.card, pressed && { transform: [{ scale: 0.99 }] }]}
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${p.name}, ${p.category}, ${p.area}`}>
      <View style={[styles.photo, { backgroundColor: tone.bg }]}>
        {p.photos.length ? <Image source={{ uri: p.photos[0] }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} /> : <Ionicons name={placeIcon(p.icon)} size={26} color={tone.tint} />}
        {p.photos.length > 1 && (
          <View style={styles.count}>
            <Ionicons name="images" size={10} color="#fff" />
            <Text style={styles.countText} maxFontSizeMultiplier={1.2}>
              {p.photos.length}
            </Text>
          </View>
        )}
      </View>
      <View style={{ flex: 1, gap: 5 }}>
        <View style={[styles.cat, { backgroundColor: tone.bg }]}>
          <Ionicons name={placeIcon(p.icon)} size={11} color={tone.text} />
          <Text style={[styles.catText, { color: tone.text }]}>{p.category}</Text>
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {p.name}
        </Text>
        {!!p.area && (
          <View style={styles.meta}>
            <Ionicons name="location-outline" size={12} color={colors.muted2} />
            <Text style={styles.metaText} numberOfLines={2}>
              {p.area}
            </Text>
          </View>
        )}
        {p.hours && (
          <View style={styles.meta}>
            <Ionicons name="time-outline" size={12} color={colors.muted2} />
            <Text style={styles.metaText} numberOfLines={1}>
              {p.hours}
            </Text>
          </View>
        )}
        {/* Under the text, never beside it: nothing gets cut, however long the name. */}
        <Pressable style={styles.go} hitSlop={6} onPress={() => openDirections(p.location, p.name)} accessibilityRole="button" accessibilityLabel={`Y aller : ${p.name}`}>
          <Ionicons name="location" size={14} color="#fff" />
          <Text style={styles.goText}>Y aller</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 20, gap: 12, paddingBottom: 32 },
  search: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginTop: 14, gap: 10 },
  viewBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56, paddingHorizontal: 12, borderRadius: radii.md },
  viewBtnMap: { backgroundColor: colors.accent },
  viewBtnOn: { backgroundColor: colors.primary },
  viewBtnIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  viewBtnText: { ...typo.smallStrong, color: '#fff' },
  layers: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 10 },
  layer: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 34, paddingHorizontal: 12, borderRadius: radii.pill, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card },
  layerText: { ...typo.smallStrong, color: colors.navy },
  // The search and the layers over the full-screen map, translucent like the header above them.
  overlay: { position: 'absolute', left: 0, right: 0, paddingTop: 2, backgroundColor: 'rgba(236,239,244,0.86)' },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  section: { ...typo.section, color: colors.navy },
  card: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  photo: { width: 88, height: 88, borderRadius: radii.md, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  title: { ...typo.title, color: colors.navy },
  // Number of photos, on the cover's corner.
  count: {
    position: 'absolute',
    right: 5,
    bottom: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(15,27,76,0.65)',
  },
  countText: { ...typo.label, color: '#fff' },
  cat: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.pill },
  catText: { ...typo.label },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { ...typo.caption, flex: 1, color: colors.muted2 },
  go: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 4, minHeight: 32, paddingHorizontal: 14, borderRadius: radii.pill, backgroundColor: colors.primary },
  goText: { ...typo.smallStrong, color: '#fff' },
});
