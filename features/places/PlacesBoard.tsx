import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CampusMap, type MapPin } from '@/components/CampusMap';
import { EmptyState } from '@/components/states';
import { Field, FilterChips, Segmented } from '@/components/ui';
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
  const { places, refresh } = usePlaces();
  const campus = useCampusOutline();
  const [view, setView] = useState<View_>('list');
  const [filter, setFilter] = useState<Filter>('Tout');
  const [query, setQuery] = useState('');
  const [layers, setLayers] = useState<Layer[]>(['place', 'restaurant', 'shop']);
  const [businesses, setBusinesses] = useState<ListedBusiness[]>([]);
  const [refreshing, setRefreshing] = useState(false);
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

  return (
    <>
      <View style={styles.search}>
        <Field
          icon="search"
          placeholder="Bibliothèque, barbier, Village E…"
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
        <Segmented
          options={[
            { value: 'list', label: 'Liste' },
            { value: 'map', label: 'Carte du campus' },
          ]}
          value={view}
          onChange={setView}
        />
      </View>

      {view === 'map' ? (
        <View style={{ flex: 1 }}>
          {/* flexGrow 0: a ScrollView fills the free space by default, the map must get it. */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.layers}>
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
          <CampusMap pins={pins} campus={campus} style={styles.map} onOpen={(pin) => (pin.kind === 'place' ? open(pin.id) : router.push(`/resto/${pin.id}`))} />
        </View>
      ) : (
        <>
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
                <Pressable onPress={() => (setFilter('Tout'), setQuery(''))}>
                  <Text style={styles.link}>Tout voir</Text>
                </Pressable>
              )}
            </View>

            {!places && <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />}
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
      </View>
      <Pressable style={styles.nav} hitSlop={6} onPress={() => openDirections(p.location, p.name)} accessibilityRole="link" accessibilityLabel={`Itinéraire vers ${p.name}`}>
        <Ionicons name="navigate-outline" size={18} color={colors.primary} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 20, gap: 12, paddingBottom: 32 },
  search: { paddingHorizontal: 20, marginTop: 14, gap: 10 },
  layers: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 10 },
  layer: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: radii.pill, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card },
  layerText: { ...typo.smallStrong, color: colors.navy },
  // Takes the rest of the screen: the whole university at a glance.
  map: { flex: 1, marginHorizontal: 12, marginBottom: 12, borderRadius: radii.xl },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  section: { ...typo.h3, color: colors.navy },
  link: { color: colors.primary, fontWeight: '700' },
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
  nav: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
