import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorState } from '@/components/states';
import { PrimaryButton } from '@/components/ui';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { placeIcon, placesApi, placeTone, usePlaces, type PlaceDto } from '@/features/places/api';
import { ApiError } from '@/lib/api';
import { openDirections } from '@/lib/maps';

const HERO_HEIGHT = 280;
const AUTO_SLIDE_MS = 3000;

export default function LieuScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { places } = usePlaces();
  const [fetched, setFetched] = useState<PlaceDto | null>(null);
  const [missing, setMissing] = useState(false);
  // No network (not "not found"): say so, with « Réessayer ».
  const [failed, setFailed] = useState(false);
  // From the list when it's there (instant), and read again when the screen shows.
  const load = useCallback(() => {
    if (!id) return;
    setFailed(false);
    placesApi.get(id).then(setFetched, (err) => (err instanceof ApiError && err.status === 404 ? setMissing(true) : setFailed(true)));
  }, [id]);
  useFocusEffect(load);
  const p = fetched ?? places?.find((x) => x.id === id) ?? null;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/lieux'));
  if (!p) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 60, alignItems: 'center', gap: 10 }]}>
        {missing ? <Text style={styles.note}>Lieu introuvable.</Text> : failed ? <ErrorState onRetry={load} /> : <ActivityIndicator color={colors.primary} />}
        <Pressable onPress={back} style={[styles.back, { top: insets.top + 8 }]} accessibilityRole="button" accessibilityLabel="Retour">
          <Ionicons name="arrow-back" size={20} color={colors.navy} />
        </Pressable>
      </View>
    );
  }
  const tone = placeTone(p.category);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { backgroundColor: tone.bg }]}>
          {p.photos.length ? (
            <Gallery photos={p.photos} name={p.name} />
          ) : (
            <View style={styles.noPhoto}>
              <Ionicons name={placeIcon(p.icon)} size={56} color={tone.tint} />
            </View>
          )}
          <Pressable
            onPress={back}
            style={[styles.back, { top: insets.top + 8 }]}
            accessibilityRole="button"
            accessibilityLabel="Retour">
            <Ionicons name="arrow-back" size={20} color={colors.navy} />
          </Pressable>
        </View>

        <View style={[styles.card, shadow.raised]}>
          <View style={[styles.cat, { backgroundColor: tone.bg }]}>
            <Ionicons name={placeIcon(p.icon)} size={12} color={tone.text} />
            <Text style={[styles.catText, { color: tone.text }]}>{p.category}</Text>
          </View>
          <Text style={styles.name}>{p.name}</Text>
          <Text style={styles.description}>{p.description}</Text>
        </View>

        <View style={styles.body}>
          <View style={[styles.infoCard, shadow.card]}>
            <Info icon="location-outline" label="Emplacement" value={[p.area, p.campusLabel].filter(Boolean).join(' · ') || 'Sur le campus'} />
            {p.hours && (
              <>
                <View style={styles.divider} />
                <Info icon="time-outline" label="Horaires" value={p.hours} />
              </>
            )}
          </View>

          <PrimaryButton label="Y aller" onPress={() => openDirections(p.location, p.name)} />
          <Text style={styles.note}>S’ouvre dans Plans ou Google Maps</Text>
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * Full-width photos that slide on their own every 3 seconds and can be swiped (pauses while touched).
 * Same pattern as the home ad carousel: in the normal layout, explicit page size.
 */
function Gallery({ photos, name }: { photos: string[]; name: string }) {
  const { width } = useWindowDimensions();
  const ref = useRef<ScrollViewInstance>(null);
  const [index, setIndex] = useState(0);
  // Current page and drag state in refs: the timer reads them without being reset by re-renders.
  const current = useRef(0);
  const dragging = useRef(false);
  // Bumped after a manual swipe to restart the 3 s countdown from zero.
  const [restart, setRestart] = useState(0);
  const multiple = photos.length > 1;

  const goTo = (i: number) => {
    current.current = i;
    setIndex(i);
    ref.current?.scrollTo({ x: i * width, y: 0, animated: true });
  };

  useEffect(() => {
    if (!multiple) return;
    const t = setInterval(() => {
      if (!dragging.current) goTo((current.current + 1) % photos.length);
    }, AUTO_SLIDE_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- goTo only uses width, listed here
  }, [multiple, photos.length, width, restart]);

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    current.current = i;
    setIndex(i);
  };

  return (
    <>
      <ScrollView
        ref={ref}
        horizontal
        pagingEnabled
        nestedScrollEnabled
        scrollEnabled={multiple}
        showsHorizontalScrollIndicator={false}
        onScrollBeginDrag={() => (dragging.current = true)}
        onScrollEndDrag={() => {
          dragging.current = false;
          setRestart((n) => n + 1);
        }}
        onMomentumScrollEnd={onScrollEnd}
        style={{ width, height: HERO_HEIGHT }}>
        {photos.map((src, i) => (
          <Image
            key={i}
            source={{ uri: src }}
            style={{ width, height: HERO_HEIGHT }}
            contentFit="cover"
            transition={200}
            accessibilityLabel={`${name}, photo ${i + 1} sur ${photos.length}`}
          />
        ))}
      </ScrollView>
      {multiple && (
        <>
          <View style={styles.counter} pointerEvents="none">
            <Text style={styles.counterText}>
              {index + 1}/{photos.length}
            </Text>
          </View>
          <View style={styles.dots}>
            {photos.map((_, i) => (
              <Pressable
                key={i}
                onPress={() => {
                  goTo(i);
                  setRestart((n) => n + 1);
                }}
                hitSlop={6}
                accessibilityLabel={`Photo ${i + 1}`}>
                <View style={[styles.dot, i === index && styles.dotOn]} />
              </Pressable>
            ))}
          </View>
        </>
      )}
    </>
  );
}

function Info({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.info}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={16} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  hero: { height: HERO_HEIGHT },
  noPhoto: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // Bottom-right, above the overlapping card: the top-right corner is the phone's clock.
  counter: { position: 'absolute', right: 20, bottom: 38, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill, backgroundColor: 'rgba(15,27,76,0.6)' },
  counterText: { ...typo.captionStrong, color: '#fff' },
  // Above the info card, which overlaps the bottom of the photo.
  dots: { position: 'absolute', bottom: 40, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 8 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.55)' },
  dotOn: { width: 18, backgroundColor: '#fff' },
  back: {
    position: 'absolute',
    left: 20,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  // Overlaps the photo a little, like the restaurant page.
  card: { marginTop: -28, marginHorizontal: 20, backgroundColor: colors.card, borderRadius: radii.lg, padding: 16, gap: 8 },
  cat: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 3, borderRadius: radii.pill },
  catText: { ...typo.captionStrong },
  name: { ...typo.h2, color: colors.navy },
  description: { ...typo.body, color: colors.muted2, lineHeight: 20 },
  body: { paddingHorizontal: 20, marginTop: 16, gap: 12 },
  infoCard: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 14, gap: 12 },
  info: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  infoLabel: { ...typo.caption, color: colors.muted2 },
  infoValue: { ...typo.bodyStrong, color: colors.navy, marginTop: 1 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  note: { ...typo.caption, textAlign: 'center', color: colors.muted2 },
});
