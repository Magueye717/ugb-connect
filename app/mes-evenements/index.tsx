import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { eventWhen } from '@/components/home';
import { EmptyState, ErrorState, SkeletonCard } from '@/components/states';
import { BackButton, StatusChip } from '@/components/ui';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { EVENT_STATUS, type OrgEventDto } from '@/features/events/api';
import { DoorActions } from '@/features/events/DoorActions';
import { eventsSource } from '@/features/events/source';

/**
 * "Mes événements": the events a student organizes, or (`org`, from the organizer space) an organization's; where each
 * one stands (validation, corrections, on sale).
 */
export default function MesEvenements() {
  const { org } = useLocalSearchParams<{ org?: string }>();
  const [items, setItems] = useState<OrgEventDto[] | null>(null);
  // The first load failed (no network…): « Impossible de charger », with « Réessayer » (not an empty list).
  const [loadFailed, setLoadFailed] = useState(false);
  const load = useCallback(() => {
    setLoadFailed(false);
    eventsSource(org ?? null)
      .list()
      .then((r) => setItems(r.items), () => setLoadFailed(true));
  }, [org]);
  useFocusEffect(load);
  const back = () => (router.canGoBack() ? router.back() : router.replace(org ? '/activites' : '/(tabs)/profil'));
  const onSale = items?.find((e) => e.status === 'published');
  const open = (id: string) => router.push(org ? { pathname: '/mes-evenements/[id]', params: { id, org } } : `/mes-evenements/${id}`);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.head}>
        <BackButton onPress={back} />
        <Text style={styles.h1}>{org ? 'Événements' : 'Mes événements'}</Text>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
        <Pressable style={[styles.new, shadow.card]} onPress={() => open('nouveau')} accessibilityRole="button">
          <View style={styles.newIcon}>
            <Ionicons name="add" size={22} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Organiser un événement</Text>
            <Text style={styles.muted}>{org ? 'Soirée, conférence, sortie… avec billetterie : les étudiants demandent leurs billets et te paient en espèces.' : 'Soirée, conférence, sortie… avec billetterie. Validé par l’équipe UGB Connect avant la mise en vente.'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>

        {/* An event on sale: its door (scan at the entrance, cash validated) one tap away. */}
        {!!onSale && <DoorActions org={onSale.organizer.id} />}

        {!items && !loadFailed && (<>{/* Loading: the shape of what's coming. */}<SkeletonCard /><SkeletonCard /></>)}
        {!items && loadFailed && <ErrorState onRetry={load} />}
        {items?.length === 0 && <EmptyState icon="sparkles-outline" title="Aucun événement" text="Crée ton premier événement : il sera vérifié avant d’être publié." />}
        {items?.map((e) => {
          const s = EVENT_STATUS[e.status];
          return (
            <Pressable key={e.id} style={[styles.card, shadow.card]} onPress={() => open(e.id)} accessibilityRole="button">
              <Image source={{ uri: e.images[0] }} style={styles.thumb} contentFit="cover" />
              <View style={{ flex: 1, gap: 4 }}>
                <StatusChip label={s.label} tone={s.tone} />
                <Text style={styles.title} numberOfLines={1}>
                  {e.title}
                </Text>
                <Text style={styles.muted}>{eventWhen(e.startsAt)} · {e.venue.name}</Text>
                {e.status === 'changes_requested' && e.review && (
                  <Text style={styles.review} numberOfLines={2}>
                    À corriger : {e.review.message}
                  </Text>
                )}
                {e.status === 'published' && <Text style={styles.muted}>{e.counts.booked} billet{e.counts.booked > 1 ? 's' : ''} vendu{e.counts.booked > 1 ? 's' : ''}</Text>}
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 },
  h1: { ...typo.h3, color: colors.navy },
  body: { padding: 20, gap: 12, paddingBottom: 32 },
  new: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: radii.lg, padding: 14 },
  newIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: radii.lg, padding: 12 },
  thumb: { width: 72, height: 72, borderRadius: radii.md, backgroundColor: colors.border },
  title: { ...typo.bodyStrong, color: colors.navy },
  muted: { ...typo.caption, color: colors.muted2, lineHeight: 17 },
  review: { ...typo.captionStrong, color: colors.dangerText },
});
