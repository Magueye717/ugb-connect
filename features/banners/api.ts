// Home carousel banners: sponsored ads and promoted events. Paid with a package, reviewed by the communication team.
import { paymentReturnUrl, type PaymentDto, type PaymentMethod } from '@/features/payments/checkout';
import { api } from '@/lib/api';

const auth = { auth: true } as const;

export type CtaTarget = 'app' | 'url' | 'whatsapp' | 'phone';
export type Cta = { label: string; target: CtaTarget; value: string };

/** What the carousel shows. `event`: tapping opens the event page. */
export type LiveBannerDto = {
  id: string;
  kind: 'ad' | 'event';
  title: string;
  description: string;
  image: string;
  cta: Cta | null;
  event: { id: string; title: string; startsAt: string; venue: string; categoryLabel: string; priceLabel: string } | null;
};

export type BannerStatus = 'pending_payment' | 'pending_review' | 'approved' | 'rejected' | 'cancelled' | 'withdrawn';

export type BannerDto = {
  id: string;
  kind: 'ad' | 'event';
  status: BannerStatus;
  title: string;
  description: string;
  image: string;
  cta: Cta | null;
  eventId: string | null;
  packageName: string;
  days: number;
  price: number;
  startsAt: string;
  endsAt: string;
  reviewReason: string | null;
  refunded: boolean;
  payment: { reference: string; checkoutUrl: string | null } | null;
};

export type BannerPackageDto = { code: string; name: string; days: number; price: number; active: boolean };

export type NewBanner = {
  kind: 'ad' | 'event';
  orgId?: string;
  eventId?: string;
  title?: string;
  description?: string;
  imageId?: string;
  cta?: Cta | null;
  packageCode: string;
  startsOn: string;
  method: PaymentMethod;
};

export const bannersApi = {
  live: () => api<{ items: LiveBannerDto[] }>('GET', '/banners', auth),
  packages: () => api<{ items: BannerPackageDto[] }>('GET', '/banner-packages', auth),
  create: (body: NewBanner) => api<{ banner: BannerDto; payment: PaymentDto }>('POST', '/banners', { ...auth, body: { ...body, returnUrl: paymentReturnUrl() } }),
  mine: () => api<{ items: BannerDto[] }>('GET', '/me/banners', auth),
  cancel: (id: string) => api<BannerDto>('POST', `/me/banners/${id}/cancel`, auth),
  // Communication team
  review: (status?: BannerStatus) => api<{ items: BannerDto[] }>('GET', `/admin/banners${status ? `?status=${status}` : ''}`, auth),
  approve: (id: string) => api<BannerDto>('POST', `/admin/banners/${id}/approve`, auth),
  reject: (id: string, reason: string) => api<BannerDto>('POST', `/admin/banners/${id}/reject`, { ...auth, body: { reason } }),
  withdraw: (id: string, reason: string) => api<BannerDto>('POST', `/admin/banners/${id}/withdraw`, { ...auth, body: { reason } }),
};

export const BANNER_STATUS: Record<BannerStatus, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  pending_payment: { label: 'Paiement en attente', tone: 'warning' },
  pending_review: { label: 'En cours de validation', tone: 'warning' },
  approved: { label: 'Validée', tone: 'success' },
  rejected: { label: 'Refusée', tone: 'danger' },
  cancelled: { label: 'Annulée', tone: 'neutral' },
  withdrawn: { label: 'Retirée', tone: 'neutral' },
};
