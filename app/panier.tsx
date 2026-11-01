import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton, Field, PrimaryButton, Segmented } from '@/components/ui';
import { formatFcfa, paymentMethods } from '@/constants/data';
import { PaymentLogo } from '@/components/PaymentLogo';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { useOrders } from '@/context/OrdersContext';
import { commerceApi, type BusinessDetail, type OrderMode } from '@/features/commerce/api';
import { payInBrowser, type PaymentMethod } from '@/features/payments/checkout';
import { ApiError } from '@/lib/api';

const METHOD: Record<string, PaymentMethod> = { wave: 'wave', om: 'orange_money' };

/** The basket: one business, delivery or pickup, paid now with Wave or Orange Money; then the order's tracking. */
export default function Panier() {
  const cart = useCart();
  const { upsert } = useOrders();
  const { user } = useAuth();
  const [b, setB] = useState<BusinessDetail | null>(null);
  const [mode, setMode] = useState<OrderMode | null>(null);
  // Pre-filled with the room given at sign-up; still editable (delivery to a friend, the BU…).
  const [address, setAddress] = useState(user?.village && user.room ? `${user.village}, chambre ${user.room}` : '');
  const [note, setNote] = useState('');
  const [payment, setPayment] = useState(paymentMethods[0].id);
  const [paying, setPaying] = useState(false);
  const businessId = cart.business?.id;

  // Prices and stock as they are now.
  useFocusEffect(
    useCallback(() => {
      if (businessId) commerceApi.get(businessId).then(setB, () => undefined);
    }, [businessId]),
  );

  const back = () => (router.canGoBack() ? router.back() : router.replace({ pathname: '/(tabs)/resto' }));

  if (!cart.count || !cart.business) {
    return (
      <SafeAreaView style={styles.safe}>
        <Header onBack={back} />
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Ionicons name="bag-handle-outline" size={32} color={colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>Ton panier est vide</Text>
          <Text style={styles.emptyText}>Choisis un restaurant ou une boutique et ajoute des articles.</Text>
          <PrimaryButton label="Voir les restaurants" onPress={() => router.dismissTo({ pathname: '/(tabs)/resto' })} style={{ alignSelf: 'stretch' }} />
        </View>
      </SafeAreaView>
    );
  }
  if (!b) {
    return (
      <SafeAreaView style={styles.safe}>
        <Header onBack={back} />
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  const canDeliver = b.deliveryFee !== null;
  const chosen: OrderMode = mode ?? (canDeliver ? 'delivery' : 'pickup');
  const lines = b.items.filter((i) => cart.items[i.id]).map((i) => ({ ...i, qty: cart.items[i.id]! }));
  const gone = Object.keys(cart.items).filter((itemId) => !b.items.some((i) => i.id === itemId));
  const subtotal = lines.reduce((sum, l) => sum + l.qty * l.price, 0);
  const delivery = chosen === 'delivery';
  const fee = delivery ? (b.deliveryFee ?? 0) : 0;
  const feeLabel = b.deliveryFee ? `Livraison · ${formatFcfa(b.deliveryFee)}` : 'Livraison gratuite';
  const total = subtotal + fee;
  const blocker = !b.open ? b.statusLabel : gone.length ? 'Retire les articles indisponibles' : delivery && !address.trim() ? 'Indique où te livrer' : null;
  const setQty = (itemId: string, qty: number) => cart.setQty({ id: b.id, name: b.name }, itemId, qty);

  const order = async () => {
    setPaying(true);
    try {
      const { order: placed, payment: pay } = await commerceApi.order(b.id, {
        lines: lines.map((l) => ({ itemId: l.id, qty: l.qty })),
        mode: chosen,
        address: delivery ? address.trim() : null,
        note: note.trim() || null,
        method: METHOD[payment] ?? 'wave',
      });
      upsert(placed);
      cart.clear();
      const paid = await payInBrowser(pay);
      upsert(await commerceApi.myOrder(placed.id));
      router.replace(`/commande/${placed.id}`);
      if (paid.status !== 'succeeded') Alert.alert('Paiement en attente', 'Ta commande part au commerce dès que le paiement est confirmé. Tu peux le reprendre depuis le suivi.');
    } catch (err) {
      Alert.alert('Commande impossible', err instanceof ApiError ? err.message : 'Réessaie dans un instant.');
    } finally {
      setPaying(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Header onBack={back} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={[styles.card, styles.resto, shadow.card]}>
            <View style={[styles.restoPhoto, { backgroundColor: colors.primarySoft }]}>
              {b.photo ? <Image source={{ uri: b.photo }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Ionicons name={b.kind === 'shop' ? 'storefront' : 'restaurant'} size={22} color={colors.primary} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.restoName} numberOfLines={1}>
                {b.name}
              </Text>
              <View style={styles.status}>
                <View style={[styles.dot, { backgroundColor: b.open ? colors.success : colors.muted }]} />
                <Text style={[styles.statusText, { color: b.open ? colors.successText : colors.muted2 }]}>{b.statusLabel}</Text>
              </View>
            </View>
          </View>

          <Text style={styles.section}>Articles · {cart.count}</Text>
          <View style={[styles.card, shadow.card, { paddingVertical: 4 }]}>
            {lines.map((l, i) => (
              <View key={l.id} style={[styles.line, i > 0 && styles.lineDivider]}>
                <View style={[styles.thumb, { backgroundColor: colors.primarySoft }]}>
                  {l.photo ? <Image source={{ uri: l.photo }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Ionicons name={b.kind === 'shop' ? 'pricetag' : 'fast-food'} size={18} color={colors.primary} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lineName} numberOfLines={1}>
                    {l.name}
                  </Text>
                  <Text style={styles.linePrice}>{formatFcfa(l.qty * l.price)}</Text>
                </View>
                <View style={styles.stepper}>
                  <Pressable onPress={() => setQty(l.id, l.qty - 1)} style={styles.stepMinus} hitSlop={8} accessibilityLabel={l.qty === 1 ? `Retirer ${l.name} du panier` : `Retirer un ${l.name}`}>
                    <Ionicons name={l.qty === 1 ? 'trash-outline' : 'remove'} size={15} color={l.qty === 1 ? colors.danger : colors.navy} />
                  </Pressable>
                  <Text style={styles.qty}>{l.qty}</Text>
                  <Pressable
                    onPress={() => setQty(l.id, l.qty + 1)}
                    disabled={l.stock !== null && l.qty >= l.stock}
                    style={[styles.stepPlus, l.stock !== null && l.qty >= l.stock && { opacity: 0.4 }]}
                    hitSlop={8}
                    accessibilityLabel={`Ajouter un ${l.name}`}>
                    <Ionicons name="add" size={15} color="#fff" />
                  </Pressable>
                </View>
              </View>
            ))}
            {gone.length > 0 && (
              <Pressable style={[styles.line, styles.lineDivider]} onPress={() => gone.forEach((itemId) => setQty(itemId, 0))} accessibilityRole="button">
                <Ionicons name="alert-circle-outline" size={20} color={colors.dangerText} />
                <Text style={[styles.addMore, { color: colors.dangerText, flex: 1 }]}>
                  {gone.length} article{gone.length > 1 ? 's' : ''} plus disponible{gone.length > 1 ? 's' : ''} · retirer
                </Text>
              </Pressable>
            )}
            <Pressable style={[styles.line, styles.lineDivider]} onPress={() => router.navigate(`/resto/${b.id}`)} accessibilityRole="button">
              <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
              <Text style={styles.addMore}>Ajouter des articles</Text>
            </Pressable>
          </View>

          <Text style={styles.section}>Récupération</Text>
          {canDeliver ? (
            <Segmented<OrderMode>
              options={[
                { value: 'delivery', label: feeLabel },
                { value: 'pickup', label: 'À emporter' },
              ]}
              value={chosen}
              onChange={setMode}
            />
          ) : (
            <View style={styles.info}>
              <Ionicons name="walk-outline" size={16} color={colors.muted2} />
              <Text style={styles.infoText}>À emporter uniquement · {b.address}</Text>
            </View>
          )}
          {delivery ? (
            <Field icon="location-outline" placeholder="Ex. Village E, pavillon C, chambre 12" value={address} onChangeText={setAddress} autoCapitalize="sentences" accessibilityLabel="Adresse de livraison" maxLength={120} />
          ) : (
            canDeliver && (
              <View style={styles.info}>
                <Ionicons name="storefront-outline" size={16} color={colors.muted2} />
                <Text style={styles.infoText}>À récupérer sur place · {b.address}</Text>
              </View>
            )
          )}
          <Field
            icon="chatbubble-ellipses-outline"
            placeholder={b.kind === 'restaurant' ? 'Note pour le restaurant (ex. sans piment)' : 'Note pour la boutique'}
            value={note}
            onChangeText={setNote}
            autoCapitalize="sentences"
            maxLength={200}
            accessibilityLabel="Note"
          />

          <Text style={styles.section}>Paiement</Text>
          {paymentMethods.map((m) => {
            const on = m.id === payment;
            return (
              <Pressable key={m.id} onPress={() => setPayment(m.id)} style={[styles.card, styles.payment, on && styles.paymentOn]} accessibilityRole="radio" accessibilityState={{ checked: on }}>
                <PaymentLogo method={m} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.payName}>{m.name}</Text>
                  <Text style={styles.muted}>Remboursé si la commande est refusée</Text>
                </View>
                {on ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} /> : <View style={styles.radio} />}
              </Pressable>
            );
          })}

          <View style={[styles.card, shadow.card, { gap: 8 }]}>
            <RecapRow k="Sous-total" v={formatFcfa(subtotal)} />
            {delivery && <RecapRow k="Livraison" v={fee ? formatFcfa(fee) : 'Gratuite'} />}
            <View style={styles.divider} />
            <View style={styles.recapRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{formatFcfa(total)}</Text>
            </View>
          </View>

          <PrimaryButton label={blocker ?? `Payer ${formatFcfa(total)} et commander`} onPress={order} disabled={!!blocker || paying} loading={paying} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.head}>
      <BackButton onPress={onBack} />
      <Text style={styles.h1}>Mon panier</Text>
      <View style={{ width: 44 }} />
    </View>
  );
}

function RecapRow({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.recapRow}>
      <Text style={styles.recapKey}>{k}</Text>
      <Text style={styles.recapValue}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 },
  h1: { ...typo.h3, color: colors.navy },
  body: { padding: 20, gap: 12, paddingBottom: 40 },
  card: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 14 },
  section: { ...typo.title, color: colors.navy, marginTop: 6 },
  muted: { ...typo.caption, color: colors.muted2, marginTop: 1 },
  resto: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  restoPhoto: { width: 52, height: 52, borderRadius: radii.sm, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  restoName: { ...typo.title, color: colors.navy },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { ...typo.captionStrong },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  lineDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  thumb: { width: 48, height: 48, borderRadius: radii.sm, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  lineName: { ...typo.bodyStrong, color: colors.text },
  linePrice: { ...typo.smallStrong, color: colors.primary, marginTop: 2 },
  addMore: { ...typo.bodyStrong, color: colors.primary },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // 32 px visible, 48 px to the touch with hitSlop.
  stepMinus: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  stepPlus: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  qty: { fontWeight: '700', color: colors.navy, minWidth: 14, textAlign: 'center' },
  info: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  infoText: { ...typo.small, flex: 1, color: colors.muted2 },
  payment: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: 'transparent' },
  paymentOn: { borderColor: colors.primary },
  payName: { ...typo.title, color: colors.navy },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border },
  recapRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recapKey: { ...typo.body, color: colors.muted2 },
  recapValue: { ...typo.bodyStrong, color: colors.text },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 2 },
  totalLabel: { ...typo.title, color: colors.navy },
  totalValue: { ...typo.h3, color: colors.primary },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  emptyTitle: { ...typo.h3, color: colors.navy },
  emptyText: { ...typo.body, color: colors.muted2, textAlign: 'center', marginBottom: 10 },
});
