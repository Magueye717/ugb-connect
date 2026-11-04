import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/states';
import { BackButton, Segmented, StatusChip } from '@/components/ui';
import { formatDateTime, formatFcfa } from '@/constants/data';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useCaravans } from '@/context/CaravansContext';
import { isCaravanTicket, type TicketDto } from '@/features/caravans/api';
import { useNow } from '@/lib/useNow';

type Tab = 'current' | 'archived';

/** Still to use: active, and the trip or event isn't over (a day's margin after it starts). */
const isCurrent = (t: TicketDto, now: number) => t.status === 'active' && !t.admittedAt && Date.parse(t.event.startsAt) > now - 24 * 3_600_000;

/** "Mes billets": every ticket (caravans, events), the ones to use first; used, cancelled, given or past ones archived. */
export default function MesBillets() {
  const { tickets, refresh } = useCaravans();
  const now = useNow();
  const [tab, setTab] = useState<Tab>('current');
  const [refreshing, setRefreshing] = useState(false);
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );
  const pull = () => {
    setRefreshing(true);
    Promise.resolve(refresh()).finally(() => setRefreshing(false));
  };

  const current = tickets.filter((t) => isCurrent(t, now)).sort((a, b) => Date.parse(a.event.startsAt) - Date.parse(b.event.startsAt));
  const archived = tickets.filter((t) => !isCurrent(t, now)).sort((a, b) => Date.parse(b.event.startsAt) - Date.parse(a.event.startsAt));
  const list = tab === 'current' ? current : archived;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profil'));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.head}>
        <BackButton onPress={back} />
        <Text style={styles.h1}>Mes billets</Text>
      </View>
      <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
        <Segmented
          options={[
            { value: 'current', label: current.length ? `En cours · ${current.length}` : 'En cours' },
            { value: 'archived', label: 'Archivés' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pull} />}>
        {list.length === 0 && (
          <EmptyState
            icon="ticket-outline"
            title={tab === 'current' ? 'Aucun billet à venir' : 'Aucun billet archivé'}
            text={tab === 'current' ? 'Réserve une caravane ou un événement : ton billet apparaît ici.' : undefined}
          />
        )}
        {list.map((t) => (
          <TicketRow key={t.id} t={t} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function TicketRow({ t }: { t: TicketDto }) {
  const caravan = isCaravanTicket(t);
  const state =
    t.status === 'cancelled' ? { label: 'Annulé', tone: 'danger' as const } : t.status === 'transferred' ? { label: 'Transféré', tone: 'neutral' as const } : t.admittedAt ? { label: 'Utilisé', tone: 'neutral' as const } : { label: 'Valide', tone: 'success' as const };
  return (
    <Pressable style={({ pressed }) => [styles.card, shadow.card, pressed && { opacity: 0.9 }]} onPress={() => router.push(`/billet/${t.id}`)} accessibilityRole="button" accessibilityLabel={`${t.event.title}, ${state.label}`}>
      <View style={[styles.icon, { backgroundColor: caravan ? colors.primarySoft : '#EEE8FF' }]}>
        <Ionicons name={caravan ? 'bus-outline' : 'sparkles-outline'} size={20} color={caravan ? colors.primary : colors.purpleText} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.title} numberOfLines={1}>
          {t.event.title}
        </Text>
        <Text style={styles.muted}>{formatDateTime(Date.parse(t.event.startsAt))}</Text>
        <Text style={styles.muted}>
          {t.seat ? `Place ${t.seat} · ` : ''}
          {formatFcfa(t.price)}
          {t.passenger ? ` · pour ${t.passenger.name.split(' ')[0]}` : ''}
        </Text>
      </View>
      <StatusChip label={state.label} tone={state.tone} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 8 },
  h1: { ...typo.h3, color: colors.navy, flex: 1 },
  body: { padding: 20, gap: 10, paddingBottom: 40 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: radii.lg, padding: 12 },
  icon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { ...typo.bodyStrong, color: colors.navy },
  muted: { ...typo.caption, color: colors.muted2 },
});
