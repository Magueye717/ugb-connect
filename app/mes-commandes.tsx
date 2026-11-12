import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/states';
import { BackButton, Segmented, StatusChip } from '@/components/ui';
import { formatDateTime, formatFcfa } from '@/constants/data';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useOrders } from '@/context/OrdersContext';
import type { OrderDto, OrderStatus } from '@/features/commerce/api';

type Tab = 'current' | 'past';

/** Still moving: sent, being prepared, ready to collect (or to pay). */
const MOVING: OrderStatus[] = ['pending_payment', 'placed', 'accepted', 'ready'];

/** Where an order stands, said from the student's side. */
const STATE: Record<OrderStatus, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  pending_payment: { label: 'À payer', tone: 'warning' },
  placed: { label: 'Envoyée', tone: 'warning' },
  accepted: { label: 'En préparation', tone: 'success' },
  ready: { label: 'Prête', tone: 'success' },
  completed: { label: 'Récupérée', tone: 'neutral' },
  refused: { label: 'Refusée', tone: 'danger' },
  cancelled: { label: 'Annulée', tone: 'neutral' },
  expired: { label: 'Expirée', tone: 'neutral' },
};

/**
 * « Mes commandes »: every order from the restaurants and shops, the ones still moving first (sent, being prepared,
 * ready); the finished, refused or cancelled ones under « Passées ». Each opens its tracking (code, items, contact).
 */
export default function MesCommandes() {
  const { orders, refresh } = useOrders();
  const [tab, setTab] = useState<Tab>('current');
  const [refreshing, setRefreshing] = useState(false);
  useFocusEffect(
    useCallback(() => {
      refresh().catch(() => undefined);
    }, [refresh]),
  );
  const pull = () => {
    setRefreshing(true);
    refresh()
      .catch(() => undefined)
      .finally(() => setRefreshing(false));
  };

  const byDate = (a: OrderDto, b: OrderDto) => Date.parse(b.createdAt) - Date.parse(a.createdAt);
  const current = orders.filter((o) => MOVING.includes(o.status)).sort(byDate);
  const past = orders.filter((o) => !MOVING.includes(o.status)).sort(byDate);
  const list = tab === 'current' ? current : past;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profil'));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.head}>
        <BackButton onPress={back} />
        <Text style={styles.h1}>Mes commandes</Text>
      </View>
      <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
        <Segmented
          options={[
            { value: 'current', label: 'En cours', badge: current.length },
            { value: 'past', label: 'Passées' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pull} />}>
        {list.length === 0 && (
          <EmptyState
            icon="receipt-outline"
            title={tab === 'current' ? 'Aucune commande en cours' : 'Aucune commande passée'}
            text={tab === 'current' ? 'Commande au resto ou dans une boutique du campus : tu la suis ici jusqu’à la remise.' : undefined}
          />
        )}
        {list.map((o) => (
          <OrderRow key={o.id} o={o} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function OrderRow({ o }: { o: OrderDto }) {
  const state = STATE[o.status];
  const items = o.lines.map((l) => `${l.qty} × ${l.name}`).join(', ');
  return (
    <Pressable
      style={({ pressed }) => [styles.card, shadow.card, pressed && { opacity: 0.9 }]}
      onPress={() => router.push(`/commande/${o.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`Commande ${o.business.name}, ${state.label}, ${formatFcfa(o.total)}`}>
      <View style={styles.pic}>
        {o.business.photo ? (
          <Image source={{ uri: o.business.photo }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <Ionicons name={o.business.kind === 'shop' ? 'storefront-outline' : 'restaurant-outline'} size={20} color={colors.primary} />
        )}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.top}>
          <Text style={styles.title} numberOfLines={1}>
            {o.business.name}
          </Text>
          <StatusChip label={state.label} tone={state.tone} />
        </View>
        <Text style={styles.items} numberOfLines={1}>
          {items}
        </Text>
        <Text style={styles.muted}>
          {o.code} · {formatDateTime(Date.parse(o.createdAt))} · <Text style={styles.total}>{formatFcfa(o.total)}</Text>
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 8 },
  h1: { ...typo.h3, color: colors.navy, flex: 1 },
  body: { padding: 20, gap: 10, paddingBottom: 40 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: radii.lg, padding: 12 },
  pic: { width: 48, height: 48, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { ...typo.bodyStrong, color: colors.navy, flex: 1 },
  items: { ...typo.small, color: colors.text },
  muted: { ...typo.caption, color: colors.muted2 },
  total: { ...typo.captionStrong, color: colors.navy },
});
