import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, type ScrollViewInstance, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { HoldCountdown } from '@/components/HoldCountdown';
import { OrganizerLine } from '@/components/caravan';
import { eventWhen } from '@/components/home';
import { NudgeRight } from '@/components/motion';
import { PaymentLogo } from '@/components/PaymentLogo';
import { BackButton, TextButton } from '@/components/ui';
import { cashMethod, formatDateTime, formatFcfa, paymentMethods } from '@/constants/data';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useCaravans } from '@/context/CaravansContext';
import { toOrganizer } from '@/features/caravans/api';
import { eventsApi, type EventBookingDto, type EventDto } from '@/features/events/api';
import { payInBrowser, type TicketMethod } from '@/features/payments/checkout';
import { ApiError } from '@/lib/api';
import { notice } from '@/lib/notice';
import { haptics } from '@/lib/haptics';

const METHOD: Record<string, TicketMethod> = { wave: 'wave', om: 'orange_money', cash: 'cash' };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const price = (n: number) => (n === 0 ? 'Gratuit' : formatFcfa(n));

/**
 * An event promoted on the home carousel: its pictures (slide), what, when, where, who organizes it, and its
 * tickets. Paid with Wave or Orange Money (a free event is booked at once); each ticket gets a QR code.
 */
export default function Evenement() {
  // `acheter`: opened from "Acheter un ticket": one ticket preselected, the page scrolled to the tickets.
  // `cover`: opened from a banner, the picture it showed comes first.
  const { id, acheter, cover } = useLocalSearchParams<{ id: string; acheter?: string; cover?: string }>();
  const scroll = useRef<ScrollViewInstance>(null);
  const preselected = useRef(false);
  // Where the tickets are in the page (their section's offset inside the body, plus the body's): known after layout.
  const at = useRef<{ body: number | null; tickets: number | null; done: boolean }>({ body: null, tickets: null, done: false });
  const toTickets = (part: 'body' | 'tickets', y: number) => {
    at.current[part] = y;
    const { body, tickets, done } = at.current;
    if (!acheter || done || body === null || tickets === null) return;
    at.current.done = true;
    scroll.current?.scrollTo({ y: body + tickets - 12, animated: true });
  };
  const { refresh } = useCaravans();
  const [e, setE] = useState<EventDto | null>(null);
  const [missing, setMissing] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>({});
  // Its organizer orders for friends only: the ticket choice opens once they say so.
  const [forFriends, setForFriends] = useState(false);
  const [method, setMethod] = useState(paymentMethods[0].id);
  const [paying, setPaying] = useState(false);
  const insets = useSafeAreaInsets();

  const load = useCallback(() => {
    if (!id) return;
    eventsApi.get(id).then((ev) => {
      setE(ev);
      const first = ev.ticketTypes.find((t) => !t.soldOut);
      if (acheter && !preselected.current && first && ev.salesOpen && !ev.organizedByMe && !ev.myBooking && ev.myTicketsLeft > 0) {
        preselected.current = true;
        setQty({ [first.typeId]: 1 });
      }
    }, (err) => err instanceof ApiError && err.status === 404 && setMissing(true));
  }, [id, acheter]);
  useFocusEffect(load);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));

  if (!e) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.head}>
          <BackButton onPress={back} />
        </View>
        {missing ? <Text style={styles.muted}>Événement introuvable.</Text> : <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />}
      </SafeAreaView>
    );
  }

  const count = Object.values(qty).reduce((n, q) => n + q, 0);
  const total = e.ticketTypes.reduce((n, t) => n + (qty[t.typeId] ?? 0) * t.price, 0);
  // Only what the organizer accepts (cash: paid at the door); the choice falls back to the first of them.
  const allowed = e.paymentMethods ?? ['wave', 'orange_money'];
  const accepted = [...paymentMethods, cashMethod].filter((m) => allowed.includes(METHOD[m.id] ?? 'wave'));
  const chosen = accepted.some((m) => m.id === method) ? method : (accepted[0]?.id ?? method);
  const add = (typeId: string, d: number) => {
    const t = e.ticketTypes.find((x) => x.typeId === typeId)!;
    const next = Math.max(0, Math.min((qty[typeId] ?? 0) + d, t.remaining));
    if (d > 0 && count >= e.myTicketsLeft) {
      Alert.alert('Limite atteinte', `${e.maxPerStudent} billet${e.maxPerStudent > 1 ? 's' : ''} maximum par étudiant pour cet événement.`);
      return;
    }
    setQty((q) => ({ ...q, [typeId]: next }));
  };

  /** After the payment page: the booking tells whether the tickets were issued. */
  const settle = async (booking: EventBookingDto) => {
    let b = booking;
    for (let i = 0; i < 4 && b.status === 'held'; i++) {
      await sleep(800);
      b = await eventsApi.booking(b.id);
    }
    await refresh();
    if (b.status === 'confirmed') {
      haptics.success();
      const first = b.tickets.find((t) => t.ticketId)?.ticketId;
      if (first) router.replace({ pathname: '/billet/[id]', params: { id: first, nouveau: '1' } });
      if (forFriends) {
        const n = b.tickets.length;
        notice({
          tone: 'success',
          title: n > 1 ? `${n} billets prêts à offrir` : 'Billet prêt à offrir',
          message: 'Ils sont dans « Mes billets ». Envoie chacun à un ami :',
          steps: ['Ouvre le billet', 'Touche « Transférer à un ami » et entre son numéro', 'Il accepte : le billet et son QR code deviennent les siens'],
        });
      }
      return;
    }
    if (b.status === 'held') notice({ tone: 'pending', title: 'Paiement en attente', message: 'Tes billets sont gardés 10 minutes. Termine le paiement depuis cette page.' });
    else notice({ tone: 'warning', title: 'Paiement non effectué', message: 'Les places ont été libérées. Tu peux réessayer.' });
    load();
  };

  const buy = async () => {
    setPaying(true);
    try {
      const items = Object.entries(qty).filter(([, q]) => q > 0).map(([typeId, q]) => ({ typeId, qty: q }));
      const { booking, payment } = await eventsApi.book(e.id, { items, method: METHOD[chosen] ?? 'wave', ...(e.organizedByMe ? { forFriends: true } : {}) });
      if (payment) await payInBrowser(payment);
      await settle(booking.status === 'confirmed' ? booking : await eventsApi.booking(booking.id));
      setQty({});
    } catch (err) {
      Alert.alert('Réservation impossible', err instanceof ApiError ? err.message : 'Réessaie dans un instant.');
      load();
    } finally {
      setPaying(false);
    }
  };

  const resume = async () => {
    if (!e.myBooking?.payment) return;
    setPaying(true);
    try {
      await payInBrowser(e.myBooking.payment);
      await settle(await eventsApi.booking(e.myBooking.id));
    } finally {
      setPaying(false);
    }
  };

  const closed = !e.salesOpen;
  // Its organizing team sees the page as students do, and orders only for friends.
  const mine = e.organizedByMe;
  const canPick = !mine || forFriends;
  return (
    <View style={styles.safe}>
      <ScrollView ref={scroll} contentContainerStyle={{ paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        <Slider images={cover && e.images.includes(cover) ? [cover, ...e.images.filter((u) => u !== cover)] : e.images} top={insets.top} onBack={back} />

        <View style={styles.body} onLayout={(ev) => toTickets('body', ev.nativeEvent.layout.y)}>
          <View style={styles.chip}>
            <Text style={styles.chipText}>{e.categoryLabel.toUpperCase()}</Text>
          </View>
          <Text style={styles.title}>{e.title}</Text>
          {/* An entity (association, company) by its name; a student organizing on their own: no name shown. */}
          {!!e.organizer.name && <OrganizerLine organizer={toOrganizer(e.organizer)} />}

          {e.status === 'cancelled' && (
            <Banner tone="danger" icon="close-circle" text={`Événement annulé${e.cancellation ? ` : ${e.cancellation.reason}` : ''}. Les billets sont remboursés.`} />
          )}
          {e.myTickets.length > 0 && (
            <Pressable onPress={() => router.push(`/billet/${e.myTickets[0]}`)} accessibilityRole="link">
              <Banner tone="success" icon="ticket" text={`Tu as ${e.myTickets.length} billet${e.myTickets.length > 1 ? 's' : ''} · Voir ${e.myTickets.length > 1 ? 'mes billets' : 'mon billet'}`} />
            </Pressable>
          )}

          <View style={[styles.card, shadow.card, { gap: 12 }]}>
            <Info icon="calendar-outline" title={eventWhen(e.startsAt)} text={`Fin prévue le ${formatDateTime(Date.parse(e.endsAt))}`} />
            <Info icon="location-outline" title={e.venue.name} text={e.venue.address ?? 'UGB'} />
            {e.status === 'published' && <Info icon="time-outline" title="Billetterie" text={closed ? 'Fermée' : `Ouverte jusqu’au ${formatDateTime(Date.parse(e.salesCloseAt))}`} />}
          </View>

          {!!e.description && (
            <View style={{ gap: 6 }}>
              <Text style={styles.section}>À propos</Text>
              <Text style={styles.description}>{e.description}</Text>
            </View>
          )}

          {e.myBooking ? (
            <View style={[styles.card, shadow.card, styles.held]}>
              <Ionicons name="time-outline" size={26} color={colors.primary} />
              <Text style={styles.heldTitle}>Billets gardés pour toi</Text>
              <HoldCountdown until={e.myBooking.holdExpiresAt} />
              <Text style={styles.muted}>Termine le paiement avant {formatDateTime(Date.parse(e.myBooking.holdExpiresAt))}.</Text>
              <Pressable style={styles.heldBtn} onPress={resume} disabled={paying}>
                <Text style={styles.heldBtnText}>{paying ? 'Paiement…' : `Payer ${formatFcfa(e.myBooking.total)}`}</Text>
              </Pressable>
              <TextButton label="Libérer les places" tone="accent" style={{ alignSelf: 'center' }} onPress={() => eventsApi.release(e.myBooking!.id).then(load, (err) => Alert.alert('Libération impossible', err instanceof ApiError ? err.message : 'Vérifie ta connexion et réessaie.'))} />
            </View>
          ) : (
            e.status === 'published' && (
              <View style={{ gap: 10 }} onLayout={(ev) => toTickets('tickets', ev.nativeEvent.layout.y)}>
                {mine && <OwnEventCard eventId={e.id} personal={e.organizer.category === 'Étudiant'} />}
                {mine && !closed && !forFriends && <ForFriendsCard onPress={() => setForFriends(true)} />}
                <View style={styles.sectionRow}>
                  <Text style={[styles.section, { flex: 1 }]}>{forFriends ? 'Billets pour tes amis' : 'Billets'}</Text>
                  {forFriends && (
                    <TextButton
                      label="Annuler"
                      onPress={() => {
                        setForFriends(false);
                        setQty({});
                      }}
                    />
                  )}
                </View>
                {e.ticketTypes.map((t) => {
                  const n = qty[t.typeId] ?? 0;
                  return (
                    <View key={t.typeId} style={[styles.card, shadow.card, styles.type, t.soldOut && { opacity: 0.55 }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.typeName}>{t.name}</Text>
                        {!!t.description && <Text style={styles.muted}>{t.description}</Text>}
                        <Text style={styles.typePrice}>
                          {price(t.price)}
                          {t.soldOut ? ' · Complet' : t.remaining <= 20 ? ` · Plus que ${t.remaining}` : ''}
                        </Text>
                      </View>
                      {!closed && !t.soldOut && canPick && (
                        <View style={styles.stepper}>
                          <Pressable onPress={() => add(t.typeId, -1)} disabled={!n} style={[styles.step, !n && { opacity: 0.4 }]} accessibilityLabel={`Un billet ${t.name} de moins`}>
                            <Ionicons name="remove" size={18} color={colors.primary} />
                          </Pressable>
                          <Text style={styles.qty}>{n}</Text>
                          <Pressable onPress={() => add(t.typeId, 1)} style={styles.step} accessibilityLabel={`Un billet ${t.name} de plus`}>
                            <Ionicons name="add" size={18} color={colors.primary} />
                          </Pressable>
                        </View>
                      )}
                    </View>
                  );
                })}
                {canPick && e.myTicketsLeft < e.maxPerStudent && e.myTicketsLeft > 0 && <Text style={styles.muted}>Tu peux encore prendre {e.myTicketsLeft} billet{e.myTicketsLeft > 1 ? 's' : ''}.</Text>}
                {canPick && (
                  <Text style={styles.muted}>
                    {forFriends ? 'Aucun n’est pour toi : chaque billet s’envoie à un ami depuis « Mes billets », avec son propre QR code.' : 'Un QR code par billet dans ton app. Tu peux en offrir à des amis depuis le billet.'}
                  </Text>
                )}

                {total > 0 && (
                  <>
                    <Text style={styles.section}>Moyen de paiement</Text>
                    {accepted.map((m) => {
                      const on = m.id === chosen;
                      return (
                        <Pressable key={m.id} onPress={() => setMethod(m.id)} style={[styles.card, styles.payment, on && styles.paymentOn]}>
                          <PaymentLogo method={m} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.typeName}>{m.name}</Text>
                            {m.id === 'cash' && <Text style={styles.muted}>Billet tout de suite, payé à l’entrée</Text>}
                          </View>
                          {on ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} /> : <View style={styles.radio} />}
                        </Pressable>
                      );
                    })}
                  </>
                )}
              </View>
            )
          )}
        </View>
      </ScrollView>

      {e.status === 'published' && !e.myBooking && !closed && canPick && (
        <View style={[styles.bar, { paddingBottom: 12 + insets.bottom }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.muted}>{count ? `${count} billet${count > 1 ? 's' : ''}${forFriends ? ' à offrir' : ''}` : `Dès ${price(e.minPrice)}`}</Text>
            <Text style={styles.total}>{count ? price(total) : forFriends ? 'Combien pour tes amis ?' : 'Choisis tes billets'}</Text>
          </View>
          <Pressable style={[styles.buy, (!count || paying) && styles.buyOff]} disabled={!count || paying} onPress={buy} accessibilityRole="button">
            <Text style={styles.buyText}>{paying ? 'Un instant…' : total > 0 ? (chosen === 'cash' ? 'Réserver · payer à l’entrée' : `Payer ${formatFcfa(total)}`) : forFriends ? 'Commander' : 'Réserver'}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

/** The event's pictures, full width, swiped; the back button over them. */
const SLIDE_MS = 4000;

/** The event's pictures, sliding on their own every 4 s (paused while the student swipes). */
function Slider({ images, top, onBack }: { images: string[]; top: number; onBack: () => void }) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const ref = useRef<ScrollViewInstance>(null);
  const shown = useRef(0);
  const touching = useRef(false);
  const onEnd = (ev: NativeSyntheticEvent<NativeScrollEvent>) => {
    shown.current = Math.round(ev.nativeEvent.contentOffset.x / width);
    setIndex(shown.current);
  };

  useEffect(() => {
    if (images.length < 2) return;
    const timer = setInterval(() => {
      if (touching.current) return;
      shown.current = (shown.current + 1) % images.length;
      ref.current?.scrollTo({ x: shown.current * width, animated: true });
      setIndex(shown.current);
    }, SLIDE_MS);
    return () => clearInterval(timer);
  }, [images.length, width]);

  return (
    <View>
      <ScrollView
        ref={ref}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScrollBeginDrag={() => (touching.current = true)}
        onScrollEndDrag={() => (touching.current = false)}
        onMomentumScrollEnd={onEnd}
        scrollEnabled={images.length > 1}>
        {images.map((uri, i) => (
          <Image key={uri} source={{ uri }} style={{ width, height: width * 0.62 }} contentFit="cover" transition={200} accessibilityLabel={`Photo ${i + 1} sur ${images.length}`} />
        ))}
      </ScrollView>
      <View style={[styles.backOver, { top: top + 8 }]}>
        <BackButton onPress={onBack} />
      </View>
      {images.length > 1 && (
        <View style={styles.dots}>
          {images.map((uri, i) => (
            <View key={uri} style={[styles.dot, i === index && styles.dotOn]} />
          ))}
        </View>
      )}
    </View>
  );
}

function Info({ icon, title, text }: { icon: keyof typeof Ionicons.glyphMap; title: string; text: string }) {
  return (
    <View style={styles.info}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.typeName}>{title}</Text>
        <Text style={styles.muted}>{text}</Text>
      </View>
    </View>
  );
}

/**
 * Shown to its organizing team instead of the ticket choice: they run it, they don't book it. A student's own event
 * opens « Mon événement »; an organization's is run from its organizer space.
 */
function OwnEventCard({ eventId, personal }: { eventId: string; personal: boolean }) {
  return (
    <View style={[styles.card, shadow.card, styles.own]}>
      <View style={styles.ownIcon}>
        <Ionicons name="sparkles" size={20} color={colors.primary} />
      </View>
      <View style={{ flex: 1, gap: 8 }}>
        <View style={{ gap: 2 }}>
          <Text style={styles.typeName}>C’est ton événement</Text>
          <Text style={styles.muted}>
            {personal ? 'Les étudiants réservent ici. Toi, tu le gères : photos, bannière, billets vendus.' : 'Les étudiants réservent ici. Ton équipe le gère depuis l’espace organisateur : billets vendus, scan à l’entrée.'}
          </Text>
        </View>
        {personal && <TextButton label="Gérer mon événement" icon="settings-outline" onPress={() => router.push({ pathname: '/mes-evenements/[id]', params: { id: eventId } })} style={{ alignSelf: 'flex-start' }} />}
      </View>
    </View>
  );
}

/** Its organizer's way to order: tickets for friends, each sent from « Mes billets ». */
function ForFriendsCard({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        haptics.select();
        onPress();
      }}
      style={({ pressed }) => [styles.card, shadow.card, styles.friends, pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] }]}
      accessibilityRole="button"
      accessibilityLabel="Commander pour un ami"
      accessibilityHint="Choisis des billets à offrir : aucun n’est pour toi">
      <View style={styles.friendsIcon}>
        <Ionicons name="gift" size={20} color="#fff" />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.typeName}>Commander pour un ami</Text>
        <Text style={styles.muted}>Offre des billets : chacun s’envoie à un ami, avec son propre QR code.</Text>
      </View>
      <NudgeRight>
        <Ionicons name="chevron-forward" size={20} color={colors.accent} />
      </NudgeRight>
    </Pressable>
  );
}

function Banner({ tone, icon, text }: { tone: 'success' | 'danger'; icon: keyof typeof Ionicons.glyphMap; text: string }) {
  const c = tone === 'success' ? { bg: colors.successBg, fg: colors.successText } : { bg: colors.dangerBg, fg: colors.dangerText };
  return (
    <View style={[styles.banner, { backgroundColor: c.bg }]}>
      <Ionicons name={icon} size={18} color={c.fg} />
      <Text style={[styles.bannerText, { color: c.fg }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  head: { paddingHorizontal: 20, paddingTop: 8 },
  body: { padding: 20, gap: 14 },
  chip: { alignSelf: 'flex-start', backgroundColor: colors.primarySoft, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { ...typo.label, color: colors.primary, letterSpacing: 0.4 },
  title: { ...typo.h2, color: colors.navy },
  card: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 14 },
  info: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoIcon: { width: 38, height: 38, borderRadius: radii.sm, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  section: { ...typo.section, color: colors.navy, marginTop: 4 },
  description: { ...typo.body, color: colors.text, lineHeight: 22 },
  muted: { ...typo.caption, color: colors.muted2, lineHeight: 17 },
  type: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  typeName: { ...typo.bodyStrong, color: colors.navy },
  typePrice: { ...typo.smallStrong, color: colors.primary, marginTop: 4 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  step: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  qty: { ...typo.title, color: colors.navy, minWidth: 18, textAlign: 'center' },
  payment: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: 'transparent' },
  paymentOn: { borderColor: colors.primary },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border },
  held: { alignItems: 'center', gap: 8, paddingVertical: 18 },
  heldTitle: { ...typo.title, color: colors.navy },
  heldBtn: { marginTop: 4, backgroundColor: colors.accent, paddingHorizontal: 22, minHeight: 42, borderRadius: radii.pill, justifyContent: 'center' },
  heldBtnText: { color: '#fff', fontWeight: '700' },
  own: { flexDirection: 'row', gap: 12, borderWidth: 1.5, borderColor: colors.primarySoft },
  friends: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: colors.accentSoft, backgroundColor: colors.accentSoft },
  friendsIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ownIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: radii.md },
  bannerText: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  backOver: { position: 'absolute', left: 16 },
  dots: { position: 'absolute', bottom: 10, alignSelf: 'center', flexDirection: 'row', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.55)' },
  dotOn: { width: 18, backgroundColor: '#fff' },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  total: { ...typo.title, color: colors.navy },
  buy: { backgroundColor: colors.accent, minHeight: 50, borderRadius: radii.pill, paddingHorizontal: 22, justifyContent: 'center' },
  buyOff: { backgroundColor: colors.tabInactive },
  buyText: { ...typo.title, color: '#fff' },
});
