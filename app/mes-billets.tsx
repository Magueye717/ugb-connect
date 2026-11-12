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
import { eventsApi, type EventDto } from '@/features/events/api';
import { useNow } from '@/lib/useNow';

type Tab = 'current' | 'archived';

/** Still to use: active, and the trip or event isn't over (a day's margin after it starts). */
const isCurrent = (t: TicketDto, now: number) => t.status === 'active' && !t.admittedAt && Date.parse(t.event.startsAt) > now - 24 * 3_600_000;

/**
 * "Mes billets": every ticket (caravans, events), the ones to use first; used, cancelled, given or past ones archived.
 * On top, the requests still waiting for their cash payment: no ticket yet, but its code to show the organizer.
 */
export default function MesBillets() {
  const { tickets, caravans, refresh } = useCaravans();
  // Events I asked tickets for, still to pay the organizer (caravans carry theirs).
  const [events, setEvents] = useState<EventDto[]>([]);
  const loadEvents = useCallback(() => {
    eventsApi.list().then((r) => setEvents(r.items), () => undefined);
  }, []);
  const now = useNow();
  const [tab, setTab] = useState<Tab>('current');
  const [refreshing, setRefreshing] = useState(false);
  useFocusEffect(
    useCallback(() => {
      refresh();
      loadEvents();
    }, [refresh, loadEvents]),
  );
  const pull = () => {
    setRefreshing(true);
    loadEvents();
    Promise.resolve(refresh()).finally(() => setRefreshing(false));
  };

  const waiting: Waiting[] = [
    ...events
      .filter((e) => e.myBooking?.awaitingValidation && Date.parse(e.myBooking.holdExpiresAt) > now)
      .map((e) => ({
        key: `e-${e.id}`, kind: 'event' as const, title: e.title, count: e.myBooking!.units?.length ?? e.myBooking!.count ?? 1, total: e.myBooking!.total,
        code: e.myBooking!.code ?? null, until: e.myBooking!.holdExpiresAt, href: `/evenement/${e.id}`,
      })),
    ...caravans
      .filter((c) => c.myBooking?.awaitingValidation && Date.parse(c.myBooking.holdExpiresAt) > now)
      .map((c) => ({
        key: `c-${c.id}`, kind: 'caravan' as const, title: `${c.from} → ${c.to}`, count: c.myBooking!.seats.length || 1, total: c.myBooking!.total ?? c.price,
        code: c.myBooking!.code ?? null, until: c.myBooking!.holdExpiresAt, href: `/caravane/${c.id}`,
      })),
  ].sort((a, b) => Date.parse(a.until) - Date.parse(b.until));

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
            { value: 'current', label: 'En cours', badge: current.length + waiting.length },
            { value: 'archived', label: 'Archivés' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pull} />}>
        {/* Requests still to pay: the first thing to do. */}
        {tab === 'current' && waiting.length > 0 && (
          <View style={{ gap: 8 }}>
            <Text style={styles.section}>En attente de paiement</Text>
            {waiting.map((w) => (
              <WaitingRow key={w.key} w={w} now={now} />
            ))}
            {list.length > 0 && <Text style={[styles.section, { marginTop: 6 }]}>Mes billets</Text>}
          </View>
        )}
        {list.length === 0 && !(tab === 'current' && waiting.length > 0) && (
          <EmptyState
            icon="ticket-outline"
            title={tab === 'current' ? 'Aucun billet à venir' : 'Aucun billet archivé'}
            text={tab === 'current' ? 'Réserve une caravane ou un événement : ton billet apparaît ici.' : undefined}
          />
        )}
        {groupOf(list).map((g) => (
          <TicketRow key={g[0]!.id} group={g} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

type Waiting = { key: string; kind: 'event' | 'caravan'; title: string; count: number; total: number; code: string | null; until: string; href: string };

/** « 23 h 05 », « 12 min ». */
const leftOf = (until: string, now: number) => {
  const ms = Math.max(0, Date.parse(until) - now);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
};

/** A request waiting for its cash payment: what, how much, its code, how long left; opens its page (QR, organizer). */
function WaitingRow({ w, now }: { w: Waiting; now: number }) {
  const unit = w.kind === 'caravan' ? (w.count > 1 ? 'places' : 'place') : w.count > 1 ? 'billets' : 'billet';
  return (
    <Pressable
      style={({ pressed }) => [styles.card, styles.waitCard, pressed && { opacity: 0.9 }]}
      onPress={() => router.push(w.href as never)}
      accessibilityRole="button"
      accessibilityLabel={`${w.title}, ${w.count} ${unit} à payer, ${formatFcfa(w.total)}, expire dans ${leftOf(w.until, now)}`}>
      <View style={[styles.icon, { backgroundColor: colors.card }]}>
        <Ionicons name="hourglass-outline" size={20} color={colors.warningText} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.title} numberOfLines={1}>
          {w.title}
        </Text>
        <Text style={styles.waitText}>
          {w.count} {unit} · {formatFcfa(w.total)} à payer en espèces
        </Text>
        <Text style={styles.waitText}>
          {w.code ? `Code ${w.code} · ` : ''}expire dans {leftOf(w.until, now)}
        </Text>
      </View>
      <Ionicons name="qr-code-outline" size={20} color={colors.warningText} />
    </Pressable>
  );
}

/** The tickets of one event or departure together (bought for friends, companions' seats), in the list's order. */
function groupOf(list: TicketDto[]) {
  const groups = new Map<string, TicketDto[]>();
  for (const t of list) {
    const key = `${t.kind}:${t.event.id}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  return [...groups.values()];
}

const stateOf = (t: TicketDto) =>
  t.status === 'cancelled' ? { label: 'Annulé', tone: 'danger' as const } : t.status === 'transferred' ? { label: 'Transféré', tone: 'neutral' as const } : t.admittedAt ? { label: 'Utilisé', tone: 'neutral' as const } : { label: 'Valide', tone: 'success' as const };

/**
 * One event or departure: its title and date, how many tickets (the seats and for whom, on a caravan), one state. Opens
 * the ticket screen, where all of them are (one number each, each its own QR code).
 */
function TicketRow({ group }: { group: TicketDto[] }) {
  const t = group[0]!;
  const caravan = isCaravanTicket(t);
  const n = group.length;
  const used = group.filter((x) => x.admittedAt).length;
  const state = n > 1 && t.status === 'active' ? (used === n ? { label: 'Utilisés', tone: 'neutral' as const } : used ? { label: `${used}/${n} utilisés`, tone: 'success' as const } : { label: 'Valides', tone: 'success' as const }) : stateOf(t);
  const total = group.reduce((sum, x) => sum + x.price, 0);
  const detail = caravan
    ? group.map((x) => `${x.seat ? `Place ${x.seat}` : 'Place'} · ${x.passenger ? x.passenger.name.split(' ')[0] : 'toi'}`).join(', ')
    : n > 1
      ? `${n} billets · ${formatFcfa(total)}`
      : formatFcfa(t.price);
  return (
    <Pressable style={({ pressed }) => [styles.card, shadow.card, pressed && { opacity: 0.9 }]} onPress={() => router.push(`/billet/${t.id}`)} accessibilityRole="button" accessibilityLabel={`${t.event.title}, ${n > 1 ? `${n} billets, ` : ''}${state.label}`}>
      <View style={[styles.icon, { backgroundColor: caravan ? colors.primarySoft : '#EEE8FF' }]}>
        <Ionicons name={caravan ? 'bus-outline' : 'sparkles-outline'} size={20} color={caravan ? colors.primary : colors.purpleText} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.title} numberOfLines={1}>
          {t.event.title}
        </Text>
        <Text style={styles.muted}>{formatDateTime(Date.parse(t.event.startsAt))}</Text>
        <Text style={styles.muted} numberOfLines={1}>
          {detail}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <StatusChip label={state.label} tone={state.tone} />
        {n > 1 && (
          <View style={styles.count}>
            <Ionicons name="ticket" size={11} color={colors.primary} />
            <Text style={styles.countText}>×{n}</Text>
          </View>
        )}
      </View>
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
  section: { ...typo.smallStrong, color: colors.navy },
  count: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: radii.pill, backgroundColor: colors.primarySoft },
  countText: { ...typo.captionStrong, color: colors.primary },
  waitCard: { backgroundColor: colors.warningBg, borderWidth: 1, borderColor: '#F5D9A8' },
  waitText: { ...typo.caption, color: colors.warningText },
});
