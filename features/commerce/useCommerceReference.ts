import { useCallback, useEffect, useState } from 'react';

import { commerceApi, type CommerceReference } from './api';

// The lists the commerce forms pick from (specialties, delivery zones, how many specialties): fetched once for the
// whole app. A failed fetch is reported (no silent greyed-out picker) and can be retried.
let cache: CommerceReference | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<(r: CommerceReference | null, failed: boolean) => void>();

function fetchReference() {
  listeners.forEach((l) => l(cache, false));
  inflight ??= commerceApi
    .reference()
    .then((r) => {
      cache = r;
      listeners.forEach((l) => l(r, false));
    })
    .catch(() => listeners.forEach((l) => l(cache, true)))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** The commerce reference (null until loaded), whether loading it failed, and `retry`. */
export function useCommerceReference() {
  const [state, setState] = useState<{ reference: CommerceReference | null; failed: boolean }>({ reference: cache, failed: false });
  useEffect(() => {
    const l = (reference: CommerceReference | null, failed: boolean) => setState({ reference, failed });
    listeners.add(l);
    if (!cache) fetchReference();
    return () => {
      listeners.delete(l);
    };
  }, []);
  const retry = useCallback(() => {
    fetchReference();
  }, []);
  return { ...state, retry };
}
