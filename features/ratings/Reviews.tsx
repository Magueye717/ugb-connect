import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SheetHeader, TextButton } from '@/components/ui';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { ratingsApi, reviewedAgo, type ReviewsDto } from './api';
import { Stars } from './RatingSheet';

/** On the page: the latest few; the sheet has the rest. */
const PREVIEW = 3;

/**
 * « Avis » on a restaurant's or shop's page: the average and how the stars split (5 to 1), then the latest comments,
 * anonymous (stars, words, when). « Voir les N avis » opens them all. Nothing until the first rating.
 */
export function ReviewsSection({ businessId }: { businessId: string }) {
  const [data, setData] = useState<ReviewsDto | null>(null);
  const [open, setOpen] = useState(false);
  useFocusEffect(
    useCallback(() => {
      ratingsApi.reviews(businessId).then(setData, () => undefined);
    }, [businessId]),
  );
  if (!data?.count) return null;

  return (
    <View style={styles.section}>
      <View style={styles.headRow}>
        <Text style={styles.h2}>Avis</Text>
        <Text style={styles.muted}>Anonymes · après une commande</Text>
      </View>
      <Pressable style={[styles.card, shadow.card]} onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`${data.avg} sur 5, ${data.count} avis. Voir les avis`}>
        <Summary data={data} />
      </Pressable>
      {data.items.slice(0, PREVIEW).map((r, i) => (
        <Review key={i} r={r} />
      ))}
      {(data.comments > PREVIEW || data.count > data.comments) && (
        <TextButton label={data.comments > PREVIEW ? `Voir les ${data.comments} avis` : 'Voir le détail des notes'} icon="chatbubbles-outline" style={{ alignSelf: 'center' }} onPress={() => setOpen(true)} />
      )}

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Fermer" />
        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <View style={styles.handle} />
          <SheetHeader onClose={() => setOpen(false)} titleStyle={styles.h2}>Avis</SheetHeader>
          <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 12 }} showsVerticalScrollIndicator={false}>
            <Summary data={data} />
            {data.items.map((r, i) => (
              <Review key={i} r={r} />
            ))}
            {data.count > data.comments && (
              <Text style={[styles.muted, { textAlign: 'center' }]}>
                {data.count - data.comments} note{data.count - data.comments > 1 ? 's' : ''} sans commentaire
              </Text>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

/** The big average, its stars and the count; beside it, one bar per star level. */
function Summary({ data }: { data: ReviewsDto }) {
  const top = Math.max(1, ...data.distribution.map((d) => d.count));
  return (
    <View style={styles.summary}>
      <View style={styles.avgBox}>
        <Text style={styles.avg}>{data.avg?.toFixed(1)}</Text>
        <Stars value={Math.round(data.avg ?? 0)} size={13} />
        <Text style={styles.muted}>
          {data.count} avis
        </Text>
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        {data.distribution.map((d) => (
          <View key={d.stars} style={styles.barRow} accessibilityLabel={`${d.stars} étoiles : ${d.count}`}>
            <Text style={styles.barLabel}>{d.stars}</Text>
            <Ionicons name="star" size={10} color={colors.warning} />
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${(d.count / top) * 100}%` }]} />
            </View>
            <Text style={styles.barCount}>{d.count}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Review({ r }: { r: ReviewsDto['items'][number] }) {
  return (
    <View style={[styles.review, shadow.card]}>
      <View style={styles.reviewHead}>
        <Stars value={r.stars} size={13} />
        <Text style={styles.muted}>{reviewedAgo(r.at)}</Text>
      </View>
      <Text style={styles.comment}>{r.comment}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10, marginTop: 8 },
  headRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  h2: { ...typo.section, color: colors.navy },
  muted: { ...typo.caption, color: colors.muted2 },
  card: { padding: 14, borderRadius: radii.lg, backgroundColor: colors.card },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avgBox: { alignItems: 'center', gap: 2, minWidth: 74 },
  avg: { fontSize: 34, fontWeight: '800', color: colors.navy, lineHeight: 38 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  barLabel: { ...typo.captionStrong, color: colors.navy, width: 8, textAlign: 'right' },
  barTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.bg, overflow: 'hidden', marginLeft: 2 },
  barFill: { height: 6, borderRadius: 3, backgroundColor: colors.warning },
  barCount: { ...typo.caption, color: colors.muted2, width: 22, textAlign: 'right' },
  review: { padding: 12, gap: 6, borderRadius: radii.md, backgroundColor: colors.card },
  reviewHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  comment: { ...typo.body, color: colors.text },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,27,76,0.4)' },
  sheet: { maxHeight: '85%', backgroundColor: colors.bg, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, paddingHorizontal: 16, paddingTop: 10, gap: 10 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border },
});
