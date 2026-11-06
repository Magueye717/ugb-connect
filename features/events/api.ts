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
  myBooking: { id: string; total: number; holdExpiresAt: string; payment: { reference: string; checkoutUrl: string | null } | null } | null;
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
  reviewLog: { at: string; action: 'submitted' | 'approved' | 'changes_requested' | 'rejected'; message: string | null }[];
  /** Same order as `images`: sent back when editing. */
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
  /** `cash` (or a free event): the tickets are issued at once, `payment` is null. */
  book: (id: string, body: { items: { typeId: string; qty: number }[]; method: TicketMethod }) =>
    api<{ booking: EventBookingDto; payment: PaymentDto | null }>('POST', `/events/${id}/bookings`, { ...auth, body: { ...body, returnUrl: paymentReturnUrl() } }),
  booking: (id: string) => api<EventBookingDto>('GET', `/events/bookings/${id}`, auth),
  release: (id: string) => api<void>('DELETE', `/events/bookings/${id}`, auth),
  ofOrg: (orgId: string) => api<{ items: OrgEventDto[] }>('GET', `/org/${orgId}/events`, auth),
  // A student's own events (reviewed by the admins)
  publicationFee: () => api<{ perPlace: number; minimum: number }>('GET', '/me/events/publication-fee', auth),
  mine: () => api<{ items: OrgEventDto[] }>('GET', '/me/events', auth),
  mineOne: (id: string) => api<OrgEventDto>('GET', `/me/events/${id}`, auth),
  create: (body: EventInput) => api<OrgEventDto>('POST', '/me/events', { ...auth, body }),
  update: (id: string, body: EventInput) => api<OrgEventDto>('PUT', `/me/events/${id}`, { ...auth, body }),
  submit: (id: string) => api<OrgEventDto>('POST', `/me/events/${id}/submit`, auth),
  publishMine: (id: string, body: PublicationInput) =>
    api<{ event: OrgEventDto; payment: PaymentDto }>('POST', `/me/events/${id}/publish`, { ...auth, body: { ...body, returnUrl: paymentReturnUrl() } }),
  cancelMine: (id: string, reason: string) => api<{ refunded: number }>('POST', `/me/events/${id}/cancel`, { ...auth, body: { reason } }),
  // Admins
  reviewQueue: (status: 'pending_review' | 'changes_requested' | 'rejected' = 'pending_review') => api<{ items: OrgEventDto[] }>('GET', `/admin/events?status=${status}`, auth),
  approve: (id: string) => api<OrgEventDto>('POST', `/admin/events/${id}/approve`, auth),
  requestChanges: (id: string, message: string) => api<OrgEventDto>('POST', `/admin/events/${id}/request-changes`, { ...auth, body: { message } }),
  reject: (id: string, message: string) => api<OrgEventDto>('POST', `/admin/events/${id}/reject`, { ...auth, body: { message } }),
};
