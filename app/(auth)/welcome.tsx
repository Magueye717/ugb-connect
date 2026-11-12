import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLogo } from '@/components/BrandLogo';
import { legalHref } from '@/features/legal/api';
import { colors, radii, typo } from '@/constants/theme';

type Slide = { key: string; title: string; highlight: string; text: string };

// Each slide answers a student's problem, not a list of features: the promise, the time and money saved, the trust.
const slides: Slide[] = [
  {
    key: 'campus',
    title: 'Toute l’UGB',
    highlight: 'dans ta poche.',
    text: 'Ton resto, ton bus pour Dakar, ton taxi, tes billets de soirée : tout se fait ici, entre étudiants.',
  },
  {
    key: 'temps',
    title: 'Moins de queue,',
    highlight: 'plus de temps.',
    text: 'Commande au resto, réserve ta place pour Dakar, partage ton taxi : tu demandes en quelques secondes, tu paies en espèces sur place.',
  },
  {
    key: 'confiance',
    title: 'Le campus',
    highlight: 'veille sur toi.',
    text: 'Un objet perdu retrouvé, une rupture au resto, un départ confirmé : tu es prévenu à temps. Et les étudiants notent chaque service.',
  },
];

const features: { label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { label: 'Resto', icon: 'restaurant-outline' },
  { label: 'Caravanes', icon: 'bus-outline' },
  { label: 'Sunu Taxi', icon: 'car-outline' },
  { label: 'Lieux', icon: 'location-outline' },
  { label: 'Objets perdus', icon: 'cube-outline' },
];

// The welcome photos, one picked at random each time the screen opens. Both 1024×1536; `face`: where the student's
// face is in the image, kept in the upper part of the screen whatever the phone size (the lower part may slide under
// the navy fade). `zoom` < 1 zooms out: the photo is shorter than the screen and the navy fade fills the bottom.
const PHOTOS = [
  { source: require('@/assets/images/welcome-girl.jpg'), face: { x: 0.47, y: 0.4 }, zoom: 0.92 },
  // Further out: the UGB tower and its sign behind him are what make it our campus.
  { source: require('@/assets/images/welcome-boy.jpg'), face: { x: 0.44, y: 0.33 }, zoom: 0.82 },
];
const PHOTO_RATIO = 1536 / 1024;
const FACE_SCREEN_Y = 0.3;

function photoFrame(width: number, height: number, face: { x: number; y: number }, zoom: number) {
  const h = Math.max(height * zoom, width * PHOTO_RATIO);
  const w = h / PHOTO_RATIO;
  const top = Math.min(0, FACE_SCREEN_Y * height - face.y * h);
  const left = Math.min(0, Math.max(width - w, width / 2 - face.x * w));
  return { position: 'absolute' as const, width: w, height: h, top, left };
}

/** Pixels per second: slow enough to read each tag as it passes. */
const MARQUEE_SPEED = 30;

/**
 * What the app does (Resto, Caravanes…), sliding by on a loop: the list twice in a row, moved left by one list's
 * width, then again from the start (no jump: the second copy is where the first was). Still when the system asks for
 * less motion.
 */
function FeatureMarquee() {
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const x = useSharedValue(0);
  useEffect(() => {
    if (!width || reduced) return;
    x.set(0);
    x.set(withRepeat(withTiming(-width, { duration: (width / MARQUEE_SPEED) * 1000, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(x);
  }, [width, reduced, x]);
  const moving = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  const row = (copy: number) => (
    <View style={styles.featureRow} onLayout={copy === 0 ? (e) => setWidth(e.nativeEvent.layout.width) : undefined} accessibilityElementsHidden={copy > 0} importantForAccessibility={copy > 0 ? 'no-hide-descendants' : 'auto'}>
      {features.map((f) => (
        <View key={f.label} style={styles.feature}>
          <Ionicons name={f.icon} size={16} color="#fff" />
          <Text style={styles.featureText}>{f.label}</Text>
        </View>
      ))}
    </View>
  );
  return (
    <View style={styles.features} accessibilityLabel={features.map((f) => f.label).join(', ')}>
      <Animated.View style={[styles.marquee, moving]}>
        {row(0)}
        {row(1)}
      </Animated.View>
    </View>
  );
}

const avatars = [
  { initials: 'AD', color: colors.orange },
  { initials: 'MS', color: colors.purple },
  { initials: 'FN', color: colors.success },
];

// Onboarding, shown before Connexion / Inscription.
export default function WelcomeScreen() {
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [slideHeight, setSlideHeight] = useState(0);
  const list = useRef<FlatList<Slide>>(null);
  // Drawn once per visit: the same photo while the screen stays open.
  const [photo] = useState(() => PHOTOS[Math.floor(Math.random() * PHOTOS.length)]!);

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));

  const goTo = (i: number) => {
    list.current?.scrollToIndex({ index: i, animated: true });
    setIndex(i);
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Image source={photo.source} style={photoFrame(width, height, photo.face, photo.zoom)} resizeMode="cover" />
      <LinearGradient
        colors={['rgba(15,27,76,0.4)', 'rgba(15,27,76,0)', 'rgba(15,27,76,0)', 'rgba(15,27,76,0.88)', colors.navy]}
        locations={[0, 0.14, 0.42, 0.62, 0.8]}
        style={StyleSheet.absoluteFill}
      />
      <View style={{ flex: 1 }}>
        <SafeAreaView edges={['top']} style={{ flex: 1 }}>
          <View style={styles.header}>
            <View style={styles.brand}>
              <BrandLogo size={28} />
              <Text style={styles.brandText}>UGB Connect</Text>
            </View>
            <View style={styles.proof}>
              <View style={{ flexDirection: 'row' }}>
                {avatars.map((a, i) => (
                  <View key={a.initials} style={[styles.avatar, { backgroundColor: a.color, marginLeft: i ? -6 : 0 }]}>
                    <Text style={styles.avatarText}>{a.initials}</Text>
                  </View>
                ))}
              </View>
              {/* Short: it shares the row with the brand, even on small phones. */}
              <Text style={styles.proofText} numberOfLines={1}>
                Rejoins-les
              </Text>
            </View>
          </View>

          <FlatList
            ref={list}
            style={{ flex: 1 }}
            onLayout={(e) => setSlideHeight(e.nativeEvent.layout.height)}
            data={slides}
            keyExtractor={(s) => s.key}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onScrollEnd}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            renderItem={({ item }) => (
              <View style={[styles.slide, { width, height: slideHeight }]}>
                <Text style={styles.title}>
                  {item.title}
                  {'\n'}
                  <Text style={{ color: colors.orange }}>{item.highlight}</Text>
                </Text>
                <Text style={styles.text}>{item.text}</Text>
              </View>
            )}
          />

          <FeatureMarquee />
        </SafeAreaView>
      </View>

      <SafeAreaView edges={['bottom']} style={styles.panel}>
        <View style={styles.dots}>
          {slides.map((s, i) => (
            <Pressable
              key={s.key}
              onPress={() => goTo(i)}
              hitSlop={6}
              accessibilityLabel={`Diapositive ${i + 1}`}
              style={[styles.dot, i === index && styles.dotActive]}
            />
          ))}
        </View>
        <Pressable
          onPress={() => router.push('/(auth)/register')}
          style={({ pressed }) => [styles.primary, pressed && { opacity: 0.85 }]}>
          <Text style={styles.primaryText}>Créer un compte</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/(auth)/login')}
          style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.7 }]}>
          <Text style={styles.secondaryText}>J’ai déjà un compte</Text>
        </Pressable>
        <Text style={styles.terms}>
          En continuant, tu acceptes nos{' '}
          <Text style={styles.termsLink} onPress={() => router.push(legalHref('conditions'))} accessibilityRole="link">
            Conditions
          </Text>{' '}
          et notre{' '}
          <Text style={styles.termsLink} onPress={() => router.push(legalHref('confidentialite'))} accessibilityRole="link">
            Politique de confidentialité
          </Text>
        </Text>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.navy },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginTop: 8,
  },
  brand: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 14,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(15,27,76,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  brandText: { ...typo.title, color: '#fff', letterSpacing: 0.4 },
  slide: { justifyContent: 'flex-end', paddingHorizontal: 24, paddingBottom: 8 },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowRadius: 12,
  },
  text: { ...typo.body, lineHeight: 20, color: 'rgba(255,255,255,0.85)', marginTop: 8 },
  // Gives way to the brand on narrow phones rather than pushing the header off screen.
  proof: {
    flexShrink: 1,
    marginLeft: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 5,
    paddingLeft: 5,
    paddingRight: 12,
    borderRadius: radii.pill,
    backgroundColor: '#fff',
  },
  // 28 px with a small overlap: the initials stay readable.
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...typo.label, color: '#fff' },
  proofText: { flexShrink: 1, fontSize: 12, fontWeight: '600', color: colors.text },
  features: { overflow: 'hidden', paddingTop: 14, paddingBottom: 14 },
  marquee: { flexDirection: 'row', alignSelf: 'flex-start', paddingLeft: 24 },
  // Each copy ends with the same gap as between tags: the loop's seam doesn't show.
  featureRow: { flexDirection: 'row', gap: 8, paddingRight: 8 },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  featureText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  panel: { paddingHorizontal: 24, paddingTop: 6, gap: 12 },
  dots: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.3)' },
  dotActive: { width: 28, backgroundColor: colors.orange },
  primary: {
    minHeight: 56,
    borderRadius: radii.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  primaryText: { ...typo.title, color: '#fff' },
  secondary: {
    minHeight: 56,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { ...typo.title, color: '#fff' },
  terms: {
    fontSize: 12,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  termsLink: { color: 'rgba(255,255,255,0.85)', fontWeight: '600' },
});
