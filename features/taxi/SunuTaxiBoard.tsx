import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { LayoutAnimationConfig } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip, Field, LabeledField, PrimaryButton } from '@/components/ui';
import { PopOnChange, popIn } from '@/components/motion';
import { EmptyState, ErrorState, SkeletonCard } from '@/components/states';
import { formatFcfa, TAXI_LOCK_MIN, TAXI_STRIKES_LIMIT, taxiSeatPrice } from '@/constants/data';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useTaxi, type TaxiTrip } from '@/context/TaxiContext';
import type { NewTrip } from '@/features/taxi/api';
import { useTaxiActions } from '@/features/taxi/useTaxiActions';
import { ApiError } from '@/lib/api';

const LEAVE_IN = [15, 30, 60, 120]; // minutes
const SEAT_OPTIONS = [2, 3, 4];
/** "Non remboursable X min avant le départ": the organizer's choice, 0 = the default (10 min). */
const LOCK_OPTIONS = [0, 5, 15, 20, 30, 45, 60];
const DEFAULT_LOCK = 10;
/** Same bounds as the backend (decision 2026-10-31). */
const FARE_MIN = 500;
const FARE_MAX = 20_000;

export function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function formatDeparture(at: number, now: number) {
  const mins = Math.round((at - now) / 60_000);
  if (mins <= 0) return 'Départ imminent';
  if (mins < 60) return `Dans ${mins} min`;
  const d = new Date(at);
  return `Aujourd’hui ${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}`;
}

const leaveLabel = (m: number) => (m < 60 ? `${m} min` : `${m / 60} h`);

// Sunu Taxi: a student proposes a trip, others pay their seat to join.
// Seats lock before departure (the organizer chooses when, 10 min by default) so nobody is left paying for someone else.
/** Screen content without header or safe area: used by a tab and by its standalone page. */
export function SunuTaxiBoard() {
  const taxi = useTaxi();
  const { me, trips, strikes } = taxi;
  const now = useNow();
  const [creating, setCreating] = useState(false);

  // From the server: open trips, plus my departed ones while their chat is still open.
  const upcoming = trips.filter((t) => t.status !== 'cancelled');

  const { join, resumePayment, leave, cancel, busy, depart, claim, current, suspended } = useTaxiActions();

  if (taxi.loading) {
    return (
      <View style={styles.body}>
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }
  if (taxi.error && trips.length === 0) return <ErrorState text={taxi.error} onRetry={taxi.refresh} />;

  return (
    <>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>Tu pars quelque part ?</Text>
            <Text style={styles.heroSub}>Propose un trajet, d’autres étudiants paient leur place et vous partagez le prix.</Text>
          </View>
          <Pressable
            style={[styles.heroBtn, suspended && { opacity: 0.5 }]}
            disabled={suspended}
            onPress={() => (current ? busy() : setCreating(true))}>
            <Ionicons name="add" size={16} color={colors.primary} />
            <Text style={styles.heroBtnText}>Proposer</Text>
          </Pressable>
        </View>

        <View style={[styles.rules, shadow.card]}>
          <Rule icon="wallet-outline" text="Tu paies ta place en rejoignant : prix fixe, connu d’avance." />
          <Rule icon="lock-closed-outline" text={`Places verrouillées ${TAXI_LOCK_MIN} min avant (à mi-chemin pour un départ proche) : quitter n’est plus remboursé.`} />
          <Rule icon="shield-checkmark-outline" text="Trajet annulé par l’organisateur : remboursé à 100 %." />
        </View>

        {strikes > 0 && (
          <View style={[styles.strikes, suspended && { backgroundColor: colors.dangerBg }]}>
            <Ionicons name="alert-circle" size={18} color={suspended ? colors.danger : colors.warning} />
            <Text style={[styles.strikesText, suspended && { color: colors.dangerText }]}>
              {suspended
                ? 'Sunu Taxi suspendu 7 jours après 3 annulations tardives.'
                : `${strikes} annulation${strikes > 1 ? 's' : ''} tardive${strikes > 1 ? 's' : ''} sur ${TAXI_STRIKES_LIMIT}. À ${TAXI_STRIKES_LIMIT}, Sunu Taxi est suspendu 7 jours.`}
            </Text>
          </View>
        )}

        <Text style={styles.section}>Trajets ouverts</Text>
        {upcoming.length === 0 && (
          <EmptyState
            icon="car-outline"
            title="Aucun trajet pour le moment"
            text="Propose le premier : d’autres étudiants te rejoindront."
            action={suspended ? undefined : { label: 'Proposer un trajet', onPress: () => setCreating(true) }}
          />
        )}

        {upcoming.map((t) => (
          <TripCard
            key={t.id}
            trip={t}
            me={me}
            now={now}
            suspended={suspended}
            busy={!!current && current.id !== t.id}
            onBusy={busy}
            onJoin={() => join(t)}
            onPay={() => resumePayment(t)}
            onLeave={(locked) => leave(t, locked)}
            onCancel={(locked) => cancel(t, locked)}
            onCheckIn={() => taxi.checkIn(t.id).catch((err) => Alert.alert('Pointage impossible', err instanceof ApiError ? err.message : 'Vérifie ta connexion et réessaie.'))}
            onDepart={() => depart(t)}
            onClaim={() => claim(t)}
            messageCount={taxi.unreadFor(t.id)}
            onChat={() => router.push(`/trajet/${t.id}`)}
            compact
            onOpen={() => router.push(`/taxi/${t.id}`)}
          />
        ))}
      </ScrollView>

      <NewTripSheet
        visible={creating}
        onClose={() => setCreating(false)}
        onCreate={async (trip) => {
          await taxi.create(trip);
          setCreating(false);
        }}
      />
    </>
  );
}

/** A trip: compact in the list (tap to open), complete with every action on the trip screen. */
export function TripCard({
  trip: t,
  compact,
  onOpen,
  me,
  now,
  suspended,
  busy,
  onBusy,
  onJoin,
  onPay,
  onLeave,
  onCancel,
  onCheckIn,
  onDepart,
  onClaim,
  messageCount,
  onChat,
}: {
  trip: TaxiTrip;
  me: string;
  now: number;
  suspended: boolean;
  /** I'm already in another trip. */
  busy: boolean;
  onBusy: () => void;
  onJoin: () => void;
  /** Back to the payment page for a seat taken but not paid yet. */
  onPay: () => void;
  onLeave: (locked: boolean) => void;
  onCancel: (locked: boolean) => void;
  onCheckIn: () => void;
  onDepart: () => void;
  /** Organizer, after departure: collect the paid seats. */
  onClaim: () => void;
  messageCount: number;
  onChat: () => void;
  compact?: boolean;
  onOpen?: () => void;
}) {
  const isOrganizer = t.passengers[0] === me;
  const isIn = t.passengers.includes(me);
  const paying = t.myStatus === 'pending_payment';
  const full = t.seatsTaken >= t.seats;
  const locked = now >= t.lockAt;
  const here = t.checkedIn.includes(me);
  const lockIn = Math.max(0, Math.ceil((t.lockAt - now) / 60_000));
  // Seats paid by someone who left after the lock, or held while someone pays: taken, but nobody to show.
  const reserved = Math.max(0, t.seatsTaken - t.passengers.length);
  const { trips, lateCancels } = t.organizer;
  const claimed = !!t.claim?.payout;

  return (
    <Pressable
      disabled={!compact}
      onPress={onOpen}
      style={({ pressed }) => [styles.card, shadow.card, pressed && { opacity: 0.85 }]}
      accessibilityRole={compact ? 'button' : undefined}
      accessibilityLabel={compact ? `Trajet vers ${t.to}, ${formatDeparture(t.departureAt, now)}` : undefined}>
      <View style={styles.rowBetween}>
        <View style={styles.organizer}>
          <Avatar initials={t.organizer.initials} />
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.organizerName}>{isOrganizer ? 'Toi' : t.organizer.name}</Text>
            {lateCancels > 0 ? (
              <Text style={[styles.organizerRole, { color: colors.warningText }]}>
                {lateCancels} annulation{lateCancels > 1 ? 's' : ''} tardive{lateCancels > 1 ? 's' : ''} récente{lateCancels > 1 ? 's' : ''}
              </Text>
            ) : (
              <Text style={[styles.organizerRole, trips > 0 && { color: colors.successText }]}>
                {trips > 0 ? `Fiable · ${trips} trajets` : 'Nouvel organisateur'}
              </Text>
            )}
          </View>
        </View>
        <Text style={styles.departure}>{formatDeparture(t.departureAt, now)}</Text>
      </View>

      <View style={styles.route}>
        <View style={styles.routeLine}>
          <View style={styles.routeFrom} />
          <View style={styles.routeBar} />
          <Ionicons name="location" size={14} color={colors.primary} />
        </View>
        <View style={{ flex: 1, gap: 10 }}>
          <Text style={styles.place} numberOfLines={1}>
            {t.from}
          </Text>
          <Text style={styles.place} numberOfLines={1}>
            {t.to}
          </Text>
        </View>
      </View>

      <View style={styles.rowBetween}>
        {/* Someone taking a seat pops in; the row doesn't animate when the list first shows. */}
        <LayoutAnimationConfig skipEntering>
        <View style={styles.seatsRow}>
          {Array.from({ length: t.seats }, (_, i) =>
            t.passengers[i] ? (
              <Animated.View key={t.passengers[i]} entering={popIn}>
                <Avatar
                  initials={t.people[t.passengers[i]]?.initials ?? '?'}
                  small
                  highlight={t.passengers[i] === me}
                  here={t.checkedIn.includes(t.passengers[i])}
                />
              </Animated.View>
            ) : i < t.passengers.length + reserved ? (
              <View key={`taken-${i}`} style={styles.takenSeat} />
            ) : (
              <View key={`free-${i}`} style={styles.freeSeat} />
            ),
          )}
          <Text style={styles.seatsText}>
            {t.seatsTaken}/{t.seats}
          </Text>
        </View>
        </LayoutAnimationConfig>
        <Text style={styles.share}>{formatFcfa(t.seatPrice)} / place</Text>
      </View>

      {!compact && t.taxi && (
        <View style={styles.taxiLine}>
          <Ionicons name="car-outline" size={14} color={colors.navy} />
          <Text style={styles.taxiText} numberOfLines={1}>
            {t.taxi}
          </Text>
        </View>
      )}

      {compact ? null : t.departed ? (
        <View style={[styles.lock, styles.lockGo]}>
          <Ionicons name="car" size={13} color={colors.successText} />
          <Text style={[styles.lockText, { color: colors.successText }]}>En route · bon trajet !</Text>
        </View>
      ) : (
        <View style={[styles.lock, locked && styles.lockOn]}>
          <Ionicons name={locked ? 'lock-closed' : 'lock-open-outline'} size={13} color={locked ? colors.warningText : colors.muted2} />
          <Text style={[styles.lockText, locked && { color: colors.warningText }]}>
            {locked ? 'Places verrouillées · quitter n’est plus remboursé' : `Verrouillage dans ${lockIn} min · quitter est remboursé`}
          </Text>
        </View>
      )}

      {!compact && isIn && (
        <Pressable style={styles.chat} onPress={onChat} accessibilityRole="button" accessibilityLabel="Ouvrir la discussion du trajet">
          <Ionicons name="chatbubbles-outline" size={16} color={colors.primary} />
          <Text style={styles.chatText}>Discussion</Text>
          {messageCount > 0 && (
            <View style={styles.chatCount}>
              <Text style={styles.chatCountText} maxFontSizeMultiplier={1.2}>{messageCount}</Text>
            </View>
          )}
          <Ionicons name="chevron-forward" size={14} color={colors.primary} style={{ marginLeft: 'auto' }} />
        </Pressable>
      )}

      {compact && isIn ? (
        <View style={styles.actions}>
          {/* At the meeting point: check in straight from the list, no need to open the trip. */}
          {!t.departed && !isOrganizer && locked ? (
            <Pressable
              style={[styles.action, { flex: 1 }, here && styles.actionDone]}
              disabled={here}
              onPress={onCheckIn}
              accessibilityRole="button"
              accessibilityState={{ disabled: here }}>
              <PopOnChange id={here ? 'here' : 'go'}>
                <Ionicons name={here ? 'checkmark-circle' : 'hand-left-outline'} size={16} color={here ? colors.successText : '#fff'} />
              </PopOnChange>
              <Text style={[styles.actionText, here && { color: colors.successText }]}>{here ? 'Au rendez-vous' : 'Je suis là'}</Text>
            </Pressable>
          ) : (
            <Pressable style={[styles.action, styles.actionOutline, { flex: 1 }]} onPress={onOpen} accessibilityRole="button">
              <Ionicons name={t.departed ? 'car' : 'checkmark-circle'} size={16} color={colors.successText} />
              <Text style={[styles.actionText, { color: colors.successText }]} numberOfLines={1}>
                {t.departed ? 'En route · voir le trajet' : isOrganizer ? 'Ton trajet · gérer' : 'Place payée · voir le trajet'}
              </Text>
            </Pressable>
          )}
          {/* One tap to the chat: it's what you need most once you're in. Gone when the chat closes. */}
          {now < t.chatClosesAt && <ChatButton count={messageCount} onPress={onChat} />}
        </View>
      ) : t.departed ? (
        isOrganizer && (t.claim?.amount ?? 0) > 0 ? (
          <Pressable
            style={[styles.action, claimed && styles.actionDone]}
            disabled={claimed}
            onPress={onClaim}
            accessibilityRole="button"
            accessibilityState={{ disabled: claimed }}>
            <Ionicons name={claimed ? 'checkmark-circle' : 'wallet-outline'} size={16} color={claimed ? colors.successText : '#fff'} />
            <Text style={[styles.actionText, claimed && { color: colors.successText }]}>
              {claimed ? `${formatFcfa(t.claim!.payout!.amount)} demandés` : `Récupérer ${formatFcfa(t.claim!.amount)}`}
            </Text>
          </Pressable>
        ) : null
      ) : paying ? (
        <View style={styles.actions}>
          <Pressable style={[styles.action, { flex: 1 }]} onPress={onPay} accessibilityRole="button">
            <Ionicons name="wallet-outline" size={16} color="#fff" />
            <Text style={styles.actionText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              Payer · {formatFcfa(t.seatPrice)}
            </Text>
          </Pressable>
          <Pressable style={[styles.action, styles.actionOutline, styles.actionSmall]} onPress={() => onLeave(false)}>
            <Text style={[styles.actionText, { color: colors.muted2 }]}>Libérer</Text>
          </Pressable>
        </View>
      ) : isOrganizer ? (
        locked ? (
          <View style={styles.actions}>
            <Pressable style={[styles.action, { flex: 1 }]} onPress={onDepart}>
              <Ionicons name="car" size={16} color="#fff" />
              <Text style={styles.actionText}>On est partis</Text>
            </Pressable>
            <Pressable style={[styles.action, styles.actionOutline, styles.actionSmall]} onPress={() => onCancel(true)}>
              <Text style={[styles.actionText, { color: colors.dangerText }]}>Annuler</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable style={[styles.action, styles.actionOutline]} onPress={() => onCancel(false)}>
            <Text style={[styles.actionText, { color: colors.dangerText }]}>Annuler le trajet</Text>
          </Pressable>
        )
      ) : isIn ? (
        locked ? (
          <View style={styles.actions}>
            <Pressable
              style={[styles.action, { flex: 1 }, here && styles.actionDone]}
              disabled={here}
              onPress={onCheckIn}
              accessibilityState={{ disabled: here }}>
              <PopOnChange id={here ? 'here' : 'go'}>
                <Ionicons name={here ? 'checkmark-circle' : 'hand-left-outline'} size={16} color={here ? colors.successText : '#fff'} />
              </PopOnChange>
              <Text style={[styles.actionText, here && { color: colors.successText }]}>{here ? 'Tu es au rendez-vous' : 'Je suis là'}</Text>
            </Pressable>
            <Pressable style={[styles.action, styles.actionOutline, styles.actionSmall]} onPress={() => onLeave(true)}>
              <Text style={[styles.actionText, { color: colors.muted2 }]}>Quitter</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable style={[styles.action, styles.actionOutline]} onPress={() => onLeave(false)}>
            <Ionicons name="checkmark-circle" size={16} color={colors.successText} />
            <Text style={[styles.actionText, { color: colors.successText }]}>Place payée · Quitter</Text>
          </Pressable>
        )
      ) : (
        <Pressable
          style={[styles.action, (full || suspended || busy) && styles.actionDisabled]}
          disabled={full || suspended}
          onPress={busy ? onBusy : onJoin}>
          <Text style={styles.actionText}>
            {full ? 'Complet' : suspended ? 'Suspendu' : busy ? 'Déjà dans un trajet' : `Rejoindre · ${formatFcfa(t.seatPrice)}`}
          </Text>
        </Pressable>
      )}
    </Pressable>
  );
}

/** Round chat button with the number of new messages. */
export function ChatButton({ count, onPress }: { count: number; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.chatRound, pressed && { opacity: 0.8 }]}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={count ? `Discussion, ${count} nouveau${count > 1 ? 'x' : ''} message${count > 1 ? 's' : ''}` : 'Discussion'}>
      <Ionicons name="chatbubbles-outline" size={20} color={colors.primary} />
      {count > 0 && (
        // Pops on each new message, so it's noticed without reading the number.
        <View style={styles.chatBadgeWrap} pointerEvents="none">
          <PopOnChange id={count}>
            <View style={styles.chatBadge}>
              <Text style={styles.chatBadgeText} maxFontSizeMultiplier={1.2}>{count > 9 ? '9+' : count}</Text>
            </View>
          </PopOnChange>
        </View>
      )}
    </Pressable>
  );
}

export function Rule({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.rule}>
      <Ionicons name={icon} size={16} color={colors.primary} />
      <Text style={styles.ruleText}>{text}</Text>
    </View>
  );
}

export function Avatar({ initials, small, highlight, here }: { initials: string; small?: boolean; highlight?: boolean; here?: boolean }) {
  return (
    <View style={[styles.avatar, small && styles.avatarSmall, highlight && styles.avatarMe, here && styles.avatarHere]}>
      <Text style={[styles.avatarText, small && { fontSize: 11 }]} maxFontSizeMultiplier={small ? 1.1 : 1.3}>{initials}</Text>
    </View>
  );
}

function NewTripSheet({
  visible,
  onClose,
  onCreate,
}: {
  visible: boolean;
  onClose: () => void;
  onCreate: (trip: NewTrip) => Promise<void>;
}) {
  const [from, setFrom] = useState('UGB · Village E');
  const [to, setTo] = useState('');
  const [leaveIn, setLeaveIn] = useState(30);
  const [seats, setSeats] = useState(4);
  const [lock, setLock] = useState(0);
  const [fare, setFare] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fareValue = Number(fare.replace(/\D/g, ''));
  const fareError = fareValue > 0 && (fareValue < FARE_MIN || fareValue > FARE_MAX) ? `Entre ${formatFcfa(FARE_MIN)} et ${formatFcfa(FARE_MAX)}.` : null;
  // Only delays shorter than the time before departure; one that no longer fits falls back to the default.
  const lockOptions = LOCK_OPTIONS.filter((m) => m === 0 || m < leaveIn);
  const lockMinutes = lockOptions.includes(lock) ? lock : 0;
  const shownLock = lockMinutes || Math.min(DEFAULT_LOCK, Math.floor(leaveIn / 2));
  const valid = from.trim().length > 1 && to.trim().length > 1 && fareValue > 0 && !fareError;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      // The departure is counted on the server's clock: a phone set to the wrong time still gets the right trip.
      await onCreate({ from: from.trim(), to: to.trim(), leaveInMinutes: leaveIn, seats, fare: fareValue, ...(lockMinutes ? { lockMinutes } : {}) });
      setTo('');
      setFare('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Une erreur est survenue. Réessaie.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fermer" />
      <KeyboardAvoidingView behavior="padding" style={{ flexShrink: 1 }}>
        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>Proposer un trajet</Text>
          <ScrollView contentContainerStyle={{ gap: 16 }} keyboardShouldPersistTaps="handled">
            <LabeledField label="Départ">
              <Field icon="radio-button-on-outline" placeholder="UGB · Village E" value={from} onChangeText={setFrom} />
            </LabeledField>
            <LabeledField label="Destination">
              <Field icon="location-outline" placeholder="Saint-Louis · Gare routière" value={to} onChangeText={setTo} />
            </LabeledField>
            <LabeledField label="Départ dans">
              <Chips options={LEAVE_IN} value={leaveIn} onChange={setLeaveIn} label={leaveLabel} />
            </LabeledField>
            <LabeledField label="Non remboursable avant le départ">
              <Chips options={lockOptions} value={lockMinutes} onChange={setLock} label={(m) => (m ? `${m} min` : `Par défaut · ${DEFAULT_LOCK} min`)} />
            </LabeledField>
            <Text style={styles.hint}>
              Un passager qui quitte le trajet moins de {shownLock} min avant le départ n’est pas remboursé : sa place reste payée.
            </Text>
            <LabeledField label="Places dans le taxi (toi compris)">
              <Chips options={SEAT_OPTIONS} value={seats} onChange={setSeats} label={String} />
            </LabeledField>
            <LabeledField label="Prix total du taxi" error={fareError}>
              <Field
                icon="cash-outline"
                placeholder="3000"
                keyboardType="number-pad"
                value={fare}
                onChangeText={setFare}
                right={<Text style={styles.fcfa}>FCFA</Text>}
              />
            </LabeledField>
            {fareValue > 0 && !fareError && (
              <Text style={styles.hint}>
                Chaque passager paie {formatFcfa(taxiSeatPrice({ fare: fareValue, seats }))} en rejoignant. Tu couvres les places vides.
              </Text>
            )}
            {error && <Text style={styles.error}>{error}</Text>}
            <PrimaryButton label="Publier le trajet" onPress={submit} disabled={!valid} loading={submitting} />
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Chips<T extends number>({
  options,
  value,
  onChange,
  label,
}: {
  options: T[];
  value: T;
  onChange: (v: T) => void;
  label: (v: T) => string;
}) {
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const on = o === value;
        return (
          <Chip key={o} label={label(o)} selected={on} onPress={() => onChange(o)} />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 20, gap: 12, paddingBottom: 32 },
  hero: {
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroTitle: { ...typo.title, color: '#fff' },
  heroSub: { ...typo.caption, color: 'rgba(255,255,255,0.85)', marginTop: 4, lineHeight: 17 },
  heroBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    minHeight: 40,
    borderRadius: radii.pill,
  },
  heroBtnText: { ...typo.smallStrong, color: colors.primary },
  section: { ...typo.section, color: colors.navy, marginTop: 8 },
  card: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 14, gap: 12 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  organizer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  organizerName: { ...typo.bodyStrong, color: colors.navy },
  organizerRole: { fontSize: 11, color: colors.muted2 },
  departure: { ...typo.captionStrong, color: colors.primary },
  route: { flexDirection: 'row', gap: 10 },
  routeLine: { alignItems: 'center', paddingTop: 4, width: 14 },
  routeFrom: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: colors.primary },
  routeBar: { width: 2, height: 14, backgroundColor: colors.border, marginVertical: 2 },
  place: { fontSize: 14, fontWeight: '600', color: colors.text },
  seatsRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  seatsText: { ...typo.caption, color: colors.muted2, marginLeft: 4 },
  freeSeat: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed' },
  takenSeat: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.border },
  share: { ...typo.smallStrong, color: colors.navy },
  action: {
    flexDirection: 'row',
    gap: 6,
    minHeight: 40,
    // Room inside the pill: a long label shrinks rather than touch the edges.
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionOutline: { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border },
  actionDisabled: { backgroundColor: colors.tabInactive },
  actionDone: { backgroundColor: colors.successBg },
  actionSmall: { paddingHorizontal: 16 },
  actions: { flexDirection: 'row', gap: 8 },
  rules: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 14, gap: 10 },
  rule: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  ruleText: { ...typo.small, flex: 1, color: colors.text, lineHeight: 18 },
  strikes: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: radii.md, backgroundColor: colors.warningBg },
  strikesText: { ...typo.small, flex: 1, color: colors.warningText, lineHeight: 18 },
  lock: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.sm, backgroundColor: colors.bg },
  lockOn: { backgroundColor: colors.warningBg },
  lockGo: { backgroundColor: colors.successBg },
  taxiLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  taxiText: { ...typo.smallStrong, flex: 1, color: colors.navy },
  chat: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 14, borderRadius: radii.pill, backgroundColor: colors.primarySoft },
  chatText: { ...typo.bodyStrong, color: colors.primary },
  chatCount: { minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  chatRound: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  chatBadgeWrap: { position: 'absolute', top: -2, right: -2 },
  chatBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.dangerText,
    borderWidth: 2,
    borderColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatBadgeText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  chatCountText: { ...typo.label, color: '#fff' },
  lockText: { flex: 1, fontSize: 12, fontWeight: '600', color: colors.muted2 },
  actionText: { ...typo.bodyStrong, color: '#fff', flexShrink: 1, textAlign: 'center' },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSmall: { width: 22, height: 22, borderRadius: 11 },
  avatarMe: { backgroundColor: colors.primary },
  // Green ring: at the meeting point.
  avatarHere: { borderWidth: 2, borderColor: colors.success },
  avatarText: { ...typo.captionStrong, color: '#fff' },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,27,76,0.4)' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
    maxHeight: 640,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 14 },
  sheetTitle: { ...typo.h3, color: colors.navy, marginBottom: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    minHeight: 40,
    borderRadius: radii.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fcfa: { color: colors.muted2, fontWeight: '600' },
  hint: { ...typo.caption, color: colors.muted2, marginTop: -6 },
  error: { fontSize: 13, fontWeight: '600', color: colors.danger, textAlign: 'center' },
});
