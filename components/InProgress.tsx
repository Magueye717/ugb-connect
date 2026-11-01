import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, shadow, typo } from '@/constants/theme';
import { useCart } from '@/context/CartContext';
import { useLost } from '@/context/LostContext';
import { useOrders } from '@/context/OrdersContext';
import { orderSteps } from '@/features/commerce/api';
import { useTaxi } from '@/context/TaxiContext';
import { useCaravans } from '@/context/CaravansContext';
import { byDeparture, dayLabel, hourLabel, isCaravanTicket, isEventTicket } from '@/features/caravans/api';
import { useNow } from '@/lib/useNow';

type Item = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  href: Href;
  /** Quick action right in the row (e.g. check in at the taxi meeting point). */
  action?: { label: string; onPress: () => void };
};

const hhmm = (at: number) => {
  const d = new Date(at);
  return `${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}`;
};

/** "En cours": tickets, taxi trip, basket and lost-and-found conversations, in one place. Hidden when empty. */
export function InProgress() {
  const now = useNow();
  const { tickets } = useCaravans();
  const taxi = useTaxi();
  const cart = useCart();
  const lost = useLost();
  const { orders } = useOrders();

  const items: Item[] = [];
  // Food orders first: they move fastest.
  for (const o of orders) {
    if (!['pending_payment', 'placed', 'accepted', 'ready'].includes(o.status)) continue;
    const step = o.status === 'pending_payment' ? { title: 'Paiement à terminer' } : orderSteps(o.mode).find((x) => x.key === o.status)!;
    items.push({ key: o.id, icon: 'receipt-outline', title: `Commande · ${o.business.name}`, detail: `${step.title} · ${o.code}`, href: `/commande/${o.id}` });
  }
  // One line per departure, even with a companion's ticket too.
  const upcoming = tickets.filter((t) => t.status === 'active' && Date.parse(t.event.startsAt) >= now);
  // Events: one line per event, however many tickets.
  const seenEvents = new Set<string>();
  for (const t of upcoming.filter(isEventTicket)) {
    if (seenEvents.has(t.details.eventId)) continue;
    seenEvents.add(t.details.eventId);
    const n = upcoming.filter((x) => isEventTicket(x) && x.details.eventId === t.details.eventId).length;
    const at = Date.parse(t.event.startsAt);
    items.push({ key: t.id, icon: 'sparkles-outline', title: t.event.title, detail: `${dayLabel(at)} · ${hourLabel(at)} · ${t.details.venue.name}${n > 1 ? ` · ${n} billets` : ''}`, href: `/billet/${t.id}` });
  }
  for (const group of byDeparture(upcoming.filter(isCaravanTicket))) {
    const t = group[0]!;
    const at = Date.parse(t.event.startsAt);
    const pickup = Date.parse(t.details.pickup.at);
    const count = group.length > 1 ? ` · ${group.length} billets` : '';
    items.push({ key: t.id, icon: 'ticket-outline', title: `Caravane ${t.event.title}`, detail: `${dayLabel(at)} · ${hourLabel(pickup)} · ${t.details.pickup.place}${count}`, href: `/billet/${t.id}` });
  }
  const trip = taxi.activeTrip();
  if (trip) {
    items.push({
      key: trip.id,
      icon: 'car-outline',
      title: `Taxi vers ${trip.to.split(' · ').pop()}`,
      detail: (() => {
        const unread = taxi.unreadFor(trip.id);
        if (trip.myStatus === 'pending_payment') return `Place gardée · paiement à terminer`;
        const base = `Départ ${hhmm(trip.departureAt)} · ${trip.seatsTaken}/${trip.seats} places`;
        return unread ? `${base} · ${unread} nouveau${unread > 1 ? 'x' : ''} message${unread > 1 ? 's' : ''}` : base;
      })(),
      href: `/taxi/${trip.id}`,
      // Seats locked and not checked in yet: one tap from home.
      action:
        trip.myStatus === 'joined' && trip.passengers[0] !== taxi.me && now >= trip.lockAt && !trip.checkedIn.includes(taxi.me)
          ? { label: 'Je suis là', onPress: () => taxi.checkIn(trip.id).catch(() => undefined) }
          : undefined,
    });
  }
  if (cart.count && cart.business) {
    items.push({
      key: 'cart',
      icon: 'bag-handle-outline',
      title: `Panier · ${cart.business.name}`,
      detail: `${cart.count} article${cart.count > 1 ? 's' : ''} · à finaliser`,
      href: '/panier',
    });
  }
  // Open items with a conversation going: mine (someone wrote), or one I wrote about.
  for (const i of lost.items ?? []) {
    if (i.returned) continue;
    if (i.myClaimId) items.push({ key: i.id, icon: 'chatbubbles-outline', title: i.name, detail: 'Discussion objet perdu en cours', href: `/objet/discussion/${i.myClaimId}` });
    else if (i.mine && i.conversationsCount > 0) {
      items.push({ key: i.id, icon: 'chatbubbles-outline', title: i.name, detail: `${i.conversationsCount} discussion${i.conversationsCount > 1 ? 's' : ''} en cours`, href: `/objet/${i.id}` });
    }
  }

  if (!items.length) return null;
  return (
    <View style={[styles.card, shadow.card]}>
      <View style={styles.head}>
        <View style={styles.live} />
        <Text style={styles.label}>EN COURS</Text>
        <Text style={styles.count}>{items.length}</Text>
      </View>
      {items.slice(0, 3).map((it, i) => (
        <Pressable
          key={it.key}
          onPress={() => router.push(it.href)}
          style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel={`${it.title}, ${it.detail}`}>
          <View style={styles.icon}>
            <Ionicons name={it.icon} size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>
              {it.title}
            </Text>
            <Text style={styles.detail} numberOfLines={1}>
              {it.detail}
            </Text>
          </View>
          {it.action ? (
            <Pressable style={styles.action} onPress={it.action.onPress} hitSlop={6} accessibilityRole="button">
              <Ionicons name="hand-left-outline" size={14} color="#fff" />
              <Text style={styles.actionText}>{it.action.label}</Text>
            </Pressable>
          ) : (
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          )}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radii.lg, paddingHorizontal: 16, paddingVertical: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  live: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  label: { ...typo.label, flex: 1, color: colors.muted2, letterSpacing: 0.5 },
  count: { ...typo.captionStrong, color: colors.muted2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  icon: { width: 36, height: 36, borderRadius: radii.sm, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  title: { ...typo.title, color: colors.navy },
  detail: { ...typo.caption, color: colors.muted2, marginTop: 1 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingHorizontal: 12, borderRadius: radii.pill, backgroundColor: colors.accent },
  actionText: { ...typo.smallStrong, color: '#fff' },
});
