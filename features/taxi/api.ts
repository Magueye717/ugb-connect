// Sunu Taxi on the backend (GET/POST /taxi/...). Errors are ApiError: `message` is French and shown as is.
import { api } from '@/lib/api';

export { methodLabel, payInBrowser, type PaymentDto, type PaymentMethod } from '@/features/payments/checkout';
import { paymentReturnUrl, type PaymentDto, type PaymentMethod } from '@/features/payments/checkout';

type Person = { key: string; name: string; initials: string };

/** A trip as the API returns it. Dates are ISO strings. */
export type TripDto = {
  id: string;
  from: string;
  to: string;
  departureAt: string;
  lockAt: string;
  chatClosesAt: string;
  seats: number;
  seatsTaken: number;
  fare: number;
  seatPrice: number;
  /** Seats paid in the app; false: joining reserves the seat, each one pays their share in the taxi. Missing: paid. */
  payOnline?: boolean;
  status: 'open' | 'departed' | 'cancelled';
  organizer: Person & { trips: number; lateCancels: number };
  passengers: (Person & { role: 'organizer' | 'passenger'; checkedIn: boolean })[];
  vehicle: string | null;
  /** The trip chat, for the people in the trip only. */
  conversationId: string | null;
  me: {
    key: string;
    role: 'organizer' | 'passenger';
    status: 'pending_payment' | 'joined' | 'left' | 'expired';
    checkedIn: boolean;
    forfeited: boolean;
    payment: { reference: string; checkoutUrl: string | null; expiresAt: string } | null;
  } | null;
  claim: { amount: number; payout: { id: string; status: string; amount: number } | null } | null;
};

/** `onlinePayment`: trips proposed now are paid in the app (false: reservation only). */
export type TaxiStanding = { key: string; strikes: number; limit: number; suspendedUntil: string | null; activeTripId: string | null; onlinePayment?: boolean };


export type PayoutDto = { id: string; amount: number; method: PaymentMethod; status: string; phoneMasked: string };

/** `lockMinutes`: non-refundable this long before departure; left out, 10 min (never earlier than half-way). */
export type NewTrip = { from: string; to: string; seats: number; fare: number; leaveInMinutes: number; lockMinutes?: number };

const auth = { auth: true } as const;

export const taxiApi = {
  board: () => api<{ serverTime: string; items: TripDto[] }>('GET', '/taxi/trips', auth),
  me: () => api<TaxiStanding>('GET', '/taxi/me', auth),
  create: (body: NewTrip) => api<TripDto>('POST', '/taxi/trips', { ...auth, body }),
  /** Without `method`: a reservation (trips not paid in the app), `payment` is null. */
  join: (id: string, method?: PaymentMethod) =>
    api<{ trip: TripDto; payment: PaymentDto | null }>('POST', `/taxi/trips/${id}/join`, { ...auth, body: method ? { method, returnUrl: paymentReturnUrl() } : {} }),
  leave: (id: string) => api<{ refundAmount: number; forfeited: boolean }>('POST', `/taxi/trips/${id}/leave`, auth),
  cancel: (id: string) => api<{ refunded: number; strike: boolean; strikes: number; limit: number; suspendedUntil: string | null }>('POST', `/taxi/trips/${id}/cancel`, auth),
  handOver: (id: string) => api<TripDto>('POST', `/taxi/trips/${id}/handover`, auth),
  checkIn: (id: string) => api<TripDto>('POST', `/taxi/trips/${id}/check-in`, auth),
  setVehicle: (id: string, label: string) => api<TripDto>('PUT', `/taxi/trips/${id}/vehicle`, { ...auth, body: { label } }),
  depart: (id: string) => api<TripDto>('POST', `/taxi/trips/${id}/depart`, auth),
  claim: (id: string, method: PaymentMethod) => api<PayoutDto>('POST', `/taxi/trips/${id}/claim`, { ...auth, body: { method } }),
};
