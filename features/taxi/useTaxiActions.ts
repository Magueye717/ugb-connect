import { Alert } from 'react-native';

import { formatFcfa, TAXI_STRIKES_LIMIT } from '@/constants/data';
import { useTaxi, type JoinOutcome, type TaxiTrip } from '@/context/TaxiContext';
import { methodLabel, type PaymentMethod } from '@/features/taxi/api';
import { ApiError } from '@/lib/api';
import { notice } from '@/lib/notice';
import { toast } from '@/lib/toast';

const hhmm = (at: number) => {
  const d = new Date(at);
  return `${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}`;
};

/** Every failure shows the server's message (trip full, already in a trip, offline…). */
const fail = (err: unknown) =>
  Alert.alert('Action impossible', err instanceof ApiError ? err.message : 'Une erreur est survenue. Réessaie.');

/** Runs an action, showing its error if it fails. */
const attempt = async <T>(run: () => Promise<T>): Promise<T | undefined> => {
  try {
    return await run();
  } catch (err) {
    fail(err);
    return undefined;
  }
};

/** Sunu Taxi actions with their confirmations, shared by the trip list and the trip screen. */
export function useTaxiActions() {
  const taxi = useTaxi();
  const { strikes, suspendedUntil } = taxi;
  const suspended = !!suspendedUntil && suspendedUntil > Date.now();

  const tellOutcome = (t: TaxiTrip, outcome: JoinOutcome | undefined) => {
    const price = formatFcfa(t.seatPrice);
    if (outcome === 'joined') toast(`Place réservée : ${price} payés. Remboursé si tu quittes avant ${hhmm(t.lockAt)}.`);
    else if (outcome === 'refunded') notice({ tone: 'warning', title: 'Plus de place', message: `Le paiement est arrivé trop tard : ${price} te sont remboursés.` });
    else if (outcome === 'failed') notice({ tone: 'warning', title: 'Paiement non effectué', message: 'Ta place a été libérée. Tu peux réessayer.' });
    else if (outcome === 'pending') notice({ tone: 'pending', title: 'Paiement en attente', message: 'Ta place est gardée 10 min. Appuie sur « Payer » pour terminer.' });
  };

  const join = (t: TaxiTrip) => {
    const price = formatFcfa(t.seatPrice);
    // Reservation only: the seat is taken now, the share paid in the taxi.
    if (!t.payOnline) {
      const reserve = async () => {
        if ((await attempt(() => taxi.join(t.id))) === 'joined') toast(`Place réservée. Ta part : ${price}, à régler dans le taxi.`);
      };
      Alert.alert('Réserver ta place ?', `Ta part : ${price}, à régler dans le taxi. Tu peux annuler ta réservation tant que vous n’êtes pas partis.`, [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Réserver', onPress: reserve },
      ]);
      return;
    }
    const pay = async (method: PaymentMethod) => tellOutcome(t, await attempt(() => taxi.join(t.id, method)));
    Alert.alert(`Payer ta place · ${price}`, `Places verrouillées à ${hhmm(t.lockAt)} : après, quitter n’est plus remboursé.`, [
      { text: 'Annuler', style: 'cancel' },
      { text: methodLabel.wave, onPress: () => pay('wave') },
      { text: methodLabel.orange_money, onPress: () => pay('orange_money') },
    ]);
  };

  const resumePayment = async (t: TaxiTrip) => tellOutcome(t, await attempt(() => taxi.resumePayment(t.id)));

  const leave = (t: TaxiTrip, locked: boolean) => {
    if (!t.payOnline) {
      Alert.alert('Annuler ta réservation ?', 'Ta place est rendue aux autres étudiants.', [
        { text: 'Garder ma place', style: 'cancel' },
        { text: 'Annuler la réservation', style: 'destructive', onPress: () => attempt(() => taxi.leave(t.id)) },
      ]);
      return;
    }
    const paying = t.myStatus === 'pending_payment';
    Alert.alert(
      paying ? 'Libérer la place ?' : 'Quitter le trajet ?',
      paying
        ? 'Tu n’as pas encore payé : la place est rendue aux autres.'
        : locked
          ? `Places verrouillées : ta place (${formatFcfa(t.seatPrice)}) n’est pas remboursée, elle sert à payer le taxi.`
          : `Tu es remboursé de ${formatFcfa(t.seatPrice)} sur ton numéro Wave / Orange Money.`,
      [
        { text: 'Rester', style: 'cancel' },
        { text: paying ? 'Libérer' : 'Quitter', style: 'destructive', onPress: () => attempt(() => taxi.leave(t.id)) },
      ],
    );
  };

  const cancel = (t: TaxiTrip, locked: boolean) => {
    const others = t.passengers.length - 1;
    const doCancel = async () => {
      const res = await attempt(() => taxi.cancel(t.id));
      if (res?.strike) Alert.alert('Trajet annulé', `Annulation tardive : ${strikes + 1}/${TAXI_STRIKES_LIMIT}. ${t.payOnline ? 'Les passagers sont remboursés à 100 %.' : 'Les passagers sont prévenus.'}`);
    };
    if (others === 0) {
      Alert.alert('Annuler le trajet ?', t.payOnline ? 'Personne n’a encore payé de place.' : 'Personne n’a encore réservé de place.', [
        { text: 'Garder le trajet', style: 'cancel' },
        { text: 'Annuler le trajet', style: 'destructive', onPress: doCancel },
      ]);
      return;
    }
    // Students are counting on this trip: handing it over comes first, so nobody is left without a taxi.
    const next = taxi.nameOf(t.passengers[1]);
    Alert.alert(
      'Tu ne peux plus partir ?',
      `Passe le relais : ${next}, premier inscrit, organise le trajet à ta place. Pas de pénalité.\n\n` +
        (t.payOnline
          ? `Ou annule : les ${others} étudiant${others > 1 ? 's' : ''} inscrit${others > 1 ? 's' : ''} ${others > 1 ? 'sont remboursés' : 'est remboursé'} à 100 %.`
          : `Ou annule : ${others > 1 ? `les ${others} étudiants inscrits sont prévenus` : 'l’étudiant inscrit est prévenu'}.`) +
        (locked ? ` Annulation tardive : ${strikes + 1}/${TAXI_STRIKES_LIMIT}. À ${TAXI_STRIKES_LIMIT}, Sunu Taxi est suspendu 7 jours.` : ''),
      [
        { text: 'Garder le trajet', style: 'cancel' },
        { text: `Passer le relais à ${next}`, onPress: () => attempt(() => taxi.handOver(t.id)) },
        { text: 'Annuler le trajet', style: 'destructive', onPress: doCancel },
      ],
    );
  };

  // One trip at a time, organized or joined: no seats held "just in case" in two taxis.
  const current = taxi.activeTrip();
  const busy = () =>
    Alert.alert(
      'Tu as déjà un trajet',
      `Tu es inscrit sur ${current?.from.split(' · ').pop()} → ${current?.to.split(' · ').pop()}. Quitte-le ou attends le départ pour en proposer ou en rejoindre un autre.`,
    );

  /** After "On est partis": the organizer chooses where the collected money goes. */
  const claim = (t: TaxiTrip) => {
    const amount = t.claim?.amount ? formatFcfa(t.claim.amount) : 'l’argent des places';
    const send = async (method: PaymentMethod) => {
      const payout = await attempt(() => taxi.claim(t.id, method));
      if (payout) toast(`Versement demandé : ${formatFcfa(payout.amount)} sur ton ${methodLabel[method]} (${payout.phoneMasked}).`);
    };
    Alert.alert(`Récupérer ${amount}`, 'Les places payées, pour payer le chauffeur. Sur quel compte ?', [
      { text: 'Plus tard', style: 'cancel' },
      { text: methodLabel.wave, onPress: () => send('wave') },
      { text: methodLabel.orange_money, onPress: () => send('orange_money') },
    ]);
  };

  const depart = (t: TaxiTrip) => {
    const paidSeats = t.passengers.length - 1;
    // Reservation only: nothing to collect in the app, everyone pays their share in the taxi.
    if (!t.payOnline) {
      Alert.alert('Vous êtes partis ?', `Chacun règle sa part (${formatFcfa(t.seatPrice)}) dans le taxi.`, [
        { text: 'Pas encore', style: 'cancel' },
        { text: 'On est partis', onPress: () => attempt(() => taxi.depart(t.id)) },
      ]);
      return;
    }
    const missing = t.passengers.filter((p) => !t.checkedIn.includes(p) && p !== taxi.me).length;
    Alert.alert(
      'Vous êtes partis ?',
      `Tu pourras récupérer ${formatFcfa(paidSeats * t.seatPrice)} pour payer le taxi.` +
        (missing ? `\n${missing} absent${missing > 1 ? 's' : ''} : ${missing > 1 ? 'leurs places restent payées' : 'sa place reste payée'}.` : ''),
      [
        { text: 'Pas encore', style: 'cancel' },
        {
          text: 'On est partis',
          onPress: async () => {
            const ok = await attempt(async () => {
              await taxi.depart(t.id);
              return true;
            });
            // The server counts the paid seats (late leavers included) when the money is claimed.
            if (ok) claim({ ...t, claim: null });
          },
        },
      ],
    );
  };

  return { join, resumePayment, leave, cancel, busy, depart, claim, current, suspended };
}
