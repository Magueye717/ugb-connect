import { useEffect, useState } from 'react';

/** Current time, refreshed every minute (enough for opening hours), or every `everyMs` (a countdown: 1 000). */
export function useNow(everyMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}
