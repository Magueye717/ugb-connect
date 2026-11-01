import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/states';
import { formatFcfa } from '@/constants/data';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useCart } from '@/context/CartContext';
import { openDirections } from '@/lib/maps';
import { matches } from '@/lib/search';
import { commerceApi, type BusinessDto, type ListedBusiness, type MarketItem } from './api';
import { distanceLabel, metres, useMyPosition } from './distance';
import { SearchBar } from './SearchBar';

const TILE = '#F5F6F8';
const TAG = colors.orangeText;

/** Fits a chip: "Ferme 15h", "Ouvre 19h", "En pause". */
const shortStatus = (b: BusinessDto) => {
  if (!b.acceptingOrders) return 'En pause';
  const hour = b.statusLabel.match(/(\d{1,2}h\d{0,2})$/)?.[1];
  if (!hour) return b.open ? 'Ouvert' : 'Fermé';
  return b.open ? `Ferme ${hour}` : `Ouvre ${hour}`;
};

// ---- Restaurants ------------------------------------------------------------------------------------------------

const FILTERS = [
  { key: 'all', label: 'Tous' },
  { key: 'open', label: 'Ouverts' },
  { key: 'delivery', label: 'Livraison' },
  { key: 'campus1', label: 'Campus 1' },
  { key: 'campus2', label: 'Campus 2' },
] as const;
type FilterKey = (typeof FILTERS)[number]['key'];
type RestoSort = 'open' | 'near' | 'price';
const RESTO_SORTS: { key: RestoSort; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'open', label: 'Ouverts d’abord', icon: 'time-outline' },
  { key: 'near', label: 'Les plus proches', icon: 'navigate-outline' },
  { key: 'price', label: 'Les moins chers', icon: 'pricetag-outline' },
];

/**
 * Private restaurants: search (a name, a cuisine, a dish), quick filters, and a card per restaurant with its photo,
 * its lowest price, what it serves, and three facts (hours, delivery, distance or campus).
 */
export function RestaurantList() {
  const [items, setItems] = useState<ListedBusiness[] | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sort, setSort] = useState<RestoSort>('open');
  const [sorting, setSorting] = useState(false);
  const me = useMyPosition();

  useFocusEffect(
    useCallback(() => {
      const load = () => commerceApi.list('restaurant').then((r) => setItems(r.items), () => setItems((x) => x ?? []));
      load();
      // Open or closed follows the clock.
      const timer = setInterval(load, 60_000);
      return () => clearInterval(timer);
    }, []),
  );

  const distance = (b: BusinessDto) => (me && b.location ? metres(me, b.location) : null);
  const shown = (items ?? [])
    .filter((b) => matches(query, [b.name, b.specialty, b.address, ...b.itemNames]))
    .filter((b) => (filter === 'open' ? b.open : filter === 'delivery' ? b.deliveryFee !== null : filter === 'campus1' || filter === 'campus2' ? b.campus === filter : true))
    .sort((a, b) =>
      sort === 'near' ? (distance(a) ?? Infinity) - (distance(b) ?? Infinity) : sort === 'price' ? (a.minPrice ?? Infinity) - (b.minPrice ?? Infinity) : Number(b.open) - Number(a.open),
    );

  return (
    <View style={{ gap: 14 }}>
      <SearchBar value={query} onChange={setQuery} placeholder="Restaurant, plat ou cuisine…" onFilter={() => setSorting(true)} filtered={sort !== 'open'} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {FILTERS.map((f) => {
          const on = f.key === filter;
          return (
            <Pressable key={f.key} onPress={() => setFilter(f.key)} style={[styles.chip, on && styles.chipOn]} accessibilityRole="radio" accessibilityState={{ checked: on }}>
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{f.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {!items && <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />}
      {items && shown.length === 0 && (
        <EmptyState
          icon="restaurant-outline"
          title={query ? `Rien pour « ${query.trim()} »` : items.length ? 'Aucun restaurant ici' : 'Pas encore de restaurant'}
          text={query ? 'Essaie un autre plat ou une autre cuisine.' : items.length ? 'Change de filtre pour en voir d’autres.' : undefined}
          action={query || filter !== 'all' ? { label: 'Tout afficher', onPress: () => (setQuery(''), setFilter('all')) } : undefined}
        />
      )}
      {shown.map((b) => (
        <RestaurantCard key={b.id} b={b} distance={distance(b)} />
      ))}

      <SortSheet visible={sorting} options={RESTO_SORTS.filter((o) => o.key !== 'near' || !!me)} value={sort} onChange={setSort} onClose={() => setSorting(false)} />
    </View>
  );
}

/** The Manger tab's first view. */
export function PrivateRestosBoard() {
  const [key, setKey] = useState(0);
  return (
    <ScrollView contentContainerStyle={styles.board} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={false} onRefresh={() => setKey((k) => k + 1)} />}>
      <RestaurantList key={key} />
    </ScrollView>
  );
}

function RestaurantCard({ b, distance }: { b: ListedBusiness; distance: number | null }) {
  // In the corner: open now (a closed one shows it on its photo).
  const tag = b.open ? 'Ouvert' : null;
  const serves = [b.specialty, ...b.highlights.map((h) => h.name)].filter(Boolean).slice(0, 3).join(' • ');
  return (
    <Pressable
      style={({ pressed }) => [styles.card, shadow.card, pressed && { transform: [{ scale: 0.99 }] }, !b.open && { opacity: 0.75 }]}
      onPress={() => router.push(`/resto/${b.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${b.name}, ${b.statusLabel}${b.minPrice !== null ? `, dès ${formatFcfa(b.minPrice)}` : ''}`}>
      <View style={styles.tile}>
        {b.photo ? <Image source={{ uri: b.photo }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} /> : <Ionicons name="restaurant" size={34} color={colors.primary} />}
        {!b.open && (
          <View style={styles.closedVeil}>
            <Text style={styles.closedText}>Fermé</Text>
          </View>
        )}
      </View>
      <View style={styles.info}>
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={1}>
            {b.name}
          </Text>
          {tag && (
            <View style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          )}
        </View>
        {b.minPrice !== null ? (
          <Text style={styles.big} numberOfLines={1}>
            <Text style={styles.from}>dès </Text>
            {String(b.minPrice).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}
            <Text style={styles.currency}> FCFA</Text>
          </Text>
        ) : (
          <Text style={[styles.from, { marginVertical: 6 }]}>Menu bientôt en ligne</Text>
        )}
        <Text style={styles.serves} numberOfLines={1}>
          {serves}
        </Text>
        <View style={styles.factsRow}>
          <View style={styles.facts}>
            <Fact icon="time-outline" text={shortStatus(b)} fixed />
            <Fact icon={b.deliveryFee !== null ? 'bicycle-outline' : 'walk-outline'} text={b.deliveryFee === null ? 'Retrait' : b.deliveryFee ? `${b.deliveryFee} F` : 'Gratuite'} fixed />
            <Fact icon="location-outline" text={distance !== null ? distanceLabel(distance) : (b.campusLabel ?? 'Campus')} />
          </View>
          {b.location && (
            // Directions from here, without opening the restaurant: an icon that never gets pushed out.
            <Pressable style={styles.go} onPress={() => openDirections(b.location!, b.name)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Itinéraire vers ${b.name}`}>
              <Ionicons name="navigate" size={14} color="#fff" />
            </Pressable>
          )}
        </View>
      </View>
    </Pressable>
  );
}

/** `fixed`: never shrinks (hours, delivery); the last one (where) gives way. */
function Fact({ icon, text, fixed }: { icon: keyof typeof Ionicons.glyphMap; text: string; fixed?: boolean }) {
  return (
    <View style={[styles.fact, fixed && { flexShrink: 0 }]}>
      <Ionicons name={icon} size={11} color={colors.navy} />
      <Text style={styles.factText} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

// ---- The market (shops) -----------------------------------------------------------------------------------------

type MarketSort = 'relevance' | 'priceUp' | 'priceDown';
const MARKET_SORTS: { key: MarketSort; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'relevance', label: 'Par boutique', icon: 'storefront-outline' },
  { key: 'priceUp', label: 'Prix croissant', icon: 'trending-up-outline' },
  { key: 'priceDown', label: 'Prix décroissant', icon: 'trending-down-outline' },
];

/**
 * The Campus tab's "Boutiques": one market for every shop. Search an article or a shop, pick a shop or an aisle, and
 * add straight to the basket (one shop per order); the shop's page has the rest.
 */
export function MarketBoard() {
  const insets = useSafeAreaInsets();
  const cart = useCart();
  const [data, setData] = useState<{ businesses: BusinessDto[]; items: MarketItem[] } | null>(null);
  const [query, setQuery] = useState('');
  const [shopId, setShopId] = useState<string | null>(null);
  const [aisle, setAisle] = useState<string | null>(null);
  const [sort, setSort] = useState<MarketSort>('relevance');
  const [sorting, setSorting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => commerceApi.market('shop').then(setData, () => setData((d) => d ?? { businesses: [], items: [] })), []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!data) return <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />;
  const shops = new Map(data.businesses.map((b) => [b.id, b]));
  const shop = shopId ? shops.get(shopId) : null;
  const inShop = data.items.filter((i) => !shopId || i.businessId === shopId);
  const aisles = [...new Set(inShop.map((i) => i.category ?? 'Autres'))];
  const shown = inShop
    .filter((i) => !aisle || (i.category ?? 'Autres') === aisle)
    .filter((i) => matches(query, [i.name, i.detail, i.category, shops.get(i.businessId)?.name]))
    .sort((a, b) => (sort === 'priceUp' ? a.price - b.price : sort === 'priceDown' ? b.price - a.price : Number(shops.get(b.businessId)?.open) - Number(shops.get(a.businessId)?.open)));
  // Shops whose name matches the search, even without a matching article.
  const shopsShown = data.businesses.filter((b) => !query || matches(query, [b.name, b.specialty]) || shown.some((i) => i.businessId === b.id));
  const cartTotal = cart.business ? data.items.filter((i) => i.businessId === cart.business!.id).reduce((n, i) => n + (cart.items[i.id] ?? 0) * i.price, 0) : 0;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={[styles.marketBody, { paddingBottom: cart.count ? 110 : 32 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => (setRefreshing(true), load().finally(() => setRefreshing(false)))} />}>
        <SearchBar value={query} onChange={setQuery} placeholder="Un article, une boutique…" onFilter={() => setSorting(true)} filtered={sort !== 'relevance'} />

        {/* The shops of the market: tap one to see only its stalls. */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shops}>
          <ShopBubble label="Toutes" on={!shopId} onPress={() => (setShopId(null), setAisle(null))} />
          {shopsShown.map((b) => (
            <ShopBubble key={b.id} label={b.name} photo={b.photo} open={b.open} on={shopId === b.id} onPress={() => (setShopId(shopId === b.id ? null : b.id), setAisle(null))} />
          ))}
        </ScrollView>

        {shop && (
          <Pressable style={[styles.shopBanner, shadow.card]} onPress={() => router.push(`/resto/${shop.id}`)} accessibilityRole="button">
            <View style={[styles.dotBig, { backgroundColor: shop.open ? colors.success : colors.muted }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.shopName}>{shop.name}</Text>
              <Text style={styles.muted} numberOfLines={1}>
                {[shop.statusLabel, shop.address].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <Text style={styles.link}>La boutique</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.primary} />
          </Pressable>
        )}

        {aisles.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {[null, ...aisles].map((a) => {
              const on = a === aisle;
              return (
                <Pressable key={a ?? 'all'} onPress={() => setAisle(a)} style={[styles.chip, on && styles.chipOn]}>
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{a ?? 'Tout'}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {shown.length === 0 ? (
          <EmptyState
            icon="basket-outline"
            title={query ? `Rien pour « ${query.trim()} »` : data.items.length ? 'Rien dans ce rayon' : 'Le marché ouvre bientôt'}
            text={query ? 'Essaie un autre mot, ou une autre boutique.' : data.items.length ? undefined : 'Les boutiques du campus mettent leurs articles en ligne.'}
            action={query || shopId || aisle ? { label: 'Tout afficher', onPress: () => (setQuery(''), setShopId(null), setAisle(null)) } : undefined}
          />
        ) : (
          <View style={styles.grid}>
            {shown.map((i) => (
              <ProductCard key={i.id} item={i} shop={shops.get(i.businessId)!} />
            ))}
          </View>
        )}
      </ScrollView>

      {cart.count > 0 && cart.business && shops.has(cart.business.id) && (
        <View style={[styles.cartWrap, { paddingBottom: Math.max(insets.bottom, 0) + 12 }]}>
          <Pressable style={styles.cartBar} onPress={() => router.push('/panier')} accessibilityRole="button">
            <Ionicons name="basket-outline" size={18} color="#fff" />
            <Text style={styles.cartText} numberOfLines={1}>
              {cart.business.name} · {cart.count} article{cart.count > 1 ? 's' : ''} · {formatFcfa(cartTotal)}
            </Text>
          </Pressable>
        </View>
      )}

      <SortSheet visible={sorting} options={MARKET_SORTS} value={sort} onChange={setSort} onClose={() => setSorting(false)} />
    </View>
  );
}

function ShopBubble({ label, photo, open, on, onPress }: { label: string; photo?: string | null; open?: boolean; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.bubble} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={label}>
      <View style={[styles.bubbleImg, on && styles.bubbleOn]}>
        {photo ? <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Ionicons name={photo === undefined ? 'grid' : 'storefront'} size={22} color={on ? colors.primary : colors.navy} />}
        {open !== undefined && <View style={[styles.bubbleDot, { backgroundColor: open ? colors.success : colors.muted }]} />}
      </View>
      <Text style={[styles.bubbleText, on && { color: colors.primary, fontWeight: '700' }]} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

function ProductCard({ item, shop }: { item: MarketItem; shop: BusinessDto }) {
  const cart = useCart();
  const qty = cart.business?.id === shop.id ? (cart.items[item.id] ?? 0) : 0;
  const can = shop.open && !item.soldOut;
  const set = (q: number) => cart.setQty({ id: shop.id, name: shop.name }, item.id, q);
  const atMax = item.stock !== null && qty >= item.stock;
  return (
    <Pressable style={[styles.product, shadow.card]} onPress={() => router.push(`/resto/${shop.id}`)} accessibilityRole="button" accessibilityLabel={`${item.name}, ${formatFcfa(item.price)}, chez ${shop.name}`}>
      <View style={styles.productTile}>
        {item.photo ? <Image source={{ uri: item.photo }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} /> : <Ionicons name="pricetag-outline" size={30} color={colors.muted} />}
        {item.soldOut && (
          <View style={styles.closedVeil}>
            <Text style={styles.closedText}>Épuisé</Text>
          </View>
        )}
        {item.soldOut ? null : qty > 0 ? (
          <View style={styles.stepper}>
            <Pressable onPress={() => set(qty - 1)} hitSlop={6} style={styles.stepBtn} accessibilityLabel={`Retirer un ${item.name}`}>
              <Ionicons name={qty === 1 ? 'trash-outline' : 'remove'} size={14} color="#fff" />
            </Pressable>
            <Text style={styles.stepQty}>{qty}</Text>
            <Pressable onPress={() => set(qty + 1)} disabled={atMax} hitSlop={6} style={[styles.stepBtn, atMax && { opacity: 0.4 }]} accessibilityLabel={`Ajouter un ${item.name}`}>
              <Ionicons name="add" size={14} color="#fff" />
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={() => set(1)} disabled={!can} hitSlop={6} style={[styles.plus, !can && { opacity: 0.35 }]} accessibilityLabel={`Ajouter ${item.name} au panier`}>
            <Ionicons name="add" size={18} color="#fff" />
          </Pressable>
        )}
      </View>
      <Text style={styles.productName} numberOfLines={1}>
        {item.name}
      </Text>
      <Text style={styles.productPrice}>{formatFcfa(item.price)}</Text>
      <View style={styles.productShop}>
        <View style={[styles.dotSmall, { backgroundColor: shop.open ? colors.success : colors.muted }]} />
        <Text style={styles.muted} numberOfLines={1}>
          {shop.name}
        </Text>
      </View>
    </Pressable>
  );
}

// ---- Shared -----------------------------------------------------------------------------------------------------

function SortSheet<K extends string>({ visible, options, value, onChange, onClose }: { visible: boolean; options: { key: K; label: string; icon: keyof typeof Ionicons.glyphMap }[]; value: K; onChange: (k: K) => void; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <Text style={styles.sheetTitle}>Trier</Text>
        {options.map((o) => {
          const on = o.key === value;
          return (
            <Pressable
              key={o.key}
              style={[styles.sortRow, on && styles.sortOn]}
              onPress={() => {
                onChange(o.key);
                onClose();
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}>
              <Ionicons name={o.icon} size={18} color={on ? colors.primary : colors.navy} />
              <Text style={[styles.sortText, on && { color: colors.primary }]}>{o.label}</Text>
              {on && <Ionicons name="checkmark" size={18} color={colors.primary} />}
            </Pressable>
          );
        })}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', gap: 8, paddingRight: 8 },
  chip: { height: 36, paddingHorizontal: 16, borderRadius: radii.pill, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: '#111318', ...shadow.card },
  chipText: { fontSize: 14, color: colors.navy, fontWeight: '500' },
  chipTextOn: { color: '#fff' },
  // Restaurant card: the photo on its tile at the left, the facts at the right.
  card: { flexDirection: 'row', gap: 10, padding: 7, borderRadius: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: '#EEF0F4' },
  tile: { width: 86, alignSelf: 'stretch', minHeight: 92, borderRadius: 15, backgroundColor: TILE, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  closedVeil: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingVertical: 4, backgroundColor: 'rgba(17,19,24,0.65)', alignItems: 'center' },
  closedText: { ...typo.captionStrong, color: '#fff' },
  info: { flex: 1, paddingVertical: 3, paddingRight: 3, gap: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flex: 1, fontSize: 14.5, fontWeight: '700', color: colors.navy },
  tag: { paddingHorizontal: 8, height: 21, borderRadius: radii.pill, borderWidth: 1, borderColor: '#F4E3D9', backgroundColor: colors.card, justifyContent: 'center' },
  tagText: { fontSize: 10.5, fontWeight: '700', color: TAG },
  big: { fontSize: 17, fontWeight: '800', color: colors.navy },
  from: { fontSize: 12, fontWeight: '500', color: colors.muted2 },
  currency: { fontSize: 12, fontWeight: '500', color: colors.muted2 },
  serves: { fontSize: 12, color: colors.muted2 },
  // One line, never wrapped: the chips shrink before they break.
  facts: { flex: 1, flexDirection: 'row', gap: 4, overflow: 'hidden' },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 23, paddingHorizontal: 6, borderRadius: radii.pill, backgroundColor: TILE, flexShrink: 1 },
  factsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  go: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  factText: { fontSize: 10.5, fontWeight: '500', color: colors.navy, flexShrink: 1 },
  board: { padding: 20, paddingTop: 16, paddingBottom: 32 },
  // Market
  marketBody: { padding: 20, paddingTop: 16, gap: 14 },
  shops: { flexDirection: 'row', gap: 12, paddingRight: 8 },
  bubble: { width: 70, alignItems: 'center', gap: 6 },
  bubbleImg: { width: 62, height: 62, borderRadius: 31, backgroundColor: colors.card, borderWidth: 2, borderColor: 'transparent', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', ...shadow.card },
  bubbleOn: { borderColor: colors.primary },
  bubbleDot: { position: 'absolute', right: 6, bottom: 6, width: 11, height: 11, borderRadius: 6, borderWidth: 2, borderColor: colors.card },
  bubbleText: { fontSize: 11.5, fontWeight: '500', color: colors.navy, textAlign: 'center' },
  shopBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radii.lg, backgroundColor: colors.card },
  shopName: { ...typo.bodyStrong, color: colors.navy },
  dotBig: { width: 10, height: 10, borderRadius: 5 },
  dotSmall: { width: 7, height: 7, borderRadius: 4 },
  link: { ...typo.smallStrong, color: colors.primary },
  muted: { ...typo.caption, color: colors.muted2, flexShrink: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  product: { width: '48.3%', padding: 6, borderRadius: 16, backgroundColor: colors.card, gap: 2, borderWidth: 1, borderColor: '#EEF0F4' },
  // Wider than tall: two rows of products in view.
  productTile: { height: 96, borderRadius: 12, backgroundColor: TILE, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  plus: { position: 'absolute', right: 5, bottom: 5, width: 30, height: 30, borderRadius: 15, backgroundColor: '#111318', alignItems: 'center', justifyContent: 'center' },
  stepper: { position: 'absolute', right: 5, bottom: 5, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 3, height: 30, borderRadius: 15, backgroundColor: '#111318' },
  stepBtn: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  stepQty: { ...typo.smallStrong, color: '#fff', minWidth: 12, textAlign: 'center' },
  productName: { fontSize: 13, fontWeight: '600', color: colors.navy },
  productPrice: { fontSize: 14, fontWeight: '800', color: colors.navy },
  productShop: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cartWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12 },
  cartBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 52, paddingHorizontal: 16, borderRadius: radii.pill, backgroundColor: colors.accent, ...shadow.card },
  cartText: { ...typo.bodyStrong, color: '#fff', flexShrink: 1 },
  // Sort sheet
  backdrop: { flex: 1, backgroundColor: 'rgba(15,27,76,0.35)' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: 20, paddingBottom: 36, gap: 6 },
  sheetTitle: { ...typo.h3, color: colors.navy, marginBottom: 6 },
  sortRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 50, paddingHorizontal: 12, borderRadius: radii.md },
  sortOn: { backgroundColor: colors.primarySoft },
  sortText: { ...typo.bodyStrong, flex: 1, color: colors.navy },
});
