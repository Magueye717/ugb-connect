import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewInstance,
} from 'react-native';
import Animated, { LayoutAnimationConfig, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fadeIn, PopOnChange } from '@/components/motion';
import { EmptyState } from '@/components/states';
import { formatFcfa } from '@/constants/data';
import { useCart } from '@/context/CartContext';
import { colors, motion, radii, shadow, typo } from '@/constants/theme';
import { commerceApi, type BusinessDetail, type ItemDto } from '@/features/commerce/api';
import { ApiError } from '@/lib/api';
import { haptics } from '@/lib/haptics';
import { openDirections } from '@/lib/maps';

const PADDING = 20;
/** Soft discs behind drinks without a photo: hibiscus, ginger, mint, water. */
const DRINK_TONES = [
  { bg: '#FDE2E7', fg: '#BE123C' },
  { bg: '#FEF3C7', fg: '#B45309' },
  { bg: '#DCFCE7', fg: '#15803D' },
  { bg: '#E0F2FE', fg: '#0369A1' },
];

/**
 * A private restaurant (menus of the day, drinks) or a shop (articles by aisle): add to the basket and order, while
 * it's open. Reached from the Manger tab (restaurants, below the public menus) and the Campus tab (shops).
 */
export default function BusinessScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [b, setB] = useState<BusinessDetail | null>(null);
  const [missing, setMissing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      commerceApi.get(id).then(setB, (err) => err instanceof ApiError && err.status === 404 && setMissing(true));
    }, [id]),
  );

  const basket = useCart();
  // Tabs jump to their section in the single scroll.
  const scroll = useRef<ScrollViewInstance>(null);
  const bodyY = useRef(0);
  const sectionY = useRef<Record<string, number>>({});
  const [tab, setTab] = useState<string | null>(null);

  if (!b) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 8, paddingHorizontal: PADDING }]}>
        <RoundButton icon="arrow-back" label="Retour" onPress={() => router.back()} />
        {missing ? <EmptyState icon="storefront-outline" title="Commerce introuvable" text="Il n’est plus proposé dans l’app." /> : <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />}
      </View>
    );
  }

  // Quantities shown here only count when the basket is for this business.
  const cart = basket.business?.id === b.id ? basket.items : {};
  const setQty = (itemId: string, qty: number) => basket.setQty({ id: b.id, name: b.name }, itemId, qty);
  const count = Object.values(cart).reduce((a, n) => a + n, 0);
  const total = b.items.reduce((sum, d) => sum + (cart[d.id] ?? 0) * d.price, 0);
  const isShop = b.kind === 'shop';
  // Restaurants: dishes then drinks. Shops: one section per aisle.
  const sections: { key: string; title: string; items: ItemDto[]; grid: boolean }[] = isShop
    ? [...new Set(b.items.map((i) => i.category ?? 'Articles'))].map((c) => ({ key: c, title: c, items: b.items.filter((i) => (i.category ?? 'Articles') === c), grid: false }))
    : [
        { key: 'menu', title: 'Menus du jour', items: b.items.filter((i) => i.section === 'menu'), grid: false },
        { key: 'drink', title: 'Boissons', items: b.items.filter((i) => i.section === 'drink'), grid: true },
      ].filter((s) => s.items.length);
  const current = tab ?? sections[0]?.key;
  const goTo = (key: string) => {
    setTab(key);
    scroll.current?.scrollTo({ y: bodyY.current + (sectionY.current[key] ?? 0) - 12, animated: true });
  };
  const location = [b.address, b.campusLabel].filter(Boolean).join(' · ');

  return (
    <View style={styles.root}>
      <ScrollView ref={scroll} contentContainerStyle={{ paddingBottom: count ? 120 : 48 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { backgroundColor: colors.primarySoft }]}>
          {b.photo ? <Image source={{ uri: b.photo }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} /> : <Ionicons name={isShop ? 'storefront' : 'restaurant'} size={56} color={colors.primary} />}
          <View style={[styles.heroBar, { top: insets.top + 8 }]}>
            <RoundButton icon="arrow-back" label="Retour" onPress={() => router.back()} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {b.location && <RoundButton icon="navigate-outline" label={`Itinéraire vers ${b.name}`} onPress={() => openDirections(b.location!, b.name)} />}
              <RoundButton icon="call-outline" label={`Appeler ${b.name}`} onPress={() => Linking.openURL(`tel:+221${b.phone.replace(/\s/g, '')}`)} />
            </View>
          </View>
        </View>

        <View style={[styles.infoCard, shadow.raised]}>
          <Text style={styles.name}>{b.name}</Text>
          <Text style={styles.sub}>
            {b.specialty}
            {location ? ` · ${location}` : ''}
          </Text>
          {!!b.description && <Text style={[styles.sub, { marginTop: 6 }]}>{b.description}</Text>}
          <View style={[styles.tag, styles.statusTag, { backgroundColor: b.open ? colors.successBg : colors.bg }]}>
            <View style={[styles.dot, { backgroundColor: b.open ? colors.success : colors.muted }]} />
            <Text style={[styles.tagText, { color: b.open ? colors.successText : colors.muted2 }]}>{b.statusLabel}</Text>
          </View>
          <View style={styles.metaLine}>
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={14} color={colors.muted2} />
              <Text style={styles.metaText}>{b.hours}</Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name={b.deliveryFee !== null ? 'bicycle-outline' : 'walk-outline'} size={15} color={colors.primary} />
              <Text style={[styles.metaText, { color: colors.primary, fontWeight: '600' }]}>
                {b.deliveryFee === null ? 'À emporter' : b.deliveryFee ? `Livraison ${formatFcfa(b.deliveryFee)}` : 'Livraison gratuite'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.body} onLayout={(e) => (bodyY.current = e.nativeEvent.layout.y)}>
          {!b.open && (
            <View style={styles.closed}>
              <Ionicons name="moon-outline" size={16} color={colors.warningText} />
              <Text style={styles.closedText}>{b.statusLabel}. Tu peux consulter {isShop ? 'les articles' : 'le menu'}, la commande ouvre avec le service.</Text>
            </View>
          )}
          {!b.items.length && <EmptyState icon={isShop ? 'pricetags-outline' : 'restaurant-outline'} title={isShop ? 'Pas encore d’articles' : 'Pas de menu aujourd’hui'} text="Repasse un peu plus tard." />}

          {sections.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
              {sections.map((s) => (
                <Tab key={s.key} label={`${s.key === 'menu' ? 'Plats' : s.title} · ${s.items.length}`} on={current === s.key} onPress={() => goTo(s.key)} />
              ))}
            </ScrollView>
          )}

          {sections.map((s) => (
            <View key={s.key} style={styles.section} onLayout={(e) => (sectionY.current[s.key] = e.nativeEvent.layout.y)}>
              <Text style={styles.sectionTitle}>{s.title}</Text>
              {s.grid ? (
                // Drinks: a row of small round cards to add alongside the dish, scrolling edge to edge.
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.drinksRow} contentContainerStyle={styles.drinksContent}>
                  {s.items.map((d, i) => {
                    const tone = DRINK_TONES[i % DRINK_TONES.length]!;
                    const qty = cart[d.id] ?? 0;
                    return (
                      <View key={d.id} style={[styles.drink, shadow.card, qty > 0 && styles.drinkOn]}>
                        <View style={[styles.drinkCircle, { backgroundColor: tone.bg }]}>
                          {d.photo ? <Image source={{ uri: d.photo }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} /> : <Ionicons name="wine" size={20} color={tone.fg} />}
                        </View>
                        <View style={styles.drinkInfo}>
                          <Text style={styles.drinkName} numberOfLines={1}>
                            {d.name}
                          </Text>
                          <Text style={styles.drinkPrice} numberOfLines={1}>
                            {formatFcfa(d.price)}
                            {!!d.detail && <Text style={styles.drinkDetail}> · {d.detail.split(' · ').pop()}</Text>}
                          </Text>
                        </View>
                        {qty > 0 ? (
                          <View style={styles.drinkStepper}>
                            <Pressable onPress={() => (haptics.select(), setQty(d.id, qty - 1))} hitSlop={8} style={styles.drinkStep} accessibilityLabel={`Retirer un ${d.name}`}>
                              <Ionicons name={qty === 1 ? 'trash-outline' : 'remove'} size={13} color={colors.navy} />
                            </Pressable>
                            <Text style={styles.drinkQty}>{qty}</Text>
                            <Pressable onPress={() => (haptics.select(), setQty(d.id, qty + 1))} hitSlop={8} style={[styles.drinkStep, styles.drinkPlus]} accessibilityLabel={`Ajouter un ${d.name}`}>
                              <Ionicons name="add" size={13} color="#fff" />
                            </Pressable>
                          </View>
                        ) : (
                          <Pressable onPress={() => (haptics.select(), setQty(d.id, 1))} disabled={!b.open} hitSlop={8} style={[styles.drinkStep, styles.drinkPlus, !b.open && { opacity: 0.4 }]} accessibilityLabel={`Ajouter ${d.name}`}>
                            <Ionicons name="add" size={15} color="#fff" />
                          </Pressable>
                        )}
                      </View>
                    );
                  })}
                </ScrollView>
              ) : (
                s.items.map((m) => (
                  <View key={m.id} style={[styles.dish, shadow.card, m.soldOut && { opacity: 0.55 }]}>
                    <Photo item={m} icon={isShop ? 'pricetag-outline' : 'restaurant-outline'} style={styles.dishPhoto} />
                    <View style={styles.dishInfo}>
                      <Text style={styles.dishName} numberOfLines={1}>
                        {m.name}
                      </Text>
                      <Text style={styles.muted} numberOfLines={2}>
                        {m.soldOut ? 'Épuisé' : m.stock !== null && m.stock <= 5 ? `Plus que ${m.stock}` : m.detail}
                      </Text>
                      <View style={styles.dishBottom}>
                        <Text style={styles.price}>{formatFcfa(m.price)}</Text>
                        <QtyControl qty={cart[m.id] ?? 0} disabled={!b.open || m.soldOut} max={m.stock ?? undefined} name={m.name} onChange={(q) => setQty(m.id, q)} />
                      </View>
                    </View>
                  </View>
                ))
              )}
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Slides up with the first item, down when the basket empties; already there when the screen opens. */}
      <LayoutAnimationConfig skipEntering>
        {count > 0 && (
          <Animated.View
            entering={SlideInDown.springify().damping(motion.glide.damping).stiffness(motion.glide.stiffness)}
            exiting={SlideOutDown.duration(motion.base)}
            style={[styles.cartWrap, { paddingBottom: insets.bottom + 12 }]}>
            <Pressable style={styles.cart} onPress={() => router.push('/panier')} accessibilityRole="button">
              {/* Bounces on each change: the item went into the basket. */}
              <PopOnChange id={count}>
                <Ionicons name="cart-outline" size={18} color="#fff" />
              </PopOnChange>
              <Text style={styles.cartText}>
                Voir le panier · {count} article{count > 1 ? 's' : ''} · {formatFcfa(total)}
              </Text>
            </Pressable>
          </Animated.View>
        )}
      </LayoutAnimationConfig>
    </View>
  );
}

function RoundButton({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.round, pressed && { opacity: 0.8 }]}
      accessibilityRole="button"
      accessibilityLabel={label}>
      <Ionicons name={icon} size={20} color={colors.navy} />
    </Pressable>
  );
}

function Tab({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.tab, on && styles.tabOn]} accessibilityRole="tab" accessibilityState={{ selected: on }}>
      <Text style={[styles.tabText, on && styles.tabTextOn]}>{label}</Text>
    </Pressable>
  );
}

/** Item photo, or an icon on a tinted tile while the business hasn't sent one. */
function Photo({ item, icon, style }: { item: ItemDto; icon: keyof typeof Ionicons.glyphMap; style: object }) {
  return (
    <View style={[style, { backgroundColor: colors.primarySoft }]}>
      {item.photo ? <Image source={{ uri: item.photo }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} /> : <Ionicons name={icon} size={28} color={colors.primary} />}
    </View>
  );
}

function QtyControl(props: QtyProps) {
  return (
    <LayoutAnimationConfig skipEntering>
      <QtyInner {...props} />
    </LayoutAnimationConfig>
  );
}

type QtyProps = {
  qty: number;
  disabled: boolean;
  /** Shops: no more than the stock left. */
  max?: number;
  name: string;
  /** Full-width control on its own row. */
  block?: boolean;
  onChange: (qty: number) => void;
};

function QtyInner({
  qty,
  disabled,
  max,
  name,
  block,
  onChange,
}: QtyProps) {
  const change = (q: number) => {
    haptics.select();
    onChange(q);
  };
  // "Ajouter" turns into the stepper with a short fade; items already in the basket show it straight away.
  if (qty) {
    return (
      <Animated.View entering={fadeIn} style={[styles.stepper, block && styles.stepperBlock]}>
        <Pressable onPress={() => change(qty - 1)} style={[styles.stepMinus, block && { backgroundColor: colors.card }]} hitSlop={8} accessibilityLabel={`Retirer un ${name}`}>
          <Ionicons name="remove" size={16} color={colors.navy} />
        </Pressable>
        <PopOnChange id={qty}>
          <Text style={styles.qty}>{qty}</Text>
        </PopOnChange>
        <Pressable onPress={() => change(qty + 1)} disabled={max !== undefined && qty >= max} style={[styles.stepPlus, max !== undefined && qty >= max && { opacity: 0.4 }]} hitSlop={8} accessibilityLabel={`Ajouter un ${name}`}>
          <Ionicons name="add" size={16} color="#fff" />
        </Pressable>
      </Animated.View>
    );
  }
  return (
    <Pressable
      onPress={() => change(1)}
      disabled={disabled}
      style={[styles.add, block && styles.addBlock, disabled && { opacity: 0.4 }]}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`Ajouter ${name}`}>
      <Ionicons name="add" size={14} color={colors.primary} />
      <Text style={styles.addText}>Ajouter</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  hero: { height: 240, alignItems: 'center', justifyContent: 'center' },
  heroBar: { position: 'absolute', left: PADDING, right: PADDING, flexDirection: 'row', justifyContent: 'space-between' },
  round: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  // Overlaps the photo a little so the page reads as one piece.
  infoCard: {
    marginTop: -28,
    marginHorizontal: PADDING,
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 16,
  },
  name: { ...typo.h2, color: colors.navy },
  sub: { ...typo.small, color: colors.muted2, marginTop: 2 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: colors.bg,
  },
  statusTag: { alignSelf: 'flex-start', marginTop: 12 },
  metaLine: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6, marginTop: 10 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { ...typo.small, color: colors.muted2 },
  tagText: { fontSize: 12, fontWeight: '600', color: colors.muted2 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  body: { paddingHorizontal: PADDING, marginTop: 16, gap: 20 },
  closed: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderRadius: radii.md,
    backgroundColor: colors.warningBg,
  },
  closedText: { ...typo.small, flex: 1, color: colors.warningText },
  tabs: { flexDirection: 'row', backgroundColor: colors.primarySoft, borderRadius: radii.pill, padding: 4, gap: 4 },
  tab: { paddingHorizontal: 16, minHeight: 38, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: colors.card, ...shadow.card },
  tabText: { ...typo.smallStrong, color: colors.muted2 },
  tabTextOn: { color: colors.navy },
  section: { gap: 12 },
  sectionTitle: { ...typo.h3, color: colors.navy },
  muted: { ...typo.caption, color: colors.muted2, marginTop: 2 },
  dish: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 10, flexDirection: 'row', gap: 12 },
  dishPhoto: { width: 100, height: 100, borderRadius: radii.md, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  dishInfo: { flex: 1, paddingVertical: 2 },
  dishName: { ...typo.title, color: colors.navy },
  dishBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: 8 },
  price: { ...typo.title, color: colors.primary },
  drinksRow: { marginHorizontal: -PADDING },
  // Room below for the cards' shadow, which a horizontal scroll would otherwise cut.
  drinksContent: { paddingHorizontal: PADDING, paddingTop: 4, paddingBottom: 14, gap: 8 },
  // One short line per drink: picture, name and price, add.
  drink: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 7, paddingRight: 9, borderRadius: radii.pill, backgroundColor: colors.card, borderWidth: 1.5, borderColor: 'transparent' },
  drinkOn: { borderColor: colors.primary },
  drinkCircle: { width: 42, height: 42, borderRadius: 21, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  drinkInfo: { maxWidth: 135 },
  drinkName: { fontSize: 13, fontWeight: '700', color: colors.navy },
  drinkPrice: { fontSize: 12, fontWeight: '700', color: colors.primary, marginTop: 1 },
  drinkDetail: { fontSize: 11, fontWeight: '400', color: colors.muted2 },
  drinkStepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  drinkStep: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  drinkPlus: { backgroundColor: colors.primary },
  drinkQty: { fontSize: 13, fontWeight: '700', color: colors.navy, minWidth: 10, textAlign: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // 32 px visible, 48 px to the touch with hitSlop.
  stepMinus: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepPlus: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qty: { fontWeight: '700', color: colors.navy, minWidth: 12, textAlign: 'center' },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 12,
    minHeight: 36,
    borderRadius: radii.pill,
  },
  // Same 32 px height in both states so the drink card doesn't jump.
  addBlock: { justifyContent: 'center', minHeight: 40, marginTop: 8 },
  stepperBlock: { justifyContent: 'space-between', minHeight: 40, marginTop: 8, paddingHorizontal: 2, borderRadius: radii.pill, backgroundColor: colors.bg },
  addText: { ...typo.captionStrong, color: colors.primary },
  cartWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: PADDING, paddingTop: 12 },
  cart: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.accent,
    minHeight: 52,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  cartText: { ...typo.bodyStrong, color: '#fff' },
});
