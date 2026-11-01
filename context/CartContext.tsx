import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { Alert } from 'react-native';

/** Quantity per item id. */
type Items = Record<string, number>;
type Shop = { id: string; name: string };

type CartValue = {
  /** Restaurant or shop the basket belongs to: an order goes to a single business. */
  business: Shop | null;
  items: Items;
  count: number;
  /** Sets a quantity (0 removes it). Asks before replacing a basket from another business. */
  setQty: (business: Shop, itemId: string, qty: number) => void;
  clear: () => void;
};

const CartContext = createContext<CartValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<{ business: Shop | null; items: Items }>({ business: null, items: {} });

  const value = useMemo<CartValue>(() => {
    const count = Object.values(cart.items).reduce((a, b) => a + b, 0);

    const apply = (business: Shop, itemId: string, qty: number) =>
      setCart((c) => {
        const items = c.business?.id === business.id ? { ...c.items } : {};
        if (qty <= 0) delete items[itemId];
        else items[itemId] = qty;
        return Object.keys(items).length ? { business, items } : { business: null, items: {} };
      });

    return {
      ...cart,
      count,
      setQty: (business, itemId, qty) => {
        if (count > 0 && cart.business && cart.business.id !== business.id && qty > 0) {
          Alert.alert('Nouveau panier ?', `Ton panier chez ${cart.business.name} sera vidé. Une commande ne concerne qu’un commerce.`, [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Vider et ajouter', style: 'destructive', onPress: () => apply(business, itemId, qty) },
          ]);
          return;
        }
        apply(business, itemId, qty);
      },
      clear: () => setCart({ business: null, items: {} }),
    };
  }, [cart]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}
