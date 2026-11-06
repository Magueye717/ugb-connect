import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import type { Caravan } from '@/constants/data';
import { useAuth } from '@/context/AuthContext';
import { caravansApi, isCaravanTicket, toCaravan, type CaravanTicketDto, type IncomingTransferDto, type SeatRequest, type TicketDto } from '@/features/caravans/api';
import { realtime } from '@/features/chat/realtime';
import { payInBrowser, type PaymentDto, type PaymentMethod, type TicketMethod } from '@/features/payments/checkout';

/** How a purchase ended, from the server's point of view. */
export type BookingOutcome = { status: 'confirmed'; ticketId: string } | { status: 'refunded' | 'failed' | 'pending' };

type CaravansValue = {
  /** Bookable departures, soonest first. */
  caravans: Caravan[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** "Mes billets": held, cancelled, and the ones I gave away. */
  tickets: TicketDto[];
  /** Tickets friends want to give me, waiting for my answer. */
  incoming: IncomingTransferDto[];
  /** The valid ticket I travel on for a departure (not the companions' ones I hold). */
  ticketFor: (caravanId: string) => CaravanTicketDto | undefined;
  /** Holds the seats (mine and/or companions'), opens Wave / Orange Money once, and waits for the server's answer. */
  book: (caravanId: string, input: { seats: SeatRequest[]; pickupStopId: string; dropoffStopId: string; method: TicketMethod }) => Promise<BookingOutcome>;
  /** Back to the payment page for a seat taken but not paid yet. */
  resume: (caravan: Caravan) => Promise<BookingOutcome>;
  release: (bookingId: string) => Promise<void>;
  cancel: (ticketId: string) => Promise<{ refundAmount: number; fee: number }>;
  transfer: (ticketId: string, phone: string) => Promise<void>;
  withdraw: (transferId: string) => Promise<void>;
  accept: (transferId: string) => Promise<string | null>;
  decline: (transferId: string) => Promise<void>;
};

const CaravansContext = createContext<CaravansValue | null>(null);

const REFRESH_MS = 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Caravans and tickets from the backend. Departures refresh every minute while the app is open; tickets and
 * transfers also refresh live (my real-time channel), e.g. when a friend sends me a ticket.
 */
export function CaravansProvider({ children }: { children: ReactNode }) {
  const { user, status } = useAuth();
  const enabled = status === 'signedIn' && !!user?.isStudent;
  const [caravans, setCaravans] = useState<Caravan[]>([]);
  const [tickets, setTickets] = useState<TicketDto[]>([]);
  const [incoming, setIncoming] = useState<IncomingTransferDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const soon = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadTickets = useCallback(async () => {
    if (!enabled) return;
    try {
      const [mine, offers] = await Promise.all([caravansApi.tickets(), caravansApi.transfers('incoming')]);
      setTickets(mine.items);
      setIncoming(offers.items);
    } catch {
      // Offline: keep what's shown.
    }
  }, [enabled]);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const [list] = await Promise.all([caravansApi.departures(), loadTickets()]);
      setCaravans(list.items.map(toCaravan));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connexion impossible.');
    } finally {
      setLoading(false);
    }
  }, [enabled, loadTickets]);

  useEffect(() => {
    if (!enabled) {
      setCaravans([]);
      setTickets([]);
      setIncoming([]);
      return;
    }
    refresh();
    const timer = setInterval(() => AppState.currentState === 'active' && refresh(), REFRESH_MS);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    // A ticket changed (transferred, cancelled by the organizer…) or a friend offers one.
    const offMine = realtime.onMine((event) => {
      if (event !== 'ticket.updated' && event !== 'ticket.transfer') return;
      if (soon.current) clearTimeout(soon.current);
      soon.current = setTimeout(refresh, 300);
    });
    return () => {
      clearInterval(timer);
      sub.remove();
      offMine();
      if (soon.current) clearTimeout(soon.current);
    };
  }, [enabled, refresh]);

  const value = useMemo<CaravansValue>(() => {
    /** After the payment page: the booking tells whether a ticket was issued. */
    const settle = async (bookingId: string, payment: Pick<PaymentDto, 'reference' | 'checkoutUrl'>): Promise<BookingOutcome> => {
      const paid = await payInBrowser(payment);
      let booking = await caravansApi.booking(bookingId);
      // The ticket is issued in the same step as the payment: one more look if the page closed just before.
      for (let i = 0; i < 3 && paid.status === 'succeeded' && booking.status !== 'confirmed'; i++) {
        await sleep(800);
        booking = await caravansApi.booking(bookingId);
      }
      await refresh();
      if (booking.status === 'confirmed' && booking.ticketId) return { status: 'confirmed', ticketId: booking.ticketId };
      if (paid.status === 'succeeded') return { status: 'refunded' };
      return { status: paid.status === 'pending' || paid.status === 'created' ? 'pending' : 'failed' };
    };

    return {
      caravans,
      loading,
      error,
      refresh,
      tickets,
      incoming,
      ticketFor: (caravanId) => tickets.find((t): t is CaravanTicketDto => isCaravanTicket(t) && t.details.departureId === caravanId && t.status === 'active' && !t.passenger),
      book: async (caravanId, input) => {
        const { booking, payment } = await caravansApi.book(caravanId, input);
        if (payment) return settle(booking.id, payment);
        // Cash: the ticket is issued at once, to pay at boarding.
        await refresh();
        return booking.ticketId ? { status: 'confirmed', ticketId: booking.ticketId } : { status: 'failed' };
      },
      resume: async (caravan) => {
        const held = caravan.myBooking;
        if (!held?.payment) return { status: 'failed' };
        return settle(held.id, held.payment);
      },
      release: async (bookingId) => {
        await caravansApi.release(bookingId);
        await refresh();
      },
      cancel: async (ticketId) => {
        const res = await caravansApi.cancelTicket(ticketId);
        await refresh();
        return res;
      },
      transfer: async (ticketId, phone) => {
        await caravansApi.transfer(ticketId, phone);
        await loadTickets();
      },
      withdraw: async (transferId) => {
        await caravansApi.withdrawTransfer(transferId);
        await loadTickets();
      },
      accept: async (transferId) => {
        const res = await caravansApi.acceptTransfer(transferId);
        await refresh();
        return res.ticketId;
      },
      decline: async (transferId) => {
        await caravansApi.declineTransfer(transferId);
        await loadTickets();
      },
    };
  }, [caravans, loading, error, refresh, tickets, incoming, loadTickets]);

  return <CaravansContext.Provider value={value}>{children}</CaravansContext.Provider>;
}

export function useCaravans() {
  const ctx = useContext(CaravansContext);
  if (!ctx) throw new Error('useCaravans must be used inside CaravansProvider');
  return ctx;
}
