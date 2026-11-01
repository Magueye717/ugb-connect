import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/context/AuthContext';
import { commerceApi, type OrderDto } from '@/features/commerce/api';

type OrdersValue = {
  /** My restaurant and shop orders, newest first (unpaid ones that expired are left out). */
  orders: OrderDto[];
  refresh: () => Promise<void>;
  /** Puts a new or changed order in the list at once. */
  upsert: (o: OrderDto) => void;
};

const OrdersContext = createContext<OrdersValue | null>(null);

/** While an order is moving, read again this often (the push tells each step too). */
const ACTIVE_REFRESH_MS = 20_000;
const ACTIVE = ['pending_payment', 'placed', 'accepted', 'ready'];

export function OrdersProvider({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const enabled = status === 'signedIn' && !!user?.studentId;
  const [orders, setOrders] = useState<OrderDto[]>([]);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      setOrders((await commerceApi.myOrders()).items);
    } catch {
      // Offline: keep what's shown.
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setOrders([]);
      return;
    }
    refresh();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => sub.remove();
  }, [enabled, refresh]);

  const moving = orders.some((o) => ACTIVE.includes(o.status));
  useEffect(() => {
    if (!moving) return;
    const timer = setInterval(() => AppState.currentState === 'active' && refresh(), ACTIVE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [moving, refresh]);

  const upsert = useCallback((o: OrderDto) => setOrders((list) => [o, ...list.filter((x) => x.id !== o.id)]), []);
  const value = useMemo(() => ({ orders, refresh, upsert }), [orders, refresh, upsert]);
  return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>;
}

export function useOrders() {
  const ctx = useContext(OrdersContext);
  if (!ctx) throw new Error('useOrders must be used inside OrdersProvider');
  return ctx;
}
