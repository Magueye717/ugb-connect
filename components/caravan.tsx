import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { caravanState, formatFcfa, type Caravan, type CaravanOrganizer, type CaravanStop, type OrganizerLevel } from '@/constants/data';
import { colors, motion, radii, typo } from '@/constants/theme';

const LEVELS: Record<OrganizerLevel, { label: string; icon: keyof typeof Ionicons.glyphMap; fg: string; bg: string }> = {
  // Not "Confirmé": that word is used for trips that reached their minimum, on the same card.
  confirme: { label: 'Certifié', icon: 'shield-checkmark', fg: colors.successText, bg: colors.successBg },
  verifie: { label: 'Vérifié', icon: 'shield-checkmark-outline', fg: colors.primary, bg: colors.primarySoft },
  nouveau: { label: 'Nouveau', icon: 'sparkles-outline', fg: colors.purpleText, bg: '#EEE8FF' },
};

/** Organizer name, verification level and rating. */
export function OrganizerLine({ organizer: o, wrap }: { organizer: CaravanOrganizer; /** The whole name, on two lines if needed. */ wrap?: boolean }) {
  const level = LEVELS[o.level];
  return (
    <View style={[styles.organizer, wrap && { flexWrap: 'wrap' }]}>
      <Text style={styles.organizerName} numberOfLines={wrap ? undefined : 1}>
        {o.name}
      </Text>
      <View style={[styles.level, { backgroundColor: level.bg }]}>
        <Ionicons name={level.icon} size={11} color={level.fg} />
        <Text style={[styles.levelText, { color: level.fg }]}>{level.label}</Text>
      </View>
      {o.rating !== null && (
        <View style={styles.rating}>
          <Ionicons name="star" size={11} color={colors.warning} />
          <Text style={styles.ratingText}>{o.rating.toFixed(1)}</Text>
        </View>
      )}
    </View>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

/**
 * Organizer (or price), route line, and date / time / first pickup point.
 * The organizer gets the whole first row so its name isn't cut; the list shows the price in its footer.
 * `via`: a stop on the way that matched the student's search, e.g. Thiès on a UGB → Dakar bus.
 */
export function CaravanSummary({
  caravan: c,
  header = 'organizer',
  via,
}: {
  caravan: Caravan;
  header?: 'organizer' | 'price';
  via?: { stop: CaravanStop; kind: 'pickup' | 'dropoff' };
}) {
  const [first] = c.pickups;
  return (
    <View style={{ gap: 12 }}>
      {header === 'organizer' ? (
        <OrganizerLine organizer={c.organizer} />
      ) : (
        <Text style={styles.price}>
          {formatFcfa(c.price)} <Text style={styles.perSeat}>/ place</Text>
        </Text>
      )}

      <View style={styles.route}>
        <View>
          <Text style={styles.city}>{c.from}</Text>
          <Text style={styles.cityLabel}>{c.pickups.length > 1 ? plural(c.pickups.length, 'montée') : 'Départ'}</Text>
        </View>
        <View style={styles.track}>
          <View style={styles.line} />
          <View style={styles.busDot}>
            <Ionicons name="bus-outline" size={13} color={colors.primary} />
          </View>
          <View style={styles.line} />
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.city}>{c.to}</Text>
          <Text style={styles.cityLabel}>{c.dropoffs.length > 1 ? plural(c.dropoffs.length, 'arrêt') : 'Arrivée'}</Text>
        </View>
      </View>

      <View style={styles.meta}>
        {/* Date and time never shrink; the place gives way ("Village E +2"), the city is already above. */}
        <Meta icon="calendar-outline" text={c.date} fixed />
        <Meta icon="time-outline" text={c.time} fixed />
        <Meta icon="location-outline" text={`${shortPlace(first.place, c.from)}${c.pickups.length > 1 ? ` +${c.pickups.length - 1}` : ''}`} />
      </View>

      {via && (
        <View style={styles.via}>
          <Ionicons name={via.kind === 'pickup' ? 'enter-outline' : 'exit-outline'} size={14} color={colors.primary} />
          <Text style={styles.viaText} numberOfLines={1}>
            {via.kind === 'pickup' ? `Monte à ${via.stop.place} · ${via.stop.time}` : `Descends à ${via.stop.place} · vers ${via.stop.time}`}
          </Text>
        </View>
      )}
    </View>
  );
}

/** Booked seats with a mark at the confirmation threshold. */
export function FillBar({
  caravan: c,
  count = true,
  few,
}: {
  caravan: Caravan;
  /** "34/64 places" at the right. The home card leaves it out: one message, not two. */
  count?: boolean;
  /** Confirmed with this many seats left or fewer: « Plus que N places » instead of « Départ confirmé ». */
  few?: number;
}) {
  const { booked, confirmed, missing } = caravanState(c);
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.bar}>
        <GrowingFill percent={(booked / c.totalSeats) * 100} color={confirmed ? colors.success : colors.primary} />
        {!confirmed && <View style={[styles.threshold, { left: `${(c.minPassengers / c.totalSeats) * 100}%` }]} />}
      </View>
      <View style={styles.rowBetween}>
        {confirmed && few !== undefined && c.seats <= few ? (
          <View style={styles.state}>
            <Ionicons name="flame-outline" size={14} color={colors.orangeText} />
            <Text style={[styles.stateText, { color: colors.orangeText }]}>
              Départ confirmé · plus que {c.seats} place{c.seats > 1 ? 's' : ''}
            </Text>
          </View>
        ) : confirmed ? (
          <View style={styles.state}>
            <Ionicons name="checkmark-circle" size={14} color={colors.success} />
            <Text style={[styles.stateText, { color: colors.successText }]}>Départ confirmé</Text>
          </View>
        ) : (
          <View style={styles.state}>
            <Ionicons name="hourglass-outline" size={13} color={colors.warningText} />
            {/* Short on purpose: the refund promise is in the banner and on the booking screen. */}
            <Text style={[styles.stateText, { color: colors.warningText }]} numberOfLines={1}>
              Encore {missing} {count ? '' : `réservation${missing > 1 ? 's' : ''} `}pour confirmer
            </Text>
          </View>
        )}
        {count && (
          <Text style={styles.count}>
            {booked}/{c.totalSeats} places
          </Text>
        )}
      </View>
    </View>
  );
}

/** Fills from empty when it appears, and slides when the count changes: "34/64" becomes something you see. */
function GrowingFill({ percent, color }: { percent: number; color: string }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withTiming(percent, { duration: motion.slow }));
  }, [percent, p]);
  const fill = useAnimatedStyle(() => ({ width: `${p.get()}%` }));
  return <Animated.View style={[styles.barFill, { backgroundColor: color }, fill]} />;
}

/** "Dakar · École normale" under a Dakar departure reads "École normale". */
export const shortPlace = (place: string, city: string) => (place.startsWith(`${city} · `) ? place.slice(city.length + 3) : place);

function Meta({ icon, text, fixed }: { icon: keyof typeof Ionicons.glyphMap; text: string; fixed?: boolean }) {
  return (
    <View style={[styles.metaItem, fixed && { flexShrink: 0 }]}>
      <Ionicons name={icon} size={13} color={colors.muted2} />
      <Text style={styles.metaText} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  organizer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  organizerName: { ...typo.smallStrong, flexShrink: 1, color: colors.navy },
  level: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: radii.pill },
  levelText: { ...typo.label },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  ratingText: { ...typo.label, color: colors.muted2 },
  price: { ...typo.title, color: colors.primary },
  perSeat: { fontSize: 12, fontWeight: '600', color: colors.muted2 },
  route: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  city: { ...typo.title, color: colors.navy },
  via: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
  },
  viaText: { ...typo.captionStrong, flexShrink: 1, color: colors.primary },
  cityLabel: { fontSize: 11, color: colors.muted2, marginTop: 1 },
  track: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  line: { flex: 1, height: 1.5, backgroundColor: colors.border },
  busDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: { flexDirection: 'row', gap: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  metaText: { ...typo.caption, color: colors.muted2 },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.bg },
  barFill: { height: '100%', borderRadius: 3 },
  // Tick where the trip becomes confirmed.
  threshold: { position: 'absolute', top: -3, width: 2, height: 12, marginLeft: -1, borderRadius: 1, backgroundColor: colors.navy },
  state: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  stateText: { ...typo.captionStrong },
  // Never squeezed by the status text.
  count: { ...typo.captionStrong, flexShrink: 0, color: colors.muted2 },
});
