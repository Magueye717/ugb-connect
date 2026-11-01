import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { eventWhen } from '@/components/home';
import { EmptyState } from '@/components/states';
import { BackButton } from '@/components/ui';
import { formatFcfa } from '@/constants/data';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useCampus } from '@/context/CampusContext';

/** Every event on sale for this student (the home screen shows the next one), soonest first. */
export default function Evenements() {
  const { events, refresh } = useCampus();
  const items = events.filter((e) => e.salesOpen);
  const [refreshing, setRefreshing] = useState(false);
  const pull = () => {
    setRefreshing(true);
    refresh().finally(() => setRefreshing(false));
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.head}>
        <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />
        <Text style={styles.h1}>Événements</Text>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pull} />}>
        {items.length === 0 && <EmptyState icon="sparkles-outline" title="Aucun événement" text="Les soirées, conférences et sorties ouvertes à la réservation apparaîtront ici." />}
        {items.map((e) => (
          <Pressable key={e.id} style={[styles.card, shadow.card]} onPress={() => router.push(`/evenement/${e.id}`)} accessibilityRole="button">
            <Image source={{ uri: e.images[0] }} style={styles.cover} contentFit="cover" />
            <View style={styles.info}>
              <Text style={styles.category}>{e.categoryLabel.toUpperCase()}</Text>
              <Text style={styles.title} numberOfLines={2}>
                {e.title}
              </Text>
              <View style={styles.row}>
                <Ionicons name="calendar-outline" size={13} color={colors.muted2} />
                <Text style={styles.meta}>{eventWhen(e.startsAt)}</Text>
              </View>
              <View style={styles.row}>
                <Ionicons name="location-outline" size={13} color={colors.muted2} />
                <Text style={styles.meta} numberOfLines={1}>
                  {e.venue.name}
                </Text>
              </View>
              <View style={styles.footer}>
                <Text style={styles.price}>{e.minPrice ? `Dès ${formatFcfa(e.minPrice)}` : 'Gratuit'}</Text>
                <Pressable
                  style={styles.buy}
                  onPress={() => router.push({ pathname: '/evenement/[id]', params: { id: e.id, acheter: '1' } })}
                  accessibilityRole="button"
                  accessibilityLabel={`Acheter un ticket pour ${e.title}`}>
                  <Ionicons name="ticket-outline" size={16} color="#fff" />
                  <Text style={styles.buyText}>{e.minPrice ? 'Acheter un ticket' : 'Réserver ma place'}</Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 },
  h1: { ...typo.h3, color: colors.navy },
  body: { padding: 20, gap: 14, paddingBottom: 32 },
  card: { backgroundColor: colors.card, borderRadius: radii.lg, overflow: 'hidden' },
  cover: { width: '100%', height: 150, backgroundColor: colors.border },
  info: { padding: 14, gap: 4 },
  category: { ...typo.label, color: colors.primary, letterSpacing: 0.4 },
  title: { ...typo.title, color: colors.navy },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { ...typo.caption, color: colors.muted2, flexShrink: 1 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 8 },
  price: { ...typo.smallStrong, color: colors.successText },
  buy: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accent, minHeight: 40, paddingHorizontal: 16, borderRadius: radii.pill },
  buyText: { ...typo.smallStrong, color: '#fff' },
});
