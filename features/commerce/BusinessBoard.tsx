import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip, SheetHeader } from '@/components/ui';
import { useLiftSpaceButton } from '@/components/SpaceSwitcher';
import { EmptyState, ErrorState, SkeletonCard } from '@/components/states';
import { formatFcfa } from '@/constants/data';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useCart } from '@/context/CartContext';
import { matches } from '@/lib/search';
import { commerceApi, type BusinessDto, type ListedBusiness, type MarketItem } from './api';
import { distanceLabel, metres, useMyPosition } from './distance';
import { LikeButton } from './LikeButton';
import { InterestButton } from './InterestButton';
import { ProductSheet } from './ProductSheet';
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
  // Nothing loaded and the load failed (no network…): an error with « Réessayer », not "no restaurant".
  const [loadFailed, setLoadFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sort, setSort] = useState<RestoSort>('open');
  const [sorting, setSorting] = useState(false);
  const me = useMyPosition();

  const load = useCallback(() => {
    setLoadFailed(false);
    commerceApi.list('restaurant').then((r) => setItems(r.items), () => setLoadFailed(true));
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
      // Open or closed follows the clock.
      const timer = setInterval(load, 60_000);
      return () => clearInterval(timer);
    }, [load]),
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
            <Chip key={f.key} label={f.label} selected={on} onPress={() => setFilter(f.key)} />
          );
        })}
      </ScrollView>

      {/* The shape of the list while it loads: it appears in place, without a jump. */}
      {!items && !loadFailed && (
        <View style={{ gap: 10 }} accessibilityLabel="Chargement">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      )}
      {!items && loadFailed && <ErrorState onRetry={load} />}
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
            {b.rating !== null && <Fact icon="star" text={b.rating.toFixed(1)} fixed />}
            <Fact icon="time-outline" text={shortStatus(b)} fixed />
            <Fact icon={b.deliveryFee !== null ? 'bicycle-outline' : 'walk-outline'} text={b.deliveryFee === null ? 'Retrait' : b.deliveryFee ? `${b.deliveryFee} F` : 'Gratuite'} fixed />
            <Fact icon="location-outline" text={distance !== null ? distanceLabel(distance) : (b.campusLabel ?? 'Campus')} />
          </View>
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

type MarketSort = 'newest' | 'relevance' | 'priceUp' | 'priceDown';
/** Who sells: every shop, the students' own, or the established shops. */
type Seller = 'all' | 'student' | 'pro';
/** Articles drawn at first, then this many more each time the list nears its end (pictures load as they show). */
const PAGE = 20;
const SELLERS: { value: Seller; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'student', label: 'Étudiants' },
  { value: 'pro', label: 'Boutiques pros' },
];
const MARKET_SORTS: { key: MarketSort; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'newest', label: 'Plus récents', icon: 'time-outline' },
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
  // `?boutique=<id>`: opened on one shop (a student checking their own, as clients see it).
  const { boutique } = useLocalSearchParams<{ boutique?: string }>();
  const [shopId, setShopId] = useState<string | null>(boutique ?? null);
  // A new link to another shop (?boutique=) opens it: state adjusted during render, no effect.
  const [seenBoutique, setSeenBoutique] = useState(boutique);
  if (boutique !== seenBoutique) {
    setSeenBoutique(boutique);
    if (boutique) setShopId(boutique);
  }
  const [aisle, setAisle] = useState<string | null>(null);
  // The newest articles first by default: what's new on the market.
  const [sort, setSort] = useState<MarketSort>('newest');
  const [seller, setSeller] = useState<Seller>('all');
  // The article whose details are open (its sheet).
  const [detailId, setDetailId] = useState<string | null>(null);
  // How many articles are drawn: one page more as the list scrolls; back to the first page when what's shown changes.
  const [limit, setLimit] = useState(PAGE);
  const viewKey = `${query}|${shopId}|${aisle}|${sort}|${seller}`;
  const [seenView, setSeenView] = useState(viewKey);
  if (viewKey !== seenView) {
    setSeenView(viewKey);
    setLimit(PAGE);
  }
  const [sorting, setSorting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Nothing loaded and the load failed: an error with « Réessayer », not an empty market.
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(() => {
    setLoadFailed(false);
    return commerceApi.market('shop').then(setData, () => setLoadFailed(true));
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // The cart bar is pinned at the bottom: the space button rises above it.
  const cartShown = !!data && cart.count > 0 && !!cart.business && data.businesses.some((b) => b.id === cart.business!.id);
  useLiftSpaceButton(cartShown ? 64 + insets.bottom : 0);

  if (!data)
    return loadFailed ? (
      <ErrorState onRetry={load} />
    ) : (
      <View style={{ padding: 20, gap: 10 }} accessibilityLabel="Chargement">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  // Who sells: a student's own shop, or an established one.
  const sells = (b: BusinessDto | undefined) => seller === 'all' || (!!b && (seller === 'student' ? b.byStudent : !b.byStudent));
  const shops = new Map(data.businesses.filter(sells).map((b) => [b.id, b]));
  const shop = shopId ? shops.get(shopId) : null;
  const inShop = data.items.filter((i) => shops.has(i.businessId) && (!shopId || i.businessId === shopId));
  const aisles = [...new Set(inShop.map((i) => i.category ?? 'Autres'))];
  const shown = inShop
    .filter((i) => !aisle || (i.category ?? 'Autres') === aisle)
    .filter((i) => matches(query, [i.name, i.detail, i.category, shops.get(i.businessId)?.name]))
    .sort((a, b) =>
      sort === 'newest'
        ? Date.parse(b.createdAt ?? '') - Date.parse(a.createdAt ?? '') || 0
        : sort === 'priceUp'
          ? a.price - b.price
          : sort === 'priceDown'
            ? b.price - a.price
            : Number(shops.get(b.businessId)?.open) - Number(shops.get(a.businessId)?.open),
    );
  // Shops whose name matches the search, even without a matching article.
  const shopsShown = data.businesses.filter(sells).filter((b) => !query || matches(query, [b.name, b.specialty]) || shown.some((i) => i.businessId === b.id));
  const cartTotal = cart.business ? data.items.filter((i) => i.businessId === cart.business!.id).reduce((n, i) => n + (cart.items[i.id] ?? 0) * i.price, 0) : 0;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={[styles.marketBody, { paddingBottom: cart.count ? 110 : 32 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        // Near the end of what's drawn: the next page, before the student gets there.
        scrollEventThrottle={200}
        onScroll={({ nativeEvent: { layoutMeasurement, contentOffset, contentSize } }) => {
          if (limit < shown.length && layoutMeasurement.height + contentOffset.y >= contentSize.height - 600) setLimit((l) => l + PAGE);
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => (setRefreshing(true), load().finally(() => setRefreshing(false)))} />}>
        <SearchBar value={query} onChange={setQuery} placeholder="Un article, une boutique…" onFilter={() => setSorting(true)} filtered={sort !== 'newest' || seller !== 'all'} />

        {/* The shops of the market: tap one to see only its stalls. */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shops}>
          <ShopBubble label="Toutes" on={!shopId} onPress={() => (setShopId(null), setAisle(null))} />
          {shopsShown.map((b) => (
            <ShopBubble key={b.id} label={b.name} photo={b.photo} open={b.open} student={b.byStudent} on={shopId === b.id} onPress={() => (setShopId(shopId === b.id ? null : b.id), setAisle(null))} />
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
                <Chip key={a ?? 'all'} label={a ?? 'Tout'} selected={on} onPress={() => setAisle(a)} />
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
          <>
            <View style={styles.grid}>
              {shown.slice(0, limit).map((i) => (
                <ProductCard key={i.id} item={i} shop={shops.get(i.businessId)!} onOpen={() => setDetailId(i.id)} onLiked={(v) => setData((d) => d && { ...d, items: d.items.map((x) => (x.id === i.id ? { ...x, ...v } : x)) })} />
              ))}
            </View>
            {limit < shown.length && (
              // Loads by itself while scrolling; a tap does it too (a short page that doesn't scroll).
              <Pressable style={styles.more} onPress={() => setLimit((l) => l + PAGE)} accessibilityRole="button" accessibilityLabel={`Afficher ${Math.min(PAGE, shown.length - limit)} articles de plus`}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.muted}>Encore {shown.length - limit} article{shown.length - limit > 1 ? 's' : ''}…</Text>
              </Pressable>
            )}
          </>
        )}
      </ScrollView>

      {/* An article's details: its photos, description, and what can be done with it. */}
      {(() => {
        const d = detailId ? data.items.find((x) => x.id === detailId) ?? null : null;
        const dShop = d ? data.businesses.find((b) => b.id === d.businessId) : null;
        if (!d || !dShop) return null;
        return (
          <ProductSheet
            item={d}
            shop={dShop}
            qty={cart.business?.id === dShop.id ? (cart.items[d.id] ?? 0) : 0}
            onQty={(q) => cart.setQty({ id: dShop.id, name: dShop.name }, d.id, q)}
            onClose={() => setDetailId(null)}
            onLiked={(v) => setData((cur) => cur && { ...cur, items: cur.items.map((x) => (x.id === d.id ? { ...x, ...v } : x)) })}
            onOpenShop={() => {
              setDetailId(null);
              router.push(`/resto/${dShop.id}`);
            }}
            basket={cart.business?.id === dShop.id ? { count: cart.count, total: cartTotal } : null}
            onOpenCart={() => {
              setDetailId(null);
              router.push('/panier');
            }}
          />
        );
      })()}

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

      <SortSheet visible={sorting} options={MARKET_SORTS} value={sort} onChange={setSort} onClose={() => setSorting(false)}>
        <Text style={styles.sheetSection}>Vendeurs</Text>
        <View style={styles.sellers}>
          {SELLERS.map((s) => (
            <Chip
              key={s.value}
              label={s.label}
              icon={s.value === 'student' ? 'school-outline' : s.value === 'pro' ? 'storefront-outline' : undefined}
              selected={seller === s.value}
              onPress={() => {
                setSeller(s.value);
                // The shop picked may not sell here any more: back to all of them.
                if (shopId && !sells(data.businesses.find((b) => b.id === shopId)) && s.value !== 'all') setShopId(null);
              }}
            />
          ))}
        </View>
      </SortSheet>
    </View>
  );
}

function ShopBubble({ label, photo, open, student, on, onPress }: { label: string; photo?: string | null; open?: boolean; student?: boolean; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.bubble} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={label}>
      <View style={[styles.bubbleImg, on && styles.bubbleOn]}>
        {photo ? <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Ionicons name={photo === undefined ? 'grid' : 'storefront'} size={22} color={on ? colors.primary : colors.navy} />}
        {open !== undefined && <View style={[styles.bubbleDot, { backgroundColor: open ? colors.success : colors.muted }]} />}
      </View>
      {student && (
        <View style={styles.studentTag}>
          <Text style={styles.studentTagText}>Étudiant</Text>
        </View>
      )}
      <Text style={[styles.bubbleText, on && { color: colors.primary, fontWeight: '700' }]} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

function ProductCard({ item, shop, onOpen, onLiked }: { item: MarketItem; shop: BusinessDto; onOpen: () => void; onLiked: (v: { liked: boolean; likes: number }) => void }) {
  const cart = useCart();
  const qty = cart.business?.id === shop.id ? (cart.items[item.id] ?? 0) : 0;
  const can = shop.open && !item.soldOut;
  const set = (q: number) => cart.setQty({ id: shop.id, name: shop.name }, item.id, q);
  const atMax = item.stock !== null && qty >= item.stock;
  return (
    <Pressable style={[styles.product, shadow.card]} onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${item.name}, ${formatFcfa(item.price)}, chez ${shop.name} : voir le détail`}>
      <View style={styles.productTile}>
        {item.photo ? <Image source={{ uri: item.photo }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} /> : <Ionicons name="pricetag-outline" size={30} color={colors.muted} />}
        {item.photos.length > 1 && (
          <View style={styles.photoCount} accessibilityLabel={`${item.photos.length} photos`}>
            <Ionicons name="images-outline" size={11} color="#fff" />
            <Text style={styles.photoCountText}>{item.photos.length}</Text>
          </View>
        )}
        {shop.itemLikes && (
          <View style={styles.like}>
            <LikeButton item={item} onChange={onLiked} />
          </View>
        )}
        {item.soldOut && (
          <View style={styles.closedVeil}>
            <Text style={styles.closedText}>Épuisé</Text>
          </View>
        )}
        {!item.orderable ? (
          // For information only (a service done on the spot): nothing to add to the basket; « Intéressé » tells the
          // shop and opens WhatsApp with it.
          <InterestButton item={item} shop={shop} variant="compact" />
        ) : item.soldOut ? null : qty > 0 ? (
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

function SortSheet<K extends string>({
  visible,
  options,
  value,
  onChange,
  onClose,
  children,
}: {
  visible: boolean;
  options: { key: K; label: string; icon: keyof typeof Ionicons.glyphMap }[];
  value: K;
  onChange: (k: K) => void;
  onClose: () => void;
  /** Filters under the sorts (the market: who sells). */
  children?: ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <SheetHeader onClose={onClose} titleStyle={styles.sheetTitle}>{children ? 'Trier et filtrer' : 'Trier'}</SheetHeader>
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
        {children}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  sheetSection: { ...typo.smallStrong, color: colors.navy, marginTop: 12, marginBottom: 8, paddingHorizontal: 4 },
  sellers: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 4 },
  studentTag: { marginTop: -6, paddingHorizontal: 6, paddingVertical: 1, borderRadius: radii.pill, backgroundColor: colors.purpleText },
  studentTagText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  chips: { flexDirection: 'row', gap: 8, paddingRight: 8 },
  chip: { minHeight: 36, paddingHorizontal: 16, borderRadius: radii.pill, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  // Restaurant card: the photo on its tile at the left, the facts at the right.
  card: { flexDirection: 'row', gap: 10, padding: 7, borderRadius: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: '#EEF0F4' },
  tile: { width: 86, alignSelf: 'stretch', minHeight: 92, borderRadius: 15, backgroundColor: TILE, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  closedVeil: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingVertical: 4, backgroundColor: 'rgba(17,19,24,0.65)', alignItems: 'center' },
  closedText: { ...typo.captionStrong, color: '#fff' },
  info: { flex: 1, paddingVertical: 3, paddingRight: 3, gap: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flex: 1, fontSize: 14.5, fontWeight: '700', color: colors.navy },
  tag: { paddingHorizontal: 8, minHeight: 21, borderRadius: radii.pill, borderWidth: 1, borderColor: '#F4E3D9', backgroundColor: colors.card, justifyContent: 'center' },
  tagText: { fontSize: 11, fontWeight: '700', color: TAG },
  big: { fontSize: 17, fontWeight: '800', color: colors.navy },
  from: { fontSize: 12, fontWeight: '500', color: colors.muted2 },
  currency: { fontSize: 12, fontWeight: '500', color: colors.muted2 },
  serves: { fontSize: 12, color: colors.muted2 },
  // One line, never wrapped: the chips shrink before they break.
  facts: { flex: 1, flexDirection: 'row', gap: 4, overflow: 'hidden' },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 23, paddingHorizontal: 6, borderRadius: radii.pill, backgroundColor: TILE, flexShrink: 1 },
  factsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  factText: { fontSize: 11, fontWeight: '500', color: colors.navy, flexShrink: 1 },
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
  // Wider than tall (two rows of products in view), but not too flat: a square photo keeps most of its height.
  productTile: { height: 116, borderRadius: 12, backgroundColor: TILE, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  photoCount: { position: 'absolute', left: 6, top: 6, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radii.pill, backgroundColor: 'rgba(10,16,40,0.7)' },
  photoCountText: { ...typo.label, color: '#fff' },
  like: { position: 'absolute', right: 5, top: 5 },
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
