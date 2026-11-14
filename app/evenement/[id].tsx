import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, type ScrollViewInstance, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { FitImage } from '@/components/FitImage';
import { usePullRefresh } from '@/components/PullRefresh';
import { PhoneField, phoneOk } from '@/components/PhoneField';
import { HoldCountdown } from '@/components/HoldCountdown';
import { OrganizerLine } from '@/components/caravan';
import { eventWhen } from '@/components/home';
import { NudgeRight } from '@/components/motion';
import { RequestPass } from '@/components/RequestPass';
import { BackButton, PrimaryButton, TextButton } from '@/components/ui';
import { formatDateTime, formatFcfa } from '@/constants/data';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useCaravans } from '@/context/CaravansContext';
import { toOrganizer } from '@/features/caravans/api';
import { eventsApi, type EventBookingDto, type EventDto } from '@/features/events/api';
import { ApiError } from '@/lib/api';
import { useNow } from '@/lib/useNow';
import { countdown } from '@/features/events/countdown';
import { confirmAction, notice } from '@/lib/notice';
import { haptics } from '@/lib/haptics';

const price = (n: number) => (n === 0 ? 'Gratuit' : formatFcfa(n));

/**
 * An event promoted on the home carousel: its pictures (slide), what, when, where, who organizes it, and its
 * tickets. A request paid in cash to the organizer, who validates it (a free event is booked at once); each ticket gets a QR code.
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
  // For a friend: their phone (they paid the organizer in cash: the tickets are theirs at once).
  const [friendPhone, setFriendPhone] = useState('');
  const [paying, setPaying] = useState(false);
  const now = useNow();
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
  const pull = usePullRefresh(load);

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
  const friendDigits = friendPhone.replace(/\D/g, '');
  const add = (typeId: string, d: number) => {
    const t = e.ticketTypes.find((x) => x.typeId === typeId)!;
    const next = Math.max(0, Math.min((qty[typeId] ?? 0) + d, t.remaining));
    if (d > 0 && count >= e.myTicketsLeft) {
      Alert.alert('Limite atteinte', `${e.maxPerStudent} billet${e.maxPerStudent > 1 ? 's' : ''} maximum par étudiant pour cet événement.`);
      return;
    }
    setQty((q) => ({ ...q, [typeId]: next }));
  };

  /** Issued at once (a free event, or ordered by its organizer): to the ticket, or what to do with them. */
  const issued = async (b: EventBookingDto) => {
    await refresh();
    haptics.success();
    if (forFriends) {
      const n = b.tickets.length;
      notice({
        tone: 'success',
        title: n > 1 ? `${n} billets prêts à offrir` : 'Billet prêt à offrir',
        message: 'Ils sont dans « Mes billets ». Envoie chacun à un ami :',
        steps: ['Ouvre le billet', 'Touche « Transférer à un ami » et entre son numéro', 'Il accepte : le billet et son QR code deviennent les siens'],
      });
      return;
    }
    const first = b.tickets.find((t) => t.ticketId)?.ticketId;
    if (first) router.replace({ pathname: '/billet/[id]', params: { id: first, nouveau: '1' } });
  };

  /** For a friend who paid the organizer: the tickets are theirs at once. */
  const orderForFriend = async () => {
    setPaying(true);
    try {
      const items = Object.entries(qty).filter(([, q]) => q > 0).map(([typeId, q]) => ({ typeId, qty: q }));
      const { booking } = await eventsApi.book(e.id, { items, friendPhone: friendDigits });
      haptics.success();
      const n = booking.tickets.length;
      notice({ tone: 'success', title: n > 1 ? `${n} billets envoyés à ton ami` : 'Billet envoyé à ton ami', message: 'Ils sont dans son app, avec leur QR code.' });
      setQty({});
      setFriendPhone('');
      setForFriends(false);
      load();
    } catch (err) {
      Alert.alert('Commande impossible', err instanceof ApiError ? err.message : 'Réessaie dans un instant.');
      load();
    } finally {
      setPaying(false);
    }
  };

  /** A request: the places held 24 h, paid to the organizer in cash, who validates it. Free: the tickets at once. */
  const buy = async () => {
    if (mine && forFriends) return orderForFriend();
    setPaying(true);
    try {
      const items = Object.entries(qty).filter(([, q]) => q > 0).map(([typeId, q]) => ({ typeId, qty: q }));
      const { booking } = await eventsApi.book(e.id, { items, ...(e.organizedByMe ? { forFriends: true } : {}) });
      setQty({});
      if (booking.status === 'confirmed') return issued(booking);
      haptics.success();
      notice({
        tone: 'success',
        title: 'Demande envoyée',
        message: `Va payer ${formatFcfa(booking.total)} en espèces à l’organisateur avant le ${formatDateTime(Date.parse(booking.holdExpiresAt))}. Il valide ta demande et ton billet apparaît, avec son QR code.`,
      });
      load();
    } catch (err) {
      Alert.alert('Demande impossible', err instanceof ApiError ? err.message : 'Réessaie dans un instant.');
      load();
    } finally {
      setPaying(false);
    }
  };

  const cancelRequest = () =>
    confirmAction({
      title: 'Annuler ta demande ?',
      message: 'Les places repartent en vente. Si tu as déjà payé l’organisateur, vois avec lui.',
      confirm: 'Annuler la demande',
      keep: 'Garder',
      onConfirm: () => eventsApi.release(e.myBooking!.id).then(load, (err) => Alert.alert('Annulation impossible', err instanceof ApiError ? err.message : 'Vérifie ta connexion et réessaie.')),
    });

  const closed = !e.salesOpen;
  // Its organizing team sees the page as students do, and orders only for friends.
  const mine = e.organizedByMe;
  const canPick = !mine || forFriends;
  return (
    <View style={styles.safe}>
      <ScrollView refreshControl={pull} ref={scroll} contentContainerStyle={{ paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        <Slider images={cover && e.images.includes(cover) ? [cover, ...e.images.filter((u) => u !== cover)] : e.images} top={insets.top} onBack={back} />

        <View style={styles.body} onLayout={(ev) => toTickets('body', ev.nativeEvent.layout.y)}>
          <View style={styles.chipsRow}>
            <View style={styles.chip}>
              <Text style={styles.chipText}>{e.categoryLabel.toUpperCase()}</Text>
            </View>
            {/* How soon: « Dans 3 j », « Aujourd’hui · 20h00 », « En cours ». */}
            <View style={styles.soon}>
              <Ionicons name="time-outline" size={12} color={colors.orangeText} />
              <Text style={styles.soonText}>{countdown(e.startsAt, e.endsAt, now)}</Text>
            </View>
          </View>
          <Text style={styles.title}>{e.title}</Text>
          {/* An entity (association, company) by its name; a student organizing on their own: no name shown. */}
          {!!e.organizer.name && <OrganizerLine organizer={toOrganizer(e.organizer)} />}

          {e.status === 'cancelled' && (
            <Banner tone="danger" icon="close-circle" text={`Événement annulé${e.cancellation ? ` : ${e.cancellation.reason}` : ''}. Si tu as payé l’organisateur, vois avec lui pour le remboursement.`} />
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
            // My request: paid to the organizer in cash, who validates it.
            <View style={[styles.card, shadow.card, styles.held]}>
              <Ionicons name="hourglass-outline" size={26} color={colors.primary} />
              <Text style={styles.heldTitle}>Demande en attente de validation</Text>
              <HoldCountdown until={e.myBooking.holdExpiresAt} />
              <Text style={[styles.muted, { textAlign: 'center' }]}>
                Va payer {formatFcfa(e.myBooking.total)} en espèces à l’organisateur{e.organizer.name ? ` (${e.organizer.name})` : ''} avant le {formatDateTime(Date.parse(e.myBooking.holdExpiresAt))}. Il valide ce que tu as payé et chaque billet apparaît ici, avec son propre QR code. Sinon, la demande est annulée.
              </Text>
              <RequestPass code={e.myBooking.code} organizer={e.myBooking.organizer} items={(e.myBooking.units ?? []).map((u) => ({ id: u.id, title: u.name, price: u.price, code: u.code }))} />
              <TextButton label="Annuler ma demande" tone="accent" style={{ alignSelf: 'center' }} onPress={cancelRequest} />
            </View>
          ) : (
            e.status === 'published' && (
              <View style={{ gap: 10 }} onLayout={(ev) => toTickets('tickets', ev.nativeEvent.layout.y)}>
                {mine && <OwnEventCard eventId={e.id} personal={e.organizer.category === 'Étudiant'} />}
                {mine && !closed && !forFriends && <ForFriendsCard onPress={() => setForFriends(true)} />}
                <View style={styles.sectionRow}>
                  <Text style={[styles.section, { flex: 1 }]}>{forFriends ? 'Billets pour ton ami' : 'Billets'}</Text>
                  {forFriends && (
                    <TextButton
                      label="Annuler"
                      onPress={() => {
                        setForFriends(false);
                        setQty({});
                        setFriendPhone('');
                      }}
                    />
                  )}
                </View>
                {mine && forFriends && (
                  <View style={[styles.card, shadow.card, { gap: 8 }]}>
                    <PhoneField label="Numéro de ton ami" value={friendPhone} onChange={setFriendPhone} />
                    <Text style={styles.muted}>Il t’a payé : ses billets arrivent tout de suite dans son app. Pas encore sur UGB Connect ? Rien n’est commandé.</Text>
                  </View>
                )}
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
                    {forFriends ? 'Les billets sont à son nom, avec leur QR code dans son app.' : 'Un QR code par billet dans ton app. Tu peux en offrir à des amis depuis le billet.'}
                  </Text>
                )}

                {total > 0 && !(mine && forFriends) && (
                  <View style={styles.cashInfo}>
                    <Ionicons name="cash-outline" size={18} color={colors.successText} />
                    <Text style={styles.cashInfoText}>Paiement en espèces, en main propre à l’organisateur. Tes places sont gardées 24 h : il valide ta demande dès qu’il reçoit l’argent.</Text>
                  </View>
                )}
              </View>
            )
          )}
        </View>
      </ScrollView>

      {e.status === 'published' && !e.myBooking && !closed && canPick && (
        <View style={[styles.bar, { paddingBottom: 12 + insets.bottom }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.muted}>{count ? `${count} billet${count > 1 ? 's' : ''}${forFriends ? ' pour ton ami' : ''}` : `Dès ${price(e.minPrice)}`}</Text>
            <Text style={styles.total}>{count ? price(total) : forFriends ? 'Combien pour ton ami ?' : 'Choisis tes billets'}</Text>
          </View>
          <PrimaryButton
            label={forFriends ? 'Envoyer à mon ami' : total > 0 ? 'Envoyer ma demande' : 'Réserver'}
            loading={paying}
            disabled={!count || paying || (forFriends && !phoneOk(friendDigits))}
            onPress={buy}
            style={{ paddingHorizontal: 22 }}
          />
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
          <FitImage key={uri} uri={uri} style={{ width, height: width * 0.62 }} accessibilityLabel={`Photo ${i + 1} sur ${images.length}`} />
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

/** Its organizer's way to order: for a friend, by their phone (the friend pays from their app). */
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
      accessibilityHint="Choisis ses billets et entre son numéro : il les paie dans son app">
      <View style={styles.friendsIcon}>
        <Ionicons name="gift" size={20} color="#fff" />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.typeName}>Commander pour un ami</Text>
        <Text style={styles.muted}>Choisis ses billets et entre son numéro : la commande arrive dans son app, il la paie.</Text>
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
  chipsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  soon: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: colors.accentSoft },
  soonText: { ...typo.captionStrong, color: colors.orangeText },
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
  held: { alignItems: 'center', gap: 8, paddingVertical: 18 },
  heldTitle: { ...typo.title, color: colors.navy },
  heldBtn: { marginTop: 4, backgroundColor: colors.accent, paddingHorizontal: 22, minHeight: 42, borderRadius: radii.pill, justifyContent: 'center' },
  heldBtnText: { color: '#fff', fontWeight: '700' },
  own: { flexDirection: 'row', gap: 12, borderWidth: 1.5, borderColor: colors.primarySoft },
  cashInfo: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: radii.md, backgroundColor: colors.successBg },
  cashInfoText: { ...typo.small, flex: 1, color: colors.successText, lineHeight: 19 },
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
