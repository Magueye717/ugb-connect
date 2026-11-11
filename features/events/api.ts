// Events (parties, conferences, outings) and their tickets. Tickets are generic (see features/caravans/api.ts).
import { paymentReturnUrl, type PaymentDto, type PaymentMethod, type TicketMethod } from '@/features/payments/checkout';
import { api } from '@/lib/api';

const auth = { auth: true } as const;

export type TicketTypeDto = { typeId: string; name: string; description: string | null; price: number; remaining: number; soldOut: boolean };

export type EventStatus = 'draft' | 'pending_review' | 'changes_requested' | 'rejected' | 'approved' | 'published' | 'cancelled' | 'completed';

export type EventDto = {
  id: string;
  code: string;
  status: EventStatus;
  organizer: { id: string; slug: string; name: string; category: string; level: string; rating: number | null; trips: number };
  title: string;
  category: string;
  categoryLabel: string;
  description: string;
  /** The first is the cover; the page slides through them. */
  images: string[];
  venue: { name: string; address: string | null };
  startsAt: string;
  endsAt: string;
  salesCloseAt: string;
  salesOpen: boolean;
  minPrice: number;
  maxPerStudent: number;
  /** How the organizer accepts payment (cash: at the door). Missing: Wave and Orange Money. */
  paymentMethods?: TicketMethod[];
  ticketTypes: TicketTypeDto[];
  cancellation: { at: string; reason: string } | null;
  /** Student's event: what the admins asked to correct, or why it was refused. */
  review: { message: string; at: string } | null;
  myTickets: string[];
  myTicketsLeft: number;
  /** I'm on its organizing team (owner, manager, door staff): I run it, I can't book it (422 OWN_EVENT). */
  organizedByMe: boolean;
  /**
   * My request: the places held until `holdExpiresAt` while I pay the organizer in cash; they validate it and my
   * tickets appear (`awaitingValidation`).
   */
  myBooking: { id: string; total: number; holdExpiresAt: string; payment: { reference: string; checkoutUrl: string | null } | null; count?: number; orderedBy?: string | null; awaitingValidation?: boolean; code?: string | null; organizer?: { name: string; phone: string } | null; /** Each ticket still waiting, its own code: paid one by one, or all with `code`. */ units?: RequestUnit[] } | null;
};

/** One ticket of a request still waiting for its payment, with its own code (UGBREQ:…). */
export type RequestUnit = { id: string; name: string; price: number; code: string | null };

/** A request waiting for its organizer: who, what, how much, until when. */
export type TicketRequestDto = {
  id: string;
  status: string;
  total: number;
  expiresAt: string;
  createdAt: string;
  tickets: { name: string; qty: number }[];
  student: { name: string; phone: string } | null;
  /** The tickets still waiting: validated some (paid one by one) or all. */
  units?: RequestUnit[];
  /** Tickets of this request validated already. */
  validated?: number;
  /** Found by one ticket's own code: that ticket. */
  matched?: string | null;
};

export type EventBookingDto = {
  id: string;
  eventId: string;
  status: 'held' | 'confirmed' | 'cancelled' | 'expired';
  total: number;
  holdExpiresAt: string;
  tickets: { typeId: string; name: string; price: number; status: string; ticketId: string | null }[];
  payment: { reference: string; status: string; checkoutUrl: string | null } | null;
};

/** `details` of an event ticket. */
export type EventTicketDetails = {
  eventId: string;
  category: string;
  categoryLabel: string;
  venue: { name: string; address: string | null };
  startsAt: string;
  endsAt: string;
  typeName: string;
  image: string | null;
};

/** Who sees the event on the home screen: each non-empty list narrows; all empty, the whole university. */
export type EventAudience = { campuses: string[]; ufrs: string[]; regions: string[]; villages: string[] };
export const EVERYONE: EventAudience = { campuses: [], ufrs: [], regions: [], villages: [] };

/** An organization's (or a student's own) event, as its organizer sees it. */
export type OrgEventDto = Omit<EventDto, 'myTickets' | 'myTicketsLeft' | 'myBooking' | 'ticketTypes'> & {
  ticketTypes: (Omit<TicketTypeDto, 'remaining'> & { capacity: number; sold: number; remaining: number })[];
  counts: { booked: number; buyers: number; admitted: number };
  reviewLog: { at: string; action: 'submitted' | 'approved' | 'changes_requested' | 'rejected'; message: string | null }[];  /** Same order as `images`: sent back when editing. */
  imageIds: string[];
  /** The organizer chose the cover (the first picture); otherwise the banner shows one at random. */
  fixedCover: boolean;
  audience: EventAudience;
  /** Students' events: the publication costs perPlace × places, at least minimum. */
  publicationFee: { perPlace: number; minimum: number };
  publication: { places: number; fee: number; paid: boolean; payment: { reference: string; checkoutUrl: string | null } | null } | null;
};

/** What the owner of an approved event sets before paying its publication. */
export type PublicationInput = {
  audience: EventAudience;
  places: { typeId: string; capacity: number }[];
  description: string;
  imageIds: string[];
  fixedCover: boolean;
  address: string | null;
  maxPerStudent: number;
  method: PaymentMethod;
};

export type EventCategory = 'soiree' | 'conference' | 'sortie' | 'sport' | 'culture' | 'autre';
export const CATEGORIES: { value: EventCategory; label: string; icon: string }[] = [
  { value: 'soiree', label: 'Soirée', icon: 'musical-notes-outline' },
  { value: 'conference', label: 'Conférence', icon: 'mic-outline' },
  { value: 'sortie', label: 'Sortie', icon: 'bus-outline' },
  { value: 'sport', label: 'Sport', icon: 'football-outline' },
  { value: 'culture', label: 'Culture', icon: 'color-palette-outline' },
  { value: 'autre', label: 'Autre', icon: 'sparkles-outline' },
];

export type EventInput = {
  title: string;
  category: EventCategory;
  description: string;
  imageIds: string[];
  fixedCover: boolean;
  venue: { name: string; address: string | null };
  startsAt: string;
  endsAt: string;
  ticketTypes: { name: string; description: string | null; price: number; capacity: number }[];
  maxPerStudent: number;
  paymentMethods: TicketMethod[];
};

export const EVENT_STATUS: Record<EventStatus, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  draft: { label: 'Brouillon', tone: 'neutral' },
  pending_review: { label: 'En cours de validation', tone: 'warning' },
  changes_requested: { label: 'Corrections demandées', tone: 'danger' },
  rejected: { label: 'Refusé', tone: 'danger' },
  approved: { label: 'Validé · à publier', tone: 'success' },
  published: { label: 'Publié', tone: 'success' },
  cancelled: { label: 'Annulé', tone: 'neutral' },
  completed: { label: 'Terminé', tone: 'neutral' },
};

export const eventsApi = {
  /** Published events for this student (their UFR, campus, village, region), soonest first. */
  list: () => api<{ items: EventDto[] }>('GET', '/events', auth),
  get: (id: string) => api<EventDto>('GET', `/events/${id}`, auth),
  /**
   * A request: the places held 24 h while the student pays the organizer in cash; validated, the tickets are issued
   * (`status` confirmed at once for a free event). `forFriends` / `friendPhone`: its organizing team orders (the cash in
   * hand): issued at once (422 FRIEND_NOT_FOUND when the friend isn't on UGB Connect: nothing is ordered).
   */
  book: (id: string, body: { items: { typeId: string; qty: number }[]; forFriends?: boolean; friendPhone?: string }) =>
    api<{ booking: EventBookingDto; payment: PaymentDto | null }>('POST', `/events/${id}/bookings`, { ...auth, body }),
  booking: (id: string) => api<EventBookingDto>('GET', `/events/bookings/${id}`, auth),
  release: (id: string) => api<void>('DELETE', `/events/bookings/${id}`, auth),
  /** My own event's requests: validated once the cash is received, or refused. */
  /** At the organizer's: a request by its code (QR UGBREQ:… scanned, or typed); null when none here. */
  requestByCode: (orgId: string, code: string) => api<{ request: (TicketRequestDto & { title: string }) | null }>('GET', `/org/${orgId}/events/requests/by-code/${encodeURIComponent(code)}`, auth),
  /** `unitIds`: only those tickets (paid one by one); every ticket waiting otherwise. */
  validateRequest: (orgId: string, bookingId: string, unitIds?: string[]) => api<TicketRequestDto>('POST', `/org/${orgId}/events/requests/${bookingId}/validate`, { ...auth, body: unitIds?.length ? { unitIds } : undefined }),
  refuseRequest: (orgId: string, bookingId: string, reason: string | null) => api<void>('POST', `/org/${orgId}/events/requests/${bookingId}/refuse`, { ...auth, body: { reason } }),
  orgRequests: (orgId: string, eventId: string) => api<{ items: TicketRequestDto[] }>('GET', `/org/${orgId}/events/${eventId}/requests`, auth),
  myRequests: (eventId: string) => api<{ items: TicketRequestDto[] }>('GET', `/me/events/${eventId}/requests`, auth),
  validateMine: (bookingId: string, unitIds?: string[]) => api<TicketRequestDto>('POST', `/me/events/requests/${bookingId}/validate`, { ...auth, body: unitIds?.length ? { unitIds } : undefined }),
  refuseMine: (bookingId: string, reason: string | null) => api<void>('POST', `/me/events/requests/${bookingId}/refuse`, { ...auth, body: { reason } }),
  ofOrg: (orgId: string) => api<{ items: OrgEventDto[] }>('GET', `/org/${orgId}/events`, auth),
  // A student's own events (reviewed by the admins)
  publicationFee: () => api<{ perPlace: number; minimum: number }>('GET', '/me/events/publication-fee', auth),
  mine: () => api<{ items: OrgEventDto[] }>('GET', '/me/events', auth),
  mineOne: (id: string) => api<OrgEventDto>('GET', `/me/events/${id}`, auth),
  create: (body: EventInput) => api<OrgEventDto>('POST', '/me/events', { ...auth, body }),
  update: (id: string, body: EventInput) => api<OrgEventDto>('PUT', `/me/events/${id}`, { ...auth, body }),
  /** A published event: its pictures reordered, the cover chosen, some taken off (none added). */
  updatePhotos: (id: string, body: { imageIds: string[]; fixedCover: boolean }) => api<OrgEventDto>('PUT', `/me/events/${id}/photos`, { ...auth, body }),
  submit: (id: string) => api<OrgEventDto>('POST', `/me/events/${id}/submit`, auth),
  publishMine: (id: string, body: PublicationInput) =>
    api<{ event: OrgEventDto; payment: PaymentDto }>('POST', `/me/events/${id}/publish`, { ...auth, body: { ...body, returnUrl: paymentReturnUrl() } }),
  cancelMine: (id: string, reason: string) => api<{ refunded: number }>('POST', `/me/events/${id}/cancel`, { ...auth, body: { reason } }),
  // Admins
  /** `live`: validated or on sale and not over yet, the soonest first (the admins' « En cours »). */
  reviewQueue: (status: 'pending_review' | 'changes_requested' | 'rejected' | 'live' = 'pending_review') => api<{ items: OrgEventDto[] }>('GET', `/admin/events?status=${status}`, auth),
  approve: (id: string) => api<OrgEventDto>('POST', `/admin/events/${id}/approve`, auth),
  requestChanges: (id: string, message: string) => api<OrgEventDto>('POST', `/admin/events/${id}/request-changes`, { ...auth, body: { message } }),
  reject: (id: string, message: string) => api<OrgEventDto>('POST', `/admin/events/${id}/reject`, { ...auth, body: { message } }),
};
