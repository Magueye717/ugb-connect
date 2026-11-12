import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/context/AuthContext';
import { useChats } from '@/features/chat/ChatContext';
import { payInBrowser, taxiApi, type NewTrip, type PaymentDto, type PaymentMethod, type PayoutDto, type TripDto } from '@/features/taxi/api';
import { haptics } from '@/lib/haptics';
import { cancelTaxiReminder, scheduleTaxiReminder } from '@/lib/notifications';

/** A trip as the screens use it: times in local milliseconds, people by their Sunu Taxi key. */
export type TaxiTrip = {
  id: string;
  from: string;
  to: string;
  departureAt: number;
  /** Seats lock here: leaving is no longer refunded. 30 min before, or half-way for trips proposed late. */
  lockAt: number;
  chatClosesAt: number;
  /** Seats in the taxi, organizer included. */
  seats: number;
  /** Paid seats, unpaid holds and seats kept after a late leave: what "full" is measured on. */
  seatsTaken: number;
  fare: number;
  /** What each passenger pays, set by the server. */
  seatPrice: number;
  /** Paid in the app; false: a reservation, each one pays their share in the taxi. */
  payOnline: boolean;
  status: TripDto['status'];
  departed: boolean;
  organizer: TripDto['organizer'];
  /** Keys of everyone with a paid seat, organizer first. */
  passengers: string[];
  checkedIn: string[];
  /** Name and initials for each key. */
  people: Record<string, { name: string; initials: string }>;
  /** Pinned by the organizer: "Peugeot 406 jaune · DK-1234-A". Only sent to the trip's people. */
  taxi?: string;
  /** My place in this trip, if any. */
  myStatus: NonNullable<TripDto['me']>['status'] | null;
  /** I took a seat and haven't paid yet (held 10 min). */
  paying: { reference: string; checkoutUrl: string | null } | null;
  /** Organizer, after departure: what can be collected and whether it was. */
  claim: TripDto['claim'];
  /** The trip chat, for its people only (features/chat). */
  conversationId: string | null;
};

export type JoinOutcome = 'joined' | 'refunded' | 'failed' | 'pending';

type TaxiValue = {
  /** My Sunu Taxi key ('' until loaded). */
  me: string;
  trips: TaxiTrip[];
  /** First load still running. */
  loading: boolean;
  /** Last load failed (offline…): the screens keep the previous list. */
  error: string | null;
  /** Late cancellations over the last 30 days. */
  strikes: number;
  suspendedUntil: number | null;
  /** New chat messages in this trip (badges). */
  unreadFor: (tripId: string) => number;
  nameOf: (key: string) => string;
  initialsOf: (key: string) => string;
  refresh: () => Promise<void>;
  /** The trip I organize, ride in or am paying for, not departed yet: one at a time. */
  activeTrip: () => TaxiTrip | undefined;
  create: (trip: NewTrip) => Promise<void>;
  /** Takes the seat, opens the payment page and waits for the server's answer. */
  /** Without `method` (a trip not paid in the app): the seat is reserved at once. */
  join: (id: string, method?: PaymentMethod) => Promise<JoinOutcome>;
  /** Trips proposed now are paid in the app (the server's setting). */
  onlinePayment: boolean;
  /** Back to the payment page for a seat taken but not paid yet. */
  resumePayment: (id: string) => Promise<JoinOutcome>;
  leave: (id: string) => Promise<{ refundAmount: number; forfeited: boolean }>;
  cancel: (id: string) => Promise<{ refunded: number; strike: boolean }>;
  /** Organizer leaves; the first passenger who joined organizes instead. No strike. */
  handOver: (id: string) => Promise<void>;
  checkIn: (id: string) => Promise<void>;
  depart: (id: string) => Promise<void>;
  claim: (id: string, method: PaymentMethod) => Promise<PayoutDto>;
  pinTaxi: (tripId: string, taxi: string) => Promise<void>;
};

const TaxiContext = createContext<TaxiValue | null>(null);

const REFRESH_MS = 20_000;

/** Server times shifted by the phone's clock error, so countdowns computed with Date.now() are right. */
function toTrip(t: TripDto, offset: number): TaxiTrip {
  const at = (iso: string) => Date.parse(iso) - offset;
  return {
    id: t.id,
    from: t.from,
    to: t.to,
    departureAt: at(t.departureAt),
    lockAt: at(t.lockAt),
    chatClosesAt: at(t.chatClosesAt),
    seats: t.seats,
    seatsTaken: t.seatsTaken,
    fare: t.fare,
    seatPrice: t.seatPrice,
    payOnline: t.payOnline ?? true,
    status: t.status,
    departed: t.status === 'departed',
    organizer: t.organizer,
    passengers: t.passengers.map((p) => p.key),
    checkedIn: t.passengers.filter((p) => p.checkedIn).map((p) => p.key),
    people: Object.fromEntries([t.organizer, ...t.passengers].map((p) => [p.key, { name: p.name, initials: p.initials }])),
    taxi: t.vehicle ?? undefined,
    myStatus: t.me?.status ?? null,
    paying: t.me?.status === 'pending_payment' && t.me.payment ? { reference: t.me.payment.reference, checkoutUrl: t.me.payment.checkoutUrl } : null,
    claim: t.claim,
    conversationId: t.conversationId,
  };
}

const outcomeOf = (p: PaymentDto): JoinOutcome =>
  p.status === 'succeeded' ? (p.fulfillment === 'unfulfillable' ? 'refunded' : 'joined') : p.status === 'pending' || p.status === 'created' ? 'pending' : 'failed';

// Sunu Taxi from the backend. Refreshed every 20 s while the app is open, and after every action. The trip chat
// lives in features/chat, like every other conversation.
export function TaxiProvider({ children }: { children: ReactNode }) {
  const { user, status } = useAuth();
  // Organizer-only accounts have no student profile: Sunu Taxi is for students.
  const enabled = status === 'signedIn' && !!user?.isStudent;
  const [me, setMe] = useState('');
  const [trips, setTrips] = useState<TaxiTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [strikes, setStrikes] = useState(0);
  const [onlinePayment, setOnlinePayment] = useState(true);
  const [suspendedUntil, setSuspendedUntil] = useState<number | null>(null);
  const chats = useChats();
  // Latest list for actions that run after a refresh (reminders, hand-over names).
  const tripsRef = useRef(trips);
  useEffect(() => {
    tripsRef.current = trips;
  }, [trips]);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const [board, standing] = await Promise.all([taxiApi.board(), taxiApi.me()]);
      const offset = Date.parse(board.serverTime) - Date.now();
      setTrips(board.items.map((t) => toTrip(t, offset)));
      setMe(standing.key);
      setStrikes(standing.strikes);
      setOnlinePayment(standing.onlinePayment ?? true);
      setSuspendedUntil(standing.suspendedUntil ? Date.parse(standing.suspendedUntil) - offset : null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connexion impossible.');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setTrips([]);
      setMe('');
      return;
    }
    refresh();
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') refresh();
    }, REFRESH_MS);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [enabled, refresh]);

  const value = useMemo<TaxiValue>(() => {
    const nameOf = (key: string) => {
      if (key === me) return user?.firstName ?? 'Toi';
      for (const t of trips) if (t.people[key]) return t.people[key].name;
      return 'Étudiant';
    };
    const initialsOf = (key: string) => {
      for (const t of trips) if (t.people[key]) return t.people[key].initials;
      return key === me ? (user?.initials ?? '?') : '?';
    };
    const find = (id: string) => tripsRef.current.find((t) => t.id === id);
    const remind = (t: TaxiTrip | undefined) => t && scheduleTaxiReminder({ id: t.id, from: t.from, departureAt: t.departureAt, lockAt: t.lockAt });
    // Trips stay "active" up to 15 min after their time, like the list.
    const activeTrip = () =>
      // Over at its time: the trip leaves then (the server marks it departed), and I'm free for another.
      trips.find((t) => !t.departed && (t.myStatus === 'joined' || t.myStatus === 'pending_payment') && t.departureAt > Date.now());

    const pay = async (id: string, payment: Pick<PaymentDto, 'reference' | 'checkoutUrl'>): Promise<JoinOutcome> => {
      const final = await payInBrowser(payment);
      await refresh();
      const outcome = outcomeOf(final);
      if (outcome === 'joined') {
        haptics.success();
        remind(find(id));
        // Just let into the trip chat: its badge appears.
        chats.refresh();
      }
      return outcome;
    };

    return {
      me,
      trips,
      loading,
      error,
      strikes,
      suspendedUntil,
      unreadFor: (tripId) => chats.unreadFor(trips.find((t) => t.id === tripId)?.conversationId),
      nameOf,
      initialsOf,
      refresh,
      activeTrip,
      create: async (trip) => {
        const created = await taxiApi.create(trip);
        await refresh();
        remind(find(created.id));
      },
      join: async (id, method) => {
        const { payment } = await taxiApi.join(id, method);
        await refresh();
        if (payment) return pay(id, payment);
        // A reservation: in the trip (and its chat) at once.
        haptics.success();
        remind(find(id));
        chats.refresh();
        return 'joined';
      },
      onlinePayment,
      resumePayment: async (id) => {
        const paying = find(id)?.paying;
        if (!paying) return 'failed';
        return pay(id, paying);
      },
      leave: async (id) => {
        const res = await taxiApi.leave(id);
        cancelTaxiReminder(id);
        await refresh();
        return res;
      },
      cancel: async (id) => {
        const res = await taxiApi.cancel(id);
        cancelTaxiReminder(id);
        await refresh();
        return res;
      },
      handOver: async (id) => {
        await taxiApi.handOver(id);
        cancelTaxiReminder(id);
        await refresh();
      },
      checkIn: async (id) => {
        // Once is enough, whichever button or quick reply was used.
        if (find(id)?.checkedIn.includes(me)) return;
        await taxiApi.checkIn(id);
        haptics.success();
        cancelTaxiReminder(id);
        await refresh();
      },
      depart: async (id) => {
        await taxiApi.depart(id);
        await refresh();
      },
      claim: async (id, method) => {
        const payout = await taxiApi.claim(id, method);
        await refresh();
        return payout;
      },
      // The server posts the system lines ("X est là ✓", "Taxi indiqué : …") in the trip chat.
      pinTaxi: async (tripId, taxi) => {
        await taxiApi.setVehicle(tripId, taxi);
        await refresh();
      },
    };
  }, [me, user, trips, loading, error, strikes, suspendedUntil, onlinePayment, refresh, chats]);

  return <TaxiContext.Provider value={value}>{children}</TaxiContext.Provider>;
}

export function useTaxi() {
  const ctx = useContext(TaxiContext);
  if (!ctx) throw new Error('useTaxi must be used inside TaxiProvider');
  return ctx;
}
