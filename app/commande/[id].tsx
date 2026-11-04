import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LivePulse, PopOnChange } from '@/components/motion';
import { EmptyState } from '@/components/states';
import { BackButton, OutlineButton, PrimaryButton } from '@/components/ui';
import { formatFcfa } from '@/constants/data';
import { colors, motion, radii, shadow, typo } from '@/constants/theme';
import { useOrders } from '@/context/OrdersContext';
import { commerceApi, orderSteps, type OrderDto } from '@/features/commerce/api';
import { payInBrowser } from '@/features/payments/checkout';
import { ApiError } from '@/lib/api';
import { haptics } from '@/lib/haptics';

const STATUS_ICON = { placed: 'receipt-outline', accepted: 'flame', ready: 'bicycle', completed: 'checkmark-circle' } as const;
const ENDED: Record<string, { icon: keyof typeof Ionicons.glyphMap; title: string }> = {
  refused: { icon: 'close-circle', title: 'Commande refusée' },
  cancelled: { icon: 'close-circle', title: 'Commande annulée' },
  expired: { icon: 'time-outline', title: 'Paiement non terminé' },
};

// Order tracking: where the order stands, what's in it, and how to reach the business. Read again while it moves.
export default function CommandeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orders, upsert } = useOrders();
  const [fetched, setFetched] = useState<OrderDto | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const known = orders.find((o) => o.id === id);
  // The list refreshes while an order moves; this screen also reads it when shown (a push may have opened it).
  const order = known && fetched ? (Date.parse(known.history.at(-1)?.at ?? '0') >= Date.parse(fetched.history.at(-1)?.at ?? '0') ? known : fetched) : (known ?? fetched);
  const home = () => router.dismissTo('/(tabs)');
  const back = () => (router.canGoBack() ? router.back() : home());

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      commerceApi.myOrder(id).then(
        (o) => {
          setFetched(o);
          upsert(o);
        },
        (err) => err instanceof ApiError && err.status === 404 && setMissing(true),
      );
    }, [id, upsert]),
  );

  // Felt as well as seen: a tick at each step, a success buzz when it's ready or done.
  const status = order?.status;
  const prev = useRef(status);
  useEffect(() => {
    if (status && prev.current && status !== prev.current) {
      if (status === 'ready' || status === 'completed') haptics.success();
      else haptics.select();
    }
    prev.current = status;
  }, [status]);

  if (!order) {
    return (
      <SafeAreaView style={styles.safe}>
        <Header onBack={back} />
        {missing ? <EmptyState icon="receipt-outline" title="Commande introuvable" /> : <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />}
      </SafeAreaView>
    );
  }

  const steps = orderSteps(order.mode);
  const current = steps.findIndex((s) => s.key === order.status);
  const step = steps[current];
  const done = order.status === 'completed';
  const ended = ENDED[order.status];
  const pending = order.status === 'pending_payment';

  const run = async (action: () => Promise<OrderDto>, title: string) => {
    setBusy(true);
    try {
      const o = await action();
      setFetched(o);
      upsert(o);
    } catch (err) {
      Alert.alert(title, err instanceof ApiError ? err.message : 'Réessaie dans un instant.');
    } finally {
      setBusy(false);
    }
  };
  const resume = () =>
    order.payment &&
    run(async () => {
      await payInBrowser(order.payment!);
      return commerceApi.myOrder(order.id);
    }, 'Paiement impossible');
  const cancel = () =>
    Alert.alert('Annuler la commande ?', `Tu es remboursé de ${formatFcfa(order.total)} sur ton numéro.`, [
      { text: 'Garder', style: 'cancel' },
      { text: 'Annuler la commande', style: 'destructive', onPress: () => run(() => commerceApi.cancel(order.id), 'Annulation impossible') },
    ]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Header onBack={back} code={order.code} />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, done && { backgroundColor: colors.success }, (ended || pending) && { backgroundColor: ended ? colors.muted2 : colors.warning }]} accessibilityLiveRegion="polite">
          <View style={styles.heroIcon}>
            <PopOnChange id={order.status}>
              <Ionicons
                name={ended ? ended.icon : pending ? 'card-outline' : order.mode === 'pickup' && order.status === 'ready' ? 'storefront' : STATUS_ICON[order.status as keyof typeof STATUS_ICON]}
                size={28}
                color="#fff"
              />
            </PopOnChange>
          </View>
          <Text style={styles.heroTitle}>{ended ? ended.title : pending ? 'Paiement à terminer' : step?.title}</Text>
          <Text style={styles.heroText}>
            {order.business.name} ·{' '}
            {order.status === 'refused'
              ? `${order.refusal ?? ''} Tu es remboursé.`
              : order.status === 'cancelled'
                ? 'Tu es remboursé sur ton numéro.'
                : ended
                  ? 'Rien n’a été débité.'
                  : pending
                    ? 'La commande part au commerce dès le paiement.'
                    : step?.detail}
          </Text>
          {order.mode === 'pickup' && !ended && !pending && (
            // At the counter: the business scans it (or types the code) to hand the order over.
            <View style={styles.codeBox}>
              <View style={styles.qr}>
                <QRCode value={`UGBCMD:${order.code}`} size={132} color={colors.navy} backgroundColor="#fff" ecl="M" />
              </View>
              <Text style={styles.codeLabel}>Montre ce code au comptoir</Text>
              <Text style={styles.codeValue}>{order.code}</Text>
            </View>
          )}
        </View>

        {pending && order.payment && <PrimaryButton label={`Payer ${formatFcfa(order.total)}`} loading={busy} onPress={resume} />}

        {!ended && !pending && (
          <View style={[styles.card, shadow.card]}>
            {steps.map((s, i) => {
              const reached = i <= current;
              const now = i === current && !done;
              return (
                <View key={s.key} style={styles.step}>
                  <View style={styles.rail}>
                    <View>
                      {now && <LivePulse color={colors.accent} size={22} />}
                      <View style={[styles.dot, reached && styles.dotOn, now && styles.dotNow]}>{reached && <Ionicons name="checkmark" size={12} color="#fff" />}</View>
                    </View>
                    {i < steps.length - 1 && (
                      <View style={styles.line}>
                        <LineFill on={i < current} />
                      </View>
                    )}
                  </View>
                  <View style={{ flex: 1, paddingBottom: i < steps.length - 1 ? 18 : 0 }}>
                    <Text style={[styles.stepTitle, !reached && { color: colors.muted2 }]}>{s.title}</Text>
                    {now && <Text style={styles.stepDetail}>{s.detail}</Text>}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={[styles.card, shadow.card, { gap: 12 }]}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{order.mode === 'delivery' ? 'Livraison' : 'À récupérer'}</Text>
              <Text style={styles.value}>{order.mode === 'delivery' ? [order.zoneLabel, order.address].filter(Boolean).join(' · ') : order.business.address}</Text>
            </View>
            <Pressable
              style={styles.call}
              onPress={() => Linking.openURL(`tel:+221${order.business.phone.replace(/\s/g, '')}`)}
              accessibilityRole="button"
              accessibilityLabel={`Appeler ${order.business.name}`}>
              <Ionicons name="call-outline" size={18} color={colors.primary} />
            </Pressable>
          </View>
          {order.note && <Text style={styles.muted}>Note : {order.note}</Text>}
          <View style={styles.divider} />
          {order.lines.map((l) => (
            <View key={l.itemId} style={styles.rowBetween}>
              <Text style={styles.item}>
                {l.qty} × {l.name}
              </Text>
              <Text style={styles.itemPrice}>{formatFcfa(l.qty * l.price)}</Text>
            </View>
          ))}
          {order.deliveryFee > 0 && (
            <View style={styles.rowBetween}>
              <Text style={styles.muted}>Livraison</Text>
              <Text style={styles.muted}>{formatFcfa(order.deliveryFee)}</Text>
            </View>
          )}
          <View style={styles.divider} />
          <View style={styles.rowBetween}>
            <Text style={styles.total}>{order.refunded ? 'Total · remboursé' : 'Total payé'}</Text>
            <Text style={styles.totalValue}>{formatFcfa(order.total)}</Text>
          </View>
        </View>

        {order.status === 'placed' && (
          <Pressable onPress={cancel} disabled={busy} style={styles.cancel} accessibilityRole="button">
            <Text style={styles.cancelText}>Annuler la commande</Text>
          </Pressable>
        )}
        <OutlineButton label="Retour à l’accueil" onPress={home} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ onBack, code }: { onBack: () => void; code?: string }) {
  return (
    <View style={styles.head}>
      <BackButton onPress={onBack} />
      <View style={{ alignItems: 'center' }}>
        <Text style={styles.h1}>Ma commande</Text>
        {code && <Text style={styles.code}>n° {code}</Text>}
      </View>
      <View style={{ width: 44 }} />
    </View>
  );
}

/** The rail between two steps fills top to bottom when the next step is reached. */
function LineFill({ on }: { on: boolean }) {
  const h = useSharedValue(0);
  useEffect(() => {
    h.set(withTiming(on ? 100 : 0, { duration: motion.slow }));
  }, [on, h]);
  const fill = useAnimatedStyle(() => ({ height: `${h.get()}%` }));
  return <Animated.View style={[styles.lineFill, fill]} />;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 },
  h1: { ...typo.h3, color: colors.navy },
  code: { ...typo.caption, color: colors.muted2 },
  body: { padding: 20, gap: 14, paddingBottom: 32 },
  hero: { backgroundColor: colors.primary, borderRadius: radii.lg, padding: 20, alignItems: 'center', gap: 6 },
  heroIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  heroTitle: { ...typo.h2, color: '#fff' },
  heroText: { ...typo.body, color: 'rgba(255,255,255,0.85)', textAlign: 'center' },
  note: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: radii.md, backgroundColor: colors.warningBg },
  noteText: { ...typo.small, flex: 1, color: colors.warningText, lineHeight: 18 },
  card: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 16 },
  step: { flexDirection: 'row', gap: 12 },
  rail: { alignItems: 'center', width: 22 },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  dotOn: { backgroundColor: colors.success, borderColor: colors.success },
  dotNow: { backgroundColor: colors.accent, borderColor: colors.accent },
  line: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 2 },
  lineFill: { width: '100%', backgroundColor: colors.success },
  stepTitle: { ...typo.title, color: colors.navy, marginTop: 1 },
  stepDetail: { ...typo.small, color: colors.muted2, marginTop: 2 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  label: { ...typo.caption, color: colors.muted2 },
  value: { ...typo.title, color: colors.navy, marginTop: 1 },
  call: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  muted: { ...typo.small, color: colors.muted2 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  item: { ...typo.body, flex: 1, color: colors.text },
  itemPrice: { ...typo.bodyStrong, color: colors.text },
  total: { ...typo.title, color: colors.navy },
  totalValue: { ...typo.h3, color: colors.navy },
  codeBox: { marginTop: 10, alignItems: 'center', gap: 4, paddingHorizontal: 18, paddingVertical: 12, borderRadius: radii.lg, backgroundColor: 'rgba(255,255,255,0.18)' },
  qr: { padding: 10, borderRadius: radii.md, backgroundColor: '#fff', marginBottom: 6 },
  codeLabel: { ...typo.caption, color: 'rgba(255,255,255,0.85)' },
  codeValue: { fontSize: 24, fontWeight: '900', letterSpacing: 3, color: '#fff' },
  cancel: { alignSelf: 'center', minHeight: 44, justifyContent: 'center' },
  cancelText: { ...typo.bodyStrong, color: colors.dangerText },
});
