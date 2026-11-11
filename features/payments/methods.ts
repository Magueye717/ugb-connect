// Which of Wave / Orange Money take payments right now: the admins can switch one off app-wide (an outage at the
// provider). Shared by every payment picker and the home banner; refreshed on open, when the app comes back, and
// every few minutes.
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { api } from '@/lib/api';

import type { PaymentMethod } from './checkout';

export type MethodStatus = { method: PaymentMethod; available: boolean; offSince: string | null; note: string | null };

const REFRESH_MS = 3 * 60_000;
let items: MethodStatus[] = [];
let loadedAt = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const getPaymentMethods = () => api<{ items: MethodStatus[] }>('GET', '/payments/methods', { auth: true });
export const setPaymentMethod = (method: PaymentMethod, enabled: boolean, note?: string | null) =>
  api<{ items: MethodStatus[] }>('PUT', `/admin/payments/methods/${method}`, { auth: true, body: { enabled, note: note ?? null } });

/** Replaces what's known (after the admins' switch, or a refresh). */
export function storeMethods(next: MethodStatus[]) {
  items = next;
  loadedAt = Date.now();
  emit();
}

export async function refreshMethods(force = false) {
  if (!force && Date.now() - loadedAt < 30_000) return;
  try {
    storeMethods((await getPaymentMethods()).items);
  } catch {
    // Offline or signed out: what was known stays; the server refuses a switched-off method anyway.
  }
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Every method's status (empty until loaded: everything counts as on). */
export function usePaymentMethods() {
  const list = useSyncExternalStore(subscribe, () => items);
  useEffect(() => {
    refreshMethods();
    const timer = setInterval(() => AppState.currentState === 'active' && refreshMethods(true), REFRESH_MS);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refreshMethods());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);
  return list;
}

/** The methods switched off (Wave, Orange Money): greyed in the pickers. `om` is the pickers' id for Orange Money. */
export function useMethodsOff() {
  const list = usePaymentMethods();
  const off = new Set(list.filter((m) => !m.available).map((m) => m.method));
  const isOff = (id: string) => off.has((id === 'om' ? 'orange_money' : id) as PaymentMethod);
  return { off: list.filter((m) => !m.available), isOff };
}

/** The line under a picker that hides a switched-off method: what's off, and why when the admins said. */
export function methodsOffLine(off: MethodStatus[]) {
  if (!off.length) return null;
  const names = off.map((m) => (m.method === 'wave' ? 'Wave' : 'Orange Money')).join(' et ');
  return `${names} momentanément indisponible${off.length > 1 ? 's' : ''}.${off.find((m) => m.note)?.note ? ` ${off.find((m) => m.note)!.note}` : ''}`;
}
