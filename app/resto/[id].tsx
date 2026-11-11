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

import { usePullRefresh } from '@/components/PullRefresh';
import { fadeIn, PopOnChange } from '@/components/motion';
import { PhotoGallery } from '@/components/PhotoGallery';
import { EmptyState } from '@/components/states';
import { formatFcfa } from '@/constants/data';
import { useCart } from '@/context/CartContext';
import { colors, motion, radii, shadow, typo } from '@/constants/theme';
import { commerceApi, type BusinessDetail, type ItemDto } from '@/features/commerce/api';
import { aislesFor, ItemEditor } from '@/features/commerce/CatalogEditor';
import { LikeButton } from '@/features/commerce/LikeButton';
import { InterestButton } from '@/features/commerce/InterestButton';
import { ProductSheet } from '@/features/commerce/ProductSheet';
import { ReviewsSection } from '@/features/ratings/Reviews';
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

  const load = useCallback(() => {
    if (!id) return;
    commerceApi.get(id).then(setB, (err) => err instanceof ApiError && err.status === 404 && setMissing(true));
  }, [id]);
  useFocusEffect(load);
  const pull = usePullRefresh(load);
  // Its owner or a manager, on their own page: an item to edit.
  const [editing, setEditing] = useState<ItemDto | null>(null);

  const basket = useCart();
  // Tabs jump to their section in the single scroll.
  const scroll = useRef<ScrollViewInstance>(null);
  // Where the reviews start in the page: the rating under the name scrolls there.
  const reviewsY = useRef(0);
  const bodyY = useRef(0);
  const sectionY = useRef<Record<string, number>>({});
  const [tab, setTab] = useState<string | null>(null);
  // The section filter sticks under the status bar once the page scrolls past it.
  const barY = useRef(0);
  const [barH, setBarH] = useState(0);
  const [stuck, setStuck] = useState(false);
  // The tab row scrolls sideways (a shop has many aisles): the current tab is kept in view.
  const tabsScroll = useRef<ScrollViewInstance>(null);
  const tabX = useRef<Record<string, number>>({});
  // An article's photos, full screen.
  const [gallery, setGallery] = useState<ItemDto | null>(null);
  // A shop's article opened: its details sheet.
  const [detail, setDetail] = useState<ItemDto | null>(null);

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
  // Its own team: they manage it, they don't order from it.
  const { member, canEdit } = b.viewer;
  // A product shown for information (a service done on the spot): the student says they're interested, on WhatsApp.
  // Restaurants: dishes then drinks. Shops: one section per aisle.
  const sections: { key: string; title: string; items: ItemDto[]; grid: boolean }[] = isShop
    ? (() => {
        // A shop: its aisles, the newest articles first in each.
        const byDate = [...b.items].sort((x, y) => Date.parse(y.createdAt ?? '') - Date.parse(x.createdAt ?? '') || 0);
        return [...new Set(byDate.map((i) => i.category ?? 'Articles'))].map((c) => ({ key: c, title: c, items: byDate.filter((i) => (i.category ?? 'Articles') === c), grid: false }));
      })()
    : [
        { key: 'menu', title: 'Menus du jour', items: b.items.filter((i) => i.section === 'menu'), grid: false },
        { key: 'drink', title: 'Boissons', items: b.items.filter((i) => i.section === 'drink'), grid: true },
      ].filter((s) => s.items.length);
  const current = tab ?? sections[0]?.key;
  // Under the stuck filter bar: a section's title shows just below it.
  const sectionTop = (key: string) => bodyY.current + (sectionY.current[key] ?? 0) - barH - insets.top - 8;
  // The current tab, brought into view (a little room on its left shows there's more before it).
  const reveal = (key: string) => tabsScroll.current?.scrollTo({ x: Math.max(0, (tabX.current[key] ?? 0) - 48), animated: true });
  const goTo = (key: string) => {
    setTab(key);
    reveal(key);
    scroll.current?.scrollTo({ y: Math.max(0, sectionTop(key)), animated: true });
  };
  // The chip follows the reading: the last section whose title went under the bar.
  const onScroll = (y: number) => {
    const isStuck = sections.length > 1 && y >= barY.current - 1;
    if (isStuck !== stuck) setStuck(isStuck);
    if (sections.length < 2) return;
    const reading = [...sections].reverse().find((sec) => y >= sectionTop(sec.key) - 4)?.key ?? sections[0]!.key;
    if (reading !== current) {
      setTab(reading);
      reveal(reading);
    }
  };
  const location = [b.address, b.campusLabel].filter(Boolean).join(' · ');

  return (
    <View style={styles.root}>
      <ScrollView refreshControl={pull}
        ref={scroll}
        contentContainerStyle={{ paddingBottom: count ? 120 : 48 }}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={sections.length > 1 ? [2] : undefined}
        scrollEventThrottle={32}
        onScroll={(e) => onScroll(e.nativeEvent.contentOffset.y)}>
        <View style={[styles.hero, { backgroundColor: colors.primarySoft }]}>
          {b.photo ? <Image source={{ uri: b.photo }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} /> : <Ionicons name={isShop ? 'storefront' : 'restaurant'} size={56} color={colors.primary} />}
          <View style={[styles.heroBar, { top: insets.top + 8 }]}>
            <RoundButton icon="arrow-back" label="Retour" onPress={() => router.back()} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {b.location && <RoundButton icon="location-outline" label={`Voir ${b.name} sur la carte`} onPress={() => openDirections(b.location!, b.name)} />}
              <RoundButton icon="call-outline" label={`Appeler ${b.name}`} onPress={() => Linking.openURL(`tel:+221${b.phone.replace(/\s/g, '')}`)} />
            </View>
          </View>
        </View>

        <View style={[styles.infoCard, shadow.raised]}>
          <Text style={styles.name}>{b.name}</Text>
          {b.rating !== null && (
            <Pressable
              style={styles.metaItem}
              hitSlop={8}
              onPress={() => scroll.current?.scrollTo({ y: bodyY.current + reviewsY.current - 12, animated: true })}
              accessibilityRole="button"
              accessibilityLabel={`Noté ${b.rating} sur 5 par ${b.ratingCount} étudiant${b.ratingCount > 1 ? 's' : ''}. Voir les avis`}>
              <Ionicons name="star" size={14} color={colors.warning} />
              <Text style={[styles.metaText, styles.reviewsLink]}>
                {b.rating.toFixed(1)} · {b.ratingCount} avis
              </Text>
            </Pressable>
          )}
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
          {member && (
            <View style={styles.ownerNote}>
              <Ionicons name="storefront-outline" size={16} color={colors.primary} />
              <Text style={styles.ownerNoteText}>
                {isShop ? 'C’est ta boutique' : 'C’est ton restaurant'} : tu la vois comme les étudiants, sans pouvoir y commander.{canEdit ? ' Touche ✎ pour modifier un article.' : ''}
              </Text>
            </View>
          )}
        </View>

        {/* The sections (Plats · Boissons, or a shop's aisles): sticky, the current one follows the scroll. */}
        {sections.length > 1 ? (
          <View
            style={[styles.bar, stuck && { paddingTop: insets.top, ...shadow.card }]}
            onLayout={(e) => {
              if (!stuck) barY.current = e.nativeEvent.layout.y;
              setBarH(e.nativeEvent.layout.height);
            }}>
            <ScrollView ref={tabsScroll} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs} accessibilityRole="tablist">
              {sections.map((s) => (
                <Tab
                  key={s.key}
                  label={s.key === 'menu' ? 'Plats' : s.title}
                  count={s.items.length}
                  on={current === s.key}
                  onPress={() => goTo(s.key)}
                  onLayout={(x) => (tabX.current[s.key] = x)}
                />
              ))}
            </ScrollView>
          </View>
        ) : (
          <View />
        )}

        <View style={styles.body} onLayout={(e) => (bodyY.current = e.nativeEvent.layout.y)}>
          {!b.open && (
            <View style={styles.closed}>
              <Ionicons name="moon-outline" size={16} color={colors.warningText} />
              <Text style={styles.closedText}>{b.statusLabel}. Tu peux consulter {isShop ? 'les articles' : 'le menu'}, la commande ouvre avec le service.</Text>
            </View>
          )}
          {!b.items.length && <EmptyState icon={isShop ? 'pricetags-outline' : 'restaurant-outline'} title={isShop ? 'Pas encore d’articles' : 'Pas de menu aujourd’hui'} text="Repasse un peu plus tard." />}

          {sections.map((s) => (
            <View key={s.key} style={styles.section} onLayout={(e) => (sectionY.current[s.key] = e.nativeEvent.layout.y)}>
              <Text style={styles.sectionTitle}>
                {s.title} <Text style={styles.sectionCount}>· {s.items.length}</Text>
              </Text>
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
                        {member ? (
                          canEdit && (
                            <Pressable onPress={() => setEditing(d)} hitSlop={8} style={styles.drinkStep} accessibilityRole="button" accessibilityLabel={`Modifier ${d.name}`}>
                              <Ionicons name="pencil" size={13} color={colors.navy} />
                            </Pressable>
                          )
                        ) : !d.orderable ? null : qty > 0 ? (
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
                  // A shop's article: the row opens its details (a restaurant's dish stays a line of the menu).
                  <Pressable
                    key={m.id}
                    disabled={!isShop}
                    onPress={() => setDetail(m)}
                    style={[styles.dish, shadow.card, m.soldOut && { opacity: 0.55 }]}
                    accessibilityRole={isShop ? 'button' : undefined}
                    accessibilityLabel={isShop ? `${m.name}, ${formatFcfa(m.price)} : voir le détail` : undefined}>
                    <Photo item={m} icon={isShop ? 'pricetag-outline' : 'restaurant-outline'} style={styles.dishPhoto} onOpen={() => setGallery(m)} />
                    <View style={styles.dishInfo}>
                      <View style={styles.nameLine}>
                        <Text style={styles.dishName} numberOfLines={1}>
                          {m.name}
                        </Text>
                        {b.itemLikes && <LikeButton item={m} variant="inline" readOnly={member} onChange={(v) => setB((cur) => cur && { ...cur, items: cur.items.map((x) => (x.id === m.id ? { ...x, ...v } : x)) })} />}
                      </View>
                      {!!m.detail && (
                        <Text style={styles.muted} numberOfLines={2}>
                          {m.detail}
                        </Text>
                      )}
                      {m.soldOut ? <Text style={styles.soldOut}>Épuisé</Text> : m.stock !== null && m.stock <= 5 && <Text style={styles.fewLeft}>Plus que {m.stock}</Text>}
                      <View style={styles.dishBottom}>
                        <Text style={styles.price}>{formatFcfa(m.price)}</Text>
                        {member ? (
                          canEdit && (
                            <Pressable onPress={() => setEditing(m)} style={styles.editBtn} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Modifier ${m.name}`}>
                              <Ionicons name="pencil" size={13} color={colors.primary} />
                              <Text style={styles.editBtnText}>Modifier</Text>
                            </Pressable>
                          )
                        ) : m.orderable ? (
                          <QtyControl qty={cart[m.id] ?? 0} disabled={!b.open || m.soldOut} max={m.stock ?? undefined} name={m.name} onChange={(q) => setQty(m.id, q)} />
                        ) : (
                          // A service done on the spot (printing…): nothing to order; « Je suis intéressé » tells the shop, who calls back.
                          <InterestButton item={m} shop={b} />
                        )}
                      </View>
                    </View>
                  </Pressable>
                ))
              )}
            </View>
          ))}

          {/* What students who ordered here thought: anonymous, after the menu. */}
          <View onLayout={(e) => (reviewsY.current = e.nativeEvent.layout.y)}>
            <ReviewsSection businessId={b.id} />
          </View>
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

      <ProductSheet
        item={detail ? (b.items.find((x) => x.id === detail.id) ?? detail) : null}
        shop={b}
        qty={detail ? (cart[detail.id] ?? 0) : 0}
        onQty={(q) => detail && setQty(detail.id, q)}
        member={member}
        onClose={() => setDetail(null)}
        onLiked={(v) => detail && setB((cur) => cur && { ...cur, items: cur.items.map((x) => (x.id === detail.id ? { ...x, ...v } : x)) })}
        basket={{ count: Object.values(cart).reduce((n, q) => n + q, 0), total }}
        onOpenCart={() => {
          setDetail(null);
          router.push('/panier');
        }}
      />
      <PhotoGallery photos={gallery?.photos ?? []} start={gallery ? 0 : null} title={gallery?.name ?? ''} onClose={() => setGallery(null)} />
      {editing && (
        <ItemEditor
          business={{ orgId: b.orgId, kind: b.kind }}
          kind={b.kind}
          item={editing}
          aisles={aislesFor(b.items)}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
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

/** A section of the page: its name, underlined when it's the one being read. Its number of items is read out. */
function Tab({ label, count, on, onPress, onLayout }: { label: string; count: number; on: boolean; onPress: () => void; onLayout: (x: number) => void }) {
  return (
    <Pressable
      onPress={onPress}
      onLayout={(e) => onLayout(e.nativeEvent.layout.x)}
      style={styles.tab}
      hitSlop={{ top: 6, bottom: 6 }}
      accessibilityRole="tab"
      accessibilityState={{ selected: on }}
      accessibilityLabel={`${label}, ${count} article${count > 1 ? 's' : ''}`}>
      <Text style={[styles.tabText, on && styles.tabTextOn]} numberOfLines={1}>
        {label}
      </Text>
      <View style={[styles.tabLine, on && styles.tabLineOn]} />
    </Pressable>
  );
}

/**
 * Item cover, or an icon on a tinted tile while the business hasn't sent one. With photos, a tap shows them all
 * (full screen); several: their number in the corner.
 */
function Photo({ item, icon, style, onOpen }: { item: ItemDto; icon: keyof typeof Ionicons.glyphMap; style: object; onOpen?: () => void }) {
  const tile = (
    <View style={[style, { backgroundColor: colors.primarySoft }]}>
      {item.photo ? <Image source={{ uri: item.photo }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} /> : <Ionicons name={icon} size={28} color={colors.primary} />}
      {item.photos.length > 1 && (
        <View style={styles.photoCount}>
          <Ionicons name="images-outline" size={11} color="#fff" />
          <Text style={styles.photoCountText}>{item.photos.length}</Text>
        </View>
      )}
    </View>
  );
  if (!item.photos.length || !onOpen) return tile;
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={item.photos.length > 1 ? `Voir les ${item.photos.length} photos de ${item.name}` : `Voir la photo de ${item.name}`}>
      {tile}
    </Pressable>
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
  body: { paddingHorizontal: PADDING, marginTop: 8, gap: 20 },
  closed: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderRadius: radii.md,
    backgroundColor: colors.warningBg,
  },
  closedText: { ...typo.small, flex: 1, color: colors.warningText },
  // Edge to edge, on the page's colour: the chips scroll under nothing, the bar covers the list when stuck.
  bar: { backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  tabs: { flexDirection: 'row', gap: 22, paddingHorizontal: PADDING },
  tab: { paddingTop: 14, maxWidth: 200, alignItems: 'center' },
  tabText: { ...typo.bodyStrong, color: colors.muted2, paddingBottom: 10 },
  tabTextOn: { color: colors.navy },
  tabLine: { alignSelf: 'stretch', height: 3, borderRadius: 2, backgroundColor: 'transparent' },
  tabLineOn: { backgroundColor: colors.primary },
  soldOut: { ...typo.captionStrong, color: colors.dangerText, marginTop: 2 },
  fewLeft: { ...typo.captionStrong, color: colors.orangeText, marginTop: 2 },
  section: { gap: 12 },
  reviewsLink: { color: colors.navy, fontWeight: '700', textDecorationLine: 'underline' },
  sectionTitle: { ...typo.section, color: colors.navy },
  sectionCount: { color: colors.muted2, fontWeight: '600' },
  muted: { ...typo.caption, color: colors.muted2, marginTop: 2 },
  dish: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 10, flexDirection: 'row', gap: 12 },
  dishPhoto: { width: 100, height: 100, borderRadius: radii.md, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  photoCount: { position: 'absolute', right: 6, bottom: 6, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radii.pill, backgroundColor: 'rgba(10,16,40,0.7)' },
  photoCountText: { ...typo.label, color: '#fff' },
  dishInfo: { flex: 1, paddingVertical: 2 },
  dishName: { ...typo.title, color: colors.navy, flex: 1 },
  dishBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: 8 },
  price: { ...typo.title, color: colors.primary },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
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
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, minHeight: 32, borderRadius: radii.pill, backgroundColor: colors.primarySoft },
  editBtnText: { ...typo.captionStrong, color: colors.primary },
  ownerNote: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 12, padding: 10, borderRadius: radii.md, backgroundColor: colors.primarySoft },
  ownerNoteText: { ...typo.small, color: colors.primary, flex: 1, lineHeight: 19 },
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
