import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { ratingsApi, type RateableDto } from './api';
import { RatingSheet } from './RatingSheet';

/** Asked once per app session at most: never a sheet each time the home screen comes back. */
const askedThisSession = new Set<string>();

/**
 * On the home screen: a service just ended and isn't rated yet → the rating sheet, once per session (the newest one).
 * « Plus tard » asks again next time, a few times at most; « Ne pas noter » never.
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
