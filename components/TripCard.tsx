import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { OrganizerLine, shortPlace } from '@/components/caravan';
import { PrimaryButton } from '@/components/ui';
import { caravanState, formatFcfa, type Caravan, type CaravanStop } from '@/constants/data';
import { colors, radii, shadow, typo } from '@/constants/theme';

/** Seats left from which the stub turns orange. */
const FEW = 5;

/**
 * One trip, like a boarding pass: the stub on the left says when and where you board and how many seats are left; the
 * rest says the route, its stops and bus, the price, how close it is to being confirmed, who runs it, and the action.
 * Everything of the previous card, in about two thirds of its height. The whole card opens the trip.
 */
export function TripCard({ c, via = null, day }: { c: Caravan; via?: { stop: CaravanStop; kind: 'pickup' | 'dropoff' } | null; /** Shown under the time where the list has no day sections (the home screen): « Demain ». */ day?: string }) {
  const mine = c.myTicketId;
  const closed = !c.seats || !c.bookingOpen;
  const first = c.pickups[0];
  const few = c.seats > 0 && c.seats <= FEW && c.bookingOpen;
  const { booked, confirmed, missing } = caravanState(c);
  const label = c.myBooking ? 'Ma demande' : !c.mySeatsLeft ? (c.purchasedHere ? 'Billet offert' : 'Limite atteinte') : c.seats ? (c.bookingOpen ? 'Réserver' : 'Fermé') : 'Complet';
  const open = () => router.push(mine ? `/billet/${mine}` : `/caravane/${c.id}`);
  const stops = `${c.pickups.length > 1 ? `${c.pickups.length} montées` : '1 montée'} · ${c.dropoffs.length > 1 ? `${c.dropoffs.length} arrêts` : '1 arrêt'}`;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, shadow.card, closed && !mine && styles.cardDim, pressed && { opacity: 0.92 }]}
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={`${c.from} vers ${c.to}, ${c.time}, ${formatFcfa(c.price)}, ${c.seats ? `${c.seats} places libres` : 'complet'}`}>
      {/* The stub: when, where, how many seats. */}
      <View style={styles.stub}>
        <View>
          <Text style={styles.time}>{c.time}</Text>
          {day && (
            <Text style={styles.day} numberOfLines={1}>
              {day}
            </Text>
          )}
        </View>
        <Text style={styles.stubPlace} numberOfLines={2}>
          {first ? shortPlace(first.place, c.from) : 'Départ'}
        </Text>
        <View style={[styles.seatsPill, !c.seats ? styles.seatsNone : few ? styles.seatsFew : null]}>
          <Text style={[styles.seatsText, !c.seats ? { color: colors.muted2 } : few ? { color: colors.orangeText } : null]} numberOfLines={1}>
            {c.seats ? `${c.seats} libre${c.seats > 1 ? 's' : ''}` : 'Complet'}
          </Text>
        </View>
      </View>
      {/* The tear line, with its two notches. */}
      <View style={styles.tear}>
        <View style={[styles.notch, { top: -7 }]} />
        <View style={styles.dash} />
        <View style={[styles.notch, { bottom: -7 }]} />
      </View>

      <View style={styles.main}>
        <View style={styles.routeRow}>
          <Text style={[styles.city, { flexShrink: 1 }]} numberOfLines={1}>
            {c.from} → {c.to}
          </Text>
          <Text style={styles.price}>
            {formatFcfa(c.price).replace(' FCFA', '')}
            <Text style={styles.perSeat}> F</Text>
          </Text>
        </View>
        <View style={styles.tags}>
          {c.vehicle.airConditioned && <Ionicons name="snow-outline" size={12} color={colors.primary} accessibilityLabel="Climatisé" />}
          <Text style={styles.tag} numberOfLines={1}>
            {stops} · {c.vehicle.label}
          </Text>
        </View>

        {via && (
          <View style={styles.via}>
            <Ionicons name={via.kind === 'pickup' ? 'enter-outline' : 'exit-outline'} size={13} color={colors.primary} />
            <Text style={styles.viaText} numberOfLines={1}>
              {via.kind === 'pickup' ? `Monte à ${via.stop.place} · ${via.stop.time}` : `Descends à ${via.stop.place} · vers ${via.stop.time}`}
            </Text>
          </View>
        )}

        {/* How full, and how close to going ahead: one slim bar, one line. */}
        <View style={{ gap: 4 }}>
          <View style={styles.bar}>
            <View style={[styles.barFill, { width: `${Math.min(100, (booked / Math.max(1, c.totalSeats)) * 100)}%`, backgroundColor: confirmed ? colors.success : colors.primary }]} />
            {!confirmed && <View style={[styles.threshold, { left: `${(c.minPassengers / Math.max(1, c.totalSeats)) * 100}%` }]} />}
          </View>
          <View style={styles.barRow}>
            <Text style={[styles.state, { color: confirmed ? colors.successText : colors.warningText }]} numberOfLines={1}>
              {confirmed ? '✓ Départ confirmé' : `Encore ${missing} pour confirmer`}
            </Text>
            <Text style={styles.count}>
              {booked}/{c.totalSeats}
            </Text>
          </View>
        </View>

        <View style={styles.bottom}>
          <View style={{ flex: 1 }}>
            <OrganizerLine organizer={c.organizer} />
          </View>
          {mine ? (
            <Pressable style={styles.soft} onPress={open} accessibilityRole="button">
              <Ionicons name="ticket-outline" size={14} color={colors.primary} />
              <Text style={styles.softText}>Mon billet</Text>
            </Pressable>
          ) : (
            <PrimaryButton size="sm" disabled={(closed || !c.mySeatsLeft) && !c.myBooking} onPress={open} label={label} />
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: radii.lg, overflow: 'hidden' },
  cardDim: { opacity: 0.7 },
  stub: { width: 82, paddingVertical: 12, paddingLeft: 12, paddingRight: 8, gap: 4, backgroundColor: colors.primarySofter, justifyContent: 'space-between' },
  time: { ...typo.h3, color: colors.navy },
  stubPlace: { fontSize: 11, lineHeight: 14, color: colors.muted2, flex: 1 },
  seatsPill: { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 2, borderRadius: radii.pill, backgroundColor: colors.successBg },
  seatsFew: { backgroundColor: colors.accentSoft },
  seatsNone: { backgroundColor: colors.border },
  seatsText: { ...typo.label, color: colors.successText },
  tear: { width: 1, alignItems: 'center' },
  dash: { flex: 1, width: 0, borderLeftWidth: 1, borderStyle: 'dashed', borderColor: colors.border, marginVertical: 8 },
  notch: { position: 'absolute', left: -7, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.bg },
  main: { flex: 1, padding: 12, gap: 7 },
  routeRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  city: { ...typo.title, color: colors.navy },
  price: { ...typo.title, color: colors.primary },
  perSeat: { fontSize: 11, fontWeight: '700', color: colors.muted2 },
  tags: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: -3 },
  tag: { ...typo.caption, color: colors.muted2, flexShrink: 1 },
  via: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', maxWidth: '100%', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill, backgroundColor: colors.primarySoft },
  viaText: { ...typo.captionStrong, flexShrink: 1, color: colors.primary },
  bar: { height: 5, borderRadius: 3, backgroundColor: colors.bg },
  barFill: { height: '100%', borderRadius: 3 },
  threshold: { position: 'absolute', top: -2, width: 2, height: 9, marginLeft: -1, borderRadius: 1, backgroundColor: colors.navy },
  barRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  state: { ...typo.captionStrong, flexShrink: 1 },
  count: { ...typo.captionStrong, color: colors.muted2 },
  bottom: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 1 },
  soft: { flexDirection: 'row', gap: 5, backgroundColor: colors.primarySoft, paddingHorizontal: 16, minHeight: 40, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  softText: { ...typo.smallStrong, color: colors.primary },
  day: { ...typo.captionStrong, color: colors.primary, marginTop: -1 },
});
