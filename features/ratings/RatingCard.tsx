import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, shadow, typo } from '@/constants/theme';
import { ratingsApi, STAR_WORDS, type MyRatingDto, type RatingSubject } from './api';
import { RatingSheet, Stars } from './RatingSheet';

/**
 * On a service's page once it's over (an order handed over, a trip, an event): « Ta note », the stars to tap, or the
 * rating given (tap to change it). Nothing while it can't be rated.
 */
export function RatingCard({ subject, id }: { subject: RatingSubject; id: string }) {
  const [mine, setMine] = useState<MyRatingDto | null>(null);
  const [open, setOpen] = useState(false);
  useFocusEffect(
    useCallback(() => {
      ratingsApi.mine(subject, id).then(setMine, () => undefined);
    }, [subject, id]),
  );
  if (!mine?.rateable) return null;
  const rated = mine.stars !== null;

  return (
    <>
      <Pressable style={[styles.card, shadow.card]} onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={rated ? `Ta note : ${mine.stars} sur 5. Modifier` : `Noter ${mine.rateable.ratedName}`}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.title}>{rated ? 'Ta note' : `Noter ${mine.rateable.ratedName || 'ce service'}`}</Text>
          <Text style={styles.muted} numberOfLines={2}>
            {rated ? (mine.comment ? `« ${mine.comment} »` : STAR_WORDS[mine.stars!]) : 'Facultatif · ça aide les autres étudiants à choisir.'}
          </Text>
        </View>
        <Stars value={mine.stars ?? 0} size={20} />
      </Pressable>
      {open && (
        <RatingSheet
          item={mine.rateable}
          initial={{ stars: mine.stars, comment: mine.comment }}
          onClose={() => setOpen(false)}
          onDone={() => ratingsApi.mine(subject, id).then(setMine, () => undefined)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radii.lg, backgroundColor: colors.card },
  title: { ...typo.bodyStrong, color: colors.navy },
  muted: { ...typo.caption, color: colors.muted2 },
});
