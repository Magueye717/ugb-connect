import { Alert } from 'react-native';

import { formatFcfa, TAXI_STRIKES_LIMIT } from '@/constants/data';
import { useTaxi, type TaxiTrip } from '@/context/TaxiContext';
import { ApiError } from '@/lib/api';
import { confirmAction, notice } from '@/lib/notice';
import { toast } from '@/lib/toast';

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

  const join = (t: TaxiTrip) => {
    const price = formatFcfa(t.seatPrice);
    // A reservation: the seat is taken now, the share paid in the taxi (no payment in the app).
    const reserve = async () => {
      if ((await attempt(() => taxi.join(t.id))) === 'joined') toast(`Place réservée. Ta part : ${price}, à régler dans le taxi.`);
    };
    notice({
      tone: 'info',
      title: 'Réserver ta place ?',
      bullets: [`Ta part : ${price}, à régler dans le taxi`, 'Tu peux annuler tant que vous n’êtes pas partis'],
      choices: [
        { label: 'Réserver ma place', onPress: reserve, tone: 'primary' },
        { label: 'Pas maintenant', tone: 'quiet' },
      ],
    });
  };

  // A reservation: nothing paid, nothing to refund; the seat goes back to the others.
  const leave = (t: TaxiTrip, _locked?: boolean) =>
    confirmAction({ title: 'Annuler ta réservation ?', bullets: ['Ta place est rendue aux autres étudiants'], confirm: 'Annuler la réservation', onConfirm: () => attempt(() => taxi.leave(t.id)), keep: 'Garder ma place' });

  const cancel = (t: TaxiTrip, locked: boolean) => {
    const others = t.passengers.length - 1;
    const doCancel = async () => {
      const res = await attempt(() => taxi.cancel(t.id));
      if (res?.strike) {
        notice({
          tone: 'warning',
          title: 'Trajet annulé',
          bullets: [`Annulation tardive : ${strikes + 1}/${TAXI_STRIKES_LIMIT}`, 'Les passagers sont prévenus', `À ${TAXI_STRIKES_LIMIT}, Sunu Taxi est suspendu 7 jours`],
        });
      }
    };
    if (others === 0) {
      confirmAction({ title: 'Annuler le trajet ?', bullets: ['Personne n’a encore réservé de place'], confirm: 'Annuler le trajet', onConfirm: doCancel, keep: 'Garder le trajet' });
      return;
    }
    // Students are counting on this trip: handing it over comes first, so nobody is left without a taxi.
    const next = taxi.nameOf(t.passengers[1]);
    confirmAction({
      title: 'Tu ne peux plus partir ?',
      message: `Passe le relais : ${next}, premier inscrit, organise le trajet à ta place. Pas de pénalité.`,
      bullets: [
        `Si tu annules : ${others > 1 ? `les ${others} étudiants inscrits sont prévenus` : 'l’étudiant inscrit est prévenu'}`,
        ...(locked ? [`Annulation tardive : ${strikes + 1}/${TAXI_STRIKES_LIMIT}`, `À ${TAXI_STRIKES_LIMIT}, Sunu Taxi est suspendu 7 jours`] : []),
      ],
      alternative: { label: `Passer le relais à ${next}`, onPress: () => attempt(() => taxi.handOver(t.id)) },
      confirm: 'Annuler le trajet',
      onConfirm: doCancel,
      keep: 'Garder le trajet',
    });
  };

  // One trip at a time, organized or joined: no seats held "just in case" in two taxis.
  const current = taxi.activeTrip();
  const busy = () =>
    notice({
      tone: 'info',
      title: 'Tu as déjà un trajet',
      message: `Tu es inscrit sur ${current?.from.split(' · ').pop()} → ${current?.to.split(' · ').pop()}.`,
      bullets: ['Un seul trajet à la fois', 'Quitte-le, ou attends le départ, pour en proposer ou en rejoindre un autre'],
    });

  // Everyone pays their share in the taxi: nothing to collect in the app.
  const depart = (t: TaxiTrip) =>
    notice({
      tone: 'info',
      title: 'Vous êtes partis ?',
      bullets: [`Chacun règle sa part (${formatFcfa(t.seatPrice)}) dans le taxi`],
      choices: [
        { label: 'On est partis', onPress: () => attempt(() => taxi.depart(t.id)), tone: 'primary' },
        { label: 'Pas encore', tone: 'quiet' },
      ],
    });

  return { join, leave, cancel, busy, depart, current, suspended };
}
