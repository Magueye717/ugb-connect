// Private restaurants and shops: browsing and ordering (students), their own space (owner, managers, staff), admin.
import { paymentReturnUrl, type PaymentDto, type PaymentMethod } from '@/features/payments/checkout';
import { api } from '@/lib/api';

const auth = { auth: true } as const;

export type BusinessKind = 'restaurant' | 'shop';
/** A business's own space: its organization and its kind (one entity may run a restaurant and a shop). */
/** How an order is paid: in cash to the business, or online. */
export type OrderMethod = 'cash' | PaymentMethod;
export type BusinessRef = { orgId: string; kind: BusinessKind };
/** « Mes ventes » for a period: completed orders only; in-progress, refused and cancelled ones counted apart. */
export type SalesDto = {
  from: string;
  to: string;
  /** FCFA, delivery included. */
  revenue: number;
  orders: number;
  average: number;
  methods: { method: OrderMethod; label: string; amount: number; orders: number }[];
  /** Wave / Orange Money sales not yet received on the owner's number. */
  owed: number;
  days: { date: string; revenue: number; orders: number }[];
  top: { itemId: string; name: string; qty: number; revenue: number }[];
  inProgress: number;
  refused: number;
  cancelled: number;
};
/** Whose profile and catalog: the business's own space, or Référencement (an editor, by the business's id). */
/** An entity a number owns (Référencement): what it runs, and whether it is a student's own (their shop). */
export type OwnedEntity = { orgId: string; name: string; personal: boolean; /** It organizes caravans or events. */ organizer: boolean; kinds: BusinessKind[]; businesses: { id: string; kind: BusinessKind; name: string }[] };

export type BusinessTarget = BusinessRef | { editorOf: string };
const own = (b: BusinessRef) => `/org/${b.orgId}/${b.kind}`;
const profileOf = (t: BusinessTarget) => ('editorOf' in t ? `/admin/businesses/${t.editorOf}` : `${own(t)}/business`);
const catalogOf = (t: BusinessTarget) => ('editorOf' in t ? `/admin/businesses/${t.editorOf}/catalog` : `${own(t)}/catalog`);

export type DeliveryZone = 'campus1' | 'campus2' | 'outside';
/** FCFA per zone, 0: free; null: no delivery there. All null: pickup only. */
export type DeliveryFees = Record<DeliveryZone, number | null>;
/** The pickers' lists, from the backend (GET /reference/commerce). */
export type CommerceReference = { specialties: Record<BusinessKind, string[]>; /** How many a business may pick. */ maxSpecialties: number; /** Photos per article, the cover included. */ maxItemPhotos: number; /** The same for Référencement (its own routes). */ editorMaxItemPhotos?: number; paymentMethods: { value: OrderMethod; label: string }[]; zones: { value: DeliveryZone; label: string }[] };
export type ItemSection = 'menu' | 'drink' | 'article';

export type ItemDto = {
  id: string;
  section: ItemSection;
  /** Shops: groups the articles ("Fournitures"). */
  category: string | null;
  name: string;
  detail: string;
  price: number;
  /** The cover: the first of `photos`. */
  photo: string | null;
  /** Every picture, the cover first. */
  photos: string[];
  /** The same pictures' ids, sent back in `photoIds` when editing. */
  photoIds: string[];
  /** Shops: units left; null: not counted. */
  stock: number | null;
  soldOut: boolean;
  available: boolean;
  /** False: shown for information only (a service done on the spot: printing…), never added to an order. */
  orderable: boolean;
  /** Students who like it (the heart). */
  likes: number;
  /** I like it. */
  liked: boolean;
  /** When it was added (ISO): the newest come first. */
  createdAt?: string;
  /** Done on the spot (not orderable): the caller said « Intéressé ». */
  interested?: boolean;
};

export type BusinessDto = {
  /** The owner's and Référencement's views only: where each provider pays out. */
  payoutNumbers?: { wave: string | null; orange_money: string | null };
  id: string;
  orgId: string;
  kind: BusinessKind;
  name: string;
  /** One or several; `specialty` is them joined ("Sénégalais · Grillades"). */
  specialties: string[];
  specialty: string;
  description: string;
  photo: string | null;
  location: { lat: number; lng: number } | null;
  address: string;
  campus: 'campus1' | 'campus2' | null;
  campusLabel: string | null;
  phone: string;
  services: { start: string; end: string }[];
  /** "12h-15h · 19h-22h". */
  hours: string;
  /** Takes orders now (within its hours, not paused). */
  open: boolean;
  statusLabel: string;
  deliveryFees: DeliveryFees;
  /** The lowest delivery price ("dès 200 F"); null: pickup only. */
  deliveryFee: number | null;
  acceptingOrders: boolean;
  /** Students' average rating of its orders (1 decimal); null: not rated yet. */
  rating: number | null;
  ratingCount: number;
  /** How students may pay it: cash (at delivery or at the counter), Wave, Orange Money. */
  paymentMethods: { value: OrderMethod; label: string }[];
  active: boolean;
  /** A student's own shop. */
  byStudent: boolean;
  /** May take Wave and Orange Money. A student's shop: false until the team has verified it (cash only). */
  onlinePayments: boolean;
  /** Its items have a heart (shops; restaurants: none). */
  itemLikes: boolean;
};
export type ListedBusiness = BusinessDto & { highlights: ItemDto[]; minPrice: number | null; itemsCount: number; /** Every available item: for searching. */ itemNames: string[] };
/** The market: every article of every shop, each with its shop. */
/** Someone interested in an article done on the spot: who to call back. */
export type InterestDto = { id: string; at: string; item: { id: string; name: string }; student: { name: string; phone: string } };

export type MarketItem = ItemDto & { businessId: string };
export type BusinessDetail = BusinessDto & {
  items: ItemDto[];
  /** The caller here: its team (`member`) can't order; owner and managers (`canEdit`) edit the catalog from the page. */
  viewer: { member: boolean; canEdit: boolean };
};

export type OrderStatus = 'pending_payment' | 'placed' | 'accepted' | 'ready' | 'completed' | 'refused' | 'cancelled' | 'expired';
export type OrderMode = 'delivery' | 'pickup';
export type OrderDto = {
  id: string;
  /** Said at the counter: "C7KQ2M". */
  code: string;
  status: OrderStatus;
  business: { id: string; kind: BusinessKind; name: string; phone: string; photo: string | null; address: string };
  /** `photo`: the item's current picture, if any. */
  lines: { itemId: string; name: string; price: number; qty: number; photo: string | null }[];
  subtotal: number;
  deliveryFee: number;
  zone: DeliveryZone | null;
  /** "Campus 2": where it's delivered. */
  zoneLabel: string | null;
  total: number;
  mode: OrderMode;
  address: string | null;
  note: string | null;
  refusal: string | null;
  refunded: boolean;
  /** `cash`: paid by hand at delivery or at the counter (no online payment). */
  method: OrderMethod;
  methodLabel: string;
  history: { status: OrderStatus; at: string }[];
  createdAt: string;
  payment: { reference: string; checkoutUrl: string | null } | null;
  /** Business side: who ordered. */
  customer: { name: string; phone: string } | null;
};

export type BusinessPatch = Partial<{
  name: string;
  specialties: string[];
  description: string;
  photoId: string | null;
  location: { lat: number; lng: number } | null;
  address: string;
  campus: 'campus1' | 'campus2' | null;
  phone: string;
  services: { start: string; end: string }[];
  deliveryFees: DeliveryFees;
  acceptingOrders: boolean;
  paymentMethods: OrderMethod[];
  /** 9 digits per provider accepted (Wave, Orange Money); null: back to the organization's number. */
  payoutNumbers: Partial<Record<'wave' | 'orange_money', string | null>>;
}>;
export type ItemInput = { section: ItemSection; category?: string | null; name: string; detail?: string; price: number; photoIds?: string[]; stock?: number | null; available?: boolean; orderable?: boolean };

/** The steps a student sees, by mode. */
export function orderSteps(mode: OrderMode) {
  return [
    { key: 'placed' as const, title: 'Commande envoyée', detail: 'Le commerce a reçu ta commande.' },
    { key: 'accepted' as const, title: 'En préparation', detail: 'Ta commande est en cours.' },
    mode === 'delivery'
      ? { key: 'ready' as const, title: 'En route', detail: 'Le livreur arrive vers toi.' }
      : { key: 'ready' as const, title: 'Prête à récupérer', detail: 'Passe la chercher avec ton code.' },
    { key: 'completed' as const, title: mode === 'delivery' ? 'Livrée' : 'Récupérée', detail: 'Bon appétit !' },
  ];
}

/** The business's next step for an order: the one big button on its card. */
export function nextStep(o: Pick<OrderDto, 'status' | 'mode'>) {
  if (o.status === 'placed') return { step: 'accept' as const, label: 'Accepter', icon: 'checkmark' as const };
  if (o.status === 'accepted') return { step: 'ready' as const, label: o.mode === 'delivery' ? 'Partie en livraison' : 'Prête', icon: o.mode === 'delivery' ? ('bicycle' as const) : ('bag-check' as const) };
  if (o.status === 'ready') return { step: 'complete' as const, label: o.mode === 'delivery' ? 'Livrée' : 'Remise au client', icon: 'checkmark-done' as const };
  return null;
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  pending_payment: { label: 'Paiement en attente', tone: 'warning' },
  placed: { label: 'Nouvelle', tone: 'warning' },
  accepted: { label: 'En préparation', tone: 'success' },
  ready: { label: 'Prête', tone: 'success' },
  completed: { label: 'Terminée', tone: 'neutral' },
  refused: { label: 'Refusée', tone: 'danger' },
  cancelled: { label: 'Annulée', tone: 'neutral' },
  expired: { label: 'Non payée', tone: 'neutral' },
};

/**
 * A server one deploy behind sends older shapes (one `photo`, no viewer, no online-payments flag): the screens get
 * today's, filled in the safe way, rather than breaking on a missing field.
 */
type Wire<T> = Partial<T> & Record<string, unknown>;
const item = <T extends ItemDto>(i: Wire<T>): T =>
  ({ ...i, photos: i.photos ?? (i.photo ? [i.photo] : []), photoIds: i.photoIds ?? (typeof i.photoId === 'string' ? [i.photoId] : []), likes: i.likes ?? 0, liked: i.liked ?? false }) as T;
const business = <T extends BusinessDto>(b: Wire<T>): T => ({ ...b, onlinePayments: b.onlinePayments ?? !b.byStudent, itemLikes: b.itemLikes ?? b.kind === 'shop' }) as T;
const listed = (b: Wire<ListedBusiness>) => ({ ...business(b), highlights: (b.highlights ?? []).map(item) }) as ListedBusiness;
const detail = (b: Wire<BusinessDetail>) => ({ ...business(b), items: (b.items ?? []).map(item), viewer: b.viewer ?? { member: false, canEdit: false } }) as BusinessDetail;

export const commerceApi = {
  // Students
  list: (kind: BusinessKind) => api<{ items: ListedBusiness[] }>('GET', `/businesses?kind=${kind}`, auth).then((r) => ({ items: r.items.map(listed) })),
  get: (id: string) => api<BusinessDetail>('GET', `/businesses/${id}`, auth).then(detail),
  market: (kind: BusinessKind) =>
    api<{ businesses: BusinessDto[]; items: MarketItem[] }>('GET', `/market?kind=${kind}`, auth).then((r) => ({ businesses: r.businesses.map(business), items: r.items.map(item) })),
  reference: () => api<CommerceReference>('GET', '/reference/commerce'),
  /** The heart on an article or a dish: on, or off. Gives back the count now. */
  like: (itemId: string, on: boolean) => api<{ liked: boolean; likes: number }>(on ? 'PUT' : 'DELETE', `/items/${itemId}/like`, auth),
  /** « Intéressé » on an article done on the spot: the shop is told who (with the phone), to call back. */
  interest: (itemId: string, on: boolean) => api<{ interested: boolean }>(on ? 'PUT' : 'DELETE', `/items/${itemId}/interest`, auth),
  /** The shop's side: who said « Intéressé » lately (30 days). */
  interests: (t: { orgId: string; kind: BusinessKind }) =>
    api<{ items: InterestDto[] }>('GET', `/org/${t.orgId}/${t.kind}/interests`, auth),
  order: (id: string, body: { lines: { itemId: string; qty: number }[]; mode: OrderMode; zone?: DeliveryZone | null; address?: string | null; note?: string | null; method: OrderMethod }) =>
    api<{ order: OrderDto; payment: PaymentDto | null }>('POST', `/businesses/${id}/orders`, { ...auth, body: { ...body, returnUrl: paymentReturnUrl() } }),
  myOrders: () => api<{ items: OrderDto[] }>('GET', '/me/orders', auth),
  myOrder: (id: string) => api<OrderDto>('GET', `/me/orders/${id}`, auth),
  cancel: (id: string) => api<OrderDto>('POST', `/me/orders/${id}/cancel`, auth),
  // The business's own space (its team: features/team)
  // Profile and catalog: also Référencement's (an editor of the kind), with the same screens.
  mine: (t: BusinessTarget) => api<BusinessDto>('GET', profileOf(t), auth).then(business),
  updateMine: (t: BusinessTarget, body: BusinessPatch) => api<BusinessDto>('PATCH', profileOf(t), { ...auth, body }).then(business),
  catalog: (t: BusinessTarget) => api<{ items: ItemDto[] }>('GET', catalogOf(t), auth).then((r) => ({ items: r.items.map(item) })),
  addItem: (t: BusinessTarget, body: ItemInput) => api<ItemDto>('POST', catalogOf(t), { ...auth, body }).then(item),
  updateItem: (t: BusinessTarget, itemId: string, body: Partial<ItemInput>) => api<ItemDto>('PATCH', `${catalogOf(t)}/${itemId}`, { ...auth, body }).then(item),
  removeItem: (t: BusinessTarget, itemId: string) => api<void>('DELETE', `${catalogOf(t)}/${itemId}`, auth),
  /** « Mes ventes » (owners and managers): days `YYYY-MM-DD`, both included. */
  sales: (b: BusinessRef, from: string, to: string) => api<SalesDto>('GET', `${own(b)}/sales?from=${from}&to=${to}`, auth),
  queue: (b: BusinessRef, scope: 'active' | 'done' = 'active') => api<{ items: OrderDto[] }>('GET', `${own(b)}/orders?scope=${scope}`, auth),
  businessOrder: (b: BusinessRef, id: string) => api<OrderDto>('GET', `${own(b)}/orders/${id}`, auth),
  step: (b: BusinessRef, id: string, step: 'accept' | 'ready' | 'complete') => api<OrderDto>('POST', `${own(b)}/orders/${id}/${step}`, auth),
  /** At the counter: the code the student gives, typed or scanned from their QR. */
  handover: (b: BusinessRef, code: string) => api<OrderDto>('POST', `${own(b)}/orders/handover`, { ...auth, body: { code } }),
  refuse: (b: BusinessRef, id: string, reason: string) => api<OrderDto>('POST', `${own(b)}/orders/${id}/refuse`, { ...auth, body: { reason } }),
  // Admins
  all: () => api<{ items: BusinessDto[] }>('GET', '/admin/businesses', auth).then((r) => ({ items: r.items.map(business) })),
  /** A new entity with its owner, or `orgId`: a restaurant's entity also opens a shop (or the reverse). */
  create: (body: { kind: BusinessKind; name: string; specialties: string[]; orgId?: string; owner?: { phone: string; firstName: string; lastName: string; password?: string } } & BusinessPatch) =>
    api<BusinessDto>('POST', '/admin/businesses', { ...auth, body }),
  /** Référencement, before adding: the account of this number and the entities it owns (with what each runs). */
  ownerLookup: (phone: string) =>
    api<{ account: { firstName: string; lastName: string } | null; entities: OwnedEntity[] }>('POST', '/admin/businesses/owner-lookup', { ...auth, body: { phone } }),
  setActive: (id: string, active: boolean) => api<BusinessDto>('PATCH', `/admin/businesses/${id}`, { ...auth, body: { active } }),
  /** The team verified who runs it: Wave and Orange Money open (closed: they are taken off, cash stays). */
  setOnlinePayments: (id: string, onlinePayments: boolean) => api<BusinessDto>('PATCH', `/admin/businesses/${id}`, { ...auth, body: { onlinePayments } }),
};
