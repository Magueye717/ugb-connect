import { Alert } from 'react-native';

import { formatFcfa, TAXI_STRIKES_LIMIT } from '@/constants/data';
import { useTaxi, type JoinOutcome, type TaxiTrip } from '@/context/TaxiContext';
import { methodsOffLine, useMethodsOff } from '@/features/payments/methods';
import { methodLabel, type PaymentMethod } from '@/features/taxi/api';
import { ApiError } from '@/lib/api';
import { confirmAction, notice } from '@/lib/notice';
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
  // A method the admins switched off isn't offered.
  const { off, isOff } = useMethodsOff();

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
      notice({
        tone: 'info',
        title: 'Réserver ta place ?',
        bullets: [`Ta part : ${price}, à régler dans le taxi`, 'Tu peux annuler tant que vous n’êtes pas partis'],
        choices: [
          { label: 'Réserver ma place', onPress: reserve, tone: 'primary' },
          { label: 'Pas maintenant', tone: 'quiet' },
        ],
      });
      return;
    }
    const pay = async (method: PaymentMethod) => tellOutcome(t, await attempt(() => taxi.join(t.id, method)));
    notice({
      tone: 'info',
      title: `Payer ta place · ${price}`,
      bullets: [`Places verrouillées à ${hhmm(t.lockAt)}`, 'Après, quitter le trajet n’est plus remboursé', ...(off.length ? [methodsOffLine(off)!] : [])],
      choices: [
        ...(['wave', 'orange_money'] as const).filter((m) => !isOff(m)).map((m) => ({ label: `Payer avec ${methodLabel[m]}`, onPress: () => pay(m), tone: 'primary' as const })),
        { label: 'Pas maintenant', tone: 'quiet' },
      ],
    });
  };

  const resumePayment = async (t: TaxiTrip) => tellOutcome(t, await attempt(() => taxi.resumePayment(t.id)));

  const leave = (t: TaxiTrip, locked: boolean) => {
    if (!t.payOnline) {
      confirmAction({ title: 'Annuler ta réservation ?', bullets: ['Ta place est rendue aux autres étudiants'], confirm: 'Annuler la réservation', onConfirm: () => attempt(() => taxi.leave(t.id)), keep: 'Garder ma place' });
      return;
    }
    const paying = t.myStatus === 'pending_payment';
    confirmAction({
      title: paying ? 'Libérer la place ?' : 'Quitter le trajet ?',
      bullets: paying
        ? ['Tu n’as pas encore payé', 'La place est rendue aux autres étudiants']
        : locked
          ? ['Les places sont verrouillées', `Ta place (${formatFcfa(t.seatPrice)}) n’est pas remboursée : elle sert à payer le taxi`]
          : [`Tu es remboursé de ${formatFcfa(t.seatPrice)}`, 'Sur ton numéro Wave / Orange Money'],
      confirm: paying ? 'Libérer la place' : 'Quitter le trajet',
      onConfirm: () => attempt(() => taxi.leave(t.id)),
      keep: 'Rester',
    });
  };

  const cancel = (t: TaxiTrip, locked: boolean) => {
    const others = t.passengers.length - 1;
    const doCancel = async () => {
      const res = await attempt(() => taxi.cancel(t.id));
      if (res?.strike) {
        notice({
          tone: 'warning',
          title: 'Trajet annulé',
          bullets: [`Annulation tardive : ${strikes + 1}/${TAXI_STRIKES_LIMIT}`, t.payOnline ? 'Les passagers sont remboursés à 100 %' : 'Les passagers sont prévenus', `À ${TAXI_STRIKES_LIMIT}, Sunu Taxi est suspendu 7 jours`],
        });
      }
    };
    if (others === 0) {
      confirmAction({ title: 'Annuler le trajet ?', bullets: [t.payOnline ? 'Personne n’a encore payé de place' : 'Personne n’a encore réservé de place'], confirm: 'Annuler le trajet', onConfirm: doCancel, keep: 'Garder le trajet' });
      return;
    }
    // Students are counting on this trip: handing it over comes first, so nobody is left without a taxi.
    const next = taxi.nameOf(t.passengers[1]);
    confirmAction({
      title: 'Tu ne peux plus partir ?',
      message: `Passe le relais : ${next}, premier inscrit, organise le trajet à ta place. Pas de pénalité.`,
      bullets: [
        t.payOnline
          ? `Si tu annules : ${others > 1 ? `les ${others} étudiants inscrits sont remboursés` : 'l’étudiant inscrit est remboursé'} à 100 %`
          : `Si tu annules : ${others > 1 ? `les ${others} étudiants inscrits sont prévenus` : 'l’étudiant inscrit est prévenu'}`,
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

  /** After "On est partis": the organizer chooses where the collected money goes. */
  const claim = (t: TaxiTrip) => {
    const amount = t.claim?.amount ? formatFcfa(t.claim.amount) : 'l’argent des places';
    const send = async (method: PaymentMethod) => {
      const payout = await attempt(() => taxi.claim(t.id, method));
      if (payout) toast(`Versement demandé : ${formatFcfa(payout.amount)} sur ton ${methodLabel[method]} (${payout.phoneMasked}).`);
    };
    notice({
      tone: 'success',
      title: `Récupérer ${amount}`,
      message: 'Les places payées, pour payer le chauffeur. Sur quel compte ?',
      choices: [
        { label: `Sur mon ${methodLabel.wave}`, onPress: () => send('wave'), tone: 'primary' },
        { label: `Sur mon ${methodLabel.orange_money}`, onPress: () => send('orange_money'), tone: 'primary' },
        { label: 'Plus tard', tone: 'quiet' },
      ],
    });
  };

  const depart = (t: TaxiTrip) => {
    const paidSeats = t.passengers.length - 1;
    // Reservation only: nothing to collect in the app, everyone pays their share in the taxi.
    if (!t.payOnline) {
      notice({
        tone: 'info',
        title: 'Vous êtes partis ?',
        bullets: [`Chacun règle sa part (${formatFcfa(t.seatPrice)}) dans le taxi`],
        choices: [
          { label: 'On est partis', onPress: () => attempt(() => taxi.depart(t.id)), tone: 'primary' },
          { label: 'Pas encore', tone: 'quiet' },
        ],
      });
      return;
    }
    const missing = t.passengers.filter((p) => !t.checkedIn.includes(p) && p !== taxi.me).length;
    notice({
      tone: 'info',
      title: 'Vous êtes partis ?',
      bullets: [
        `Tu pourras récupérer ${formatFcfa(paidSeats * t.seatPrice)} pour payer le taxi`,
        ...(missing ? [`${missing} absent${missing > 1 ? 's' : ''} : ${missing > 1 ? 'leurs places restent payées' : 'sa place reste payée'}`] : []),
      ],
      choices: [
        {
          label: 'On est partis',
          tone: 'primary',
          onPress: async () => {
            const ok = await attempt(async () => {
              await taxi.depart(t.id);
              return true;
            });
            // The server counts the paid seats (late leavers included) when the money is claimed.
            if (ok) claim({ ...t, claim: null });
          },
        },
        { label: 'Pas encore', tone: 'quiet' },
      ],
    });
  };

  return { join, resumePayment, leave, cancel, busy, depart, claim, current, suspended };
}
