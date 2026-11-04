// University restaurants' menus and the home screen's alerts, from the backend.
import { api } from '@/lib/api';

const auth = { auth: true } as const;

export type Meal = 'lunch' | 'dinner';
/** `out`: "Rupture", nothing left. */
export type DishStatus = 'available' | 'low' | 'out';
export type Service = { start: string; end: string };

export type DishDto = { id: string; name: string; detail: string; status: DishStatus; statusAt: string };
export type MenuDto = { id: string; restoId: string; date: string; meal: Meal; dishes: DishDto[]; updatedAt: string };
export type PublicRestoDto = {
  id: string;
  slug: string;
  name: string;
  location: string;
  /** GPS point, for directions. */
  coords: { lat: number; lng: number } | null;
  services: Record<Meal, Service>;
  menus: Record<Meal, MenuDto | null>;
};
export type RestosDayDto = { date: string; restos: PublicRestoDto[] };

export type AlertDto = {
  id: string;
  /** campus: communication team; academic: academic team; resto_stock: a dish sold out. */
  kind: 'campus' | 'academic' | 'resto_stock';
  /** banner: the strip at the top (short, urgent); headline: "À la une" (news, announcements). */
  placement: 'banner' | 'headline';
  /** "À la une" label: "Élections", "Bourses". */
  tag: string | null;
  title: string;
  body: string;
  icon: string;
  tone: 'info' | 'warning' | 'danger' | 'success';
  /** App route opened on tap; null: display only. */
  href: string | null;
  /** The day it's about (the vote, the payment). */
  eventAt: string | null;
  audience: Audience;
  startsAt: string;
  endsAt: string;
};

/** Who an announcement is for: each list narrows (UFR SAT + Campus 1 = SAT students on Campus 1); all empty: everyone. */
export type Audience = { campuses: string[]; ufrs: string[]; regions: string[] };
export const EVERYONE: Audience = { campuses: [], ufrs: [], regions: [] };
const CAMPUS_LABEL: Record<string, string> = { campus1: 'Campus 1', campus2: 'Campus 2' };
/** "Toute l'université", or "UFR SAT, SJP · Campus 1 · Ziguinchor". */
export function audienceLabel(a: Audience) {
  const parts = [a.ufrs.length ? `UFR ${a.ufrs.join(', ')}` : '', a.campuses.map((c) => CAMPUS_LABEL[c] ?? c).join(', '), a.regions.join(', ')].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Toute l’université';
}

/** Back office: status, push state, and what this editor may do. */
export type AdminAlertDto = AlertDto & {
  status: 'scheduled' | 'live' | 'ended' | 'withdrawn';
  push: boolean;
  pushedAt: string | null;
  editable: boolean;
  withdrawable: boolean;
};

export type AlertBody = {
  placement: AlertDto['placement'];
  tag: string | null;
  title: string;
  body: string;
  tone: AlertDto['tone'];
  icon: string;
  eventAt: string | null;
  audience: Audience;
  startsAt: string;
  endsAt: string;
  push: boolean;
};

export const restosApi = {
  day: (date?: string) => api<RestosDayDto>('GET', `/public-restos${date ? `?date=${date}` : ''}`, auth),
  alerts: () => api<{ items: AlertDto[] }>('GET', '/alerts', auth),
};

/** Campus staff: stock levels during the service (restaurant staff), alerts (communication team). */
/** A restaurant as its staff and the super admin see it (no menus). */
export type StaffRestoDto = Omit<PublicRestoDto, 'menus'> & { campus: string | null; sortOrder: number; status: string };
export type DishInput = { id?: string; name: string; detail?: string };
/** A dish of the catalogue the staff pick from: predefined, or published once by someone. */
export type CatalogueDish = { id: string; name: string; detail: string; meals: Meal[]; uses: number };

export const staffApi = {
  /** The super admin: every restaurant. A menu publisher: the ones assigned to them. */
  restos: () => api<{ items: StaffRestoDto[] }>('GET', '/admin/public-restos', auth),
  /** Lunch and dinner are published separately (dinner is often known later in the day). */
  putMenu: (restoId: string, date: string, meal: Meal, dishes: DishInput[]) => api<MenuDto>('PUT', `/admin/public-restos/${restoId}/menus/${date}/${meal}`, { ...auth, body: { dishes } }),
  /** The dishes to pick from, those of `meal` first then the most served. Publishing a menu adds its new dishes. */
  dishes: (meal: Meal) => api<{ items: CatalogueDish[] }>('GET', `/admin/public-dishes?meal=${meal}`, auth),
  /** Out of the suggestions (a typo…); published menus keep it. */
  removeDish: (id: string) => api<void>('DELETE', `/admin/public-dishes/${id}`, auth),
  deleteMenu: (restoId: string, date: string, meal: Meal) => api<void>('DELETE', `/admin/public-restos/${restoId}/menus/${date}/${meal}`, auth),
  /** `notify` (with a rupture): a push to everyone with the app, on top of the home screen alert. */
  setDishStatus: (restoId: string, date: string, meal: Meal, dishId: string, status: DishStatus, notify = false) =>
    api<MenuDto>('PATCH', `/admin/public-restos/${restoId}/menus/${date}/${meal}/dishes/${dishId}`, { ...auth, body: { status, notify } }),
  alerts: () => api<{ items: AdminAlertDto[] }>('GET', '/admin/alerts', auth),
  postAlert: (body: AlertBody) => api<AdminAlertDto>('POST', '/admin/alerts', { ...auth, body }),
  updateAlert: (id: string, body: AlertBody) => api<AdminAlertDto>('PUT', `/admin/alerts/${id}`, { ...auth, body }),
  withdrawAlert: (id: string) => api<AdminAlertDto>('DELETE', `/admin/alerts/${id}`, auth),
};

export const MEAL_LABEL: Record<Meal, string> = { lunch: 'Déjeuner', dinner: 'Dîner' };

/** Service hours shown when no restaurant is listed yet. */
const FALLBACK: Record<Meal, Service> = { lunch: { start: '12:00', end: '15:00' }, dinner: { start: '19:00', end: '21:00' } };

const hours = (hm: string) => {
  const [h, m] = hm.split(':').map(Number);
  return h! + m! / 60;
};
/** "12:00" → "12h", "12:30" → "12h30" */
export const hmLabel = (hm: string) => hm.replace(/^0/, '').replace(':00', 'h').replace(':', 'h');

/**
 * The meal of the day that matters now: lunch until it ends, then dinner (shown as over after its end: the app
 * only shows today). Times are the restaurants' own (the earliest start and latest end among them).
 */
export function currentMeal(now: number, restos: PublicRestoDto[]) {
  const span = (meal: Meal): Service =>
    restos.length
      ? { start: restos.map((r) => r.services[meal].start).sort()[0]!, end: restos.map((r) => r.services[meal].end).sort().at(-1)! }
      : FALLBACK[meal];
  const lunch = span('lunch');
  const dinner = span('dinner');
  const d = new Date(now);
  const h = d.getHours() + d.getMinutes() / 60;
  if (h < hours(lunch.end))
    return { key: 'lunch' as const, label: MEAL_LABEL.lunch, service: lunch, status: h < hours(lunch.start) ? `Dès ${hmLabel(lunch.start)}` : `Servi jusqu'à ${hmLabel(lunch.end)}`, live: h >= hours(lunch.start) };
  if (h < hours(dinner.end))
    return { key: 'dinner' as const, label: MEAL_LABEL.dinner, service: dinner, status: h < hours(dinner.start) ? `Dès ${hmLabel(dinner.start)}` : `Servi jusqu'à ${hmLabel(dinner.end)}`, live: h >= hours(dinner.start) };
  return { key: 'dinner' as const, label: MEAL_LABEL.dinner, service: dinner, status: 'Service terminé', live: false };
}
