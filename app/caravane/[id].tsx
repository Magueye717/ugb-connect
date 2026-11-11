import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { usePullRefresh } from '@/components/PullRefresh';
import { CaravanSummary, FillBar, OrganizerLine } from '@/components/caravan';
import { HoldCountdown } from '@/components/HoldCountdown';
import { ErrorState } from '@/components/states';
import { RequestPass } from '@/components/RequestPass';
import { BackButton, PrimaryButton, STICKY_FOOTER_SPACE, StickyFooter, TextButton } from '@/components/ui';
import { caravanState, formatDateTime, formatFcfa, type Caravan, type CaravanStop } from '@/constants/data';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useCaravans, type BookingOutcome } from '@/context/CaravansContext';
import { caravansApi, isCaravanTicket, toCaravan, type CaravanTicketDto, type PassengerDto, type SeatMap } from '@/features/caravans/api';
import { CompanionSheet, type CompanionStops } from '@/features/caravans/CompanionSheet';
import { ApiError } from '@/lib/api';
import { notice } from '@/lib/notice';
import { haptics } from '@/lib/haptics';
import { scheduleCaravanReminder } from '@/lib/notifications';

const SERVICE_FEE = 0;

export default function CaravaneReservation() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { caravans, tickets, book, release, refresh } = useCaravans();
  // Pull: the departure (seats left, confirmed…) and the seat plan.
  // From the list, or straight from a link (notification): then fetched.
  const [fetched, setFetched] = useState<Caravan | null>(null);
  const c = caravans.find((x) => x.id === id) ?? fetched;
  const [map, setMap] = useState<SeatMap | null>(null);
  // My seat and/or companions' seats, paid together.
  const [picks, setPicks] = useState<SeatPick[]>([]);
  // The seat whose companion is being named.
  const [sheet, setSheet] = useState<number | null>(null);
  // What the next tap on a free seat does: move my seat, add a companion, or move that companion's seat.
  const [target, setTarget] = useState<Target | null>(null);
  // I already have my seat and book one for a companion.
  const [forCompanion, setForCompanion] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [pickedUp, setPickup] = useState<CaravanStop | null>(null);
  const [droppedOff, setDropoff] = useState<CaravanStop | null>(null);
  // A single choice is made for the student.
  const pickup = pickedUp ?? (c?.pickups.length === 1 ? c.pickups[0]! : null);
  const dropoff = droppedOff ?? (c?.dropoffs.length === 1 ? c.dropoffs[0]! : null);
  // Only the providers this trip accepts (and not one the admins switched off); the choice falls back to the first.
  const [paying, setPaying] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // The seat plan couldn't be loaded: say so in the plan, with « Réessayer » (not an empty bus).
  const [seatsFailed, setSeatsFailed] = useState(false);
  const loadSeats = useCallback(() => {
    if (!id) return;
    caravansApi.seats(id).then(setMap, () => setSeatsFailed(true));
  }, [id]);
  const pull = usePullRefresh(refresh, loadSeats);
  const retrySeats = () => {
    setSeatsFailed(false);
    loadSeats();
  };

  useEffect(() => {
    if (!id) return;
    loadSeats();
    if (!caravans.some((x) => x.id === id)) {
      caravansApi.departure(id).then(
        (d) => setFetched(toCaravan(d)),
        (err) => setLoadError(err instanceof ApiError ? err.message : 'Départ introuvable.'),
      );
    }
  }, [id, caravans, loadSeats]);

  const perRow = map?.seatsPerRow ?? 4;
  // Numbered from the front: the first row has 2 seats on the right (door and driver on the left), then full rows.
  const first = map?.firstRowSeats ?? 2;
  const columnOf = (n: number) => (n <= first ? perRow - first + (n - 1) : (n - 1 - first) % perRow);
  const rowOf = (n: number) => (n <= first ? 1 : 2 + Math.floor((n - 1 - first) / perRow));
  // First and last column of each row are by the window.
  const isWindow = (n: number) => columnOf(n) === 0 || columnOf(n) === perRow - 1;
  // 5 per row: the middle one is the folding seat in the aisle (« versailler »).
  const isMiddle = (n: number) => perRow % 2 === 1 && columnOf(n) === Math.floor(perRow / 2);
  const seatKind = (n: number) => (isWindow(n) ? 'Fenêtre' : isMiddle(n) ? 'Versailler' : 'Couloir');
  const taken = useMemo(() => new Set([...(map?.taken ?? []), ...(map?.blocked ?? [])]), [map]);

  if (!c) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.head}>
          <BackButton onPress={() => router.back()} />
          <Text style={styles.h1}>Réserver ma place</Text>
          <View style={{ width: 44 }} />
        </View>
        {loadError ? <Text style={[styles.muted, { textAlign: 'center', marginTop: 40 }]}>{loadError}</Text> : <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />}
      </SafeAreaView>
    );
  }

  const existing = c.myTicketId;
  const limit = c.mySeatsLeft;
  const limitText = c.maxSeatsPerStudent === 1 ? 'Une seule place par étudiant sur ce départ.' : `${c.maxSeatsPerStudent} places maximum par étudiant sur ce départ.`;
  const mine = picks.find((p) => !p.passenger);
  // Companions' seats already paid on this departure (I may have cancelled my own seat and be booking again).
  const paid = tickets.filter(isCaravanTicket).filter((t) => t.status === 'active' && t.passenger && t.details.departureId === c.id);
  const paidSeat = (n: number) => paid.find((t) => t.seat === n);
  const sheetPick = picks.find((p) => p.seat === sheet);
  const freeSeats = () => Array.from({ length: map?.capacity ?? c.totalSeats }, (_, i) => i + 1).filter((n) => !taken.has(n) && !picks.some((p) => p.seat === n));

  // The first seat placed is mine (unless I already have one), then taps move the seat being placed.
  const valid = (t: Target | null): t is Target =>
    t === 'mine' ? !existing : t === 'add' ? picks.length < limit : t !== null && picks.some((p) => p.seat === t && p.passenger);
  const companions = picks.filter((p) => p.passenger);
  const current: Target = valid(target)
    ? target
    : !existing
      ? 'mine'
      : companions.length
        ? companions[companions.length - 1]!.seat
        : 'add';

  /** Puts the seat being placed on seat n: mine moves, a companion moves with their name, or a new companion is named. */
  const place = (n: number, t: Target) => {
    if (t === 'mine') {
      setPicks((prev) => (prev.some((p) => !p.passenger) ? prev.map((p) => (p.passenger ? p : { ...p, seat: n })) : [...prev, { seat: n, passenger: null }]));
      setTarget('mine');
    } else if (t === 'add') {
      if (picks.length >= limit) Alert.alert('Limite atteinte', limitText);
      else setSheet(n);
    } else {
      setPicks((prev) => prev.map((p) => (p.seat === t ? { ...p, seat: n } : p)));
      setTarget(n);
    }
  };

  const tapSeat = (n: number) => {
    const picked = picks.find((p) => p.seat === n);
    // Tapping one of my chosen seats selects it: the next free seat tapped moves it.
    if (picked) setTarget(picked.passenger ? n : 'mine');
    else place(n, current);
  };

  // Front-most free window seat, else the front-most free seat (the server suggests the same).
  const pickForMe = () => {
    const free = freeSeats();
    const best = free.find(isWindow) ?? free[0];
    if (best) place(best, existing ? 'add' : 'mine');
  };
  const openMap = (t: Target) => {
    setTarget(t);
    setShowMap(true);
  };
  const { confirmed } = caravanState(c);
  // Each row as its `perRow` places, front first: a seat number, or null for an empty place (the left of the first row,
  // where the door and the driver are; the end of a short last row).
  const capacity = map?.capacity ?? 0;
  const rows: (number | null)[][] = capacity
    ? [
        Array.from({ length: perRow }, (_, c) => (c >= perRow - first && c - (perRow - first) + 1 <= capacity ? c - (perRow - first) + 1 : null)),
        ...Array.from({ length: Math.ceil(Math.max(0, capacity - first) / perRow) }, (_, r) =>
          Array.from({ length: perRow }, (_, c) => {
            const n = first + r * perRow + c + 1;
            return n <= capacity ? n : null;
          }),
        ),
      ]
    : [];
  const total = (c.price + SERVICE_FEE) * Math.max(1, picks.length);
  const ready = picks.length > 0 && !!pickup && !!dropoff && !paying;
  const ordered = [...picks].sort((a, b) => Number(!!a.passenger) - Number(!!b.passenger));
  const held = c.myBooking;
  const heldTotal = (c.price + SERVICE_FEE) * (held?.seats.length || 1);
  const booking = !existing || forCompanion;

  const finish = (outcome: BookingOutcome, stop: CaravanStop | null, amount: number) => {
    if (outcome.status === 'confirmed') {
      haptics.success();
      if (stop) scheduleCaravanReminder(c, stop);
      router.replace({ pathname: '/billet/[id]', params: { id: outcome.ticketId, nouveau: '1' } });
    } else if (outcome.status === 'refunded') {
      notice({ tone: 'warning', title: 'Place perdue', message: `Le paiement est arrivé après la fin de la réservation et la place a été reprise. ${formatFcfa(amount)} te sont remboursés.` });
    } else if (outcome.status === 'requested') {
      haptics.success();
      notice({
        tone: 'success',
        title: 'Demande envoyée',
        message: `Va payer ${formatFcfa(amount)} en espèces à l’organisateur${c.organizer.name ? ` (${c.organizer.name})` : ''} dans les 24 h. Il valide ta demande et ${picks.length > 1 ? 'tes billets apparaissent' : 'ton billet apparaît'}, avec ${picks.length > 1 ? 'leur' : 'son'} QR code.`,
      });
    } else if (outcome.status === 'pending') {
      notice({ tone: 'pending', title: 'Demande en attente', message: 'Va payer l’organisateur en espèces : il valide ta demande.' });
    } else {
      notice({ tone: 'warning', title: 'Paiement non effectué', message: 'Les places ont été libérées. Tu peux réessayer.' });
    }
    loadSeats();
  };

  const pay = async () => {
    if (!picks.length || !pickup || !dropoff) return;
    setPaying(true);
    try {
      const seats = ordered.map((p) => (p.passenger ? { seat: p.seat, passenger: p.passenger, ...(p.stops ?? {}) } : { seat: p.seat }));
      finish(await book(c.id, { seats, pickupStopId: pickup.stopId, dropoffStopId: dropoff.stopId }), pickup, total);
      setPicks([]);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SEAT_TAKEN') {
        setPicks([]);
        loadSeats();
      }
      Alert.alert('Réservation impossible', err instanceof ApiError ? err.message : 'Réessaie dans un instant.');
      refresh();
    } finally {
      setPaying(false);
    }
  };

  // Everything already mine on this departure, in one place: my ticket, my companions', a request waiting.
  const mineHere = tickets.filter(isCaravanTicket).filter((t) => t.status === 'active' && t.details.departureId === c.id).sort((a, b) => Number(!!a.passenger) - Number(!!b.passenger));
  const hasMine = !!held || !!existing || mineHere.length > 0;
  // The booking steps: nothing waiting, places left for me, still open, and (when I have my seat) for a companion.
  const flow = !held && limit > 0 && c.bookingOpen && booking;
  const canAdd = !held && !!existing && !forCompanion && limit > 0 && c.bookingOpen;
  const seatsDone = picks.length > 0;
  const tripDone = !!pickup && !!dropoff;
  const cta = paying
    ? 'Envoi…'
    : !seatsDone
      ? 'Choisis une place'
      : !pickup
        ? 'Choisis le point de montée'
        : !dropoff
          ? 'Choisis ton arrêt'
          : 'Envoyer ma demande';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.head}>
        <BackButton onPress={() => router.back()} />
        <Text style={styles.h1}>{existing && forCompanion ? 'Place pour un accompagnant' : 'Réserver ma place'}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.body, flow && { paddingBottom: STICKY_FOOTER_SPACE.two }]} showsVerticalScrollIndicator={false} refreshControl={pull}>
        <View style={[styles.card, shadow.card, { gap: 14 }]}>
          {/* The organizer is detailed in the card below: no need to repeat it here. */}
          <CaravanSummary caravan={c} header="price" />
          <FillBar caravan={c} />
        </View>

        {/* What I already have here comes first: the answer to « where do I stand? » before anything to choose. */}
        {hasMine && (
          <MyPlaces
            caravan={c}
            held={held}
            heldTotal={heldTotal}
            tickets={mineHere}
            existing={existing}
            onRelease={() => held && release(held.id).then(loadSeats, (err) => Alert.alert('Annulation impossible', err instanceof ApiError ? err.message : 'Vérifie ta connexion et réessaie.'))}
            footer={
              canAdd ? (
                <Pressable style={styles.addRow} onPress={() => setForCompanion(true)} accessibilityRole="button">
                  <Ionicons name="person-add-outline" size={18} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.addRowTitle}>Ajouter un accompagnant</Text>
                    <Text style={styles.muted}>Encore {limit > 1 ? `${limit} places possibles` : 'une place possible'} pour toi sur ce départ.</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                </Pressable>
              ) : forCompanion ? (
                <TextButton label="Ne pas ajouter d’accompagnant" onPress={() => (setForCompanion(false), setPicks([]))} style={{ alignSelf: 'center' }} />
              ) : !held && existing ? (
                <Text style={[styles.muted, { textAlign: 'center' }]}>{c.bookingOpen ? limitText : 'Réservations fermées sur ce départ.'}</Text>
              ) : null
            }
          />
        )}

        {!hasMine && limit === 0 && (
          <View style={[styles.card, shadow.card, styles.already]}>
            <Ionicons name="ticket-outline" size={28} color={colors.primary} />
            <Text style={styles.alreadyTitle}>{c.purchasedHere ? 'Tu as transféré ton billet' : 'Limite atteinte'}</Text>
            <Text style={styles.alreadyText}>{limitText} Les billets transférés comptent aussi, pour que chaque place aille à un vrai voyageur.</Text>
          </View>
        )}
        {!hasMine && limit > 0 && !c.bookingOpen && (
          <View style={[styles.card, shadow.card, styles.already]}>
            <Ionicons name="lock-closed-outline" size={28} color={colors.muted} />
            <Text style={styles.alreadyTitle}>{c.seats ? 'Réservations fermées' : 'Départ complet'}</Text>
          </View>
        )}

        <OrganizerCard caravan={c} confirmed={confirmed} />

        {flow && (
          <>
            <Step n={1} title={existing ? 'Sa place' : limit > 1 ? 'Tes places' : 'Ta place'} done={seatsDone} aside={`${c.seats} libres`}>
            {/* The 64-seat plan is long: folded by default, one tap picks a good seat. */}
            {!showMap ? (
              <View style={[styles.card, shadow.card, { gap: 12 }]}>
                {ordered.map((p) => (
                  <Pressable
                    key={p.seat}
                    style={styles.picked}
                    disabled={!p.passenger}
                    onPress={() => setSheet(p.seat)}
                    accessibilityRole={p.passenger ? 'button' : undefined}
                    accessibilityLabel={p.passenger ? `Place ${p.seat}, ${p.passenger.name}. Modifier` : undefined}>
                    <View style={[styles.pickedSeat, p.passenger && styles.pickedCompanion]}>
                      <Text style={styles.pickedSeatText}>{p.seat}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.payName}>
                        Place n° {p.seat} · {p.passenger ? p.passenger.name : 'Toi'}
                      </Text>
                      <Text style={styles.muted}>
                        {p.passenger ? (p.stops ? `${c.pickups.find((x) => x.stopId === p.stops!.pickupStopId)?.place ?? ''} → ${c.dropoffs.find((x) => x.stopId === p.stops!.dropoffStopId)?.place ?? ''}` : `Accompagnant · ${p.passenger.phone}`) : `${seatKind(p.seat)} · rangée ${rowOf(p.seat)}`}
                      </Text>
                    </View>
                    {p.passenger && <Ionicons name="create-outline" size={18} color={colors.muted2} />}
                  </Pressable>
                ))}
                {picks.length > 0 ? (
                  <View style={styles.pickedActions}>
                    <Pressable onPress={() => openMap(mine ? 'mine' : ordered[0]!.seat)} hitSlop={10} accessibilityRole="button">
                      <Text style={styles.change}>{picks.length > 1 ? 'Changer les places' : 'Changer'}</Text>
                    </Pressable>
                    {picks.length < limit && (
                      <Pressable onPress={() => openMap('add')} hitSlop={10} accessibilityRole="button" style={styles.addCompanion}>
                        <Ionicons name="person-add-outline" size={16} color={colors.primary} />
                        <Text style={styles.addCompanionText}>Ajouter un accompagnant</Text>
                      </Pressable>
                    )}
                  </View>
                ) : (
                  <>
                    <Text style={styles.muted}>
                      {existing ? 'Choisis la place de ton accompagnant : on te demandera son nom et son numéro.' : 'Laisse-nous choisir, ou regarde le plan du bus.'}
                      {!existing && limit > 1 ? ` Tu voyages avec quelqu’un ? Après ta place, ajoute un accompagnant (${limitText.toLowerCase().replace('.', '')}).` : ''}
                    </Text>
                    <View style={styles.seatActions}>
                      <Pressable style={[styles.seatAction, styles.seatActionMain]} onPress={pickForMe} accessibilityRole="button">
                        <Ionicons name="sparkles-outline" size={16} color="#fff" />
                        <Text style={[styles.seatActionText, { color: '#fff' }]}>Choisis pour moi</Text>
                      </Pressable>
                      <Pressable style={styles.seatAction} onPress={() => openMap(existing ? 'add' : 'mine')} accessibilityRole="button">
                        <Ionicons name="grid-outline" size={16} color={colors.primary} />
                        <Text style={styles.seatActionText}>Voir les places</Text>
                      </Pressable>
                    </View>
                  </>
                )}
              </View>
            ) : (
              <>
                <View style={styles.legend}>
                  <Legend style={styles.seatFree} label="Libre" />
                  <Legend style={styles.seatTaken} label="Occupée" />
                  {!existing && <Legend style={styles.seatSelected} label="Toi" />}
                  {limit > 1 || existing || paid.length ? <Legend style={styles.seatCompanion} label="Accompagnant" /> : null}
                  {perRow === 5 && <Legend style={[styles.seatFree, styles.seatMiddle]} label="Versailler" />}
                </View>
                {/* Which seat the next tap places: mine, a companion's, or a new companion. */}
                {(picks.length > 0 || paid.length > 0) && (
                  <View style={styles.targets}>
                    {ordered.map((p) => {
                      const t: Target = p.passenger ? p.seat : 'mine';
                      const on = current === t;
                      return (
                        <Pressable
                          key={p.seat}
                          onPress={() => setTarget(t)}
                          style={[styles.target, on && (p.passenger ? styles.targetOnCompanion : styles.targetOn)]}
                          accessibilityRole="tab"
                          accessibilityState={{ selected: on }}>
                          <Text style={[styles.targetText, on && { color: '#fff' }]} numberOfLines={1}>
                            {p.passenger ? p.passenger.name.split(' ')[0] : 'Toi'} · {p.seat}
                          </Text>
                        </Pressable>
                      );
                    })}
                    {picks.length < limit && (existing || mine) && (
                      <Pressable
                        onPress={() => setTarget('add')}
                        style={[styles.target, current === 'add' && styles.targetOnCompanion]}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: current === 'add' }}>
                        <Text style={[styles.targetText, current === 'add' && { color: '#fff' }]}>+ Accompagnant</Text>
                      </Pressable>
                    )}
                  </View>
                )}
                <Text style={styles.mapHint}>
                  {current === 'mine'
                    ? mine
                      ? 'Touche une autre place pour déplacer la tienne.'
                      : limit > 1
                        ? 'Touche ta place. Tu voyages avec quelqu’un ? Ensuite, choisis « + Accompagnant ».'
                        : 'Touche ta place.'
                    : current === 'add'
                      ? 'Touche une place libre pour ton accompagnant : on te demandera son nom et son numéro.'
                      : `Touche une autre place pour déplacer celle de ${picks.find((p) => p.seat === current)?.passenger?.name.split(' ')[0] ?? 'ton accompagnant'}.`}
                </Text>
                <View style={[styles.card, styles.busCard, shadow.card]}>
                  <View style={styles.front}>
                    <Ionicons name="bus-outline" size={12} color={colors.primary} />
                    <Text style={styles.frontText}>Avant du bus</Text>
                  </View>
                  {!map && !seatsFailed && <ActivityIndicator color={colors.primary} />}
                  {!map && seatsFailed && <ErrorState text="Le plan des places n’a pas pu être chargé." onRetry={retrySeats} />}
                  {rows.map((row) => (
                    <View key={row.find((n) => n !== null)} style={styles.seatRow}>
                      {row.map((n, i) => {
                        // 4 per row: the aisle before the third seat. 5: the folding middle seat sits in it.
                        const aisle = perRow % 2 === 0 ? i === perRow / 2 && styles.afterAisle : i === Math.floor(perRow / 2) && styles.inAisle;
                        if (n === null) return <View key={`empty-${i}`} style={[styles.seat, aisle]} />;
                        const isTaken = taken.has(n);
                        const pick = picks.find((p) => p.seat === n);
                        const own = paidSeat(n);
                        const selected = !!pick && current === (pick.passenger ? pick.seat : 'mine');
                        return (
                          <Pressable
                            key={n}
                            disabled={isTaken}
                            onPress={() => tapSeat(n)}
                            accessibilityLabel={
                              own
                                ? `Place ${n}, ${own.passenger!.name}, déjà payée`
                                : isTaken
                                  ? `Place ${n}, occupée`
                                  : pick
                                    ? `Place ${n}, ${pick.passenger ? pick.passenger.name : 'ta place'}`
                                    : `Place ${n}${isMiddle(n) ? ', versailler' : ''}`
                            }
                            style={[
                              styles.seat,
                              aisle,
                              own ? [styles.seatCompanion, styles.seatPaid] : isTaken ? styles.seatTaken : pick ? (pick.passenger ? styles.seatCompanion : styles.seatSelected) : [styles.seatFree, isMiddle(n) && styles.seatMiddle],
                              selected && styles.seatMoving,
                            ]}>
                            {own ? (
                              <Text style={styles.seatInitials}>{initials(own.passenger!.name)}</Text>
                            ) : isTaken ? (
                              <Ionicons name="close" size={16} color={colors.muted} />
                            ) : pick?.passenger ? (
                              <Text style={styles.seatInitials}>{initials(pick.passenger.name)}</Text>
                            ) : (
                              <Text style={[styles.seatText, !!pick && { color: '#fff' }]}>{n}</Text>
                            )}
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}
                </View>
                <Pressable style={[styles.seatAction, styles.seatActionMain, styles.mapDone]} onPress={() => setShowMap(false)} accessibilityRole="button">
                  <Ionicons name="checkmark" size={16} color="#fff" />
                  <Text style={[styles.seatActionText, { color: '#fff' }]}>
                    {picks.length > 1 ? `Valider les ${picks.length} places` : picks.length ? 'Valider ma place' : 'Fermer le plan'}
                  </Text>
                </Pressable>
              </>
            )}

            </Step>

            {/* Like the organizers' own timetables: every stop with the bus's time there. */}
            <Step n={2} title="Trajet" done={tripDone}>
              <StopPicker
                title={existing ? 'Où monte-t-il ?' : 'Où montes-tu ?'}
                hint="Sois au point de montée 15 min avant l’heure : le bus n’attend pas."
                stops={c.pickups}
                value={pickup}
                onChange={setPickup}
              />
              <StopPicker
                title={existing ? 'Où descend-il ?' : 'Où descends-tu ?'}
                hint="Heures d’arrivée estimées, selon la circulation."
                stops={c.dropoffs}
                value={dropoff}
                onChange={setDropoff}
                estimated
              />
            </Step>

            <Step n={3} title="Paiement" done={false}>
              <View style={[styles.card, shadow.card, { gap: 8 }]}>
                {ordered.length ? (
                  ordered.map((p) => <RecapRow key={p.seat} k={`Place n° ${p.seat} · ${p.passenger ? shortName(p.passenger.name) : 'Toi'}`} v={formatFcfa(c.price)} />)
                ) : (
                  <RecapRow k="Aucune place choisie" v={formatFcfa(c.price)} />
                )}
                <RecapRow k="Montée" v={pickup ? `${pickup.place} · ${pickup.time}` : 'À choisir'} />
                <RecapRow k="Arrêt" v={dropoff?.place ?? 'À choisir'} />
                {SERVICE_FEE > 0 && <RecapRow k="Frais de service" v={formatFcfa(SERVICE_FEE)} />}
                <View style={styles.divider} />
                <View style={styles.recapRow}>
                  <Text style={styles.totalLabel}>Total</Text>
                  <Text style={styles.totalValue}>{formatFcfa(total)}</Text>
                </View>
              </View>
              <View style={styles.cashInfo}>
                <Ionicons name="cash-outline" size={18} color={colors.successText} />
                <Text style={styles.cashInfoText}>
                  En espèces, en main propre à l’organisateur. {picks.length > 1 ? 'Tes places sont gardées' : 'Ta place est gardée'} 24 h : il valide ta demande dès qu’il reçoit l’argent, et {picks.length > 1 ? 'chaque billet arrive avec son' : 'ton billet arrive avec son'} QR code.
                </Text>
              </View>
            </Step>
          </>
        )}
      </ScrollView>

      {/* The action and its total never scroll away. */}
      {flow && (
        <StickyFooter>
          <View style={styles.footerRow}>
            <View>
              <Text style={styles.footerLabel}>{picks.length > 1 ? `${picks.length} places` : 'Total'}</Text>
              <Text style={styles.footerTotal}>{formatFcfa(total)}</Text>
            </View>
            <PrimaryButton label={cta} disabled={!ready} loading={paying} onPress={pay} style={{ flex: 1, paddingHorizontal: 16 }} />
          </View>
        </StickyFooter>
      )}

      <CompanionSheet
        key={sheet ?? 'closed'}
        seat={sheet}
        initial={sheetPick?.passenger ?? null}
        route={pickup && dropoff ? `${pickup.place} → ${dropoff.place}` : null}
        pickups={c.pickups}
        dropoffs={c.dropoffs}
        initialStops={sheetPick?.stops ?? null}
        onClose={() => setSheet(null)}
        onSave={(passenger, stops) => {
          setPicks((prev) => [...prev.filter((p) => p.seat !== sheet), { seat: sheet!, passenger, stops }]);
          // The new companion's seat is the one the next taps move.
          setTarget(sheet);
          setSheet(null);
        }}
        onRemove={() => {
          setPicks((prev) => prev.filter((p) => p.seat !== sheet));
          setSheet(null);
        }}
      />
    </SafeAreaView>
  );
}

type SeatPick = { seat: number; passenger: PassengerDto | null; stops?: CompanionStops | null };
/** What the next tap on a free seat places: my seat, a new companion, or the companion on that seat. */
type Target = 'mine' | 'add' | number;

/** "Awa Ndiaye" → "AN", on the seat map. */
const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

/** "Awa Ndiaye" → "Awa N." */
const shortName = (name: string) => {
  const [first, ...rest] = name.split(' ');
  return rest.length ? `${first} ${rest[rest.length - 1]![0]}.` : first!;
};

function Legend({ style, label }: { style: StyleProp<ViewStyle>; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendBox, style]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

/**
 * « Mes places sur ce départ »: however many there are, one card. A request waiting (how much, to whom, until when, its
 * QR code), then each ticket on its own row (mine first, then my companions'), opening the ticket.
 */
function MyPlaces({
  caravan: c,
  held,
  heldTotal,
  tickets,
  existing,
  onRelease,
  footer,
}: {
  caravan: Caravan;
  held: Caravan['myBooking'];
  heldTotal: number;
  tickets: CaravanTicketDto[];
  existing: string | null | undefined;
  onRelease: () => void;
  footer: React.ReactNode;
}) {
  const count = tickets.length + (held?.seats.length ?? 0);
  return (
    <View style={[styles.card, shadow.card, { gap: 12 }]}>
      <View style={styles.mineHead}>
        <Ionicons name="ticket" size={18} color={colors.primary} />
        <Text style={styles.mineTitle}>Mes places sur ce départ</Text>
        {count > 0 && (
          <View style={styles.countPill}>
            <Text style={styles.countPillText}>{count}</Text>
          </View>
        )}
      </View>

      {held && (
        <View style={styles.heldBox}>
          <View style={styles.heldTop}>
            <Text style={styles.heldTitle}>Demande en attente</Text>
            <HoldCountdown until={held.holdExpiresAt} />
          </View>
          {held.seats.map((x) => (
            <SeatLine key={x.seat} seat={x.seat} name={x.passenger?.name ?? 'Toi'} companion={!!x.passenger} sub="En attente du paiement" />
          ))}
          <View style={styles.payStep}>
            <Ionicons name="cash-outline" size={18} color={colors.warningText} />
            <Text style={styles.payStepText}>
              Va payer <Text style={{ fontWeight: '800' }}>{formatFcfa(held.total ?? heldTotal)}</Text> en espèces à {c.organizer.name || 'l’organisateur'} avant le {formatDateTime(Date.parse(held.holdExpiresAt))}. Sans validation, les places sont rendues.
            </Text>
          </View>
          <RequestPass
            code={held.code}
            organizer={held.organizer}
            items={held.seats.map((x) => ({ id: x.id ?? String(x.seat), title: `Place ${x.seat}`, sub: x.passenger ? x.passenger.name : 'Toi', price: x.price ?? c.price, code: x.code ?? null }))}
          />
          <TextButton label="Annuler ma demande" tone="danger" onPress={onRelease} style={{ alignSelf: 'center' }} />
        </View>
      )}

      {tickets.map((t) => (
        <SeatLine
          key={t.id}
          seat={t.seat}
          name={t.passenger ? t.passenger.name : 'Toi'}
          companion={!!t.passenger}
          sub={`${t.details.pickup.place} → ${t.details.dropoff.place}`}
          onPress={() => router.push(`/billet/${t.id}`)}
        />
      ))}
      {/* My ticket not in the list yet (just validated, list loading): still one tap away. */}
      {!!existing && !tickets.some((t) => t.id === existing) && (
        <TextButton label="Voir mon billet" icon="ticket-outline" onPress={() => router.push(`/billet/${existing}`)} style={{ alignSelf: 'flex-start' }} />
      )}
      {footer}
    </View>
  );
}

/** One seat: its number in a badge (mine blue, a companion's orange), who travels, and where. */
function SeatLine({ seat, name, companion, sub, onPress }: { seat: number | null; name: string; companion: boolean; sub: string; onPress?: () => void }) {
  return (
    <Pressable style={styles.picked} onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={`Place ${seat ?? ''}, ${name}, ${sub}`}>
      <View style={[styles.pickedSeat, companion && styles.pickedCompanion]}>
        <Text style={styles.pickedSeatText}>{seat ?? '–'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.payName} numberOfLines={1}>
          {name}
          {companion ? <Text style={styles.muted}> · accompagnant</Text> : null}
        </Text>
        <Text style={styles.muted} numberOfLines={1}>
          {sub}
        </Text>
      </View>
      {onPress && <Ionicons name="chevron-forward" size={16} color={colors.muted} />}
    </Pressable>
  );
}

/** Who drives, folded to one line; the guarantees (insurance, seats, refund, cancellation) one tap away. */
function OrganizerCard({ caravan: c, confirmed }: { caravan: Caravan; confirmed: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={[styles.card, shadow.card, { gap: 10 }]}>
      <OrganizerLine organizer={c.organizer} />
      <Text style={styles.muted}>
        {c.organizer.kind} · {c.organizer.trips ? `${c.organizer.trips} trajets effectués` : 'Premier trajet sur l’app'} · {c.vehicle.label}
        {c.vehicle.plate ? ` (${c.vehicle.plate})` : ''}
        {c.vehicle.airConditioned ? ' · climatisé' : ''}
      </Text>
      <Pressable style={styles.fold} onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <Ionicons name="shield-checkmark-outline" size={16} color={colors.success} />
        <Text style={styles.foldText}>Garanties et annulation</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted2} />
      </Pressable>
      {open && (
        <View style={{ gap: 8 }}>
          <Guarantee icon="document-text-outline" text="Assurance, visite technique et permis du chauffeur vérifiés" />
          <Guarantee icon="person-outline" text={`${c.totalSeats} places assises, pas une de plus`} />
          <Guarantee
            icon="wallet-outline"
            text={confirmed ? 'Départ confirmé : le bus part' : `Annulé si ${c.minPassengers} passagers ne sont pas atteints le ${formatDateTime(c.confirmBy)} : tu es prévenu`}
          />
          <Guarantee icon="refresh-outline" text="Annulation gratuite jusqu’à 24 h avant le départ, puis 10 % de frais" />
        </View>
      )}
    </View>
  );
}

/** A booking step: its number (a tick once done), its title, and what it holds. */
function Step({ n, title, done, aside, children }: { n: number; title: string; done: boolean; aside?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.stepHead}>
        <View style={[styles.stepDot, done && styles.stepDotDone]}>
          {done ? <Ionicons name="checkmark" size={14} color="#fff" /> : <Text style={styles.stepNum}>{n}</Text>}
        </View>
        <Text style={styles.stepTitle}>{title}</Text>
        {!!aside && <Text style={styles.free}>{aside}</Text>}
      </View>
      {children}
    </View>
  );
}

function Guarantee({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.guarantee}>
      <Ionicons name={icon} size={16} color={colors.success} />
      <Text style={styles.guaranteeText}>{text}</Text>
    </View>
  );
}

/**
 * The stops, like a timetable. Chosen, it folds to that one stop (« Changer » opens the list again): a long route
 * doesn't stretch the screen. A single stop is chosen already.
 */
function StopPicker({
  title,
  hint,
  stops,
  value,
  onChange,
  estimated,
}: {
  title: string;
  hint: string;
  stops: CaravanStop[];
  value: CaravanStop | null;
  onChange: (s: CaravanStop) => void;
  estimated?: boolean;
}) {
  const [open, setOpen] = useState(!value);
  const only = stops.length === 1;
  const shown = open && !only ? stops : value ? [value] : stops;
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.stopHead}>
        <Text style={styles.label}>{title}</Text>
        {!open && !only && value && (
          <Pressable onPress={() => setOpen(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Changer : ${title}`}>
            <Text style={styles.change}>Changer</Text>
          </Pressable>
        )}
      </View>
      <View style={[styles.card, shadow.card, styles.stopList]}>
        {shown.map((s, i) => {
          const on = s.stopId === value?.stopId;
          return (
            <Pressable
              key={s.stopId}
              onPress={() => {
                onChange(s);
                setOpen(false);
              }}
              disabled={only || !open}
              style={[styles.stopRow, on && styles.stopRowOn]}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${s.place}, ${estimated ? 'vers ' : ''}${s.time}`}>
              {/* Route line: dots joined top to bottom, like a timetable. */}
              <View style={styles.rail}>
                <View style={[styles.railLine, i === 0 && { backgroundColor: 'transparent' }]} />
                <View style={[styles.railDot, on && styles.railDotOn]}>
                  {on && <Ionicons name="checkmark" size={11} color="#fff" />}
                </View>
                <View style={[styles.railLine, i === shown.length - 1 && { backgroundColor: 'transparent' }]} />
              </View>
              <Text style={[styles.stopPlace, on && styles.stopPlaceOn]}>{s.place}</Text>
              <Text style={[styles.stopTime, on && styles.stopPlaceOn]}>
                {estimated ? '~' : ''}
                {s.time}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {open && <Text style={styles.stopHint}>{hint}</Text>}
    </View>
  );
}

function RecapRow({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.recapRow}>
      <Text style={styles.recapKey}>{k}</Text>
      <Text style={styles.recapValue}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  h1: { ...typo.h3, color: colors.navy },
  body: { padding: 20, gap: 12, paddingBottom: 32 },
  card: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 14 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  section: { ...typo.section, color: colors.navy, marginTop: 4 },
  free: { ...typo.captionStrong, color: colors.success },
  // Wraps to a second line when there are many (Libre, Occupée, Toi, Accompagnant, Versailler).
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendBox: { width: 12, height: 12, borderRadius: 3 },
  legendText: { ...typo.caption, color: colors.muted2 },
  busCard: { alignItems: 'center', gap: 8 },
  front: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    marginBottom: 4,
  },
  frontText: { ...typo.label, color: colors.primary },
  seatRow: { flexDirection: 'row', gap: 8 },
  seat: { width: 40, height: 40, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center' },
  afterAisle: { marginLeft: 28 },
  inAisle: { marginHorizontal: 4 },
  seatMiddle: { borderStyle: 'dashed', borderColor: colors.accent },
  seatFree: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  seatTaken: { backgroundColor: colors.border },
  seatSelected: { backgroundColor: colors.primary },
  seatCompanion: { backgroundColor: colors.accent },
  // Paid earlier: shown as mine, not tappable.
  seatPaid: { opacity: 0.55 },
  // The chosen seat the next tap moves.
  seatMoving: { borderWidth: 3, borderColor: colors.navy },
  targets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  target: { minHeight: 36, paddingHorizontal: 14, borderRadius: radii.pill, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card, justifyContent: 'center' },
  targetOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  targetOnCompanion: { backgroundColor: colors.accent, borderColor: colors.accent },
  targetText: { ...typo.smallStrong, color: colors.navy },
  seatText: { ...typo.smallStrong, color: colors.navy },
  seatInitials: { ...typo.smallStrong, color: '#fff' },
  mapHint: { ...typo.caption, color: colors.muted2, lineHeight: 17 },
  mapDone: { flex: 0 },
  picked: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pickedSeat: { width: 44, height: 44, borderRadius: radii.sm, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  pickedSeatText: { ...typo.title, color: '#fff' },
  pickedCompanion: { backgroundColor: colors.accent },
  pickedActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  addCompanion: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  addCompanionText: { ...typo.smallStrong, color: colors.primary },
  change: { color: colors.orangeText, fontWeight: '700' },
  seatActions: { flexDirection: 'row', gap: 10 },
  seatAction: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    minHeight: 44,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  seatActionMain: { backgroundColor: colors.primary },
  seatActionText: { ...typo.bodyStrong, color: colors.primary },
  payment: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: 'transparent' },
  paymentOn: { borderColor: colors.primary },
  payName: { fontWeight: '700', color: colors.navy },
  muted: { ...typo.caption, color: colors.muted2, marginTop: 1 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border },
  recapTitle: { fontWeight: '700', color: colors.navy, marginBottom: 2 },
  recapRow: { flexDirection: 'row', justifyContent: 'space-between' },
  recapKey: { ...typo.small, color: colors.muted2 },
  recapValue: { color: colors.navy, fontSize: 13, fontWeight: '600' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
  totalLabel: { fontWeight: '700', color: colors.navy },
  totalValue: { ...typo.title, color: colors.primary },
  pay: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.accent,
    minHeight: 52,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  payDisabled: { backgroundColor: colors.tabInactive },
  payText: { ...typo.title, color: '#fff' },
  note: { ...typo.caption, textAlign: 'center', color: colors.muted2 },
  guarantee: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  guaranteeText: { ...typo.small, flex: 1, color: colors.text, lineHeight: 18 },
  already: { alignItems: 'center', gap: 8, paddingVertical: 20 },
  alreadyTitle: { ...typo.title, color: colors.navy, textAlign: 'center' },
  alreadyText: { ...typo.small, color: colors.muted2, textAlign: 'center', lineHeight: 18 },
  alreadyBtn: { marginTop: 6, backgroundColor: colors.accent, paddingHorizontal: 22, minHeight: 42, borderRadius: radii.pill, justifyContent: 'center' },
  alreadyBtnText: { color: '#fff', fontWeight: '700' },
  stopList: { paddingVertical: 4, paddingHorizontal: 0 },
  stopRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingRight: 14 },
  stopRowOn: { backgroundColor: colors.primarySoft },
  rail: { width: 34, alignSelf: 'stretch', alignItems: 'center' },
  railLine: { flex: 1, width: 2, backgroundColor: colors.border },
  railDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.muted,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  railDotOn: { borderColor: colors.primary, backgroundColor: colors.primary },
  stopPlace: { ...typo.body, flex: 1, color: colors.text, paddingVertical: 10 },
  stopPlaceOn: { fontWeight: '700', color: colors.navy },
  stopTime: { ...typo.smallStrong, color: colors.muted2, fontVariant: ['tabular-nums'] },
  stopHint: { ...typo.caption, color: colors.muted2, lineHeight: 17 },
  cashInfo: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: radii.md, backgroundColor: colors.successBg },
  label: { ...typo.smallStrong, color: colors.navy },
  stopHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  stepDot: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  stepDotDone: { backgroundColor: colors.success, borderColor: colors.success },
  stepNum: { ...typo.smallStrong, color: colors.primary },
  stepTitle: { ...typo.section, color: colors.navy, flex: 1 },
  mineHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mineTitle: { ...typo.section, color: colors.navy, flex: 1 },
  countPill: { minWidth: 24, height: 24, paddingHorizontal: 7, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  countPillText: { ...typo.label, color: '#fff' },
  heldBox: { gap: 10, padding: 12, borderRadius: radii.md, backgroundColor: colors.warningBg },
  // Title above the countdown: side by side, a long countdown would push off the screen.
  heldTop: { gap: 6 },
  heldTitle: { ...typo.bodyStrong, color: colors.warningText },
  payStep: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  payStepText: { ...typo.small, flex: 1, color: colors.warningText, lineHeight: 19 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radii.md, backgroundColor: colors.primarySoft },
  addRowTitle: { ...typo.bodyStrong, color: colors.primary },
  fold: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  foldText: { ...typo.smallStrong, color: colors.navy, flex: 1 },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  footerLabel: { ...typo.caption, color: colors.muted2 },
  footerTotal: { ...typo.title, color: colors.navy },
  cashInfoText: { ...typo.small, flex: 1, color: colors.successText, lineHeight: 19 },
});
