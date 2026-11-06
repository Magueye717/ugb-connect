import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type ScrollViewInstance } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { PopOnChange, riseIn } from '@/components/motion';

import { PhotoGallery } from '@/components/PhotoGallery';
import { SafeBottom, SheetHeader } from '@/components/ui';
import { formatFcfa } from '@/constants/data';
import { colors, radii, typo } from '@/constants/theme';
import type { BusinessDto, ItemDto } from './api';
import { InterestButton } from './InterestButton';
import { LikeButton } from './LikeButton';

type Props = {
  /** The article shown; null hides the sheet. */
  item: ItemDto | null;
  shop: Pick<BusinessDto, 'id' | 'name' | 'phone' | 'open' | 'statusLabel' | 'itemLikes'>;
  /** In the basket now (this shop's basket). */
  qty: number;
  onQty: (qty: number) => void;
  /** The shop's own team: nothing to order or like, the details only. */
  member?: boolean;
  onClose: () => void;
  onLiked?: (v: { liked: boolean; likes: number }) => void;
  /** From the market: a way to the whole shop. */
  onOpenShop?: () => void;
  /** This shop's basket now: shown once something is in it, with the way to it. */
  basket?: { count: number; total: number } | null;
  onOpenCart?: () => void;
};

/**
 * An article's details, from the market or the shop's page: its photos (swipe; tap for full screen), price, the shop
 * and whether it's open, the description, what's left. Then what can be done with it: add to the basket, « Je suis
 * intéressé » for a service done on the spot, or why it can't be ordered now.
 */
export function ProductSheet({ item, shop, qty, onQty, member, onClose, onLiked, onOpenShop, basket, onOpenCart }: Props) {
  const { width, height } = useWindowDimensions();
  const [photo, setPhoto] = useState(0);
  const [full, setFull] = useState<number | null>(null);
  // Swiped by hand: the photos stop sliding by themselves.
  const [touched, setTouched] = useState(false);
  // Another article opened: back to its first photo (render-time adjustment, no effect).
  const [seenId, setSeenId] = useState(item?.id);
  if (item?.id !== seenId) {
    setSeenId(item?.id);
    setPhoto(0);
    setTouched(false);
  }
  const photoW = width - 40;
  const strip = useRef<ScrollViewInstance>(null);
  // The photo on screen, for the timer (read outside render).
  const current = useRef(0);
  useEffect(() => {
    current.current = photo;
  }, [photo]);
  // The photos slide by themselves (every 3.5 s) until the student touches them; never with « reduce motion ».
  const reduced = useReducedMotion();
  const count = item?.photos.length ?? 0;
  useEffect(() => {
    if (!item || count < 2 || touched || full !== null || reduced) return;
    const t = setInterval(() => {
      const next = (current.current + 1) % count;
      strip.current?.scrollTo({ x: next * photoW, animated: true });
      setPhoto(next);
    }, 3500);
    return () => clearInterval(t);
  }, [item, count, touched, full, reduced, photoW]);

  const can = !!item && shop.open && !item.soldOut;
  const atMax = !!item && item.stock !== null && qty >= item.stock;

  return (
    <Modal visible={!!item} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fermer" />
      {item && (
        <View style={[styles.sheet, { maxHeight: height * 0.9 }]}>
          <SheetHeader onClose={onClose} subtitle={`${shop.name} · ${shop.statusLabel}`}>
            {item.name}
          </SheetHeader>
          <ScrollView contentContainerStyle={{ gap: 14 }} showsVerticalScrollIndicator={false}>
            {item.photos.length > 0 ? (
              <View>
                <ScrollView
                  ref={strip}
                  horizontal
                  pagingEnabled
                  // Inside the sheet's own vertical scroll: Android needs this to let the photos swipe sideways.
                  nestedScrollEnabled
                  decelerationRate="fast"
                  onScrollBeginDrag={() => setTouched(true)}
                  showsHorizontalScrollIndicator={false}
                  onMomentumScrollEnd={(e) => setPhoto(Math.round(e.nativeEvent.contentOffset.x / photoW))}
                  style={{ width: photoW, borderRadius: radii.lg }}>
                  {item.photos.map((uri, i) => (
                    <Pressable key={uri} onPress={() => setFull(i)} accessibilityRole="imagebutton" accessibilityLabel={`Photo ${i + 1} de ${item.name}, voir en grand`}>
                      <Image source={{ uri }} style={{ width: photoW, height: photoW * 0.75 }} contentFit="cover" transition={150} />
                    </Pressable>
                  ))}
                </ScrollView>
                {item.photos.length > 1 && (
                  <View style={styles.dots}>
                    {item.photos.map((uri, i) => (
                      <View key={uri} style={[styles.dot, i === photo && styles.dotOn]} />
                    ))}
                  </View>
                )}
                {shop.itemLikes && !member && (
                  <View style={styles.like}>
                    <LikeButton item={item} onChange={onLiked} />
                  </View>
                )}
              </View>
            ) : (
              <View style={[styles.noPhoto, { height: photoW * 0.5 }]}>
                <Ionicons name="pricetag-outline" size={34} color={colors.muted} />
              </View>
            )}

            <View style={styles.priceRow}>
              <Text style={styles.price}>{formatFcfa(item.price)}</Text>
              {!item.orderable ? (
                <View style={styles.tag}>
                  <Text style={styles.tagText}>Sur place</Text>
                </View>
              ) : item.soldOut ? (
                <View style={[styles.tag, { backgroundColor: colors.dangerBg }]}>
                  <Text style={[styles.tagText, { color: colors.dangerText }]}>Épuisé</Text>
                </View>
              ) : item.stock !== null ? (
                <Text style={styles.muted}>
                  {item.stock} restant{item.stock > 1 ? 's' : ''}
                </Text>
              ) : null}
            </View>
            {!!item.category && <Text style={styles.category}>{item.category}</Text>}
            {!!item.detail && <Text style={styles.detail}>{item.detail}</Text>}

            {onOpenShop && (
              <Pressable style={styles.shopLink} onPress={onOpenShop} accessibilityRole="button">
                <View style={[styles.statusDot, { backgroundColor: shop.open ? colors.success : colors.muted }]} />
                <Text style={[styles.shopName, { flex: 1 }]} numberOfLines={1}>
                  {shop.name}
                </Text>
                <Text style={styles.link}>Voir la boutique</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.primary} />
              </Pressable>
            )}
          </ScrollView>

          {/* What can be done with it. */}
          {!member && (
            <View style={styles.actions}>
              {!item.orderable ? (
                <InterestButton item={item} shop={shop} />
              ) : !can ? (
                <Text style={styles.muted}>{item.soldOut ? 'Épuisé pour l’instant.' : `${shop.name} est fermé : reviens à l’ouverture.`}</Text>
              ) : qty > 0 ? (
                <View style={styles.stepper}>
                  <Pressable onPress={() => onQty(qty - 1)} style={styles.stepBtn} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Retirer un ${item.name}`}>
                    <Ionicons name={qty === 1 ? 'trash-outline' : 'remove'} size={18} color="#fff" />
                  </Pressable>
                  <Text style={styles.qty}>{qty} dans le panier</Text>
                  <Pressable onPress={() => onQty(qty + 1)} disabled={atMax} style={[styles.stepBtn, atMax && { opacity: 0.4 }]} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Ajouter un ${item.name}`}>
                    <Ionicons name="add" size={18} color="#fff" />
                  </Pressable>
                </View>
              ) : (
                <Pressable style={styles.add} onPress={() => onQty(1)} accessibilityRole="button">
                  <Ionicons name="basket-outline" size={18} color="#fff" />
                  <Text style={styles.addText}>Ajouter au panier · {formatFcfa(item.price)}</Text>
                </Pressable>
              )}
              {/* The basket, once something is in it: rises in, and its count pops at each change. */}
              {!!basket && basket.count > 0 && onOpenCart && (
                <Animated.View entering={riseIn}>
                  <Pressable style={styles.cart} onPress={onOpenCart} accessibilityRole="button" accessibilityLabel={`Voir le panier : ${basket.count} article${basket.count > 1 ? 's' : ''}, ${formatFcfa(basket.total)}`}>
                    <PopOnChange id={basket.count}>
                      <View style={styles.cartIcon}>
                        <Ionicons name="basket" size={18} color={colors.primary} />
                        <View style={styles.cartBadge}>
                          <Text style={styles.cartBadgeText}>{basket.count}</Text>
                        </View>
                      </View>
                    </PopOnChange>
                    <Text style={[styles.cartText, { flex: 1 }]}>Voir le panier</Text>
                    <Text style={styles.cartText}>{formatFcfa(basket.total)}</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                  </Pressable>
                </Animated.View>
              )}
            </View>
          )}
          <SafeBottom />
        </View>
      )}
      <PhotoGallery photos={item?.photos ?? []} start={full} title={item?.name ?? ''} onClose={() => setFull(null)} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,27,76,0.35)' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: 20, paddingBottom: 12, gap: 14 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotOn: { width: 18, backgroundColor: colors.primary },
  like: { position: 'absolute', top: 8, right: 8 },
  noPhoto: { borderRadius: radii.lg, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  price: { ...typo.h2, color: colors.navy },
  tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill, backgroundColor: colors.primarySoft },
  tagText: { ...typo.label, color: colors.primary, fontWeight: '700' },
  category: { ...typo.captionStrong, color: colors.muted2, marginTop: -8 },
  detail: { ...typo.body, color: colors.navy, lineHeight: 22 },
  muted: { ...typo.small, color: colors.muted2 },
  shopLink: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: radii.md, backgroundColor: colors.bg },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  shopName: { ...typo.bodyStrong, color: colors.navy },
  link: { ...typo.smallStrong, color: colors.primary },
  actions: { alignItems: 'stretch', gap: 10 },
  cart: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50, paddingHorizontal: 12, borderRadius: radii.sm, borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  cartIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  cartBadge: { position: 'absolute', top: -2, right: -4, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  cartBadgeText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  cartText: { ...typo.bodyStrong, color: colors.primary },
  add: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 52, borderRadius: radii.sm, backgroundColor: colors.accent },
  addText: { ...typo.title, color: '#fff' },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52, paddingHorizontal: 8, borderRadius: radii.sm, backgroundColor: colors.primary },
  stepBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  qty: { ...typo.title, color: '#fff' },
});
