// Lost and found on the backend: the board, declaring, the chats about an item, and found student cards (OCR).
import { File } from 'expo-file-system';

import { API_URL, ApiError, api, session } from '@/lib/api';

const auth = { auth: true } as const;

export type LostStatus = 'found' | 'lost';
export type LostKind = 'object' | 'student-card' | 'id-card';
export type LostWhen = 'today' | 'yesterday' | 'this_week';
export type LostHolder = 'office' | 'finder';

export type LostItemDto = {
  id: string;
  status: LostStatus;
  kind: LostKind;
  category: string;
  name: string;
  details: string | null;
  where: string;
  spot: string | null;
  when: LostWhen;
  holder: LostHolder | null;
  photo: string | null;
  /** The declarer, masked: "Moussa S.". */
  by: string;
  /** Cards: the owner, masked ("Awa D."). */
  owner: string | null;
  ownerNotified: boolean;
  state: 'open' | 'returned';
  returned: boolean;
  createdAt: string;
  /** I declared it. */
  mine: boolean;
  /** My student card, found by someone. */
  isOwner: boolean;
  /** Found objects, declarer only: the detail to check. */
  secret: string | null;
  /** My conversation about it. */
  myClaimId: string | null;
  /** Declarer: conversations opened about it. */
  conversationsCount: number;
  /** Declarer: those conversations' claim ids, for their unread counts. */
  claimIds?: string[];
};

export type LostItemDetail = LostItemDto & { conversations: { claimId: string; with: string; role: ClaimRole; createdAt: string }[] };

export type ClaimRole = 'claim' | 'found_it' | 'card';
export type ClaimDto = { id: string; role: ClaimRole; conversationId: string | null; with: string; item: LostItemDto };

/** Someone a found card may belong to: enough to compare with the card. Students also have UFR, campus and number. */
export type StudentMatch = {
  ref: string;
  name: string;
  firstName: string;
  lastName: string;
  initials: string;
  ufr: string | null;
  campus: string | null;
  village: string | null;
  /** "P23•••55". */
  numberHint: string | null;
};

/** What the OCR recognised: decides how names are read and what the owner is told. */
export type CardType = 'student' | 'national_id' | 'driving_licence' | 'bank';
export const CARD_TYPES: { value: CardType; label: string; icon: string }[] = [
  { value: 'student', label: 'Carte étudiant', icon: 'school-outline' },
  { value: 'national_id', label: 'Carte d’identité', icon: 'id-card-outline' },
  { value: 'driving_licence', label: 'Permis', icon: 'car-outline' },
  { value: 'bank', label: 'Carte bancaire', icon: 'card-outline' },
];
export type CardReading = { cardType: CardType | null; studentNumber: string | null; names: string[]; owner: StudentMatch | null; candidates: StudentMatch[] };

export type NewLostItem = {
  status: LostStatus;
  category: string;
  name?: string;
  details?: string | null;
  secret?: string | null;
  where: string;
  spot?: string | null;
  when: LostWhen;
  holder?: LostHolder | null;
  imageId?: string | null;
  ownerName?: string | null;
};

export const WHEN_LABEL: Record<LostWhen, string> = { today: 'Aujourd’hui', yesterday: 'Hier', this_week: 'Cette semaine' };

/** "Il y a 2 h", "Hier", "Lun. 3 nov.": when it was declared. */
export function declaredAgo(iso: string, now = Date.now()) {
  const ms = now - Date.parse(iso);
  if (ms < 60 * 60_000) return `Il y a ${Math.max(1, Math.round(ms / 60_000))} min`;
  if (ms < 24 * 3_600_000) return `Il y a ${Math.round(ms / 3_600_000)} h`;
  if (ms < 48 * 3_600_000) return 'Hier';
  return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

export const lostApi = {
  list: () => api<{ items: LostItemDto[] }>('GET', '/lost/items', auth),
  get: (id: string) => api<LostItemDetail>('GET', `/lost/items/${id}`, auth),
  declare: (body: NewLostItem) => api<LostItemDetail>('POST', '/lost/items', { ...auth, body }),
  returned: (id: string) => api<LostItemDetail>('POST', `/lost/items/${id}/returned`, auth),
  claim: (id: string, proof: string) => api<ClaimDto>('POST', `/lost/items/${id}/claim`, { ...auth, body: { proof } }),
  foundIt: (id: string) => api<ClaimDto>('POST', `/lost/items/${id}/found-it`, auth),
  claimView: (claimId: string) => api<ClaimDto>('GET', `/lost/claims/${claimId}`, auth),
  // Found student cards
  lookupCard: (number: string) => api<{ studentNumber: string; owner: StudentMatch | null }>('GET', `/lost/cards/lookup?number=${encodeURIComponent(number)}`, auth),
  searchCard: (q: string) => api<{ items: StudentMatch[] }>('GET', `/lost/cards/search?q=${encodeURIComponent(q)}`, auth),
  cardFound: (body: { ownerRef: string | null; cardType: CardType; where: string; spot?: string | null; holder: LostHolder }) =>
    api<{ item: LostItemDetail; claimId: string | null }>('POST', '/lost/cards/found', { ...auth, body }),
};

/**
 * Sends the photo of a found card to be read (OCR on the server: number and names). Same upload as the pictures
 * (expo/fetch needs expo-file-system's File in the FormData). The photo is never stored.
 */
export function readCardPhoto(uri: string): Promise<CardReading> {
  return postPhoto<CardReading>('/lost/cards/read', uri, 'Lecture de la carte impossible.');
}

/** What the student's own card gives (POST /me/student-card/read): checked by them, then saved. */
export type MyCardReading = { matched: 'number' | 'name'; studentNumber: string | null; birthDate: string | null; birthPlace: string | null; nationality: string | null };
export const readMyCardPhoto = (uri: string) => postPhoto<MyCardReading>('/me/student-card/read', uri, 'Lecture de ta carte impossible.');
export const saveIdentity = (body: { birthDate: string | null; birthPlace: string | null; nationality: string | null; fromCard: boolean }) =>
  api<void>('PUT', '/me/identity', { ...auth, body });

async function postPhoto<T>(path: string, uri: string, failure: string): Promise<T> {
  const token = await session.accessToken();
  if (!token) throw new ApiError(401, 'UNAUTHENTICATED', 'Connecte-toi pour continuer.');
  const form = new FormData();
  form.append('file', new File(uri));
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, body: form });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Connexion impossible. Vérifie ta connexion internet et réessaie.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.code ?? 'HTTP_ERROR', data?.message ?? failure);
  return data as T;
}
