import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/states';
import { colors } from '@/constants/theme';
import { ratingsApi, type MyRatingDto, type RatingSubject } from '@/features/ratings/api';
import { RatingSheet } from '@/features/ratings/RatingSheet';

const SUBJECTS: RatingSubject[] = ['caravan', 'event', 'order'];

/** Opened from the « Bien arrivé ? » notification: the rating sheet for that trip or event, then back. */
export default function Noter() {
  const { subject, id } = useLocalSearchParams<{ subject: string; id: string }>();
  const s = SUBJECTS.includes(subject as RatingSubject) ? (subject as RatingSubject) : null;
  const [mine, setMine] = useState<MyRatingDto | null>(null);
  const [failed, setFailed] = useState(!s);
  useEffect(() => {
    if (s && id) ratingsApi.mine(s, id).then(setMine, () => setFailed(true));
  }, [s, id]);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));

  return (
    <SafeAreaView style={styles.safe}>
      {mine?.rateable ? (
        <RatingSheet item={mine.rateable} initial={{ stars: mine.stars, comment: mine.comment }} prompted={mine.stars === null} onClose={back} />
      ) : failed || mine ? (
        <View style={{ padding: 20 }}>
          <EmptyState icon="star-outline" title="Plus rien à noter ici" text="Ce service ne peut plus être noté." action={{ label: 'Retour', onPress: back }} />
        </View>
      ) : (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.bg } });
