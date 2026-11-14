import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SpaceBar } from '@/components/SpaceBar';
import { EmptyState, SkeletonCard } from '@/components/states';
import { Segmented, StatusChip, Toggle } from '@/components/ui';
import { formatFcfa } from '@/constants/data';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { commerceApi, nextStep, ORDER_STATUS_LABEL, type BusinessDto, type OrderDto, type SalesDto } from '@/features/commerce/api';
import { ApiError } from '@/lib/api';

/** How often the list is read again while it's on screen (the push also announces each new order). */
const REFRESH_MS = 20_000;
const fail = (title: string) => (err: unknown) => Alert.alert(title, err instanceof ApiError ? err.message : 'Réessaie dans un instant.');
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const time = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** Incoming orders: the new ones first, one tap to move each to its next step. */
export default function Commandes() {
  const { business } = useAuth();
  const [scope, setScope] = useState<'active' | 'done'>('active');
  // Owners and managers: today's sales, one line above the orders (« Ventes » has the rest).
  const [today, setToday] = useState<SalesDto | null>(null);
  const [orders, setOrders] = useState<OrderDto[] | null>(null);
  const [profile, setProfile] = useState<BusinessDto | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const manager = !!business?.roles.some((r) => r === 'owner' || r === 'manager');
  const load = useCallback(async () => {
    if (!business) return;
    const day = todayIso();
    const [list, me, sold] = await Promise.allSettled([
      commerceApi.queue(business, scope),
      commerceApi.mine(business!),
      manager ? commerceApi.sales(business, day, day) : Promise.resolve(null),
    ]);
    if (list.status === 'fulfilled') setOrders(list.value.items);
    else setOrders((o) => o ?? []);
    if (me.status === 'fulfilled') setProfile(me.value);
    if (sold.status === 'fulfilled') setToday(sold.value);
  }, [business, scope, manager]);

  useFocusEffect(
    useCallback(() => {
      load();
      const timer = setInterval(load, REFRESH_MS);
      return () => clearInterval(timer);
    }, [load]),
  );

  if (!business) return null;
  const canManage = manager;

  const advance = async (o: OrderDto) => {
    const next = nextStep(o);
    if (!next) return;
    setBusy(o.id);
    try {
      await commerceApi.step(business, o.id, next.step);
      await load();
    } catch (err) {
      fail('Action impossible')(err);
    } finally {
      setBusy(null);
    }
  };

  const pause = (accepting: boolean) =>
    commerceApi.updateMine(business, { acceptingOrders: accepting }).then(setProfile, fail('Changement impossible'));

  const newCount = orders?.filter((o) => o.status === 'placed').length ?? 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <SpaceBar>
        {/* Orders picked up at the counter: scan the client's QR or type their code. */}
        <Pressable style={styles.scan} onPress={() => router.push('/remise')} accessibilityRole="button" accessibilityLabel="Remettre une commande">
          <Ionicons name="qr-code-outline" size={18} color="#fff" />
          <Text style={styles.scanText}>Remettre</Text>
        </Pressable>
      </SpaceBar>
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => (setRefreshing(true), load().finally(() => setRefreshing(false)))} />}>
        {profile && (
          <View style={[styles.card, shadow.card, styles.row]}>
            <View style={[styles.dot, { backgroundColor: profile.open ? colors.success : colors.muted }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{profile.acceptingOrders ? 'Commandes ouvertes' : 'Commandes en pause'}</Text>
              <Text style={styles.muted}>{profile.statusLabel} · {profile.hours}</Text>
            </View>
            {canManage && <Toggle value={profile.acceptingOrders} onValueChange={pause} accessibilityLabel="Accepter les commandes" />}
          </View>
        )}

        {/* Today at a glance; « Ventes » for the week, the month, chosen days. */}
        {canManage && today && (
          <Pressable style={[styles.card, shadow.card, styles.row]} onPress={() => router.push('/ventes')} accessibilityRole="button" accessibilityLabel={`Ventes du jour : ${formatFcfa(today.revenue)}, ${today.orders} commandes. Voir mes ventes`}>
            <Ionicons name="stats-chart-outline" size={18} color={colors.successText} />
            <Text style={[styles.cardTitle, { flex: 1 }]} numberOfLines={1}>
              Aujourd’hui · {formatFcfa(today.revenue)} · {today.orders} commande{today.orders > 1 ? 's' : ''}
            </Text>
            <Text style={styles.salesLink}>Mes ventes</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </Pressable>
        )}

        <Segmented
          options={[
            { value: 'active', label: newCount ? `En cours · ${newCount} nouvelle${newCount > 1 ? 's' : ''}` : 'En cours' },
            { value: 'done', label: 'Terminées' },
          ]}
          value={scope}
          onChange={(v) => {
            setScope(v);
            setOrders(null);
          }}
        />

        {!orders && (<><SkeletonCard /><SkeletonCard /></>)}
        {orders?.length === 0 && (
          <EmptyState
            icon={scope === 'active' ? 'receipt-outline' : 'time-outline'}
            title={scope === 'active' ? 'Aucune commande en cours' : 'Rien ces deux derniers jours'}
            text={scope === 'active' ? 'Les nouvelles commandes apparaissent ici, avec une notification.' : undefined}
          />
        )}

        {orders?.map((o) => {
          const s = ORDER_STATUS_LABEL[o.status];
          const next = nextStep(o);
          return (
            <Pressable
              key={o.id}
              style={({ pressed }) => [styles.card, shadow.card, o.status === 'placed' && styles.cardNew, pressed && { opacity: 0.9 }]}
              onPress={() => router.push(`/commande-recue/${o.id}`)}
              accessibilityRole="button">
              <View style={styles.head}>
                <OrderThumb order={o} kind={business.kind} />
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={styles.row}>
                    <Text style={styles.code}>{o.code}</Text>
                    <Text style={styles.muted}>{time(o.createdAt)}</Text>
                    <View style={{ flex: 1 }} />
                    <StatusChip label={s.label} tone={s.tone} />
                  </View>
                  <Text style={styles.lines} numberOfLines={2}>
                    {o.lines.map((l) => `${l.qty} × ${l.name}`).join(', ')}
                  </Text>
                </View>
              </View>
              <View style={styles.row}>
                <Ionicons name={o.mode === 'delivery' ? 'bicycle-outline' : 'walk-outline'} size={15} color={colors.muted2} />
                <Text style={[styles.muted, { flex: 1 }]} numberOfLines={1}>
                  {o.mode === 'delivery' ? [o.zoneLabel, o.address].filter(Boolean).join(' · ') : 'À emporter'} · {o.customer?.name}
                </Text>
                {o.method === 'cash' && (
                  <View style={styles.cash}>
                    <Ionicons name="cash-outline" size={13} color={colors.successText} />
                    <Text style={styles.cashText}>Espèces</Text>
                  </View>
                )}
                <Text style={styles.total}>{formatFcfa(o.total)}</Text>
              </View>
              {o.note && <Text style={styles.note}>« {o.note} »</Text>}
              {next && (
                <Pressable style={[styles.next, o.status === 'placed' && { backgroundColor: colors.successText }]} onPress={() => advance(o)} disabled={busy === o.id} accessibilityRole="button">
                  {busy === o.id ? <ActivityIndicator color="#fff" /> : <Ionicons name={next.icon} size={18} color="#fff" />}
                  <Text style={styles.nextText}>{next.label}</Text>
                </Pressable>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

/** The order's picture: its first item with a photo, a small "+2" when there are more lines; an icon otherwise. */
function OrderThumb({ order, kind }: { order: OrderDto; kind: 'restaurant' | 'shop' }) {
  const photo = order.lines.find((l) => l.photo)?.photo;
  const more = order.lines.length - 1;
  return (
    <View style={styles.thumb}>
      {photo ? (
        <Image source={photo} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
      ) : (
        <Ionicons name={kind === 'restaurant' ? 'restaurant-outline' : 'bag-handle-outline'} size={26} color={colors.primary} />
      )}
      {more > 0 && (
        <View style={styles.more}>
          <Text style={styles.moreText}>+{more}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  salesLink: { ...typo.smallStrong, color: colors.primary },
  // A cash order: the money is collected at delivery or at the counter.
  cash: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill, backgroundColor: colors.successBg },
  cashText: { ...typo.captionStrong, color: colors.successText },
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 20, gap: 12, paddingBottom: 32 },
  sub: { ...typo.small, color: colors.muted2 },
  head: { flexDirection: 'row', gap: 12 },
  thumb: { width: 64, height: 64, borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  more: { position: 'absolute', right: 4, bottom: 4, minWidth: 24, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: 'rgba(15,27,76,0.85)', alignItems: 'center', justifyContent: 'center' },
  moreText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  scan: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 14, borderRadius: radii.pill, backgroundColor: colors.navy },
  scanText: { ...typo.smallStrong, color: '#fff' },
  card: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 14, gap: 8 },
  cardNew: { borderWidth: 2, borderColor: colors.success },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  cardTitle: { ...typo.bodyStrong, color: colors.navy },
  muted: { ...typo.caption, color: colors.muted2 },
  code: { ...typo.title, color: colors.navy, letterSpacing: 1 },
  lines: { ...typo.body, color: colors.text },
  total: { ...typo.bodyStrong, color: colors.primary },
  note: { ...typo.small, color: colors.warningText, fontStyle: 'italic' },
  next: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 46, borderRadius: radii.pill, backgroundColor: colors.primary, marginTop: 4 },
  nextText: { ...typo.bodyStrong, color: '#fff' },
});
