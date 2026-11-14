import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { lostCategory, lostTone } from '@/constants/data';
import { colors, radii, typo } from '@/constants/theme';
import type { LostItemDto } from './api';

type Variant = 'card' | 'hero' | 'thumb';
const ICON: Record<Variant, number> = { card: 30, hero: 64, thumb: 18 };
const TILE: Record<Variant, number> = { card: 58, hero: 120, thumb: 0 };
const PATTERN: Record<Variant, number> = { card: 54, hero: 110, thumb: 0 };

/**
 * An object's picture: its photo, or (none sent) an illustration of its type: keys, bag, phone… so the board
 * still reads at a glance. Cards (student, identity, bank) are never shown in photo, only their type.
 */
export function LostVisual({ item, variant, style }: { item: Pick<LostItemDto, 'kind' | 'category' | 'photo'>; variant: Variant; style?: StyleProp<ViewStyle> }) {
  const photo = item.kind === 'object' ? item.photo : null;
  // The illustration is always drawn; a photo goes on top of it. While it loads, or if it can't be loaded (no
  // network, a file gone from the storage), the object's drawing shows instead of an empty grey box.
  return (
    <View style={[styles.fill, style]}>
      <LostPlaceholder category={item.category} card={item.kind !== 'object'} variant={variant} quiet={!!photo} />
      {photo && <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />}
    </View>
  );
}

function LostPlaceholder({ category, card, variant, style, quiet }: { category: string; card: boolean; variant: Variant; style?: StyleProp<ViewStyle>; /** Under a photo: no « pas de photo » caption. */ quiet?: boolean }) {
  const cat = lostCategory(category);
  const tone = lostTone(category);
  if (variant === 'thumb')
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: tone.bg }, style]}>
        <Ionicons name={cat.icon} size={ICON.thumb} color={tone.tint} />
      </View>
    );
  return (
    <View style={[styles.fill, { backgroundColor: tone.bg }, style]} accessibilityLabel={`${cat.label}, pas de photo`}>
      <LinearGradient colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      {/* The same object, large and faint, behind: a drawing rather than an empty box. */}
      <Ionicons name={cat.icon} size={PATTERN[variant]} color={tone.tint} style={[styles.pattern, styles.patternA]} />
      <Ionicons name={cat.icon} size={PATTERN[variant] * 0.7} color={tone.tint} style={[styles.pattern, styles.patternB]} />
      <View style={styles.center}>
        <View style={[styles.tile, { width: TILE[variant], height: TILE[variant], borderRadius: TILE[variant] * 0.3 }]}>
          <Ionicons name={cat.icon} size={ICON[variant]} color={tone.tint} />
        </View>
      </View>
      {!quiet && (
      <View style={[styles.caption, variant === 'hero' && styles.captionHero]}>
        {card && <Ionicons name="eye-off-outline" size={10} color={colors.muted2} />}
        <Text style={styles.captionText} numberOfLines={1}>
          {card ? (variant === 'hero' ? 'Pièce personnelle : jamais en photo' : 'Jamais en photo') : `${cat.label} · pas de photo`}
        </Text>
      </View>
      )}
    </View>
  );
}

const cover = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const;

const styles = StyleSheet.create({
  fill: { ...cover, overflow: 'hidden' },
  center: { ...cover, alignItems: 'center', justifyContent: 'center' },
  pattern: { position: 'absolute', opacity: 0.1 },
  patternA: { top: -8, right: -10, transform: [{ rotate: '-18deg' }] },
  patternB: { bottom: -6, left: -8, transform: [{ rotate: '14deg' }] },
  tile: { backgroundColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center', shadowColor: '#0F1B4C', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  caption: { position: 'absolute', bottom: 6, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: radii.pill, backgroundColor: 'rgba(255,255,255,0.9)', maxWidth: '92%' },
  captionHero: { bottom: 16 },
  captionText: { ...typo.label, color: colors.muted2 },
});
