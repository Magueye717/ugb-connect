import type { Ionicons } from '@expo/vector-icons';

import { colors } from '@/constants/theme';
import { api } from '@/lib/api';

export type HousingKind = 'swap' | 'host_offer' | 'host_need' | 'roommate';
export type HousingFor = 'any' | 'girls' | 'boys';

export type HousingAdDto = {
  id: string;
  kind: HousingKind;
  by: string;
  initials: string;
  village: string | null;
  room: string | null;
  wants: string[];
  area: string | null;
  from: string | null;
  to: string | null;
  rent: number | null;
  places: number | null;
  for: HousingFor;
  note: string | null;
  state: 'open' | 'closed' | 'hidden';
  createdAt: string;
  expiresAt: string;
  mine: boolean;
  /** Swaps: one of my swap ads fits this one. */
  match: boolean;
  myContactId: string | null;
  contactIds: string[];
};
export type HousingAdDetail = HousingAdDto & { conversations: { contactId: string; with: string; createdAt: string }[] };
export type HousingContactDto = { id: string; conversationId: string | null; with: string; ad: HousingAdDto };
export type HousingInput = {
  kind: HousingKind;
  village?: string | null;
  room?: string | null;
  wants?: string[];
  area?: string | null;
  from?: string | null;
  to?: string | null;
  rent?: number | null;
  places?: number | null;
  for?: HousingFor;
  note?: string | null;
};

const auth = { auth: true } as const;

export const housingApi = {
  list: () => api<{ items: HousingAdDto[] }>('GET', '/housing/ads', auth),
  detail: (id: string) => api<HousingAdDetail>('GET', `/housing/ads/${id}`, auth),
  create: (body: HousingInput) => api<HousingAdDetail>('POST', '/housing/ads', { ...auth, body }),
  close: (id: string) => api<HousingAdDetail>('POST', `/housing/ads/${id}/close`, auth),
  report: (id: string) => api<void>('POST', `/housing/ads/${id}/report`, auth),
  contact: (id: string) => api<HousingContactDto>('POST', `/housing/ads/${id}/contact`, auth),
  contactView: (id: string) => api<HousingContactDto>('GET', `/housing/contacts/${id}`, auth),
};

/** Each kind's look: one colour family, one icon, one word, so the board reads at a glance. */
export const KIND: Record<HousingKind, { label: string; short: string; icon: keyof typeof Ionicons.glyphMap; fg: string; bg: string; grad: [string, string] }> = {
  swap: { label: 'Échange de chambre', short: 'Échange', icon: 'swap-horizontal', fg: colors.primary, bg: colors.primarySoft, grad: ['#3B5BDB', '#5C7CFA'] },
  host_offer: { label: 'Propose un hébergement', short: 'Héberge', icon: 'home', fg: colors.successText, bg: colors.successBg, grad: ['#0CA678', '#38D9A9'] },
  host_need: { label: 'Cherche un hébergement', short: 'Cherche', icon: 'bed', fg: colors.orangeText, bg: colors.accentSoft, grad: ['#F76707', '#FFA94D'] },
  roommate: { label: 'Colocation', short: 'Coloc', icon: 'people', fg: colors.purpleText, bg: '#EEEBFE', grad: ['#7048E8', '#9775FA'] },
};

export const FOR_LABEL: Record<HousingFor, string | null> = { any: null, girls: 'Filles', boys: 'Garçons' };

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const shortDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};
/** « il y a 2 h », « hier », « il y a 5 j ». */
export const ago = (iso: string, now: number) => {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (m < 60) return m <= 1 ? 'à l’instant' : `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'hier' : `il y a ${d} j`;
};

/** The one line that says what the ad is about. */
export function headline(a: HousingAdDto) {
  switch (a.kind) {
    case 'swap':
      return `${a.village ?? ''} → ${a.wants.join(' ou ')}`;
    case 'host_offer':
      return `Héberge ${a.village ?? a.area ?? ''}`.trim();
    case 'host_need':
      return a.village || a.area ? `Cherche où dormir · ${a.village ?? a.area}` : 'Cherche où dormir';
    case 'roommate':
      return `Colocation · ${a.area ?? a.village ?? ''}`;
  }
}
