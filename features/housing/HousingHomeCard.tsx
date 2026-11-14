import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LivePulse } from '@/components/motion';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { housingApi, KIND, type HousingAdDto } from '@/features/housing/api';

const openBoard = () => router.push({ pathname: '/(tabs)/lieux', params: { vue: 'logement' } });

/**
 * Home: housing between students in one slim card: the swaps that fit mine (if any), what's online, « Voir » the
 * board, « Publier » an ad.
 */
export function HousingHomeCard() {
  const [ads, setAds] = useState<HousingAdDto[] | null>(null);
  useFocusEffect(
    useCallback(() => {
      housingApi.list().then((r) => setAds(r.items), () => undefined);
    }, []),
  );
  if (!ads) return null;
  const others = ads.filter((a) => a.state === 'open' && !a.mine).sort((x, y) => Number(y.match) - Number(x.match));
  const matches = others.filter((a) => a.match).length;
  const publish = () => router.push('/logement/publier' as never);

  return (
    <View style={[styles.card, shadow.card]}>
      <Pressable style={styles.head} onPress={openBoard} accessibilityRole="button" accessibilityLabel="Logement : voir toutes les annonces">
        <View style={styles.label}>
          <Ionicons name="bed-outline" size={11} color={colors.primary} />
          <Text style={styles.labelText}>LOGEMENT</Text>
        </View>
        <Text style={styles.all}>Voir ›</Text>
      </Pressable>

      {matches > 0 && (
        <Pressable style={styles.match} onPress={openBoard} accessibilityRole="button">
          <View style={styles.matchDot}>
            <LivePulse color={colors.success} size={22} />
            <Ionicons name="swap-horizontal" size={12} color="#fff" />
          </View>
          <Text style={styles.matchText}>
            {matches} échange{matches > 1 ? 's' : ''} de chambre possible{matches > 1 ? 's' : ''} pour toi
          </Text>
          <Ionicons name="chevron-forward" size={14} color={colors.successText} />
        </Pressable>
      )}

      {/* One slim line, always: what it's for (or how many ads are online), « Voir » the board, « Publier » an ad. */}
      <View style={styles.empty}>
        <Pressable style={styles.emptyMain} onPress={openBoard} accessibilityRole="button" accessibilityLabel="Logement : voir les annonces">
          <View style={styles.emptyIcons}>
            {(['swap', 'host_offer', 'roommate'] as const).map((k, i) => (
              <LinearGradient key={k} colors={KIND[k].grad} style={[styles.emptyIcon, { marginLeft: i ? -6 : 0 }]}>
                <Ionicons name={KIND[k].icon} size={12} color="#fff" />
              </LinearGradient>
            ))}
          </View>
          <Text style={styles.emptyText}>
            {others.length
              ? `${others.length} annonce${others.length > 1 ? 's' : ''} en ligne : échanges, hébergements, colocations.`
              : 'Échange ta chambre, trouve où dormir, partage un loyer.'}
          </Text>
        </Pressable>
        <Pressable onPress={publish} hitSlop={8} accessibilityRole="button" accessibilityLabel="Publier une annonce">
          <Text style={styles.publishLink}>Publier</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radii.md, padding: 12, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  // Card labels (« PROCHAINE CARAVANE », « MENUS DU JOUR »…): small caps, quiet; the content is what stands out.
  labelText: { fontSize: 10, fontWeight: '700', color: colors.muted2, letterSpacing: 0.3 },
  all: { ...typo.captionStrong, color: colors.primary },
  match: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: radii.sm, backgroundColor: colors.successBg },
  matchDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' },
  matchText: { ...typo.captionStrong, color: colors.successText, flex: 1 },
  empty: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  emptyMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  emptyIcons: { flexDirection: 'row' },
  emptyIcon: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.card },
  emptyText: { ...typo.caption, color: colors.text, flex: 1, lineHeight: 16 },
  publishLink: { ...typo.captionStrong, color: colors.primary },
});
