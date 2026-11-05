import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { ratingsApi, type RateableDto } from './api';
import { RatingSheet } from './RatingSheet';

/** Asked once per app session at most: never a sheet each time the home screen comes back. */
const askedThisSession = new Set<string>();

/**
 * On the home screen: a service just ended and isn't rated yet → the rating sheet, once (the newest one; one per
 * restaurant or shop). Not answered: not asked again; its page (the order, the ticket) still lets them rate.
 */
export function RatingPrompt() {
  const [item, setItem] = useState<RateableDto | null>(null);
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      // A moment after landing: the screen first, then the question.
      const t = setTimeout(() => {
        ratingsApi.pending().then(({ items }) => {
          const next = items.find((r) => !askedThisSession.has(`${r.subject}:${r.id}`));
          if (!alive || !next) return;
          askedThisSession.add(`${next.subject}:${next.id}`);
          // Asked once: shown now, never again on its own (even if the app is closed without answering).
          ratingsApi.later(next.subject, next.id).catch(() => undefined);
          setItem(next);
        }, () => undefined);
      }, 1200);
      return () => {
        alive = false;
        clearTimeout(t);
      };
    }, []),
  );
  if (!item) return null;
  return <RatingSheet item={item} prompted onClose={() => setItem(null)} />;
}
