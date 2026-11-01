import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CaravanSummary, FillBar, OrganizerLine } from '@/components/caravan';
import { BackButton } from '@/components/ui';
import { caravanState, formatDateTime, formatFcfa, paymentMethods, type Caravan, type CaravanStop } from '@/constants/data';
import { PaymentLogo } from '@/components/PaymentLogo';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useCaravans, type BookingOutcome } from '@/context/CaravansContext';
import { caravansApi, isCaravanTicket, toCaravan, type PassengerDto, type SeatMap } from '@/features/caravans/api';
import { CompanionSheet } from '@/features/caravans/CompanionSheet';
import type { PaymentMethod } from '@/features/payments/checkout';
import { ApiError } from '@/lib/api';
import { haptics } from '@/lib/haptics';
import { scheduleCaravanReminder } from '@/lib/notifications';

const SERVICE_FEE = 0;
/** The app's payment choices, as the API names them. */
const METHOD: Record<string, PaymentMethod> = { wave: 'wave', om: 'orange_money' };

export default function CaravaneReservation() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { caravans, tickets, book, resume, release, refresh } = useCaravans();
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
  const [payment, setPayment] = useState(paymentMethods[0].id);
  const [paying, setPaying] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadSeats = useCallback(() => {
    if (!id) return;
    caravansApi.seats(id).then(setMap, () => undefined);
  }, [id]);

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
  // First and last seat of each row are by the window.
  const isWindow = (n: number) => (n - 1) % perRow === 0 || (n - 1) % perRow === perRow - 1;
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
  const rows = Array.from({ length: Math.ceil((map?.capacity ?? 0) / perRow) }, (_, r) =>
    Array.from({ length: perRow }, (_, i) => r * perRow + i + 1).filter((n) => n <= (map?.capacity ?? 0)),
  );
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
      Alert.alert('Place perdue', `Le paiement est arrivé après la fin de la réservation et la place a été reprise. ${formatFcfa(amount)} te sont remboursés.`);
    } else if (outcome.status === 'pending') {
      Alert.alert('Paiement en attente', 'Tes places sont gardées 10 minutes. Termine le paiement depuis cet écran.');
    } else {
      Alert.alert('Paiement non effectué', 'Les places ont été libérées. Tu peux réessayer.');
    }
    loadSeats();
  };

  const pay = async () => {
    if (!picks.length || !pickup || !dropoff) return;
    setPaying(true);
    try {
      const seats = ordered.map((p) => (p.passenger ? { seat: p.seat, passenger: p.passenger } : { seat: p.seat }));
      finish(await book(c.id, { seats, pickupStopId: pickup.stopId, dropoffStopId: dropoff.stopId, method: METHOD[payment] ?? 'wave' }), pickup, total);
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

  const resumePayment = async () => {
    setPaying(true);
    try {
      finish(await resume(c), c.pickups[0] ?? null, heldTotal);
    } catch (err) {
      Alert.alert('Paiement impossible', err instanceof ApiError ? err.message : 'Réessaie dans un instant.');
    } finally {
      setPaying(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.head}>
        <BackButton onPress={() => router.back()} />
        <Text style={styles.h1}>{existing && forCompanion ? 'Place pour un accompagnant' : 'Réserver ma place'}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, shadow.card, { gap: 14 }]}>
          {/* The organizer is detailed in the card below: no need to repeat it here. */}
          <CaravanSummary caravan={c} header="price" />
          <FillBar caravan={c} />
        </View>

        <View style={[styles.card, shadow.card, { gap: 10 }]}>
          <OrganizerLine organizer={c.organizer} />
          <Text style={styles.muted}>
            {c.organizer.kind} · {c.organizer.trips ? `${c.organizer.trips} trajets effectués` : 'Premier trajet sur l’app'} · {c.vehicle.label}
            {c.vehicle.plate ? ` (${c.vehicle.plate})` : ''}
          </Text>
          <View style={styles.divider} />
          <Guarantee icon="document-text-outline" text="Assurance, visite technique et permis du chauffeur vérifiés" />
          <Guarantee icon="person-outline" text={`${c.totalSeats} places assises, pas une de plus`} />
          <Guarantee
            icon="wallet-outline"
            text={
              confirmed
                ? 'Ton argent reste bloqué jusqu’au départ'
                : `Remboursé à 100 % si ${c.minPassengers} passagers ne sont pas atteints le ${formatDateTime(c.confirmBy)}`
            }
          />
          <Guarantee icon="refresh-outline" text="Annulation gratuite jusqu’à 24 h avant le départ, puis 10 % de frais" />
        </View>

        {held ? (
          <View style={[styles.card, shadow.card, styles.already]}>
            <Ionicons name="time-outline" size={28} color={colors.primary} />
            <Text style={styles.alreadyTitle}>
              {held.seats.length > 1 ? `Places n° ${held.seats.map((x) => x.seat).join(' et ')} gardées pour toi` : `Place n° ${held.seat} gardée pour toi`}
            </Text>
            {held.seats
              .filter((x) => x.passenger)
              .map((x) => (
                <Text key={x.seat} style={styles.alreadyText}>
                  Place {x.seat} : {x.passenger!.name}
                </Text>
              ))}
            <Text style={styles.alreadyText}>Termine le paiement avant {formatDateTime(Date.parse(held.holdExpiresAt))}, sinon elles sont rendues aux autres.</Text>
            <Pressable style={styles.alreadyBtn} onPress={resumePayment} disabled={paying}>
              <Text style={styles.alreadyBtnText}>{paying ? 'Paiement…' : `Payer ${formatFcfa(heldTotal)}`}</Text>
            </Pressable>
            <Pressable onPress={() => release(held.id).then(loadSeats, () => undefined)} hitSlop={8} accessibilityRole="button">
              <Text style={styles.change}>{held.seats.length > 1 ? 'Libérer les places' : 'Libérer la place'}</Text>
            </Pressable>
          </View>
        ) : existing && !forCompanion ? (
          <View style={[styles.card, shadow.card, styles.already]}>
            <Ionicons name="ticket-outline" size={28} color={colors.primary} />
            <Text style={styles.alreadyTitle}>Tu as déjà ta place pour ce départ</Text>
            <Text style={styles.alreadyText}>
              {limit > 0 && c.bookingOpen
                ? `Tu voyages avec quelqu’un ? Tu peux encore réserver ${limit > 1 ? `${limit} places` : 'une place'} pour un accompagnant (${limitText.toLowerCase()})`
                : limitText}
            </Text>
            <Pressable style={styles.alreadyBtn} onPress={() => router.replace(`/billet/${existing}`)}>
              <Text style={styles.alreadyBtnText}>Voir mon billet</Text>
            </Pressable>
            {limit > 0 && c.bookingOpen && (
              <Pressable onPress={() => setForCompanion(true)} hitSlop={8} accessibilityRole="button">
                <Text style={styles.change}>Réserver pour un accompagnant</Text>
              </Pressable>
            )}
          </View>
        ) : limit === 0 ? (
          <View style={[styles.card, shadow.card, styles.already]}>
            <Ionicons name="ticket-outline" size={28} color={colors.primary} />
            <Text style={styles.alreadyTitle}>{c.purchasedHere ? 'Tu as transféré ton billet' : 'Limite atteinte'}</Text>
            <Text style={styles.alreadyText}>{limitText} Les billets transférés comptent aussi, pour que chaque place aille à un vrai voyageur.</Text>
          </View>
        ) : !c.bookingOpen ? (
          <View style={[styles.card, shadow.card, styles.already]}>
            <Ionicons name="lock-closed-outline" size={28} color={colors.muted} />
            <Text style={styles.alreadyTitle}>{c.seats ? 'Réservations fermées' : 'Départ complet'}</Text>
          </View>
        ) : booking ? (
          <>
          <View style={styles.sectionRow}>
            <Text style={styles.section}>{existing ? 'Sa place' : limit > 1 ? 'Tes places' : 'Ta place'}</Text>
            <Text style={styles.free}>{c.seats} places libres</Text>
          </View>

          {paid.length > 0 && (
            <View style={[styles.card, shadow.card, { gap: 10 }]}>
              <Text style={styles.recapTitle}>Déjà payé{paid.length > 1 ? 'es' : 'e'} sur ce départ</Text>
              {paid.map((t) => (
                <Pressable key={t.id} style={styles.picked} onPress={() => router.push(`/billet/${t.id}`)} accessibilityRole="button">
                  <View style={[styles.pickedSeat, styles.pickedCompanion]}>
                    <Text style={styles.pickedSeatText}>{t.seat}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.payName}>
                      Place n° {t.seat} · {t.passenger!.name}
                    </Text>
                    <Text style={styles.muted}>Ton accompagnant · son billet reste valable</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                </Pressable>
              ))}
            </View>
          )}

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
                      {p.passenger ? `Accompagnant · ${p.passenger.phone}` : `${isWindow(p.seat) ? 'Fenêtre' : 'Couloir'} · rangée ${Math.ceil(p.seat / perRow)}`}
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
                      <Text style={styles.seatActionText}>Voir le plan</Text>
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
                {!map && <ActivityIndicator color={colors.primary} />}
                {rows.map((row) => (
                  <View key={row[0]} style={styles.seatRow}>
                    {row.map((n, i) => {
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
                                  : `Place ${n}`
                          }
                          style={[
                            styles.seat,
                            i === Math.floor(perRow / 2) && styles.afterAisle,
                            own ? [styles.seatCompanion, styles.seatPaid] : isTaken ? styles.seatTaken : pick ? (pick.passenger ? styles.seatCompanion : styles.seatSelected) : styles.seatFree,
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

          {/* Like the organizers' own timetables: every stop with the bus's time there. */}
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

          <Text style={styles.section}>Moyen de paiement</Text>
          {paymentMethods.map((m) => {
            const on = m.id === payment;
            return (
              <Pressable key={m.id} onPress={() => setPayment(m.id)} style={[styles.card, styles.payment, on && styles.paymentOn]}>
                <PaymentLogo method={m} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.payName}>{m.name}</Text>
                  <Text style={styles.muted}>{m.detail}</Text>
                </View>
                {on ? (
                  <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                ) : (
                  <View style={styles.radio} />
                )}
              </Pressable>
            );
          })}

          <View style={[styles.card, shadow.card, { gap: 8 }]}>
            <Text style={styles.recapTitle}>Récapitulatif</Text>
            {ordered.length ? (
              ordered.map((p) => (
                <RecapRow
                  key={p.seat}
                  k={`Place n° ${p.seat} · ${p.passenger ? shortName(p.passenger.name) : 'Toi'}`}
                  v={formatFcfa(c.price)}
                />
              ))
            ) : (
              <RecapRow k="Aucune place choisie" v={formatFcfa(c.price)} />
            )}
            <RecapRow k="Montée" v={pickup ? `${pickup.place} · ${pickup.time}` : 'À choisir'} />
            <RecapRow k="Descente" v={dropoff?.place ?? 'À choisir'} />
            <RecapRow k="Frais de service" v={formatFcfa(SERVICE_FEE)} />
            <View style={styles.divider} />
            <View style={styles.recapRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{formatFcfa(total)}</Text>
            </View>
          </View>

          <Pressable disabled={!ready} onPress={pay} style={[styles.pay, !ready && styles.payDisabled]}>
            <Ionicons name="checkmark" size={18} color="#fff" />
            <Text style={styles.payText}>
              {paying
                ? 'Paiement en cours…'
                : !picks.length
                ? 'Choisis une place'
                : !pickup
                  ? 'Choisis le point de montée'
                  : !dropoff
                    ? 'Choisis la descente'
                    : `Payer ${formatFcfa(total)}`}
            </Text>
          </Pressable>
          <Text style={styles.note}>
            {picks.length > 1 ? 'Un billet avec QR code par place dans ton app après paiement' : 'Billet avec QR code dans l’app après paiement'}
          </Text>
          </>
        ) : null}
      </ScrollView>

      <CompanionSheet
        key={sheet ?? 'closed'}
        seat={sheet}
        initial={sheetPick?.passenger ?? null}
        route={pickup && dropoff ? `${pickup.place} → ${dropoff.place}` : null}
        onClose={() => setSheet(null)}
        onSave={(passenger) => {
          setPicks((prev) => [...prev.filter((p) => p.seat !== sheet), { seat: sheet!, passenger }]);
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

type SeatPick = { seat: number; passenger: PassengerDto | null };
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

function Guarantee({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.guarantee}>
      <Ionicons name={icon} size={16} color={colors.success} />
      <Text style={styles.guaranteeText}>{text}</Text>
    </View>
  );
}

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
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.section}>{title}</Text>
      <View style={[styles.card, shadow.card, styles.stopList]}>
        {stops.map((s, i) => {
          const on = s.stopId === value?.stopId;
          const only = stops.length === 1;
          return (
            <Pressable
              key={s.stopId}
              onPress={() => onChange(s)}
              disabled={only}
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
                <View style={[styles.railLine, i === stops.length - 1 && { backgroundColor: 'transparent' }]} />
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
      <Text style={styles.stopHint}>{hint}</Text>
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
  section: { ...typo.title, color: colors.navy, marginTop: 4 },
  free: { ...typo.captionStrong, color: colors.success },
  legend: { flexDirection: 'row', gap: 14 },
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
});
