// Ratings: after a caravan trip, an event, an order, 1 to 5 stars (and a word). Optional; the app asks while it's fresh.
import { api } from '@/lib/api';

const auth = { auth: true } as const;

export type RatingSubject = 'caravan' | 'event' | 'order';

/** A service that ended and can be rated. */
export type RateableDto = {
  subject: RatingSubject;
  id: string;
  /** "UGB → Dakar", the event's title, "Commande chez Khoulé & Frère". */
  title: string;
  /** Who is rated: the organizer, the restaurant or shop. */
  ratedName: string;
  endedAt: string;
};

export type MyRatingDto = { rateable: RateableDto | null; stars: number | null; comment: string };

const path = (s: RatingSubject, id: string) => `/me/ratings/${s}/${id}`;

/** A restaurant's or shop's reviews, anonymous. `distribution`: 5★ down to 1★. */
export type ReviewsDto = {
  avg: number | null;
  count: number;
  distribution: { stars: number; count: number }[];
  /** Ratings with a comment; the latest ones are in `items`. */
  comments: number;
  items: { stars: number; comment: string; at: string }[];
};

export const ratingsApi = {
  /** A business's page: its reviews. */
  reviews: (businessId: string) => api<ReviewsDto>('GET', `/businesses/${businessId}/reviews`, auth),
  /** What to ask about now, newest first. */
  pending: () => api<{ items: RateableDto[] }>('GET', '/me/ratings/pending', auth),
  /** A service page's card: `rateable` null when it can't be rated (not over, too old). */
  mine: (s: RatingSubject, id: string) => api<MyRatingDto>('GET', path(s, id), auth),
  rate: (s: RatingSubject, id: string, stars: number, comment: string) => api<{ stars: number; comment: string }>('PUT', path(s, id), { ...auth, body: { stars, comment } }),
  /** « Plus tard »: asked again, a few times at most. */
  later: (s: RatingSubject, id: string) => api<void>('POST', `${path(s, id)}/later`, auth),
  /** « Ne pas noter »: never asked again. */
  decline: (s: RatingSubject, id: string) => api<void>('POST', `${path(s, id)}/decline`, auth),
};

/** The question, by what students recognise: the trip, the event, the vendor (never an order code). */
export const ratingQuestion = (r: RateableDto) =>
  r.subject === 'caravan'
    ? `Comment s’est passé ton trajet ${r.title}${r.ratedName ? ` avec ${r.ratedName}` : ''} ?`
    : r.subject === 'event'
      ? `C’était comment, « ${r.title} » ?`
      : // The vendor, not the order's code: « Ta commande chez Khoulé & Frère s’est bien passée ? »
        `Ta commande chez ${r.ratedName || 'ce commerce'} s’est bien passée ?`;

/** What one to five stars mean, under the stars. */
export const STAR_WORDS = ['', 'Très décevant', 'Décevant', 'Correct', 'Bien', 'Excellent'];

/** "Aujourd’hui", "Hier", "Il y a 5 j", "Il y a 3 sem.", "Il y a 2 mois": when a review was written. */
export function reviewedAgo(iso: string, now = Date.now()) {
  const days = Math.floor((now - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return 'Aujourd’hui';
  if (days === 1) return 'Hier';
  if (days < 7) return `Il y a ${days} j`;
  if (days < 30) return `Il y a ${Math.floor(days / 7)} sem.`;
  return `Il y a ${Math.floor(days / 30)} mois`;
}
