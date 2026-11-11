import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { eventWhen } from '@/components/home';
import { EmptyState, ErrorState } from '@/components/states';
import { FillBar, OrganizerLine } from '@/components/caravan';
import { StatusChip } from '@/components/ui';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { EVENT_STATUS, type OrgEventDto } from '@/features/events/api';
import { eventsSource } from '@/features/events/source';
import { useOrgDepartures } from '@/features/organizer/boarding';
import { useNow } from '@/lib/useNow';

/**
 * Organizer home: what the organization does, and only that. A transport company sees its departures (soonest first,
 * each opening its passenger list, a draft its form); an association its events (each opening its page: requests,
 * photos, the door); one doing both sees both. The owner and managers create here; scanners only see the lists.
 */
export default function Activites() {
  const { organizer } = useAuth();
  const { items: mine, loading, error, refresh } = useOrgDepartures();
  const canCreate = !!organizer?.roles.some((r) => r === 'owner' || r === 'manager');
  const now = useNow();
  const caps = organizer?.capabilities ?? [];
  const events = caps.includes('events');
  // An organization without either (older data) is a transport company: caravans were the first activity.
  const caravans = caps.includes('caravans') || !events;
  const ev = useOrgEvents(events ? organizer?.orgId : undefined);
  const reload = () => {
    if (caravans) refresh();
    ev.load();
  };
  const newEvent = () => organizer && router.push({ pathname: '/mes-evenements/[id]', params: { id: 'nouveau', org: organizer.orgId } });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={false} onRefresh={reload} />}>
        <Text style={styles.h1}>Mes activités</Text>
        {organizer && (
          <View style={[styles.card, shadow.card, { gap: 12 }]}>
            <OrganizerLine organizer={organizer} />
            {canCreate && (
              <View style={styles.createRow}>
                {caravans && (
                  <Pressable style={styles.create} onPress={() => router.push('/depart/edition/nouveau')} accessibilityRole="button">
                    <Ionicons name="add" size={18} color="#fff" />
                    <Text style={styles.createText}>Nouveau départ</Text>
                  </Pressable>
                )}
                {events && (
                  <Pressable style={[styles.create, caravans && styles.createAlt]} onPress={newEvent} accessibilityRole="button">
                    <Ionicons name="sparkles" size={16} color="#fff" />
                    <Text style={styles.createText}>Nouvel événement</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        )}

        {events && organizer && <EventsSection org={organizer.orgId} state={ev} canCreate={canCreate} />}

        {caravans && events && <Text style={styles.section}>Caravanes</Text>}
        {caravans && (
          <Departures
            items={mine}
            loading={loading}
            error={error}
            refresh={refresh}
            canCreate={canCreate}
            now={now}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

type DeparturesProps = { items: ReturnType<typeof useOrgDepartures>['items']; loading: boolean; error: string | null; refresh: () => void; canCreate: boolean; now: number };

/** The organization's departures: each opens its passenger list (a draft, its form). */
function Departures({ items: mine, loading, error, refresh, canCreate, now }: DeparturesProps) {
  return (
    <>
        {loading && <ActivityIndicator color={colors.primary} />}
        {!loading && error && mine.length === 0 && <ErrorState text={error} onRetry={refresh} />}
        {!loading && !error && mine.length === 0 && (
          <EmptyState
            icon="bus-outline"
            title="Aucun départ à venir"
            text={canCreate ? 'Crée ton premier départ : trajet, arrêts, prix. Les étudiants réservent depuis l’onglet Caravanes.' : 'Les départs créés par ton organisation apparaissent ici.'}
          />
        )}
        {mine.map((c) => {
          const total = c.counts.booked;
          const on = c.counts.admitted;
          return (
            <Pressable
              key={c.id}
              style={[styles.card, shadow.card, { gap: 12 }]}
              onPress={() => router.push(c.status === 'draft' && canCreate ? `/depart/edition/${c.id}` : `/depart/${c.id}`)}
              accessibilityRole="button"
              accessibilityLabel={c.status === 'draft' ? `Brouillon ${c.from} vers ${c.to}, ${c.date}` : `Liste des passagers ${c.from} vers ${c.to}, ${c.date}, ${total} passagers`}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.route}>
                    {c.from} → {c.to}
                  </Text>
                  <Text style={styles.muted}>
                    {c.date} · {c.time} · {c.plate ?? c.vehicle.label}
                    {c.status === 'draft' ? ' · brouillon' : c.status === 'departed' ? ' · en route' : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </View>
              <View style={styles.chips}>
                <Chip icon="enter-outline" text={`${c.pickups.length} montée${c.pickups.length > 1 ? 's' : ''}`} />
                <Chip icon="exit-outline" text={`${c.dropoffs.length} arrêt${c.dropoffs.length > 1 ? 's' : ''}`} />
                {on > 0 && <Chip icon="checkmark-circle-outline" text={`${on}/${total} à bord`} tone="success" />}
              </View>
              <FillBar caravan={c} />
              {canCreate && (c.status === 'published' || c.status === 'confirmed') && c.departureAt > now && (
                <Pressable onPress={() => router.push(`/depart/edition/${c.id}`)} style={styles.editLink} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Modifier ${c.from} vers ${c.to}`}>
                  <Ionicons name="create-outline" size={15} color={colors.primary} />
                  <Text style={styles.editLinkText}>Modifier (arrêts, véhicule)</Text>
                </Pressable>
              )}
            </Pressable>
          );
        })}
    </>
  );
}

/** The organization's events, loaded each time the screen shows (a request validated elsewhere, a review decided). */
function useOrgEvents(org: string | undefined) {
  const [items, setItems] = useState<OrgEventDto[] | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    if (!org) return;
    setFailed(false);
    eventsSource(org)
      .list()
      .then((r) => setItems(r.items), () => setFailed(true));
  }, [org]);
  useFocusEffect(load);
  return { items, failed, load };
}

/** Events: on sale first, then the ones being prepared; each opens its page (requests, photos, the door). */
function EventsSection({ org, state, canCreate }: { org: string; state: ReturnType<typeof useOrgEvents>; canCreate: boolean }) {
  const { items, failed, load } = state;
  const rank = (e: OrgEventDto) => (e.status === 'published' ? 0 : e.status === 'completed' || e.status === 'cancelled' || e.status === 'rejected' ? 2 : 1);
  const list = items ? [...items].sort((a, b) => rank(a) - rank(b) || a.startsAt.localeCompare(b.startsAt)) : null;
  const open = (id: string) => router.push({ pathname: '/mes-evenements/[id]', params: { id, org } });
  return (
    <>
      <Text style={styles.section}>Événements</Text>
      {!list && !failed && <ActivityIndicator color={colors.primary} />}
      {!list && failed && <ErrorState onRetry={load} />}
      {list?.length === 0 && (
        <EmptyState
          icon="sparkles-outline"
          title="Aucun événement"
          text={canCreate ? 'Crée ton premier événement : soirée, conférence, sortie… Les étudiants demandent leurs billets et te paient en espèces.' : 'Les événements de ton organisation apparaissent ici.'}
        />
      )}
      {list?.map((e) => {
        const st = EVENT_STATUS[e.status];
        return (
          <Pressable key={e.id} style={[styles.card, shadow.card, styles.eventRow]} onPress={() => open(e.id)} accessibilityRole="button" accessibilityLabel={`${e.title}, ${st.label}`}>
            <Image source={{ uri: e.images[0] }} style={styles.thumb} contentFit="cover" />
            <View style={{ flex: 1, gap: 4 }}>
              <StatusChip label={st.label} tone={st.tone} />
              <Text style={styles.route} numberOfLines={1}>
                {e.title}
              </Text>
              <Text style={styles.muted} numberOfLines={1}>
                {eventWhen(e.startsAt)} · {e.venue.name}
              </Text>
              {e.status === 'published' && (
                <Text style={styles.muted}>
                  {e.counts.booked} billet{e.counts.booked > 1 ? 's' : ''} · {e.counts.admitted} entré{e.counts.admitted > 1 ? 's' : ''}
                </Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        );
      })}
    </>
  );
}

function Chip({ icon, text, tone }: { icon: keyof typeof Ionicons.glyphMap; text: string; tone?: 'success' }) {
  const fg = tone ? colors.successText : colors.primary;
  return (
    <View style={[styles.chip, tone && { backgroundColor: colors.successBg }]}>
      <Ionicons name={icon} size={13} color={fg} />
      <Text style={[styles.chipText, { color: fg }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 20, gap: 12, paddingBottom: 32 },
  h1: { ...typo.h1, color: colors.navy },
  card: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 14 },
  editLink: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 2 },
  editLinkText: { ...typo.smallStrong, color: colors.primary },
  createRow: { flexDirection: 'row', gap: 10 },
  create: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, borderRadius: radii.sm, backgroundColor: colors.accent },
  createAlt: { backgroundColor: colors.primary },
  createText: { color: '#fff', fontWeight: '700' },
  section: { ...typo.section, color: colors.navy, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  route: { ...typo.title, color: colors.navy },
  muted: { ...typo.caption, color: colors.muted2, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primarySoft, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { ...typo.captionStrong },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  thumb: { width: 64, height: 64, borderRadius: radii.md, backgroundColor: colors.border },
});
