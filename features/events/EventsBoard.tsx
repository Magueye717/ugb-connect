import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { eventWhen } from '@/components/home';
import { EmptyState } from '@/components/states';
import { PrimaryButton } from '@/components/ui';
import { formatFcfa } from '@/constants/data';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useCampus } from '@/context/CampusContext';

/**
 * Every event on sale for this student, soonest first: the Campus tab's « Événements » section (and the events screen).
 * Each opens its page; « Demander un billet » goes straight to the tickets (paid in cash to the organizer).
 */
export function EventsBoard() {
  const { events, refresh } = useCampus();
  const items = events.filter((e) => e.salesOpen);
  const [refreshing, setRefreshing] = useState(false);
  const pull = () => {
    setRefreshing(true);
    refresh().finally(() => setRefreshing(false));
  };

  return (
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
                <PrimaryButton
                  size="sm"
                  icon="ticket-outline"
                  label={e.minPrice ? 'Demander un billet' : 'Réserver ma place'}
                  onPress={() => router.push({ pathname: '/evenement/[id]', params: { id: e.id, acheter: '1' } })}
                />
              </View>
            </View>
          </Pressable>
        ))}
      </ScrollView>
  );
}

const styles = StyleSheet.create({
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
});
