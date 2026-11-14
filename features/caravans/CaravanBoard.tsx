import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { EmptyState, ErrorState, SkeletonCard } from '@/components/states';
import { Chip, Field, PrimaryButton } from '@/components/ui';
import { SPACE_BUTTON_CLEARANCE } from '@/components/SpaceSwitcher';
import { TripCard } from '@/components/TripCard';
import { type Caravan, type CaravanDirection, type CaravanStop } from '@/constants/data';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useCaravans } from '@/context/CaravansContext';
import { byDeparture, dayLabel, hourLabel, isCaravanTicket } from '@/features/caravans/api';
import { ApiError } from '@/lib/api';
import { matches } from '@/lib/search';
import { useNow } from '@/lib/useNow';

const DAY = 24 * 3_600_000;
/** Seats left from which a card says « Plus que N places ». */
const FEW = 5;

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

const midnight = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
/** « Aujourd'hui », « Demain », else « Sam. 15 nov. ». */
const dayTitle = (at: number, now: number) => {
  const diff = Math.round((midnight(at) - midnight(now)) / DAY);
  if (diff === 0) return 'Aujourd’hui';
  if (diff === 1) return 'Demain';
  const label = dayLabel(at);
  return label.charAt(0).toUpperCase() + label.slice(1);
};
/** The city a trip is chosen by: where it goes on the way out, where it comes from on the way back. */
const cityOf = (c: Caravan) => (c.direction === 'aller' ? c.to : c.from);

/**
 * The Caravanes section: my tickets first (one swipe away), then the trips of the chosen way, by day, soonest first.
 * The destination chips narrow it in one tap; the search finds a stop on the way (Thiès on a UGB → Dakar bus).
 */
export function CaravanBoard() {
  const [direction, setDirection] = useState<CaravanDirection>('aller');
  const [city, setCity] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const q = query.trim();
  const now = useNow();
  const { caravans, tickets, incoming, loading, error, refresh, accept, decline } = useCaravans();

  const ofWay = useMemo(() => caravans.filter((c) => c.direction === direction).sort((a, b) => a.departureAt - b.departureAt), [caravans, direction]);
  // The cities of this way, the busiest first: one tap each.
  const cities = useMemo(() => {
    const count = new Map<string, number>();
    for (const c of ofWay) count.set(cityOf(c), (count.get(cityOf(c)) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [ofWay]);
  const list = ofWay
    .filter((c) => !city || cityOf(c) === city)
    .map((c) => ({ c, via: q ? findStop(c, q) : null }))
    .filter(({ c, via }) => !q || via || matches(q, [c.from, c.to, c.organizer.name]));
  const days: { title: string; items: typeof list }[] = [];
  for (const item of list) {
    const title = dayTitle(item.c.departureAt, now);
    const last = days[days.length - 1];
    if (last?.title === title) last.items.push(item);
    else days.push({ title, items: [item] });
  }

  const active = tickets.filter(isCaravanTicket).filter((t) => t.status === 'active' && Date.parse(t.event.startsAt) > now - 12 * 3_600_000);
  // One card per departure: my seat and my companions' tickets together ("2 billets").
  const trips = byDeparture(active);

  const switchWay = (d: CaravanDirection) => {
    setDirection(d);
    setCity(null);
  };
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
    <ScrollView
      contentContainerStyle={styles.body}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} />}>
      {/* A friend gave me a ticket: it's mine once I accept. */}
      {incoming.map((x) => (
        <View key={x.id} style={[styles.offer, shadow.card]}>
          <View style={styles.offerTop}>
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
            <PrimaryButton size="sm" label="Accepter" onPress={() => answer(x.id, true)} style={{ flex: 1 }} />
            <Pressable style={[styles.soft, { flex: 1 }]} onPress={() => answer(x.id, false)} accessibilityRole="button">
              <Text style={styles.softText}>Refuser</Text>
            </Pressable>
          </View>
        </View>
      ))}

      {/* My next trips: a strip, so the list of trips stays in view. */}
      {trips.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={styles.section}>Mes billets</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
            {trips.map((group) => {
              const t = group[0]!;
              const at = Date.parse(t.details.pickup.at);
              const seats = group.map((x) => x.seat).join(', ');
              return (
                <Pressable
                  key={t.id}
                  style={[styles.ticket, trips.length === 1 && { width: undefined, flex: 1 }]}
                  onPress={() => router.push(`/billet/${t.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`${group.length > 1 ? `${group.length} billets` : 'Billet'} ${t.event.title}, ${dayLabel(at)}, place ${seats}`}>
                  <View style={styles.ticketQr}>
                    <Ionicons name="qr-code" size={20} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ticketTitle} numberOfLines={1}>
                      {t.event.title}
                    </Text>
                    <Text style={styles.ticketSub} numberOfLines={1}>
                      {dayTitle(at, now)} · {hourLabel(at)} · {group.length > 1 ? 'places' : 'place'} {seats}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.7)" />
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      <Field
        icon="search"
        placeholder={direction === 'aller' ? 'Où descends-tu ? Louga, Thiès…' : 'Où montes-tu ? Pikine, Rufisque…'}
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

      {/* One row of filters: the way (Aller / Retour), then the cities of that way. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipsWrap}>
        <View style={styles.way} accessibilityRole="tablist">
          {(['aller', 'retour'] as const).map((d) => {
            const on = d === direction;
            return (
              <Pressable key={d} onPress={() => switchWay(d)} style={[styles.wayItem, on && styles.wayOn]} accessibilityRole="tab" accessibilityState={{ selected: on }}>
                <Text style={[styles.wayText, on && styles.wayTextOn]}>{d === 'aller' ? 'Aller' : 'Retour'}</Text>
              </Pressable>
            );
          })}
        </View>
        {cities.length > 1 && (
          <>
            <View style={styles.sep} />
            <Chip label={`Toutes · ${ofWay.length}`} selected={!city} onPress={() => setCity(null)} />
            {cities.map(([name, n]) => (
              <Chip key={name} label={`${name} · ${n}`} selected={city === name} onPress={() => setCity(city === name ? null : name)} />
            ))}
          </>
        )}
      </ScrollView>

      {list.length === 0 &&
        (q || city ? (
          <EmptyState
            icon="bus-outline"
            title={q ? `Aucune caravane ne passe par « ${q} »` : `Aucune caravane pour ${city}`}
            text={direction === 'aller' ? 'Essaie la grande ville la plus proche, ou regarde les retours.' : 'Essaie la grande ville la plus proche, ou regarde les allers.'}
            action={{
              label: 'Tout afficher',
              onPress: () => {
                setQuery('');
                setCity(null);
              },
            }}
          />
        ) : (
          <EmptyState icon="bus-outline" title={direction === 'aller' ? 'Aucun départ prévu' : 'Aucun retour prévu'} text="Les organisateurs publient leurs départs ici : reviens bientôt." />
        ))}

      {days.map((d) => (
        <Animated.View key={d.title} layout={LinearTransition} entering={FadeIn.duration(180)} style={{ gap: 10 }}>
          <View style={styles.dayHead}>
            <Text style={styles.dayTitle}>{d.title}</Text>
            <Text style={styles.dayCount}>
              {d.items.length} départ{d.items.length > 1 ? 's' : ''}
            </Text>
          </View>
          {d.items.map(({ c, via }) => (
            <TripCard key={c.id} c={c} via={via} />
          ))}
        </Animated.View>
      ))}

      {list.length > 0 && (
        <View style={styles.footnote}>
          <Ionicons name="cash-outline" size={14} color={colors.muted2} />
          <Text style={styles.footnoteText}>Place assise garantie : tu réserves ici, tu paies l’organisateur en espèces.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 14, paddingBottom: SPACE_BUTTON_CLEARANCE },
  section: { ...typo.section, color: colors.navy },
  offer: { backgroundColor: colors.card, borderRadius: radii.md, padding: 12, gap: 10 },
  offerTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ticketIcon: { width: 40, height: 40, borderRadius: radii.sm, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  ticketRoute: { ...typo.title, color: colors.navy },
  ticketMeta: { ...typo.caption, color: colors.muted2, marginTop: 2 },
  strip: { gap: 10, flexGrow: 1 },
  ticket: { width: 260, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.navy, borderRadius: radii.md, padding: 12 },
  ticketQr: { width: 38, height: 38, borderRadius: radii.sm, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  ticketTitle: { ...typo.smallStrong, color: '#fff' },
  ticketSub: { ...typo.caption, color: 'rgba(255,255,255,0.75)', marginTop: 1 },
  chipsWrap: { marginHorizontal: -20, marginTop: -4 },
  chips: { gap: 8, paddingHorizontal: 20, alignItems: 'center' },
  way: { flexDirection: 'row', padding: 3, borderRadius: radii.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  wayItem: { paddingHorizontal: 14, minHeight: 30, borderRadius: radii.pill, justifyContent: 'center' },
  wayOn: { backgroundColor: colors.primary },
  wayText: { ...typo.smallStrong, color: colors.navy },
  wayTextOn: { color: '#fff' },
  sep: { width: 1, height: 22, backgroundColor: colors.border },
  dayHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4 },
  dayTitle: { ...typo.section, color: colors.navy },
  dayCount: { ...typo.caption, color: colors.muted2 },
  // The soft second action (« Mon billet », « Refuser »).
  soft: { flexDirection: 'row', gap: 5, backgroundColor: colors.primarySoft, paddingHorizontal: 16, minHeight: 40, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  softText: { ...typo.smallStrong, color: colors.primary },
  footnote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12 },
  footnoteText: { ...typo.caption, color: colors.muted2, textAlign: 'center', flexShrink: 1 },
});
