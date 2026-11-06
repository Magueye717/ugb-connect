import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CaravanSummary, FillBar } from '@/components/caravan';
import { EmptyState, ErrorState, SkeletonCard } from '@/components/states';
import { Field, Segmented } from '@/components/ui';
import { SPACE_BUTTON_CLEARANCE } from '@/components/SpaceSwitcher';
import { formatFcfa, type Caravan, type CaravanDirection } from '@/constants/data';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useCaravans } from '@/context/CaravansContext';
import { byDeparture, dayLabel, hourLabel, isCaravanTicket } from '@/features/caravans/api';
import { ApiError } from '@/lib/api';
import { matches } from '@/lib/search';

/**
 * Buses stop along the way: a student from Thiès takes the UGB → Dakar bus too.
 * Returns the stop that matched (drop-offs first on the way out, pickups first on the way back), or null.
 */
function findStop(c: Caravan, query: string) {
  const hit = (kind: 'pickup' | 'dropoff') => {
    const stop = (kind === 'pickup' ? c.pickups : c.dropoffs).find((s) => matches(query, [s.place]));
    return stop ? { kind, stop } : null;
  };
  return c.direction === 'aller' ? (hit('dropoff') ?? hit('pickup')) : (hit('pickup') ?? hit('dropoff'));
}

/** Screen content without header or safe area: used by a tab and by its standalone page. */
export function CaravanBoard() {
  const [direction, setDirection] = useState<CaravanDirection>('aller');
  const [query, setQuery] = useState('');
  const q = query.trim();
  const { caravans, tickets, incoming, loading, error, refresh, accept, decline } = useCaravans();
  const list = caravans
    .filter((c) => c.direction === direction)
    .map((c) => ({ c, via: q ? findStop(c, q) : null }))
    .filter(({ c, via }) => !q || via || matches(q, [c.from, c.to, c.organizer.name]));
  const active = tickets.filter(isCaravanTicket).filter((t) => t.status === 'active' && Date.parse(t.event.startsAt) > Date.now() - 12 * 3_600_000);
  // One card per departure: my seat and my companions' tickets together ("2 billets").
  const trips = byDeparture(active);

  const answer = (id: string, yes: boolean) =>
    (yes ? accept(id).then((ticketId) => ticketId && router.push(`/billet/${ticketId}`)) : decline(id)).catch((err) =>
      Alert.alert('Action impossible', err instanceof ApiError ? err.message : 'Réessaie dans un instant.'),
    );

  if (loading) {
    return (
      <View style={styles.body}>
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }
  if (error && caravans.length === 0) return <ErrorState text={error} onRetry={refresh} />;

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} />}>
        <View style={styles.hero}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>Réserve ton billet</Text>
            <Text style={styles.heroSub}>Place assise garantie · remboursé si le départ est annulé · Wave ou Orange Money.</Text>
          </View>
          <View style={styles.heroIcon}>
            <Ionicons name="bus-outline" size={26} color="#fff" />
          </View>
        </View>

        {/* A friend gave me a ticket: it's mine once I accept. */}
        {incoming.map((x) => (
          <View key={x.id} style={[styles.ticket, shadow.card, { flexDirection: 'column', alignItems: 'stretch', gap: 10 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={styles.ticketIcon}>
                <Ionicons name="gift-outline" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.ticketRoute}>{x.forCompanion ? `${x.from.name} t’a réservé une place` : `${x.from.name} t’offre son billet`}</Text>
                <Text style={styles.ticketMeta}>
                  {/* A caravan seat (its pickup time and seat) or an event ticket (its start and type). */}
                  {x.event?.title}
                  {x.event ? ` · ${dayLabel(Date.parse(x.event.startsAt))} · ${hourLabel(Date.parse('pickup' in x.details ? x.details.pickup.at : x.event.startsAt))}` : ''}
                  {x.seat ? ` · Place ${x.seat}` : 'typeName' in x.details ? ` · Billet ${x.details.typeName}` : ''}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable style={[styles.book, { flex: 1 }]} onPress={() => answer(x.id, true)} accessibilityRole="button">
                <Text style={styles.bookText}>Accepter</Text>
              </Pressable>
              <Pressable style={[styles.book, styles.bookMine, { flex: 1 }]} onPress={() => answer(x.id, false)} accessibilityRole="button">
                <Text style={[styles.bookText, { color: colors.primary }]}>Refuser</Text>
              </Pressable>
            </View>
          </View>
        ))}

        {trips.length > 0 && (
          <View style={{ gap: 8 }}>
            <Text style={styles.section}>Mes billets</Text>
            {trips.map((group) => {
              const t = group[0]!;
              const at = Date.parse(t.event.startsAt);
              const seats = group.map((x) => x.seat).join(' et ');
              return (
                <Pressable
                  key={t.id}
                  style={[styles.ticket, shadow.card]}
                  onPress={() => router.push(`/billet/${t.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`${group.length > 1 ? `${group.length} billets` : 'Billet'} ${t.event.title}, ${dayLabel(at)}, place ${seats}`}>
                  <View style={styles.ticketIcon}>
                    <Ionicons name="qr-code-outline" size={20} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.ticketTitleRow}>
                      <Text style={styles.ticketRoute}>{t.event.title}</Text>
                      {group.length > 1 && (
                        <View style={styles.countBadge}>
                          <Text style={styles.countBadgeText}>{group.length} billets</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.ticketMeta}>
                      {dayLabel(at)} · {hourLabel(Date.parse(t.details.pickup.at))} · {group.length > 1 ? 'Places' : 'Place'} {seats}
                      {group.some((x) => x.transfer?.status === 'pending') ? ' · transfert en attente' : ''}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                </Pressable>
              );
            })}
          </View>
        )}

        <Segmented
          options={[
            { value: 'aller', label: 'Aller' },
            { value: 'retour', label: 'Retour' },
          ]}
          value={direction}
          onChange={setDirection}
        />

        <Field
          icon="search"
          placeholder={direction === 'aller' ? 'Où descends-tu ? Louga, Thiès, Dakar…' : 'Où montes-tu ? Pikine, Rufisque, Thiès…'}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Rechercher une ville ou un arrêt"
          right={
            query ? (
              <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Effacer la recherche">
                <Ionicons name="close-circle" size={18} color={colors.muted} />
              </Pressable>
            ) : null
          }
        />

        {list.length === 0 && (
          <EmptyState
            icon="bus-outline"
            title={`Aucune caravane ne passe par « ${q} »`}
            text={direction === 'aller' ? 'Essaie la grande ville la plus proche, ou regarde les retours.' : 'Essaie la grande ville la plus proche, ou regarde les allers.'}
            action={{ label: 'Effacer la recherche', onPress: () => setQuery('') }}
          />
        )}

        {list.map(({ c, via }) => {
          const mine = c.myTicketId;
          const closed = !c.seats || !c.bookingOpen;
          return (
            <View key={c.id} style={[styles.card, shadow.card]}>
              <CaravanSummary caravan={c} via={via ?? undefined} />
              <FillBar caravan={c} />
              <View style={styles.rowBetween}>
                {/* Price next to the action: what you pay, right where you decide. */}
                <View style={{ flexShrink: 1 }}>
                  <Text style={styles.price}>{formatFcfa(c.price)}</Text>
                  <Text style={styles.seats} numberOfLines={1}>
                    {c.seats > 0 ? `${c.seats} libres` : 'Complet'} · {c.vehicle.airConditioned ? 'Climatisé · ' : ''}{c.vehicle.label}
                  </Text>
                </View>
                {mine ? (
                  <Pressable style={[styles.book, styles.bookMine]} onPress={() => router.push(`/billet/${mine}`)}>
                    <Ionicons name="ticket-outline" size={14} color={colors.primary} />
                    <Text style={[styles.bookText, { color: colors.primary }]}>Mon billet</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    style={[styles.book, (closed || !c.mySeatsLeft) && !c.myBooking && styles.bookOff]}
                    disabled={(closed || !c.mySeatsLeft) && !c.myBooking}
                    onPress={() => router.push(`/caravane/${c.id}`)}>
                    <Text style={styles.bookText}>
                      {c.myBooking ? 'Payer' : !c.mySeatsLeft ? (c.purchasedHere ? 'Billet offert' : 'Limite atteinte') : c.seats ? (c.bookingOpen ? 'Réserver' : 'Fermé') : 'Complet'}
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 20, gap: 14, paddingBottom: SPACE_BUTTON_CLEARANCE },
  hero: {
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroTitle: { ...typo.h3, color: '#fff' },
  heroSub: { ...typo.caption, color: 'rgba(255,255,255,0.85)', marginTop: 4, lineHeight: 17 },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 14, gap: 12 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  price: { ...typo.h3, color: colors.navy },
  seats: { fontSize: 12, fontWeight: '600', color: colors.muted2, marginTop: 1 },
  bookOff: { backgroundColor: colors.tabInactive },
  bookMine: { flexDirection: 'row', gap: 5, backgroundColor: colors.primarySoft },
  section: { ...typo.section, color: colors.navy },
  ticket: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: radii.md, padding: 12 },
  ticketTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  countBadge: { backgroundColor: colors.primarySoft, borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 2 },
  countBadgeText: { ...typo.label, color: colors.primary },
  ticketIcon: { width: 40, height: 40, borderRadius: radii.sm, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  ticketRoute: { ...typo.title, color: colors.navy },
  ticketMeta: { ...typo.caption, color: colors.muted2, marginTop: 2 },
  book: {
    backgroundColor: colors.accent,
    paddingHorizontal: 22,
    minHeight: 38,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookText: { color: '#fff', fontWeight: '700' },
});
