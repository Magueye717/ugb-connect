// Private restaurants and shops: browsing and ordering (students), their own space (owner, managers, staff), admin.
import { paymentReturnUrl, type PaymentDto, type PaymentMethod } from '@/features/payments/checkout';
import { api } from '@/lib/api';

const auth = { auth: true } as const;

export type BusinessKind = 'restaurant' | 'shop';
export type ItemSection = 'menu' | 'drink' | 'article';

export type ItemDto = {
  id: string;
  section: ItemSection;
  /** Shops: groups the articles ("Fournitures"). */
  category: string | null;
  name: string;
  detail: string;
  price: number;
  photo: string | null;
  photoId: string | null;
  /** Shops: units left; null: not counted. */
  stock: number | null;
  soldOut: boolean;
  available: boolean;
};

export type BusinessDto = {
  id: string;
  orgId: string;
  kind: BusinessKind;
  name: string;
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
  /** FCFA, 0: free; null: pickup only. */
  deliveryFee: number | null;
  acceptingOrders: boolean;
  active: boolean;
};
export type ListedBusiness = BusinessDto & { highlights: ItemDto[]; minPrice: number | null; itemsCount: number; /** Every available item: for searching. */ itemNames: string[] };
/** The market: every article of every shop, each with its shop. */
export type MarketItem = ItemDto & { businessId: string };
export type BusinessDetail = BusinessDto & { items: ItemDto[] };

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
  total: number;
  mode: OrderMode;
  address: string | null;
  note: string | null;
  refusal: string | null;
  refunded: boolean;
  history: { status: OrderStatus; at: string }[];
  createdAt: string;
  payment: { reference: string; checkoutUrl: string | null } | null;
  /** Business side: who ordered. */
  customer: { name: string; phone: string } | null;
};

export type BusinessPatch = Partial<{
  name: string;
  specialty: string;
  description: string;
  photoId: string | null;
  location: { lat: number; lng: number } | null;
  address: string;
  campus: 'campus1' | 'campus2' | null;
  phone: string;
  services: { start: string; end: string }[];
  deliveryFee: number | null;
  acceptingOrders: boolean;
}>;
export type ItemInput = { section: ItemSection; category?: string | null; name: string; detail?: string; price: number; photoId?: string | null; stock?: number | null; available?: boolean };
export type Member = { userId: string; roles: string[]; firstName: string; lastName: string };

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

export const commerceApi = {
  // Students
  list: (kind: BusinessKind) => api<{ items: ListedBusiness[] }>('GET', `/businesses?kind=${kind}`, auth),
  get: (id: string) => api<BusinessDetail>('GET', `/businesses/${id}`, auth),
  market: (kind: BusinessKind) => api<{ businesses: BusinessDto[]; items: MarketItem[] }>('GET', `/market?kind=${kind}`, auth),
  order: (id: string, body: { lines: { itemId: string; qty: number }[]; mode: OrderMode; address?: string | null; note?: string | null; method: PaymentMethod }) =>
    api<{ order: OrderDto; payment: PaymentDto }>('POST', `/businesses/${id}/orders`, { ...auth, body: { ...body, returnUrl: paymentReturnUrl() } }),
  myOrders: () => api<{ items: OrderDto[] }>('GET', '/me/orders', auth),
  myOrder: (id: string) => api<OrderDto>('GET', `/me/orders/${id}`, auth),
  cancel: (id: string) => api<OrderDto>('POST', `/me/orders/${id}/cancel`, auth),
  // The business's own space
  mine: (orgId: string) => api<BusinessDto>('GET', `/org/${orgId}/business`, auth),
  updateMine: (orgId: string, body: BusinessPatch) => api<BusinessDto>('PATCH', `/org/${orgId}/business`, { ...auth, body }),
  catalog: (orgId: string) => api<{ items: ItemDto[] }>('GET', `/org/${orgId}/catalog`, auth),
  addItem: (orgId: string, body: ItemInput) => api<ItemDto>('POST', `/org/${orgId}/catalog`, { ...auth, body }),
  updateItem: (orgId: string, itemId: string, body: Partial<ItemInput>) => api<ItemDto>('PATCH', `/org/${orgId}/catalog/${itemId}`, { ...auth, body }),
  removeItem: (orgId: string, itemId: string) => api<void>('DELETE', `/org/${orgId}/catalog/${itemId}`, auth),
  queue: (orgId: string, scope: 'active' | 'done' = 'active') => api<{ items: OrderDto[] }>('GET', `/org/${orgId}/orders?scope=${scope}`, auth),
  businessOrder: (orgId: string, id: string) => api<OrderDto>('GET', `/org/${orgId}/orders/${id}`, auth),
  step: (orgId: string, id: string, step: 'accept' | 'ready' | 'complete') => api<OrderDto>('POST', `/org/${orgId}/orders/${id}/${step}`, auth),
  /** At the counter: the code the student gives, typed or scanned from their QR. */
  handover: (orgId: string, code: string) => api<OrderDto>('POST', `/org/${orgId}/orders/handover`, { ...auth, body: { code } }),
  refuse: (orgId: string, id: string, reason: string) => api<OrderDto>('POST', `/org/${orgId}/orders/${id}/refuse`, { ...auth, body: { reason } }),
  members: (orgId: string) => api<Member[]>('GET', `/org/${orgId}/members`, auth),
  /** A new number gets an account when firstName and lastName are given. */
  setMember: (orgId: string, body: { phone: string; roles: string[]; firstName?: string; lastName?: string }) => api<void>('PUT', `/org/${orgId}/members`, { ...auth, body }),
  removeMember: (orgId: string, userId: string) => api<void>('DELETE', `/org/${orgId}/members/${userId}`, auth),
  // Admins
  all: () => api<{ items: BusinessDto[] }>('GET', '/admin/businesses', auth),
  create: (body: { kind: BusinessKind; name: string; specialty: string; owner: { phone: string; firstName: string; lastName: string } } & BusinessPatch) =>
    api<BusinessDto>('POST', '/admin/businesses', { ...auth, body }),
  setActive: (id: string, active: boolean) => api<BusinessDto>('PATCH', `/admin/businesses/${id}`, { ...auth, body: { active } }),
};
