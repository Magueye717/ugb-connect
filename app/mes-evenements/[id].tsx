import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Animated, { Extrapolation, FadeIn, interpolate, interpolateColor, runOnJS, useAnimatedReaction, useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { DateField, TimeField } from '@/components/DatePicker';
import { eventWhen } from '@/components/home';
import { LivePulse, NudgeRight } from '@/components/motion';
import { PaymentLogo } from '@/components/PaymentLogo';
import { RequestsCard } from '@/components/RequestsCard';
import { BackButton, Chip, Field, LabeledField, PrimaryButton, Segmented, StatusChip, STICKY_FOOTER_SPACE, StickyFooter, TextButton, useDirty } from '@/components/ui';
import { formatFcfa, paymentMethods } from '@/constants/data';
import { methodsOffLine, useMethodsOff } from '@/features/payments/methods';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { bannerLastDay, bannersApi, holdsSlot, type BannerDto } from '@/features/banners/api';
import { eventsSource, EventsSourceProvider, useEventsSource } from '@/features/events/source';
import { CATEGORIES, EVENT_STATUS, eventsApi, EVERYONE, type EventAudience, type EventCategory, type EventInput, type OrgEventDto } from '@/features/events/api';
import { payInBrowser, type PaymentMethod } from '@/features/payments/checkout';
import { CAMPUSES, REGIONS, UFRS, VILLAGES, type CampusKey } from '@/features/register/validation';
import { ApiError } from '@/lib/api';
import { haptics } from '@/lib/haptics';
import { useLeaveGuard } from '@/lib/leaveGuard';
import { confirmAction, notice } from '@/lib/notice';
import { uploadImage } from '@/lib/upload';
import { useNow } from '@/lib/useNow';

const MAX_IMAGES = 8;
/** Start times offered: every 30 minutes from 8h to 23h30. */
const TIMES = Array.from({ length: 32 }, (_, i) => `${String(8 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);
const DURATIONS = [1, 2, 3, 4, 5, 6, 8, 10, 12];
const ACTION: Record<OrgEventDto['reviewLog'][number]['action'], string> = {
  submitted: 'Envoyé pour validation',
  approved: 'Validé',
  changes_requested: 'Corrections demandées',
  rejected: 'Refusé',
};

type TicketRow = { name: string; price: string; capacity: string };
const days = (now: number) =>
  Array.from({ length: 60 }, (_, i) => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + i);
    return d;
  });
/** The chosen day at the chosen "HH:MM". */
const startOf = (day: Date, time: string) => {
  const [h, m] = time.split(':').map(Number);
  const start = new Date(day);
  start.setHours(h!, m!, 0, 0);
  return start;
};
const METHOD: Record<string, PaymentMethod> = { wave: 'wave', om: 'orange_money' };
type Photo = { id: string; url: string };
const photosOf = (e: OrgEventDto): Photo[] => e.imageIds.map((imgId, i) => ({ id: imgId, url: e.images[i]! }));
/** "Toute l'université", or "Campus 1 · Village E · UFR SAT · Ziguinchor". */
const audienceLabel = (a: EventAudience) => {
  const parts = [
    a.campuses.map((c) => CAMPUSES.find((x) => x.key === c)?.label ?? c).join(', '),
    a.villages.join(', '),
    a.ufrs.length ? `UFR ${a.ufrs.join(', ')}` : '',
    a.regions.join(', '),
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Toute l’université';
};
const fail = (title: string) => (err: unknown) => Alert.alert(title, err instanceof ApiError ? err.message : 'Réessaie dans un instant.');

/**
 * A student's event: the form to create it or correct it (draft, corrections asked), then submitted to the UGB
 * Campus team. Once published, its state (tickets sold) and the history of the review.
 */
export default function MonEvenement() {
  const { id, org } = useLocalSearchParams<{ id: string; org?: string }>();
  const isNew = id === 'nouveau';
  // An organization's events (from its organizer space), or the student's own.
  const src = useMemo(() => eventsSource(org ?? null), [org]);
  const listHref = org ? { pathname: '/mes-evenements' as const, params: { org } } : '/mes-evenements';
  const { reloadAccount } = useAuth();
  const [event, setEvent] = useState<OrgEventDto | null>(null);
  const [loading, setLoading] = useState(!isNew);

  // Reloaded each time the screen shows: opened again from a notification ("publié"), it must not keep the state it
  // had before the payment.
  useFocusEffect(
    useCallback(() => {
      if (isNew || !id) return;
      eventsSource(org ?? null)
        .one(id)
        .then(setEvent, fail('Événement introuvable'))
        .finally(() => setLoading(false));
    }, [id, isNew, org]),
  );

  const back = () => (router.canGoBack() ? router.back() : router.replace(listHref));
  const editable = isNew || event?.status === 'draft' || event?.status === 'changes_requested';

  const heading = isNew ? 'Nouvel événement' : org ? 'Événement' : 'Mon événement';
  // Submitted, published or over: the dashboard, full screen under its cover.
  if (!loading && event && !editable && event.status !== 'approved') {
    return (
      <EventsSourceProvider value={src}>
        <EventState event={event} onChanged={setEvent} onBack={back} title={heading} />
      </EventsSourceProvider>
    );
  }

  return (
    <EventsSourceProvider value={src}>
    <SafeAreaView style={styles.safe}>
      <View style={styles.head}>
        <BackButton onPress={back} />
        <Text style={styles.h1}>{heading}</Text>
        <View style={{ width: 44 }} />
      </View>
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : event?.status === 'approved' ? (
        <PublishForm key={event.id} event={event} onChanged={setEvent} />
      ) : editable ? (
        <EventForm
          key={event?.id ?? 'new'}
          event={event}
          onSaved={(saved, submitted) => {
            // The first event creates the student's own organization: the organizer space appears.
            if (isNew) reloadAccount().catch(() => undefined);
            if (submitted && org) {
              router.replace(listHref);
              notice(
                saved.status === 'published'
                  ? { tone: 'success', title: 'Événement publié', message: `« ${saved.title} » est en ligne : les étudiants peuvent demander leurs billets.` }
                  : { tone: 'success', title: 'Envoyé pour validation', message: `« ${saved.title} » est entre les mains de l’équipe UGB Connect.` },
              );
            } else if (submitted) {
              router.replace('/mes-evenements');
              notice({
                tone: 'success',
                title: 'Envoyé pour validation',
                message: `« ${saved.title} » est entre les mains de l’équipe UGB Connect.`,
                steps: ['L’équipe vérifie ton événement', 'Validé : tu choisis qui le voit et le nombre de places', 'Tu paies la publication : la billetterie ouvre'],
                footnote: 'Tu reçois une notification dans tous les cas.',
              });
            } else if (isNew) router.replace(org ? { pathname: '/mes-evenements/[id]', params: { id: saved.id, org } } : `/mes-evenements/${saved.id}`);
            else setEvent(saved);
          }}
        />
      ) : null}
    </SafeAreaView>
    </EventsSourceProvider>
  );
}

type Tab = 'billetterie' | 'demandes' | 'visibilite';

const HERO_H = 300;
const BAR_H = 52;

/** « Dans 3 j », « Demain · 20h00 », « Aujourd’hui · 20h00 », « En cours », « Terminé ». */
function countdown(startsAt: string, endsAt: string, now: number) {
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  if (now >= end) return 'Terminé';
  if (now >= start) return 'En cours';
  const hour = new Date(start).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h');
  const day = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const days = Math.round((day(start) - day(now)) / 86_400_000);
  return days === 0 ? `Aujourd’hui · ${hour}` : days === 1 ? `Demain · ${hour}` : `Dans ${days} j`;
}

/**
 * Once submitted. A dashboard under the event's cover: the cover full width behind the status bar (it drifts slower
 * than the page, and grows when pulled), the status and a countdown on it; the three numbers that matter (sold,
 * entered, waiting) in a card over its edge; the door's four actions (scan, validate, see the page, share); then one
 * tab per job — the ticket office, the requests to validate (opened first when someone is waiting), visibility. The
 * tabs stay pinned under the top bar, which appears once the cover is gone.
 */
function EventState({ event: e, onChanged, onBack, title }: { event: OrgEventDto; onChanged: (e: OrgEventDto) => void; onBack: () => void; title: string }) {
  const src = useEventsSource();
  const insets = useSafeAreaInsets();
  const now = useNow();
  const published = e.status === 'published';
  const cancel = () =>
    confirmAction({
      title: 'Annuler l’événement ?',
      message: `« ${e.title} »`,
      bullets: [
        e.counts.booked ? `Les ${e.counts.booked} billets vendus sont annulés : rembourse en espèces ceux qui t’ont payé` : 'Aucun billet vendu : rien à rembourser',
        'La billetterie ferme, et l’événement disparaît de l’accueil',
        'Les inscrits sont prévenus',
      ],
      confirm: 'Annuler l’événement',
      keep: 'Garder l’événement',
      onConfirm: () => src.cancel(e.id, 'Annulé par l’organisateur').then(() => src.one(e.id).then(onChanged), fail('Annulation impossible')),
    });
  const photos = usePhotoEdits(e, onChanged);
  const banner = useEventBanner(e.id, published);
  // Requests waiting: the number on the tile and the tab, and the tab opened first when there are some.
  const [waiting, setWaiting] = useState<number | null>(null);
  const loadWaiting = useCallback(() => {
    if (!published) return;
    src.requests(e.id).then((r) => setWaiting(r.items.length), () => undefined);
  }, [published, src, e.id]);
  useFocusEffect(loadWaiting);
  const [picked, setPicked] = useState<Tab | null>(null);
  const tab: Tab = picked ?? (waiting ? 'demandes' : 'billetterie');
  const refresh = () => {
    loadWaiting();
    src.one(e.id).then(onChanged, () => undefined);
  };

  const capacity = e.ticketTypes.reduce((n, t) => n + t.capacity, 0);
  const sold = e.ticketTypes.reduce((n, t) => n + t.sold, 0);
  const collected = e.ticketTypes.reduce((n, t) => n + t.sold * t.price, 0);
  const s = EVENT_STATUS[e.status];

  // ---- Motion: the cover drifts, the top bar appears, the tabs stay pinned under it ---------------------------
  const scroll = useAnimatedRef<Animated.ScrollView>();
  const y = useSharedValue(0);
  const tabsY = useSharedValue(10_000);
  const barH = insets.top + BAR_H;
  const [dark, setDark] = useState(false);
  const onScroll = useAnimatedScrollHandler((ev) => {
    y.set(ev.contentOffset.y);
  });
  // The status bar's icons: white over the picture, dark once the bar is shown.
  useAnimatedReaction(
    () => y.get() > HERO_H - barH - 20,
    (now, before) => {
      if (now !== before) runOnJS(setDark)(now);
    },
  );
  const coverStyle = useAnimatedStyle(() => {
    const v = y.get();
    return { transform: [{ translateY: v > 0 ? v * 0.45 : v / 2 }, { scale: v < 0 ? 1 + -v / HERO_H : 1 }] };
  });
  const heroTextStyle = useAnimatedStyle(() => ({ opacity: interpolate(y.get(), [0, HERO_H * 0.55], [1, 0], Extrapolation.CLAMP) }));
  const barStyle = useAnimatedStyle(() => ({ opacity: interpolate(y.get(), [HERO_H - barH - 60, HERO_H - barH - 10], [0, 1], Extrapolation.CLAMP) }));
  const backStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(y.get(), [HERO_H - barH - 60, HERO_H - barH - 10], ['rgba(10,16,40,0.45)', 'rgba(10,16,40,0)']),
  }));
  const whiteIcon = useAnimatedStyle(() => ({ opacity: interpolate(y.get(), [HERO_H - barH - 60, HERO_H - barH - 10], [1, 0], Extrapolation.CLAMP) }));
  const tabsStyle = useAnimatedStyle(() => {
    const lift = Math.max(0, y.get() + barH - tabsY.get());
    return { transform: [{ translateY: lift }], shadowOpacity: lift > 0 ? 0.08 : 0, elevation: lift > 0 ? 3 : 0 };
  });
  const pick = (t: Tab, jump = false) => {
    setPicked(t);
    // From a tile: brings the tabs up under the bar.
    if (jump) scroll.current?.scrollTo({ y: Math.max(0, tabsY.get() - barH), animated: true });
  };

  const share = () =>
    Share.share({ message: `${e.title}\n${eventWhen(e.startsAt)} · ${e.venue.name}\nDemande ton billet sur UGB Connect.` }).catch(() => undefined);
  const actions: { icon: keyof typeof Ionicons.glyphMap; label: string; tone: string; onPress: () => void }[] = published
    ? [
        { icon: 'qr-code', label: 'Scanner', tone: colors.navy, onPress: () => router.push({ pathname: '/scanner-billets', params: { org: e.organizer.id, event: e.id, title: e.title } }) },
        { icon: 'cash', label: 'Valider', tone: colors.accent, onPress: () => router.push({ pathname: '/valider-paiement', params: { org: e.organizer.id } }) },
        { icon: 'eye', label: 'Voir la page', tone: colors.primary, onPress: () => router.push(`/evenement/${e.id}`) },
        { icon: 'share-social', label: 'Partager', tone: colors.success, onPress: share },
      ]
    : [];

  return (
    <View style={styles.dash}>
      <StatusBar style={dark ? 'dark' : 'light'} />
      <Animated.ScrollView
        ref={scroll}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: (photos.editable && published && tab === 'visibilite' ? STICKY_FOOTER_SPACE.one : 0) + 40 + insets.bottom }}>
        {/* The cover, behind the status bar. */}
        <View style={[styles.hero2, { height: HERO_H + insets.top }]}>
          <Animated.View style={[StyleSheet.absoluteFill, coverStyle]}>
            <Image source={{ uri: photos.editable ? photos.images[0]?.url : e.images[0] }} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} />
          </Animated.View>
          <LinearGradient colors={['rgba(10,16,40,0.55)', 'rgba(10,16,40,0)', 'rgba(10,16,40,0.9)']} locations={[0, 0.35, 1]} style={StyleSheet.absoluteFill} />
          <Animated.View style={[styles.hero2Text, heroTextStyle]}>
            <View style={styles.chips}>
              <StatusChip label={s.label} tone={s.tone} />
              <View style={styles.countChip}>
                <Ionicons name="time-outline" size={12} color="#fff" />
                <Text style={styles.countText}>{countdown(e.startsAt, e.endsAt, now)}</Text>
              </View>
            </View>
            <Text style={styles.heroTitle} numberOfLines={2}>
              {e.title}
            </Text>
            <View style={styles.heroLine}>
              <Ionicons name="calendar-outline" size={14} color="rgba(255,255,255,0.9)" />
              <Text style={styles.heroMeta} numberOfLines={1}>
                {eventWhen(e.startsAt)}
              </Text>
            </View>
            <View style={styles.heroLine}>
              <Ionicons name="location-outline" size={14} color="rgba(255,255,255,0.9)" />
              <Text style={styles.heroMeta} numberOfLines={1}>
                {e.venue.name}
                {e.venue.address ? ` · ${e.venue.address}` : ''}
              </Text>
            </View>
          </Animated.View>
        </View>

        <View style={styles.sheet}>
          {/* The three numbers, over the cover's edge. */}
          {(published || e.status === 'completed') && (
            <View style={[styles.statsCard, shadow.raised]}>
              <View style={styles.statCol}>
                <Text style={styles.statValue}>
                  {sold}
                  <Text style={styles.statOf}>/{capacity}</Text>
                </Text>
                <Text style={styles.statLabel}>vendus</Text>
                <View style={styles.miniBar}>
                  <View style={[styles.miniFill, { width: `${capacity ? Math.min(100, (sold / capacity) * 100) : 0}%` }]} />
                </View>
              </View>
              <View style={styles.statSep} />
              <View style={styles.statCol}>
                <Text style={styles.statValue}>{e.counts.admitted}</Text>
                <Text style={styles.statLabel}>{e.counts.admitted > 1 ? 'entrés' : 'entré'}</Text>
              </View>
              {published && (
                <>
                  <View style={styles.statSep} />
                  <Pressable style={styles.statCol} onPress={() => pick('demandes', true)} accessibilityRole="button" accessibilityLabel={`${waiting ?? 0} demandes à valider`}>
                    <View style={styles.statHotRow}>
                      <Text style={[styles.statValue, !!waiting && { color: colors.accent }]}>{waiting === null ? '…' : waiting}</Text>
                      {!!waiting && <View style={styles.hotDot} />}
                    </View>
                    <Text style={styles.statLabel}>à valider</Text>
                  </Pressable>
                </>
              )}
            </View>
          )}

          {e.review && (e.status === 'rejected' || e.status === 'changes_requested') && (
            <View style={styles.reviewBox}>
              <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.dangerText} />
              <Text style={styles.reviewText}>{e.review.message}</Text>
            </View>
          )}
          {e.status === 'pending_review' && (
            <View style={styles.infoBox}>
              <Ionicons name="hourglass-outline" size={18} color={colors.primary} />
              <Text style={styles.infoText}>L’équipe UGB Connect vérifie ton événement. Tu seras notifié de sa décision.</Text>
            </View>
          )}

          {/* The door, one tap each. */}
          {actions.length > 0 && (
            <View style={styles.quick}>
              {actions.map((a) => (
                <Pressable
                  key={a.label}
                  style={({ pressed }) => [styles.quickItem, pressed && { transform: [{ scale: 0.94 }] }]}
                  onPress={() => {
                    haptics.select();
                    a.onPress();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={a.label}>
                  <View style={[styles.quickIcon, shadow.card, { backgroundColor: a.tone }]}>
                    <Ionicons name={a.icon} size={22} color="#fff" />
                  </View>
                  <Text style={styles.quickLabel} numberOfLines={1}>
                    {a.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* Pinned under the top bar while scrolling. */}
        {published && (
          <Animated.View style={[styles.tabsWrap, tabsStyle]} onLayout={(ev) => tabsY.set(ev.nativeEvent.layout.y)}>
            <Segmented<Tab>
              value={tab}
              onChange={(t) => pick(t)}
              options={[
                { value: 'billetterie', label: 'Billetterie' },
                { value: 'demandes', label: 'Demandes', badge: waiting },
                { value: 'visibilite', label: 'Visibilité' },
              ]}
            />
          </Animated.View>
        )}

        <Animated.View key={published ? tab : 'state'} entering={FadeIn.duration(220)} style={styles.tabBody}>
          {(!published || tab === 'billetterie') && (
            <>
              {(published || e.status === 'completed') && (
                <View style={[styles.card, shadow.card, { gap: 14 }]}>
                  <View style={styles.row}>
                    <Text style={[styles.cardTitle, { flex: 1 }]}>Ventes par billet</Text>
                    {collected > 0 && (
                      <View style={styles.cashPill}>
                        <Ionicons name="cash-outline" size={13} color={colors.successText} />
                        <Text style={styles.cashPillText}>{formatFcfa(collected)} encaissés</Text>
                      </View>
                    )}
                  </View>
                  {e.ticketTypes.map((t) => (
                    <View key={t.typeId} style={{ gap: 6 }}>
                      <View style={styles.row}>
                        <Text style={[styles.label, { flex: 1 }]} numberOfLines={1}>
                          {t.name} · {t.price ? formatFcfa(t.price) : 'Gratuit'}
                        </Text>
                        <Text style={styles.muted}>
                          {t.sold}/{t.capacity}
                        </Text>
                      </View>
                      <View style={styles.bar}>
                        <View style={[styles.barFill, { width: `${t.capacity ? Math.min(100, (t.sold / t.capacity) * 100) : 0}%` }, t.sold >= t.capacity && { backgroundColor: colors.success }]} />
                      </View>
                    </View>
                  ))}
                  <View style={styles.metaLine}>
                    <Ionicons name="eye-outline" size={14} color={colors.muted2} />
                    <Text style={[styles.muted, { flex: 1 }]}>Visible par : {audienceLabel(e.audience)}</Text>
                  </View>
                </View>
              )}
              <History log={e.reviewLog} />
              {published && <TextButton label="Annuler l’événement" onPress={cancel} style={{ alignSelf: 'center' }} tone="danger" />}
            </>
          )}

          {published && tab === 'demandes' && (
            <RequestsCard
              load={async () =>
                (await src.requests(e.id)).items.map((r) => ({
                  id: r.id, name: r.student?.name ?? 'Étudiant', phone: r.student?.phone ?? null, total: r.total, expiresAt: r.expiresAt,
                  lines: [r.tickets.map((x) => `${x.qty} × ${x.name}`).join(' · ')],
                  units: (r.units ?? []).map((u, i) => ({ id: u.id, label: `Billet ${i + 1} · ${u.name}`, price: u.price, code: u.code })),
                  createdAt: r.createdAt,
                  code: r.code,
                }))
              }
              validate={src.validate}
              refuse={src.refuse}
              onChanged={refresh}
            />
          )}

          {published && tab === 'visibilite' && (
            <>
              {banner === undefined && <ActivityIndicator color={colors.primary} />}
              {banner && <BannerCard banner={banner} />}
              {banner === null && <PromoteCard onPress={() => router.push({ pathname: '/publicite', params: { eventId: e.id } })} />}
              {photos.editable ? (
                <Photos images={photos.images} setImages={photos.setImages} uploading={false} setUploading={() => undefined} fixedCover={photos.fixedCover} setFixedCover={photos.setFixedCover} canAdd={false} />
              ) : (
                <Text style={styles.muted}>Une seule photo : c’est la couverture de ton événement et de sa bannière.</Text>
              )}
            </>
          )}
        </Animated.View>
      </Animated.ScrollView>

      {/* The top bar: only the back button over the picture; its title and background once the picture is gone. */}
      <View style={[styles.topBar, { height: barH, paddingTop: insets.top }]} pointerEvents="box-none">
        <Animated.View style={[StyleSheet.absoluteFill, styles.topBarBg, barStyle]} pointerEvents="none" />
        <Pressable onPress={onBack} hitSlop={8} accessibilityRole="button" accessibilityLabel="Retour">
          <Animated.View style={[styles.floatBack, backStyle]}>
            <Ionicons name="chevron-back" size={22} color={colors.navy} />
            <Animated.View style={[StyleSheet.absoluteFill, styles.center, whiteIcon]}>
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </Animated.View>
          </Animated.View>
        </Pressable>
        <Animated.Text style={[styles.topTitle, barStyle]} numberOfLines={1}>
          {e.title}
        </Animated.Text>
        <Animated.Text style={[styles.topKind, barStyle]}>{title}</Animated.Text>
      </View>

      {/* Pinned, as on every form: usable once a photo changed. */}
      {photos.editable && published && tab === 'visibilite' && (
        <StickyFooter>
          <PrimaryButton label="Enregistrer les photos" disabled={!photos.dirty} loading={photos.saving} onPress={photos.save} />
        </StickyFooter>
      )}
    </View>
  );
}

/** The review's history, folded: rarely needed once published. */
function History({ log }: { log: OrgEventDto['reviewLog'] }) {
  const [open, setOpen] = useState(false);
  if (!log.length) return null;
  return (
    <View style={[styles.card, shadow.card, { gap: 8 }]}>
      <Pressable style={styles.row} onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <Ionicons name="time-outline" size={16} color={colors.muted2} />
        <Text style={[styles.cardTitle, { flex: 1 }]}>Historique</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted2} />
      </Pressable>
      {open &&
        log.map((r, i) => (
          <Text key={i} style={styles.muted}>
            {new Date(r.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} · {ACTION[r.action]}
            {r.message ? ` : ${r.message}` : ''}
          </Text>
        ))}
    </View>
  );
}

/**
 * Published: the pictures the team validated, as a cover (shown first, and on the event's banners), an order, or one
 * taken off. Nothing changes until « Enregistrer ».
 */
function usePhotoEdits(e: OrgEventDto, onChanged: (e: OrgEventDto) => void) {
  const src = useEventsSource();
  const [images, setImages] = useState<Photo[]>(photosOf(e));
  const [fixedCover, setFixedCover] = useState(e.fixedCover);
  const [saving, setSaving] = useState(false);
  const reset = () => {
    setImages(photosOf(e));
    setFixedCover(e.fixedCover);
  };
  // Saved, or reloaded when the screen shows again: start over from what the server has.
  const saved = `${e.imageIds.join()}|${e.fixedCover}`;
  const [base, setBase] = useState(saved);
  if (base !== saved) {
    setBase(saved);
    reset();
  }

  const cover = fixedCover && images.length > 1;
  const dirty = images.map((i) => i.id).join() !== e.imageIds.join() || cover !== e.fixedCover;
  const removed = e.imageIds.length - images.length;
  const run = () => {
    setSaving(true);
    src
      .updatePhotos(e.id, { imageIds: images.map((i) => i.id), fixedCover: cover })
      .then(onChanged, fail('Photos non enregistrées'))
      .finally(() => setSaving(false));
  };
  const save = () =>
    removed > 0
      ? confirmAction({
          title: `Retirer ${removed} photo${removed > 1 ? 's' : ''} ?`,
          bullets: [removed > 1 ? 'Elles sont supprimées de l’événement pour de bon' : 'Elle est supprimée de l’événement pour de bon', 'Les autres photos restent'],
          confirm: removed > 1 ? 'Retirer les photos' : 'Retirer la photo',
          keep: 'Garder',
          onConfirm: run,
        })
      : run();

  // A single picture is the cover: nothing to choose.
  return { editable: e.status === 'published' && e.imageIds.length > 1, images, setImages, fixedCover, setFixedCover, dirty, saving, save, reset };
}

const dayLabel = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

/**
 * Published: the event's banner on the home screen when it has one (running, to come, being paid), otherwise the
 * button to get one. A new banner is possible once the current one has ended.
 */
function useEventBanner(eventId: string, published: boolean) {
  // undefined: loading; null: none (or « Mes publicités » couldn't be read: the banner screen checks again).
  const [banner, setBanner] = useState<BannerDto | null | undefined>(undefined);
  useFocusEffect(
    useCallback(() => {
      if (!published) return;
      bannersApi.mine().then(
        (r) => setBanner(r.items.find((b) => b.eventId === eventId && holdsSlot(b)) ?? null),
        () => setBanner(null),
      );
    }, [eventId, published]),
  );
  return banner;
}

/**
 * The invitation to put the event on the home carousel: a warm card that reads as an action (megaphone breathing,
 * arrow nudging, both still when the system reduces motion), apart from the pinned « Enregistrer les photos ».
 */
function PromoteCard({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        haptics.select();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel="Mettre en bannière sur l’accueil"
      accessibilityHint="Choisis la durée et paie la bannière de ton événement"
      style={({ pressed }) => [styles.promoWrap, shadow.card, pressed && { transform: [{ scale: 0.98 }], opacity: 0.95 }]}>
      <LinearGradient colors={[colors.accent, colors.orange]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.promo}>
        <View style={styles.promoIcon}>
          <LivePulse color="rgba(255,255,255,0.55)" size={44} />
          <Ionicons name="megaphone" size={22} color={colors.accent} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.promoTitle}>Mettre en bannière sur l’accueil</Text>
          <Text style={styles.promoText}>Ton événement en grand, en haut de l’accueil des étudiants.</Text>
        </View>
        <NudgeRight>
          <View style={styles.promoGo}>
            <Ionicons name="arrow-forward" size={18} color={colors.accent} />
          </View>
        </NudgeRight>
      </LinearGradient>
    </Pressable>
  );
}

/** Its banner, running, to come or being paid, with the way to « Mes publicités ». */
function BannerCard({ banner }: { banner: BannerDto }) {
  const now = useNow();
  const live = banner.status === 'approved' && Date.parse(banner.startsAt) <= now;
  const state =
    banner.status === 'pending_payment'
      ? { tone: 'warning' as const, icon: 'time-outline' as const, title: 'Bannière : paiement en attente', text: 'Termine le paiement pour garder ta place sur l’accueil.', action: 'Terminer le paiement' }
      : banner.status === 'pending_review'
        ? { tone: 'warning' as const, icon: 'hourglass-outline' as const, title: 'Bannière en cours de validation', text: `Prévue jusqu’au ${bannerLastDay(banner)}.`, action: 'Voir mes publicités' }
        : live
          ? { tone: 'success' as const, icon: 'megaphone' as const, title: 'En bannière sur l’accueil', text: `Jusqu’au ${bannerLastDay(banner)}. Une nouvelle bannière sera possible ensuite.`, action: 'Voir mes publicités' }
          : { tone: 'success' as const, icon: 'calendar-outline' as const, title: 'Bannière prévue', text: `Sur l’accueil du ${dayLabel(banner.startsAt)} au ${bannerLastDay(banner)}.`, action: 'Voir mes publicités' };
  const t = state.tone === 'success' ? { bg: colors.successBg, fg: colors.successText } : { bg: colors.warningBg, fg: colors.warningText };

  return (
    <View style={[styles.bannerBox, { backgroundColor: t.bg }]} accessible accessibilityLabel={`${state.title}. ${state.text}`}>
      <Ionicons name={state.icon} size={20} color={t.fg} />
      <View style={{ flex: 1, gap: 8 }}>
        <View style={{ gap: 2 }}>
          <Text style={[styles.okText, { color: t.fg, fontWeight: '700' }]}>{state.title}</Text>
          <Text style={[styles.okText, { color: t.fg }]}>{state.text}</Text>
        </View>
        <TextButton label={state.action} icon="chevron-forward" onPress={() => router.push('/mes-publicites')} style={{ alignSelf: 'flex-start' }} />
      </View>
    </View>
  );
}

type PhotosProps = {
  images: Photo[];
  setImages: (f: (list: Photo[]) => Photo[]) => void;
  uploading: boolean;
  setUploading: (v: boolean) => void;
  fixedCover: boolean;
  setFixedCover: (v: boolean) => void;
  /** Published: only the pictures the team saw (cover, order, take some off), none added. */
  canAdd?: boolean;
};

/**
 * Up to 8 pictures, all shown on the event page (they slide). The banner shows one at random, unless the organizer
 * taps the star of one: it becomes the cover (moved first).
 */
function Photos({ images, setImages, uploading, setUploading, fixedCover, setFixedCover, canAdd = true }: PhotosProps) {
  const makeCover = (img: Photo) => {
    setImages((list) => [img, ...list.filter((x) => x.id !== img.id)]);
    setFixedCover(true);
  };
  const pick = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: MAX_IMAGES - images.length, quality: 0.85 });
    if (res.canceled) return;
    setUploading(true);
    try {
      for (const asset of res.assets.slice(0, MAX_IMAGES - images.length)) {
        const up = await uploadImage(asset, 'event');
        setImages((list) => [...list, { id: up.id, url: up.url }]);
      }
    } catch (err) {
      fail('Image refusée')(err);
    } finally {
      setUploading(false);
    }
  };
  return (
    <>
      <View style={styles.row}>
        <Text style={[styles.section, { flex: 1 }]}>{canAdd ? `Photos (${images.length}/${MAX_IMAGES})` : 'Photos'}</Text>
        {images.length > 1 && (
          <View style={styles.editTag}>
            <Ionicons name="hand-left-outline" size={12} color={colors.primary} />
            <Text style={styles.editTagText}>Touche pour choisir</Text>
          </View>
        )}
      </View>
      {images.length > 1 && (
        <Text style={styles.muted}>
          {fixedCover
            ? 'La photo encadrée est la couverture : en premier sur la page et sur la bannière. Touche une autre photo pour la changer, ou son étoile pour une photo au hasard sur la bannière.'
            : 'Touche une photo pour en faire la couverture : elle passe en premier sur la page et sur la bannière. Sinon, la bannière en tire une au hasard.'}
        </Text>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photos}>
        {images.map((img, i) => (
          <View key={img.id}>
            <Pressable
              onPress={() => images.length > 1 && !(i === 0 && fixedCover) && makeCover(img)}
              disabled={images.length < 2}
              accessibilityRole="button"
              accessibilityState={{ selected: i === 0 && fixedCover }}
              accessibilityLabel={i === 0 && fixedCover ? 'Photo de couverture' : 'Choisir comme couverture'}>
              <Image source={{ uri: img.url }} style={[styles.photo, i === 0 && fixedCover && styles.photoOn]} contentFit="cover" />
            </Pressable>
            {i === 0 && fixedCover && (
              <View style={styles.coverTag}>
                <Text style={styles.coverTagText}>Couverture</Text>
              </View>
            )}
            {images.length > 1 && (
              <Pressable
                style={styles.star}
                onPress={() => (i === 0 && fixedCover ? setFixedCover(false) : makeCover(img))}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={i === 0 && fixedCover ? 'Ne plus fixer la couverture' : 'Choisir comme couverture'}>
                <Ionicons name={i === 0 && fixedCover ? 'star' : 'star-outline'} size={14} color={i === 0 && fixedCover ? '#FFD34E' : '#fff'} />
              </Pressable>
            )}
            {(canAdd || images.length > 1) && (
              <Pressable style={styles.remove} onPress={() => setImages((list) => list.filter((x) => x.id !== img.id))} hitSlop={6} accessibilityLabel="Retirer la photo">
                <Ionicons name="close" size={14} color="#fff" />
              </Pressable>
            )}
          </View>
        ))}
        {canAdd && images.length < MAX_IMAGES && (
          <Pressable style={[styles.photo, styles.addPhoto]} onPress={pick} accessibilityRole="button" accessibilityLabel="Ajouter des photos">
            {uploading ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="add" size={26} color={colors.primary} />}
          </Pressable>
        )}
      </ScrollView>
    </>
  );
}


/**
 * Validated by the team: the owner chooses who sees the event on the home screen (campus, village, UFR, region),
 * the places to sell, may touch up the pictures and the text, and pays the publication (per place). The date, the
 * place and the prices stay as validated.
 */
function PublishForm({ event: e, onChanged }: { event: OrgEventDto; onChanged: (e: OrgEventDto) => void }) {
  const [images, setImages] = useState<Photo[]>(photosOf(e));
  const [uploading, setUploading] = useState(false);
  const [fixedCover, setFixedCover] = useState(e.fixedCover);
  const [description, setDescription] = useState(e.description);
  const [address, setAddress] = useState(e.venue.address ?? '');
  const [places, setPlaces] = useState<Record<string, string>>(Object.fromEntries(e.ticketTypes.map((t) => [t.typeId, String(t.capacity)])));
  const [maxPer, setMaxPer] = useState(e.maxPerStudent);
  const [audience, setAudience] = useState<EventAudience>(e.audience);
  const [targeted, setTargeted] = useState(audienceLabel(e.audience) !== audienceLabel(EVERYONE));
  const [method, setMethod] = useState(paymentMethods[0].id);
  // Not a method the admins switched off; the choice falls back to the first one left.
  const { off, isOff } = useMethodsOff();
  const shownMethods = paymentMethods.filter((m) => !isOff(m.id));
  const payWith = shownMethods.some((m) => m.id === method) ? method : (shownMethods[0]?.id ?? method);
  const [paying, setPaying] = useState(false);

  const toggle = (key: keyof EventAudience, value: string) =>
    setAudience((a) => ({ ...a, [key]: a[key].includes(value) ? a[key].filter((x) => x !== value) : [...a[key], value] }));
  const pickCampus = (c: CampusKey) =>
    setAudience((a) => {
      const campuses = a.campuses.includes(c) ? a.campuses.filter((x) => x !== c) : [...a.campuses, c];
      // Villages stay those of the campuses still chosen.
      const allowed = campuses.length ? campuses.flatMap((k) => VILLAGES[k as CampusKey]) : null;
      return { ...a, campuses, villages: allowed ? a.villages.filter((v) => allowed.includes(v)) : a.villages };
    });
  const villages = audience.campuses.length ? audience.campuses.flatMap((c) => VILLAGES[c as CampusKey]) : [...VILLAGES.campus1, ...VILLAGES.campus2];
  const chosen = targeted ? audience : EVERYONE;
  const narrowed = audienceLabel(chosen) !== audienceLabel(EVERYONE);

  const counts = e.ticketTypes.map((t) => Number(places[t.typeId] || 0));
  const total = counts.reduce((n, c) => n + c, 0);
  const fee = Math.max(e.publicationFee.minimum, total * e.publicationFee.perPlace);
  const ready = images.length > 0 && counts.every((c) => c > 0) && (!targeted || narrowed) && !uploading && !paying;

  const publish = async () => {
    setPaying(true);
    try {
      const { payment } = await eventsApi.publishMine(e.id, {
        audience: chosen,
        places: e.ticketTypes.map((t, i) => ({ typeId: t.typeId, capacity: counts[i]! })),
        description: description.trim(),
        imageIds: images.map((i) => i.id),
        fixedCover,
        address: address.trim() || null,
        maxPerStudent: maxPer,
        method: METHOD[payWith] ?? 'wave',
      });
      const paid = await payInBrowser(payment);
      onChanged(await eventsApi.mineOne(e.id));
      if (paid.status === 'succeeded') {
        notice({
          tone: 'success',
          title: 'Événement publié',
          message: `La billetterie est ouverte. « ${e.title} » est sur l’accueil de : ${audienceLabel(chosen)}.`,
          primary: { label: 'Super' },
          secondary: { label: 'Le mettre en bannière', onPress: () => router.push({ pathname: '/publicite', params: { eventId: e.id } }) },
        });
      } else {
        notice({
          tone: 'pending',
          title: 'Paiement en attente',
          message: 'Ton événement est publié dès que le paiement est confirmé. Tu peux aussi relancer le paiement depuis cet écran.',
        });
      }
    } catch (err) {
      fail('Publication impossible')(err);
    } finally {
      setPaying(false);
    }
  };

  return (
    <>
    <KeyboardAwareScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" bottomOffset={STICKY_FOOTER_SPACE.one}>
      <View style={styles.okBox}>
        <Ionicons name="checkmark-circle" size={20} color={colors.successText} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.okText, { fontWeight: '700' }]}>Validé par l’équipe UGB Connect</Text>
          <Text style={styles.okText}>Choisis qui voit ton événement, le nombre de places à vendre, puis publie-le.</Text>
        </View>
      </View>

      <View style={[styles.card, shadow.card, { gap: 4 }]}>
        <Text style={styles.title}>{e.title}</Text>
        <Text style={styles.muted}>{eventWhen(e.startsAt)} · {e.venue.name}</Text>
        <Text style={styles.muted}>La date, le lieu et les prix restent ceux validés.</Text>
      </View>

      <Photos images={images} setImages={setImages} uploading={uploading} setUploading={setUploading} fixedCover={fixedCover} setFixedCover={setFixedCover} />
      <LabeledField label="Description">
        <Field value={description} onChangeText={setDescription} maxLength={3000} multiline />
      </LabeledField>
      <LabeledField label="Précision sur le lieu (facultatif)">
        <Field placeholder="Campus 1, à côté du terrain" value={address} onChangeText={setAddress} maxLength={160} />
      </LabeledField>

      <Text style={styles.section}>Places à vendre</Text>
      {e.ticketTypes.map((t) => (
        <View key={t.typeId} style={styles.row}>
          <Text style={[styles.label, { flex: 1 }]}>
            {t.name} · {t.price ? formatFcfa(t.price) : 'Gratuit'}
          </Text>
          <View style={{ width: 110 }}>
            <Field keyboardType="number-pad" value={places[t.typeId]} onChangeText={(v) => setPlaces((p) => ({ ...p, [t.typeId]: v.replace(/\D/g, '') }))} />
          </View>
        </View>
      ))}
      <View style={styles.row}>
        <Text style={[styles.label, { flex: 1 }]}>Billets max par étudiant</Text>
        <Pressable onPress={() => setMaxPer(Math.max(1, maxPer - 1))} style={styles.step} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Un billet de moins par étudiant (${maxPer})`}>
          <Ionicons name="remove" size={16} color={colors.primary} />
        </Pressable>
        <Text style={styles.label}>{maxPer}</Text>
        <Pressable onPress={() => setMaxPer(Math.min(10, maxPer + 1))} style={styles.step} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Un billet de plus par étudiant (${maxPer})`}>
          <Ionicons name="add" size={16} color={colors.primary} />
        </Pressable>
      </View>

      <Text style={styles.section}>Qui voit ton événement ?</Text>
      <View style={styles.wrap}>
        <Chip label="Toute l’université" selected={!targeted} onPress={() => setTargeted(false)} />
        <Chip label="Un public précis" selected={targeted} onPress={() => setTargeted(true)} />
      </View>
      {targeted && (
        <View style={styles.audienceBox}>
          <Text style={styles.label}>Campus</Text>
          <View style={styles.wrap}>
            {CAMPUSES.map((c) => (
              <Chip key={c.key} label={c.label} selected={audience.campuses.includes(c.key)} onPress={() => pickCampus(c.key)} role="checkbox" />
            ))}
          </View>
          <Text style={styles.label}>Village</Text>
          <View style={styles.wrap}>
            {villages.map((v) => (
              <Chip key={v} label={v.replace('Village ', '')} selected={audience.villages.includes(v)} onPress={() => toggle('villages', v)} role="checkbox" />
            ))}
          </View>
          <Text style={styles.label}>UFR</Text>
          <View style={styles.wrap}>
            {UFRS.map((u) => (
              <Chip key={u.code} label={u.code} selected={audience.ufrs.includes(u.code)} onPress={() => toggle('ufrs', u.code)} role="checkbox" />
            ))}
          </View>
          <Text style={styles.label}>Région d’origine</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            {REGIONS.map((r) => (
              <Chip key={r} label={r} selected={audience.regions.includes(r)} onPress={() => toggle('regions', r)} role="checkbox" />
            ))}
          </ScrollView>
          <Text style={styles.muted}>
            {narrowed ? `Visible par : ${audienceLabel(chosen)}.` : 'Choisis au moins un campus, un village, un UFR ou une région.'} Chaque choix réduit : Village E + UFR SAT = les étudiants de SAT qui habitent le village E.
          </Text>
        </View>
      )}

      <View style={[styles.card, shadow.card, { gap: 6 }]}>
        <View style={styles.row}>
          <Text style={[styles.muted, { flex: 1 }]}>
            {total} place{total > 1 ? 's' : ''} × {formatFcfa(e.publicationFee.perPlace)}
          </Text>
          <Text style={styles.label}>{formatFcfa(fee)}</Text>
        </View>
        {total * e.publicationFee.perPlace < e.publicationFee.minimum && <Text style={styles.muted}>Minimum {formatFcfa(e.publicationFee.minimum)}.</Text>}
        <Text style={styles.muted}>Les billets se paient en espèces, directement à toi : tu valides chaque demande à réception. La bannière sur l’accueil est une option à part.</Text>
      </View>

      {e.publication?.payment && <Text style={styles.warn}>Un paiement de {formatFcfa(e.publication.fee)} est en attente : payer à nouveau le remplace.</Text>}

      <Text style={styles.label}>Moyen de paiement</Text>
      {shownMethods.map((m) => {
        const on = m.id === payWith;
        return (
          <Pressable key={m.id} onPress={() => setMethod(m.id)} style={[styles.option, on && styles.optionOn]}>
            <PaymentLogo method={m} />
            <Text style={[styles.label, { flex: 1 }]}>{m.name}</Text>
            {on && <Ionicons name="checkmark-circle" size={22} color={colors.primary} />}
          </Pressable>
        );
      })}
      {!!methodsOffLine(off) && <Text style={styles.hint}>{methodsOffLine(off)}</Text>}
    </KeyboardAwareScrollView>
    <StickyFooter>
      <PrimaryButton label={`Payer ${formatFcfa(fee)} et publier`} disabled={!ready} loading={paying} onPress={publish} />
    </StickyFooter>
    </>
  );
}

function EventForm({ event, onSaved }: { event: OrgEventDto | null; onSaved: (e: OrgEventDto, submitted: boolean) => void }) {
  const src = useEventsSource();
  const start0 = event ? new Date(event.startsAt) : null;
  const [title, setTitle] = useState(event?.title ?? '');
  const [category, setCategory] = useState<EventCategory>((event?.category as EventCategory) ?? 'soiree');
  const [description, setDescription] = useState(event?.description ?? '');
  const [images, setImages] = useState<Photo[]>(event ? photosOf(event) : []);
  const [uploading, setUploading] = useState(false);
  const [fixedCover, setFixedCover] = useState(event?.fixedCover ?? false);
  const [feeRule, setFeeRule] = useState(event?.publicationFee ?? null);
  const [venue, setVenue] = useState(event?.venue.name ?? '');
  const [address, setAddress] = useState(event?.venue.address ?? '');
  const [day, setDay] = useState<Date | null>(start0 ? new Date(start0.getFullYear(), start0.getMonth(), start0.getDate()) : null);
  const [time, setTime] = useState(start0 ? `${String(start0.getHours()).padStart(2, '0')}:${String(start0.getMinutes()).padStart(2, '0')}` : '20:00');
  const [hours, setHours] = useState(event ? Math.max(1, Math.round((Date.parse(event.endsAt) - Date.parse(event.startsAt)) / 3_600_000)) : 4);
  const [tickets, setTickets] = useState<TicketRow[]>(event ? event.ticketTypes.map((t) => ({ name: t.name, price: String(t.price), capacity: String(t.capacity) })) : [{ name: 'Entrée', price: '1000', capacity: '100' }]);
  const [maxPer, setMaxPer] = useState(event?.maxPerStudent ?? 4);
  // How students pay: in the app (Wave, Orange Money) and / or cash at the door. At least one.
  const [saving, setSaving] = useState<'draft' | 'submit' | null>(null);
  // Leaving with changes not saved asks first; a save goes on without asking.
  const dirty = useDirty({ title, category, description, images: images.map((i) => i.id), fixedCover, venue, address, day: day?.getTime() ?? null, time, hours, tickets, maxPer });
  const guard = useLeaveGuard(dirty && !saving);
  const now = useNow();
  // Today only offers the start times still ahead.
  const times = day ? TIMES.filter((t) => startOf(day, t).getTime() > now) : TIMES;
  const inPast = !!day && startOf(day, time).getTime() <= now;

  const setTicket = (i: number, patch: Partial<TicketRow>) => setTickets((list) => list.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  // The price of the publication (paid once the event is approved), known from the start.
  // The fee couldn't be loaded: say so (the organizer must know the price before sending), with a retry.
  const [feeFailed, setFeeFailed] = useState(false);
  const [feeAttempt, setFeeAttempt] = useState(0);
  useEffect(() => {
    // An organization publishes without the students' publication fee.
    if (feeRule || src.org) return;
    eventsApi.publicationFee().then(setFeeRule, () => setFeeFailed(true));
  }, [feeRule, feeAttempt, src.org]);
  const totalPlaces = tickets.reduce((n, t) => n + (Number(t.capacity) || 0), 0);
  const fee = feeRule ? Math.max(feeRule.minimum, totalPlaces * feeRule.perPlace) : null;

  const ticketsOk = tickets.length > 0 && tickets.every((t) => t.name.trim().length >= 2 && /^\d+$/.test(t.price) && /^\d+$/.test(t.capacity) && Number(t.capacity) > 0);
  const ready = title.trim().length >= 3 && images.length > 0 && venue.trim().length >= 2 && !!day && !inPast && ticketsOk && !uploading && !saving;

  const input = (): EventInput => {
    const start = startOf(day!, time);
    return {
      title: title.trim(),
      category,
      description: description.trim(),
      imageIds: images.map((i) => i.id),
      fixedCover,
      venue: { name: venue.trim(), address: address.trim() || null },
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + hours * 3_600_000).toISOString(),
      ticketTypes: tickets.map((t) => ({ name: t.name.trim(), description: null, price: Number(t.price), capacity: Number(t.capacity) })),
      maxPerStudent: maxPer,
      paymentMethods: ['cash'],
    };
  };

  const save = async (submit: boolean) => {
    setSaving(submit ? 'submit' : 'draft');
    try {
      let saved = event ? await src.update(event.id, input()) : await src.create(input());
      if (submit) saved = await src.submit(saved.id);
      guard.leave(() => onSaved(saved, submit));
    } catch (err) {
      fail(submit ? 'Envoi impossible' : 'Enregistrement impossible')(err);
    } finally {
      setSaving(null);
    }
  };

  return (
    <>
    <KeyboardAwareScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" bottomOffset={STICKY_FOOTER_SPACE.two}>
      {event?.status === 'changes_requested' && event.review && (
        <View style={styles.reviewBox}>
          <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.dangerText} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.reviewText, { fontWeight: '700' }]}>Corrections demandées par l’équipe UGB Connect</Text>
            <Text style={styles.reviewText}>{event.review.message}</Text>
          </View>
        </View>
      )}

      <Photos images={images} setImages={setImages} uploading={uploading} setUploading={setUploading} fixedCover={fixedCover} setFixedCover={setFixedCover} />

      <LabeledField label="Titre">
        <Field placeholder="Soirée karaoké du Village E" value={title} onChangeText={setTitle} maxLength={80} />
      </LabeledField>
      <Text style={styles.label}>Type</Text>
      <View style={styles.wrap}>
        {CATEGORIES.map((c) => (
          <Pressable key={c.value} onPress={() => setCategory(c.value)} style={[styles.chip, category === c.value && styles.chipOn]}>
            <Ionicons name={c.icon as keyof typeof Ionicons.glyphMap} size={14} color={category === c.value ? colors.primary : colors.muted2} />
            <Text style={[styles.chipText, category === c.value && { color: colors.primary }]}>{c.label}</Text>
          </Pressable>
        ))}
      </View>
      <LabeledField label="Description">
        <Field placeholder="Programme, ambiance, ce qui est compris…" value={description} onChangeText={setDescription} maxLength={3000} multiline />
      </LabeledField>
      <LabeledField label="Lieu">
        <Field placeholder="Foyer du Village E" value={venue} onChangeText={setVenue} maxLength={80} />
      </LabeledField>
      <LabeledField label="Précision (facultatif)">
        <Field placeholder="Campus 1, à côté du terrain" value={address} onChangeText={setAddress} maxLength={160} />
      </LabeledField>

      <View style={styles.row}>
        <View style={{ flex: 1.4 }}>
          <DateField label="Jour" value={day} onChange={setDay} min={days(now)[0]!} max={days(now)[days(now).length - 1]!} />
        </View>
        <View style={{ flex: 1 }}>
          <TimeField label="Heure de début" value={time} onChange={setTime} times={times} />
        </View>
      </View>
      {inPast && <Text style={styles.warn}>{times.length ? 'Cette heure est passée : choisis une heure à venir.' : 'Plus d’horaire possible aujourd’hui : choisis un autre jour.'}</Text>}
      <Text style={styles.label}>Durée</Text>
      <View style={styles.wrap}>
        {DURATIONS.map((h) => (
          <Chip key={h} label={`${h} h`} selected={hours === h} onPress={() => setHours(h)} />
        ))}
      </View>

      <Text style={styles.section}>Billets</Text>
      {tickets.map((t, i) => (
        <View key={i} style={[styles.card, shadow.card, { gap: 8 }]}>
          <View style={styles.row}>
            <Text style={[styles.label, { flex: 1 }]}>Type {i + 1}</Text>
            {tickets.length > 1 && (
              <TextButton label="Retirer" tone="danger" icon="trash-outline" onPress={() => setTickets((list) => list.filter((_, j) => j !== i))} />
            )}
          </View>
          <Field placeholder="Standard, VIP…" value={t.name} onChangeText={(v) => setTicket(i, { name: v })} maxLength={40} />
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <LabeledField label="Prix (FCFA, 0 = gratuit)">
                <Field keyboardType="number-pad" value={t.price} onChangeText={(v) => setTicket(i, { price: v.replace(/\D/g, '') })} />
              </LabeledField>
            </View>
            <View style={{ flex: 1 }}>
              <LabeledField label="Places">
                <Field keyboardType="number-pad" value={t.capacity} onChangeText={(v) => setTicket(i, { capacity: v.replace(/\D/g, '') })} />
              </LabeledField>
            </View>
          </View>
        </View>
      ))}
      {tickets.length < 6 && (
        <TextButton label="Ajouter un type de billet" icon="add-circle-outline" onPress={() => setTickets((list) => [...list, { name: '', price: '0', capacity: '50' }])} />
      )}
      <View style={styles.row}>
        <Text style={[styles.label, { flex: 1 }]}>Billets max par étudiant</Text>
        <Pressable onPress={() => setMaxPer(Math.max(1, maxPer - 1))} style={styles.step} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Un billet de moins par étudiant (${maxPer})`}>
          <Ionicons name="remove" size={16} color={colors.primary} />
        </Pressable>
        <Text style={styles.label}>{maxPer}</Text>
        <Pressable onPress={() => setMaxPer(Math.min(10, maxPer + 1))} style={styles.step} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Un billet de plus par étudiant (${maxPer})`}>
          <Ionicons name="add" size={16} color={colors.primary} />
        </Pressable>
      </View>

      {tickets.some((t) => Number(t.price) > 0) && (
        <View style={styles.cashHint}>
          <Ionicons name="cash-outline" size={18} color={colors.successText} />
          <Text style={[styles.hint, { flex: 1, color: colors.successText }]}>
            Les étudiants demandent leurs billets et viennent te payer en espèces : tu valides chaque demande à réception de l’argent (sous 24 h, sinon elle est annulée). Le billet devient alors valable.
          </Text>
        </View>
      )}

      {!src.org && !feeRule && feeFailed && <TextButton label="Prix de publication indisponible : réessayer" icon="refresh-outline" onPress={() => (setFeeFailed(false), setFeeAttempt((a) => a + 1))} />}
      {!src.org && feeRule && fee !== null && (
        <View style={[styles.card, shadow.card, styles.feeCard]}>
          <View style={styles.row}>
            <Ionicons name="pricetag-outline" size={18} color={colors.primary} />
            <Text style={[styles.label, { flex: 1 }]}>Prix de publication</Text>
            <Text style={styles.feeAmount}>{formatFcfa(fee)}</Text>
          </View>
          <Text style={styles.muted}>
            {totalPlaces} place{totalPlaces > 1 ? 's' : ''} × {formatFcfa(feeRule.perPlace)}
            {totalPlaces * feeRule.perPlace < feeRule.minimum ? ` (minimum ${formatFcfa(feeRule.minimum)})` : ''}. À payer seulement une fois l’événement validé ; tu pourras encore ajuster le nombre de places.
          </Text>
        </View>
      )}

      <Text style={styles.muted}>
        {src.org
          ? 'Publié, il apparaît aux étudiants : ils demandent leurs billets et viennent te payer en espèces ; tu valides chaque demande à réception.'
          : '1. L’équipe UGB Connect vérifie ton événement. 2. Une fois validé, tu choisis qui le voit (campus, village, UFR, région) et tu paies la publication, selon le nombre de places. 3. La billetterie ouvre : les étudiants demandent leurs billets et te paient en espèces.'}
      </Text>
    </KeyboardAwareScrollView>
    <StickyFooter>
      <PrimaryButton label={src.org ? 'Publier' : 'Envoyer pour validation'} disabled={!ready} loading={saving === 'submit'} onPress={() => save(true)} />
      <TextButton label={saving === 'draft' ? 'Enregistrement…' : 'Enregistrer le brouillon'} icon="save-outline" disabled={!ready} style={{ alignSelf: 'center' }} onPress={() => save(false)} />
    </StickyFooter>
    </>
  );
}

const styles = StyleSheet.create({
  methods: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cashHint: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: radii.md, backgroundColor: colors.successBg },
  hint: { ...typo.caption, color: colors.muted2, lineHeight: 17 },
  safe: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 },
  h1: { ...typo.h3, color: colors.navy },
  body: { padding: 20, gap: 12, paddingBottom: 48 },
  section: { ...typo.section, color: colors.navy, marginTop: 6 },
  label: { ...typo.smallStrong, color: colors.navy },
  warn: { ...typo.small, color: colors.dangerText, marginTop: -4 },
  title: { ...typo.h2, color: colors.navy },
  muted: { ...typo.caption, color: colors.muted2, lineHeight: 17 },
  card: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 14 },
  dash: { flex: 1, backgroundColor: colors.bg },
  hero2: { overflow: 'hidden', backgroundColor: colors.navy, justifyContent: 'flex-end' },
  hero2Text: { padding: 20, paddingBottom: 48, gap: 6 },
  chips: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  countChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill, backgroundColor: 'rgba(255,255,255,0.2)' },
  countText: { ...typo.captionStrong, color: '#fff' },
  heroLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sheet: { paddingHorizontal: 20, marginTop: -32, gap: 16 },
  statsCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 8, borderRadius: radii.lg, backgroundColor: colors.card },
  statCol: { flex: 1, alignItems: 'center', gap: 2 },
  statSep: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: colors.border },
  statHotRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 3 },
  hotDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent, marginTop: 4 },
  miniBar: { width: '70%', height: 4, borderRadius: 2, backgroundColor: colors.primarySoft, overflow: 'hidden', marginTop: 4 },
  miniFill: { height: 4, borderRadius: 2, backgroundColor: colors.primary },
  quick: { flexDirection: 'row', justifyContent: 'space-between' },
  quickItem: { flex: 1, alignItems: 'center', gap: 6 },
  quickIcon: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { ...typo.captionStrong, color: colors.navy },
  tabsWrap: { zIndex: 10, paddingHorizontal: 20, paddingVertical: 10, marginTop: 8, backgroundColor: colors.bg, shadowColor: '#000', shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  tabBody: { paddingHorizontal: 20, paddingTop: 6, gap: 14 },
  cashPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 3, borderRadius: radii.pill, backgroundColor: colors.successBg },
  cashPillText: { ...typo.captionStrong, color: colors.successText },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  topBarBg: { backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  floatBack: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  topTitle: { ...typo.bodyStrong, color: colors.navy, flex: 1 },
  topKind: { ...typo.caption, color: colors.muted2 },
  hero: { height: 200, borderRadius: radii.lg, overflow: 'hidden', backgroundColor: colors.navy, justifyContent: 'flex-end' },
  heroText: { padding: 14, gap: 6, alignItems: 'flex-start' },
  heroTitle: { ...typo.h2, color: '#fff' },
  heroMeta: { ...typo.small, color: 'rgba(255,255,255,0.9)' },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, backgroundColor: colors.card, borderRadius: radii.lg, paddingVertical: 12, paddingHorizontal: 10, gap: 2 },
  statHot: { backgroundColor: colors.accent },
  statValue: { ...typo.h2, color: colors.navy, fontVariant: ['tabular-nums'] },
  statOf: { ...typo.smallStrong, color: colors.muted2 },
  statLabel: { ...typo.caption, color: colors.muted2 },
  cardTitle: { ...typo.bodyStrong, color: colors.navy },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.primarySoft, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: colors.primary },
  metaLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoBox: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: radii.md, backgroundColor: colors.primarySoft },
  infoText: { ...typo.small, flex: 1, color: colors.primary, lineHeight: 19 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  feeCard: { gap: 6, borderWidth: 1.5, borderColor: colors.primarySoft },
  feeAmount: { ...typo.title, color: colors.primary },
  okBox: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: radii.md, backgroundColor: colors.successBg },
  bannerBox: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: radii.md },
  promoWrap: { borderRadius: radii.lg },
  promo: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radii.lg },
  promoIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  promoTitle: { ...typo.bodyStrong, color: '#fff' },
  promoText: { ...typo.caption, color: 'rgba(255,255,255,0.92)', lineHeight: 17 },
  promoGo: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  okText: { ...typo.small, color: colors.successText, lineHeight: 19 },
  audienceBox: { gap: 8, padding: 12, borderRadius: radii.md, backgroundColor: colors.primarySofter },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radii.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card },
  optionOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  reviewBox: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: radii.md, backgroundColor: colors.dangerBg },  reviewText: { ...typo.small, color: colors.dangerText, lineHeight: 19 },
  photos: { flexDirection: 'row', gap: 10 },
  photo: { width: 110, height: 80, borderRadius: radii.md, backgroundColor: colors.border },
  addPhoto: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.primary, backgroundColor: colors.primarySoft },
  star: { position: 'absolute', top: 4, left: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(10,16,40,0.7)', alignItems: 'center', justifyContent: 'center' },
  photoOn: { borderWidth: 3, borderColor: colors.primary },
  editTag: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill, backgroundColor: colors.primarySoft },
  editTagText: { ...typo.label, color: colors.primary },
  coverTag: { position: 'absolute', left: 6, bottom: 6, backgroundColor: 'rgba(10,16,40,0.7)', borderRadius: radii.pill, paddingHorizontal: 6, paddingVertical: 2 },
  coverTagText: { ...typo.label, color: '#fff' },
  remove: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(10,16,40,0.7)', alignItems: 'center', justifyContent: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chipsRow: { flexDirection: 'row', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: radii.pill, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card },
  chipOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipText: { ...typo.smallStrong, color: colors.muted2 },
  step: { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
