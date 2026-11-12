// Caravans and tickets on the backend. Tickets are generic (caravan seats now, other events later): a ticket
// has a `kind`, an `event` card, and kind-specific `details`. Errors are ApiError: `message` is French.
import type { Caravan, CaravanOrganizer, CaravanStop } from '@/constants/data';
import { paymentReturnUrl, type PaymentDto, type PaymentMethod, type TicketMethod } from '@/features/payments/checkout';
import type { EventTicketDetails } from '@/features/events/api';
import { api } from '@/lib/api';

const auth = { auth: true } as const;

type StopDto = { stopId: string; place: string; at: string };
type OrgCardDto = { id: string; slug: string; name: string; category: string; level: string; rating: number | null; trips: number };

export type DepartureDto = {
  id: string;
  code: string;
  status: string;
  organizer: OrgCardDto;
  direction: 'aller' | 'retour';
  from: string;
  to: string;
  departureAt: string;
  pickups: StopDto[];
  dropoffs: StopDto[];
  price: number;
  /** Seats one student can buy here: their own + companions (2 by default). */
  maxSeatsPerStudent: number;
  /** How the organizer accepts payment for this trip (cash: at boarding). */
  paymentMethods: TicketMethod[];
  totalSeats: number;
  seatsFree: number;
  seatsBooked: number;
  minPassengers: number;
  confirmBy: string;
  confirmed: boolean;
  bookingOpen: boolean;
  vehicle: { label: string; plate: string | null; airConditioned: boolean };
  myTicketId?: string | null;
  purchasedHere?: boolean;
  /** Seats I can still buy here (purchases count even once given away). */
  mySeatsLeft?: number;
  myBooking?: HeldBooking | null;
};

/** Someone travelling on a seat the student bought for them ("accompagnant"): no account needed. */
export type PassengerDto = { name: string; phone: string };

/** Seats taken and not paid yet (held 10 min), paid together. */
export type HeldBooking = {
  id: string;
  seat: number;
  holdExpiresAt: string;
  /** Each seat waiting, its own code (UGBREQ:…): paid one by one, or all together with `code`. */
  seats: { id?: string; seat: number; price?: number; code?: string | null; passenger: PassengerDto | null }[];
  payment: { reference: string; checkoutUrl: string | null } | null;
  /** A request: to pay the organizer in cash, who validates it before `holdExpiresAt`. */
  awaitingValidation?: boolean;
  total?: number;
  /** The request's code, shown as a QR code (UGBREQ:…) for the organizer to scan when paid. */
  code?: string | null;
  /** Who to pay and call. */
  organizer?: { name: string; phone: string } | null;
};

/** A request waiting for the organizer: who, which seats and stops, how much, until when. */
export type SeatRequestDto = {
  id: string;
  status: string;
  total: number;
  expiresAt: string;
  createdAt: string;
  student: { name: string; phone: string } | null;
  /** The seats still waiting, each with its own code. */
  seats: { id?: string; seat: number; price?: number; code?: string | null; passenger: string | null; pickup: string; dropoff: string }[];
  /** Found by one seat's own code: that seat. */
  matched?: string | null;
  /** The whole request's code (« Tout payer »). */
  code?: string | null;
};

export type OrgDepartureDto = DepartureDto & {
  vehicle: { label: string; plate: string | null; airConditioned: boolean };
  /** To edit a draft. */
  vehicleId: string;
  /** Stops someone boards or gets off at: they can't be removed. */
  bookedStopIds: string[];
  bookingClosesAt: string;
  stopsLeft: { stopId: string; at: string }[];
  /** Seats sold, students who bought them, passengers on board. */
  counts: { booked: number; buyers: number; admitted: number };
  cancellation: { at: string; reason: string } | null;
  /** After departure: what the owner can collect, and the payout once asked for. */
  claim: { amount: number; payout: { id: string; status: string; amount: number } | null } | null;
};

export type VehicleDto = { id: string; label: string; plate: string | null; airConditioned: boolean; capacity: number; seatsPerRow: number; blockedSeats: number[] };
export type VehicleInput = { label: string; capacity: number; airConditioned: boolean; /** 4: 2 + aisle + 2; 5: with the folding middle seat (« versailler »). */ seatsPerRow: 4 | 5 };
/** What the departure form allows (sent by the server with the vehicles). */
export type DepartureLimits = { maxSeatsPerStudent: number; defaultSeatsPerStudent: number };

/** A departure as the organizer writes it: a draft until published. Stops in route order, times ISO. */
export type DepartureInput = {
  vehicleId: string;
  direction: 'aller' | 'retour';
  from: string;
  to: string;
  pickups: { place: string; at: string }[];
  dropoffs: { place: string; at: string }[];
  price: number;
  maxSeatsPerStudent: number;
  paymentMethods: TicketMethod[];
  minPassengers: number;
};

export type SeatMap = {
  capacity: number;
  seatsPerRow: number;
  /** Seats of the first row, on the right (door and driver on the left); then full rows. Numbered from the front. */
  firstRowSeats?: number;
  blocked: number[];
  taken: number[];
  suggested: number | null;
};

export type BookingDto = {
  id: string;
  departureId: string;
  status: 'held' | 'confirmed' | 'cancelled' | 'expired';
  seat: number;
  holdExpiresAt: string;
  ticketId: string | null;
  /** Every seat paid with this booking's payment. */
  seats: { seat: number; passenger: PassengerDto | null; status: string; ticketId: string | null }[];
  payment: { reference: string; status: string; amount: number; checkoutUrl: string | null } | null;
};

/** One seat asked for: mine (no passenger), or a companion's. Seat omitted: picked by the server. */
/** A seat: mine, or a companion's (who may board and get off at other stops than mine). */
export type SeatRequest = { seat?: number; passenger?: PassengerDto; pickupStopId?: string; dropoffStopId?: string };

export type CancellationQuote = { allowed: true; fee: number; refund: number; freeUntil: string | null } | { allowed: false; reason: string };

export type TransferDto = {
  id: string;
  ticketId: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';
  expiresAt: string;
  from: { name: string };
  to: { name: string; phoneMasked: string };
};

/** `details` of a caravan ticket. */
export type CaravanTicketDetails = {
  departureId: string;
  direction: 'aller' | 'retour';
  from: string;
  to: string;
  pickup: StopDto;
  dropoff: StopDto;
  vehicle: { label: string; plate: string | null; airConditioned?: boolean };
  confirmed: boolean;
  minPassengers: number;
  seatsBooked: number;
  confirmBy: string;
};

type TicketBase = {
  id: string;
  code: string;
  status: 'active' | 'cancelled' | 'transferred';
  seat: number | null;
  price: number;
  paidWith: TicketMethod;
  /** Paid in cash: still to hand over at boarding / the door (0: nothing due). */
  cashDue?: number;
  event: { id: string; kind: string; title: string; startsAt: string; status: string; organizer: OrgCardDto };
  /** Companion ticket: who travels on it (I booked it for them). */
  passenger: PassengerDto | null;
  purchaser: { name: string; isMe: boolean };
  qr: string | null;
  admittedAt: string | null;
  cancellation: { at: string; fee: number; refundAmount: number; reason: string } | null;
  cancellationQuote: CancellationQuote | null;
  transferDeadline: string | null;
  transfer: TransferDto | null;
};

/** A seat on a caravan departure. */
export type CaravanTicketDto = TicketBase & { kind: 'caravan_seat'; details: CaravanTicketDetails };
/** Entry to an event (party, conference, outing). */
export type EventTicketDto = TicketBase & { kind: 'event_entry'; details: EventTicketDetails };
/** Tickets are generic: the `kind` says which `details` they carry. */
export type TicketDto = CaravanTicketDto | EventTicketDto;
export const isCaravanTicket = (t: TicketDto): t is CaravanTicketDto => t.kind === 'caravan_seat';
export const isEventTicket = (t: TicketDto): t is EventTicketDto => t.kind === 'event_entry';

/** `forCompanion`: the sender booked this seat for me as their companion. */
export type IncomingTransferDto = TransferDto & { seat: number | null; event: TicketDto['event'] | null; details: CaravanTicketDetails | EventTicketDetails; forCompanion: boolean };

export type ManifestDto = {
  departure: OrgDepartureDto;
  passengers: {
    ticketId: string;
    code: string;
    seat: number | null;
    name: string;
    phone: string;
    pickupStopId: string;
    dropoffStopId: string;
    admitted: boolean;
    admittedAt: string | null;
    transferred: boolean;
    /** Companion ticket: the student who booked it (check an ID, not a student card). */
    companionOf: string | null;
    /** Seats bought by the same student are shown together. */
    purchaser: { id: string; name: string };
    groupSize: number;
  }[];
};

export type ManifestPassenger = ManifestDto['passengers'][number];

/** The purchaser's other valid tickets on the departure, to board a pair together. */
export type ScanGroup = { size: number; purchaser: string; others: { ticketId: string; seat: number | null; name: string; admitted: boolean }[] };

export type ScanResultDto = {
  result: 'admitted' | 'duplicate' | 'rejected';
  tone: 'success' | 'warning' | 'danger';
  title: string;
  text: string;
  reason: string | null;
  eventId: string | null;
  ticket: { id: string; code: string; seat: number | null } | null;
  /** Who travels: the companion's name on a companion ticket. */
  holder: { name: string } | null;
  companionOf: string | null;
  group: ScanGroup | null;
};

export const caravansApi = {
  departures: (direction?: 'aller' | 'retour') => api<{ items: DepartureDto[] }>('GET', `/caravans/departures${direction ? `?direction=${direction}` : ''}`, auth),
  departure: (id: string) => api<DepartureDto>('GET', `/caravans/departures/${id}`, auth),
  seats: (id: string) => api<SeatMap>('GET', `/caravans/departures/${id}/seats`, auth),
  /** `cash`: booked at once, `payment` is null. */
  book: (id: string, body: { seats: SeatRequest[]; pickupStopId: string; dropoffStopId: string; method?: TicketMethod }) =>
    api<{ booking: BookingDto; payment: PaymentDto | null }>('POST', `/caravans/departures/${id}/bookings`, { ...auth, body: { ...body, returnUrl: paymentReturnUrl() } }),
  booking: (id: string) => api<BookingDto>('GET', `/caravans/bookings/${id}`, auth),
  release: (id: string) => api<void>('DELETE', `/caravans/bookings/${id}`, auth),

  tickets: () => api<{ items: TicketDto[] }>('GET', '/tickets', auth),
  ticket: (id: string) => api<TicketDto>('GET', `/tickets/${id}`, auth),
  cancelTicket: (id: string) => api<{ refundAmount: number; fee: number }>('POST', `/tickets/${id}/cancel`, auth),
  transfer: (id: string, recipientPhone: string) => api<TransferDto>('POST', `/tickets/${id}/transfers`, { ...auth, body: { recipientPhone } }),
  transfers: (direction: 'incoming' | 'outgoing') => api<{ items: IncomingTransferDto[] }>('GET', `/ticket-transfers?direction=${direction}`, auth),
  acceptTransfer: (id: string) => api<{ status: string; ticketId: string | null }>('POST', `/ticket-transfers/${id}/accept`, auth),
  declineTransfer: (id: string) => api<{ status: string }>('POST', `/ticket-transfers/${id}/decline`, auth),
  withdrawTransfer: (id: string) => api<void>('POST', `/ticket-transfers/${id}/cancel`, auth),

  // Organizer
  orgDepartures: (orgId: string, scope: 'upcoming' | 'past' = 'upcoming') => api<{ items: OrgDepartureDto[] }>('GET', `/org/${orgId}/departures?scope=${scope}`, auth),
  orgDeparture: (orgId: string, id: string) => api<OrgDepartureDto>('GET', `/org/${orgId}/departures/${id}`, auth),
  vehicles: (orgId: string) => api<{ items: VehicleDto[]; limits: DepartureLimits }>('GET', `/org/${orgId}/vehicles`, auth),
  /** Owner only. */
  addVehicle: (orgId: string, body: VehicleInput) => api<VehicleDto>('POST', `/org/${orgId}/vehicles`, { ...auth, body }),
  /** Owner only. Drafts take the change; published departures keep their vehicle. */
  updateVehicle: (orgId: string, id: string, body: VehicleInput) => api<VehicleDto>('PUT', `/org/${orgId}/vehicles/${id}`, { ...auth, body }),
  /** Owner only. Refused while a planned departure uses it. */
  deleteVehicle: (orgId: string, id: string) => api<void>('DELETE', `/org/${orgId}/vehicles/${id}`, auth),
  createDeparture: (orgId: string, body: DepartureInput) => api<OrgDepartureDto>('POST', `/org/${orgId}/departures`, { ...auth, body }),
  /** Drafts only. */
  updateDeparture: (orgId: string, id: string, body: DepartureInput) => api<OrgDepartureDto>('PUT', `/org/${orgId}/departures/${id}`, { ...auth, body }),
  /** Published, before the bus leaves: new stops, removing the unbooked ones, or a vehicle with as many seats or more. */
  extendDeparture: (orgId: string, id: string, body: { pickups?: { place: string; at: string }[]; dropoffs?: { place: string; at: string }[]; vehicleId?: string; /** stopIds nobody booked. */ remove?: string[] }) =>
    api<OrgDepartureDto>('PATCH', `/org/${orgId}/departures/${id}`, { ...auth, body }),
  publishDeparture: (orgId: string, id: string) => api<OrgDepartureDto>('POST', `/org/${orgId}/departures/${id}/publish`, auth),
  /** Every ticket is refunded 100 %. */
  /** The requests waiting on a departure; validated once the cash is received, or refused. */
  requests: (orgId: string, id: string) => api<{ items: SeatRequestDto[] }>('GET', `/org/${orgId}/departures/${id}/requests`, auth),
  requestByCode: (orgId: string, code: string) => api<{ request: (SeatRequestDto & { title: string }) | null }>('GET', `/org/${orgId}/departures/requests/by-code/${encodeURIComponent(code)}`, auth),
  /** `bookingIds`: only those seats (paid one by one); every seat waiting otherwise. */
  validateRequest: (orgId: string, orderId: string, bookingIds?: string[]) =>
    api<SeatRequestDto>('POST', `/org/${orgId}/departures/requests/${orderId}/validate`, { ...auth, body: bookingIds?.length ? { bookingIds } : undefined }),
  refuseRequest: (orgId: string, orderId: string, reason: string | null) => api<void>('POST', `/org/${orgId}/departures/requests/${orderId}/refuse`, { ...auth, body: { reason } }),
  cancelDeparture: (orgId: string, id: string, reason: string) => api<{ refunded: number }>('POST', `/org/${orgId}/departures/${id}/cancel`, { ...auth, body: { reason } }),
  manifest: (orgId: string, id: string) => api<ManifestDto>('GET', `/org/${orgId}/departures/${id}/manifest`, auth),
  scan: (orgId: string, body: { qr?: string; code?: string; ticketId?: string; eventId?: string; locationId?: string; clientScanId: string }) =>
    api<ScanResultDto>('POST', `/org/${orgId}/admissions`, { ...auth, body }),
  unboard: (orgId: string, ticketId: string, reason?: string) => api<void>('POST', `/org/${orgId}/tickets/${ticketId}/admission/void`, { ...auth, body: reason ? { reason } : {} }),
  claim: (orgId: string, id: string, method: PaymentMethod) =>
    api<{ id: string; amount: number; status: string; phoneMasked: string }>('POST', `/org/${orgId}/departures/${id}/claim`, { ...auth, body: { method } }),
  leaveStop: (orgId: string, id: string, stopId: string) =>
    api<{ absent: { ticketId: string; seat: number | null }[] }>('POST', `/org/${orgId}/departures/${id}/stops/${stopId}/leave`, auth),
};

// ---- From the API to what the screens show ----------------------------------------------------------------------

// Manual names: Hermes' Intl support for fr-FR varies by platform.
const DAYS = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];
const MONTHS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
const pad = (n: number) => String(n).padStart(2, '0');

/** "Mer. 03 sept" */
export const dayLabel = (at: number) => {
  const d = new Date(at);
  return `${DAYS[d.getDay()]} ${pad(d.getDate())} ${MONTHS[d.getMonth()]}`;
};
/** "14h50" */
export const hourLabel = (at: number) => {
  const d = new Date(at);
  return `${pad(d.getHours())}h${pad(d.getMinutes())}`;
};

export const toStop = (s: StopDto): CaravanStop => {
  const at = Date.parse(s.at);
  return { stopId: s.stopId, place: s.place, at, time: hourLabel(at) };
};

const KINDS: Record<string, CaravanOrganizer['kind']> = { Entreprise: 'Entreprise', Amicale: 'Amicale', Transporteur: 'Transporteur' };

export const toOrganizer = (o: OrgCardDto): CaravanOrganizer => ({
  id: o.id,
  name: o.name,
  kind: KINDS[o.category] ?? 'Entreprise',
  level: o.level as CaravanOrganizer['level'],
  rating: o.rating,
  trips: o.trips,
});

export function toCaravan(d: DepartureDto): Caravan {
  const departureAt = Date.parse(d.departureAt);
  return {
    id: d.id,
    code: d.code,
    status: d.status,
    organizer: toOrganizer(d.organizer),
    vehicle: d.vehicle,
    direction: d.direction,
    from: d.from,
    to: d.to,
    date: dayLabel(departureAt),
    time: hourLabel(departureAt),
    pickups: d.pickups.map(toStop),
    dropoffs: d.dropoffs.map(toStop),
    departureAt,
    seats: d.seatsFree,
    totalSeats: d.totalSeats,
    booked: d.seatsBooked,
    minPassengers: d.minPassengers,
    confirmBy: Date.parse(d.confirmBy),
    confirmed: d.confirmed,
    bookingOpen: d.bookingOpen,
    price: d.price,
    maxSeatsPerStudent: d.maxSeatsPerStudent,
    paymentMethods: d.paymentMethods ?? ['wave', 'orange_money'],
    myTicketId: d.myTicketId ?? null,
    purchasedHere: !!d.purchasedHere,
    mySeatsLeft: d.mySeatsLeft ?? d.maxSeatsPerStudent,
    myBooking: d.myBooking ?? null,
  };
}

/** Tickets of the same departure together (my seat and my companions'), my own first, then by seat. */
export function byDeparture(tickets: CaravanTicketDto[]): CaravanTicketDto[][] {
  const groups = new Map<string, CaravanTicketDto[]>();
  for (const t of tickets) groups.set(t.details.departureId, [...(groups.get(t.details.departureId) ?? []), t]);
  return [...groups.values()].map((g) => g.sort((a, b) => Number(!!a.passenger) - Number(!!b.passenger) || (a.seat ?? 0) - (b.seat ?? 0)));
}

/** A unique id per scan, so a scan retried after a network error is recorded once. */
export const newScanId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

// ---- Référencement: caravan organizers (caravan editors, admins) ------------------------------------------------

export type OrganizerCategory = 'Entreprise' | 'Transporteur' | 'Amicale';
export type OrganizerLevel = 'nouveau' | 'verifie' | 'confirme';
export type CaravanOrganizerDto = {
  id: string;
  name: string;
  category: OrganizerCategory;
  /** Shown to students: the badge given or earned by the trips (5: Vérifié, 20: Certifié), the higher. */
  level: OrganizerLevel;
  /** What Référencement set: « nouveau » lets the trips decide. */
  levelGiven?: OrganizerLevel;
  status: 'pending' | 'active' | 'suspended';
  rating: number | null;
  trips: number;
  payoutPhone: string | null;
  owner: { firstName: string; lastName: string; phone: string } | null;
};
export type CaravanOrganizerInput = {
  name: string;
  category: OrganizerCategory;
  level: OrganizerLevel;
  payoutPhone?: string;
  owner: { phone: string; firstName?: string; lastName?: string; password?: string };
};

export const caravanOrganizersApi = {
  list: () => api<{ items: CaravanOrganizerDto[] }>('GET', '/admin/caravan-organizers', auth),
  /** Before adding: the account of this number, and the caravan organizer it already runs (one per account). */
  ownerLookup: (phone: string) =>
    api<{ account: { firstName: string; lastName: string } | null; organizer: { name: string } | null }>('POST', '/admin/caravan-organizers/owner-lookup', { ...auth, body: { phone } }),
  create: (body: CaravanOrganizerInput) => api<CaravanOrganizerDto>('POST', '/admin/caravan-organizers', { ...auth, body }),
  update: (id: string, body: Partial<{ name: string; category: OrganizerCategory; level: OrganizerLevel; status: 'active' | 'suspended'; payoutPhone: string | null }>) =>
    api<CaravanOrganizerDto>('PATCH', `/admin/caravan-organizers/${id}`, { ...auth, body }),
};
