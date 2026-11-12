import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from 'react-native';

import { colors, radii, shadow, typo } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useCampus } from '@/context/CampusContext';
import { useCaravans } from '@/context/CaravansContext';
import { AlertSheet } from '@/components/AlertSheet';
import { Segmented } from '@/components/ui';
import { Hop, LivePulse, SearchingDots } from '@/components/motion';
import { formatFcfa } from '@/constants/data';
import { FillBar, OrganizerLine, shortPlace } from '@/components/caravan';
import { type LiveBannerDto } from '@/features/banners/api';
import { methodLabel } from '@/features/payments/checkout';
import { useMethodsOff } from '@/features/payments/methods';
import { currentMeal, hmLabel, MEAL_LABEL, type AlertDto, type DishStatus } from '@/features/restos/api';
import { openDirections } from '@/lib/maps';
import { useTaxi } from '@/context/TaxiContext';
import { documentMeta } from '@/lib/fileSize';

const BODY_PADDING = 20;
const AUTO_SCROLL_MS = 5000;

const ALERT_TONES: Record<AlertDto['tone'], { bg: string; fg: string }> = {
  danger: { bg: colors.dangerBg, fg: colors.danger },
  warning: { bg: colors.warningBg, fg: colors.warning },
  info: { bg: colors.primarySoft, fg: colors.primary },
  success: { bg: colors.successBg, fg: colors.success },
};
/** The server names an Ionicons glyph; an unknown one falls back to a warning sign. */
const alertIcon = (name: string) => (name in Ionicons.glyphMap ? (name as keyof typeof Ionicons.glyphMap) : 'warning-outline');
/** At most this many at once: the home screen stays readable. */
const MAX_ALERTS = 3;

/** Campus notices and dishes sold out right now ("Rupture · Thiébou dieun · Resto 1"). Each can be hidden. */
export function AlertStrip() {
  const { alerts } = useCampus();
  const [hidden, setHidden] = useState<string[]>([]);
  const shown = alerts.filter((a) => a.placement === 'banner' && !hidden.includes(a.id)).slice(0, MAX_ALERTS);
  if (!shown.length) return null;

  return (
    <View style={{ gap: 8 }}>
      {shown.map((a) => {
        const tone = ALERT_TONES[a.tone];
        return (
          <Pressable
            key={a.id}
            style={[styles.alert, { backgroundColor: tone.bg, borderLeftColor: tone.fg }]}
            onPress={() => a.href && router.push(a.href as never)}
            disabled={!a.href}
            accessibilityRole={a.href ? 'link' : undefined}>
            <Ionicons name={alertIcon(a.icon)} size={20} color={tone.fg} />
            <View style={{ flex: 1 }}>
              <Text style={styles.alertTitle}>{a.title}</Text>
              {!!a.body && <Text style={styles.alertSub}>{a.body}</Text>}
            </View>
            <Pressable onPress={() => setHidden((h) => [...h, a.id])} hitSlop={10} accessibilityLabel="Masquer l’alerte">
              <Ionicons name="close" size={18} color={colors.muted} />
            </Pressable>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Wave or Orange Money switched off by the admins (an outage): said on the home, until it's back. */
export function PaymentsOffStrip() {
  const { off } = useMethodsOff();
  const [hidden, setHidden] = useState(false);
  if (!off.length || hidden) return null;
  const names = off.map((m) => methodLabel[m.method]).join(' et ');
  const others = (['wave', 'orange_money'] as const).filter((m) => !off.some((o) => o.method === m)).map((m) => methodLabel[m]);
  const note = off.find((m) => m.note)?.note;
  return (
    <View style={[styles.alert, { backgroundColor: colors.warningBg, borderLeftColor: colors.warningText }]} accessibilityRole="alert">
      <Ionicons name="card-outline" size={20} color={colors.warningText} />
      <View style={{ flex: 1 }}>
        <Text style={styles.alertTitle}>{names} momentanément indisponible{off.length > 1 ? 's' : ''}</Text>
        <Text style={styles.alertSub}>
          {others.length ? `Paie avec ${others.join(' ou ')}, ou en espèces quand c’est proposé.` : 'Paie en espèces quand c’est proposé.'}
          {note ? ` ${note}` : ''}
        </Text>
      </View>
      <Pressable onPress={() => setHidden(true)} hitSlop={10} accessibilityLabel="Masquer">
        <Ionicons name="close" size={18} color={colors.muted} />
      </Pressable>
    </View>
  );
}

/**
 * Students who signed up before the UFR and region were asked: announcements for their UFR can't reach them yet.
 * Can be put off for this session.
 */
export function OriginPrompt() {
  const { user } = useAuth();
  const [later, setLater] = useState(false);
  if (!user?.isStudent || (user.ufrCode && user.niveau && user.region) || later) return null;
  // UFR and niveau on « Mon UFR », the région on « Ma carte étudiant ».
  const studies = !user.ufrCode || !user.niveau;
  return (
    <Pressable style={[styles.alert, { backgroundColor: colors.primarySoft, borderLeftColor: colors.primary }]} onPress={() => router.push(studies ? '/mes-etudes' : '/ma-carte')} accessibilityRole="link">
      <Ionicons name={studies ? 'school-outline' : 'map-outline'} size={20} color={colors.primary} />
      <View style={{ flex: 1 }}>
        <Text style={styles.alertTitle}>{studies ? 'Indique ton UFR et ton niveau' : 'Indique ta région d’origine'}</Text>
        <Text style={styles.alertSub}>{studies ? 'Pour recevoir les annonces de ton UFR : examens, élections des délégués…' : 'Pour recevoir les annonces de ta région.'}</Text>
      </View>
      <Pressable onPress={() => setLater(true)} hitSlop={10} accessibilityLabel="Plus tard">
        <Ionicons name="close" size={18} color={colors.muted} />
      </Pressable>
    </Pressable>
  );
}

/** Where a banner's button leads: the event page, a screen of the app, a website, WhatsApp or a call. */
export function openBanner(b: LiveBannerDto) {
  // The event page starts on the picture the banner showed (its cover, or the one drawn at random).
  if (b.event) return router.push({ pathname: '/evenement/[id]', params: { id: b.event.id, cover: b.image } });
  if (b.cta) openCta(b.cta);
}

/** An ad's button: a screen of the app, a website, WhatsApp or a call. */
export function openCta(cta: { target: string; value: string }) {
  const digits = cta.value.replace(/\D/g, '').replace(/^221/, '');
  if (cta.target === 'app') router.push(cta.value as never);
  else if (cta.target === 'url') Linking.openURL(cta.value).catch(() => undefined);
  else if (cta.target === 'whatsapp') Linking.openURL(`https://wa.me/221${digits}`).catch(() => undefined);
  else Linking.openURL(`tel:+221${digits}`).catch(() => undefined);
}

const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
/** "Sam. 07 nov. · 20h00" */
export const eventWhen = (iso: string) => {
  const d = new Date(iso);
  return `${DAYS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')} ${MONTHS_SHORT[d.getMonth()]} · ${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`;
};

/**
 * The home carousel: paid banners. An ad says it's sponsored, with a short title, a short text, its picture and
 * its button; an event shows its date, place and price, and opens its page.
 */
export function AdCarousel() {
  const { banners } = useCampus();
  const { width, fontScale } = useWindowDimensions();
  const slideWidth = width - BODY_PADDING * 2;
  // The pictures are 16:9: as tall as that on every phone, a little more with large text (title + button fit).
  const slideHeight = Math.round(Math.max(180, (slideWidth * 9) / 16) * Math.min(Math.max(fontScale, 1), 1.3));
  const ref = useRef<ScrollViewInstance>(null);
  const [index, setIndex] = useState(0);
  const multiple = banners.length > 1;

  // Restarts whenever the index changes, so a manual swipe resets the timer.
  useEffect(() => {
    if (!multiple) return;
    const t = setTimeout(() => {
      const next = (index + 1) % banners.length;
      ref.current?.scrollTo({ x: next * slideWidth, animated: true });
      setIndex(next);
    }, AUTO_SCROLL_MS);
    return () => clearTimeout(t);
  }, [index, slideWidth, multiple, banners.length]);

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / slideWidth));
  };

  // No banner right now: leave no gap on the home screen.
  if (banners.length === 0) return null;

  return (
    <View style={{ gap: 10 }}>
      <ScrollView
        ref={ref}
        horizontal
        pagingEnabled
        scrollEnabled={multiple}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        style={styles.bannerTrack}>
        {banners.map((b) => {
          const action = b.event ? 'Réserver un ticket' : b.cta?.label;
          return (
            <Pressable
              key={b.id}
              disabled={!b.event && !b.cta}
              onPress={() => openBanner(b)}
              accessibilityRole={b.event || b.cta ? 'button' : undefined}
              accessibilityLabel={`${b.event ? 'Événement' : 'Sponsorisé'} : ${b.title}`}
              style={[styles.banner, { width: slideWidth, height: slideHeight }]}>
              <Image source={{ uri: b.image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
              {/* Darker at the bottom: the text stays readable on any picture. */}
              <LinearGradient colors={['rgba(10,16,40,0.05)', 'rgba(10,16,40,0.78)']} style={StyleSheet.absoluteFill} />
              <View style={styles.tag}>
                <Text style={styles.tagText}>{b.event ? `ÉVÉNEMENT · ${b.event.categoryLabel.toUpperCase()}` : 'SPONSORISÉ'}</Text>
              </View>
              {/* The title takes the whole width; the button sits beside the date and price, never over the text. */}
              <View>
                <Text style={styles.bannerTitle} numberOfLines={2}>
                  {b.title}
                </Text>
                <View style={styles.bannerFoot}>
                  <Text style={styles.bannerSub} numberOfLines={2}>
                    {b.event ? `${eventWhen(b.event.startsAt)} · ${b.event.priceLabel}` : b.description}
                  </Text>
                  {action && (
                    <View style={styles.bannerBtn}>
                      <Text style={styles.bannerBtnText} numberOfLines={1}>
                        {action}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      {multiple && (
        <View style={styles.dots}>
          {banners.map((b, i) => (
            <View key={b.id} style={[styles.dotItem, i === index && styles.dotOn]} />
          ))}
        </View>
      )}
    </View>
  );
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const URGENT_MS = 2 * 60 * 60 * 1000;

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function formatTimeLeft(ms: number) {
  const mins = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const minutes = mins % 60;
  if (mins === 0) return 'Départ imminent';
  if (days > 0) return `Dans ${days} j ${hours} h`;
  if (hours > 0) return `Dans ${hours} h ${minutes} min`;
  return `Dans ${minutes} min`;
}

/** The campus, as the caravans name it. */
const CAMPUS = 'UGB';
/** « Plus que N places » from this many down. */
const FEW_SEATS = 5;
const DAY_MS = 24 * 3600 * 1000;

const DAYS = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];
const startOfDay = (t: number) => new Date(new Date(t).setHours(0, 0, 0, 0)).getTime();

/** Right of an "À la une" item: the day it's about ("Jeu. 05"), else how long it's been up ("Hier"). */
function headlineWhen(a: AlertDto, now: number) {
  if (a.eventAt) {
    const d = new Date(a.eventAt);
    const days = Math.round((startOfDay(d.getTime()) - startOfDay(now)) / 86_400_000);
    if (days === 0) return 'Aujourd’hui';
    if (days === 1) return 'Demain';
    return `${DAYS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}`;
  }
  const ago = Math.round((startOfDay(now) - startOfDay(Date.parse(a.startsAt))) / 86_400_000);
  return ago <= 0 ? 'Aujourd’hui' : ago === 1 ? 'Hier' : `Il y a ${ago} j`;
}

/** `more`: the home screen's card offers « S’imprégner » (its page) when the announcement has more to show. */
export function HeadlineItem({ a, more = false }: { a: AlertDto; more?: boolean }) {
  const now = useNow();
  const [reading, setReading] = useState(false);
  // One neutral style; red only for what is urgent.
  const urgent = a.tone === 'danger';
  const extra = more && (!!a.details || a.images.length > 0 || !!a.attachment);
  const content = (
    <>
      <View style={styles.newsRow}>
      <View style={[styles.newsIcon, { backgroundColor: urgent ? colors.dangerBg : colors.primarySoft }]}>
        <Ionicons name={alertIcon(a.icon)} size={18} color={urgent ? colors.dangerText : colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.newsTop}>
          <Text style={[styles.newsTag, { color: urgent ? colors.dangerText : colors.muted2 }]}>{(a.tag ?? 'Info').toUpperCase()}</Text>
          <Text style={styles.newsTime}>{headlineWhen(a, now)}</Text>
        </View>
        <Text style={styles.newsTitle}>{a.title}</Text>
        {!!a.body && (
          <Text style={styles.newsBody} numberOfLines={2}>
            {a.body}
          </Text>
        )}
      </View>
      </View>
    {/* More than the card: a glimpse of what's inside, and « S'imprégner » to open it all in a popup. */}
    {extra && (
      <Pressable
        onPress={() => setReading(true)}
        style={styles.newsFoot}
        accessibilityRole="button"
        accessibilityLabel={`S’imprégner : ${a.title}`}
        accessibilityHint="Affiche l’annonce complète">
        <View style={styles.newsPeek}>
          {a.attachment ? (
            <>
              <View style={styles.newsPdf}>
                <Text style={styles.newsPdfText}>PDF</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.newsPeekTitle} numberOfLines={1}>
                  {a.attachment.label}
                </Text>
                <Text style={styles.newsPeekSub}>{documentMeta(a.attachment)}</Text>
              </View>
            </>
          ) : a.images.length ? (
            <>
              <View style={styles.newsThumbs}>
                {a.images.map((uri, i) => (
                  <Image key={uri} source={{ uri }} style={[styles.newsThumb, i > 0 && { marginLeft: -12 }]} contentFit="cover" />
                ))}
              </View>
              <Text style={styles.newsPeekSub}>{a.images.length > 1 ? `${a.images.length} photos` : 'Photo'}</Text>
            </>
          ) : (
            <>
              <Ionicons name="reader-outline" size={16} color={colors.muted2} />
              <Text style={styles.newsPeekSub}>Texte complet</Text>
            </>
          )}
        </View>
        <View style={styles.newsMore}>
          <Text style={styles.newsMoreText}>S’imprégner</Text>
          <Ionicons name="arrow-forward" size={14} color={colors.primary} />
        </View>
      </Pressable>
    )}
    </>
  );
  const sheet = more && <AlertSheet alert={a} visible={reading} onClose={() => setReading(false)} />;
  // The card opens its link; without one, it opens the popup (the footer always does).
  return a.href || extra ? (
    <Pressable style={[styles.news, shadow.card]} onPress={() => (a.href ? router.push(a.href as never) : setReading(true))} accessibilityRole={a.href ? 'link' : 'button'}>
      {content}
      {sheet}
    </Pressable>
  ) : (
    <View style={[styles.news, shadow.card]}>
      {content}
      {sheet}
    </View>
  );
}

/** How many "À la une" items the home screen shows; the rest are one tap away. */
const HOME_HEADLINES = 5;

/** "À la une": announcements from the communication and academic teams, urgent first, then newest. */
export function Headlines() {
  const { alerts } = useCampus();
  const items = alerts.filter((a) => a.placement === 'headline');
  if (!items.length) return null;
  return (
    <View style={{ gap: 14 }}>
      <View style={styles.newsHead}>
        <Text style={styles.newsSection}>À la une</Text>
        {items.length > HOME_HEADLINES && (
          <Pressable onPress={() => router.push('/a-la-une')} hitSlop={10} accessibilityRole="link">
            <Text style={styles.moreText}>Tout voir ({items.length})</Text>
          </Pressable>
        )}
      </View>
      {items.slice(0, HOME_HEADLINES).map((a) => (
        <HeadlineItem key={a.id} a={a} more />
      ))}
    </View>
  );
}


/** The public restaurants' current meal, one line per restaurant; a sold-out dish is struck through. */
/**
 * The next caravan to book. Usually the next departure from the campus; a student who already has a ticket out sees
 * their way back instead (the next return to campus from that city, after their trip), and when nothing leaves the
 * campus, the next return. Price, where to get on, stops on the way, organizer and whether the trip is confirmed: what
 * a student checks before booking.
 */
export function CaravanCard() {
  const now = useNow();
  const { caravans } = useCaravans();
  const bookable = caravans.filter((c) => c.seats > 0 && c.bookingOpen && c.departureAt > now && !c.myTicketId).sort((a, b) => a.departureAt - b.departureAt);
  const outbound = bookable.filter((c) => c.from === CAMPUS);
  const returns = bookable.filter((c) => c.to === CAMPUS);
  // My trip out (the latest one booked): its way back comes first.
  const myTrip = caravans.filter((c) => c.from === CAMPUS && c.myTicketId && c.departureAt > now - WEEK_MS).sort((a, b) => b.departureAt - a.departureAt)[0];
  const myReturns = myTrip ? returns.filter((c) => c.from === myTrip.to && c.departureAt > myTrip.departureAt) : [];
  const list = myReturns.length ? myReturns : outbound.length ? outbound : returns;
  const next = list[0];
  const label = myReturns.length ? 'TON RETOUR AU CAMPUS' : next?.to === CAMPUS ? 'RETOUR AU CAMPUS' : 'PROCHAINE CARAVANE';

  if (!next) {
    return (
      <Pressable style={[styles.infoCard, shadow.card]} onPress={() => router.push({ pathname: '/(tabs)/caravanes', params: { vue: 'caravanes' } })}>
        <View style={styles.rowBetween}>
          <View style={styles.label}>
            <Ionicons name="bus-outline" size={12} color={colors.primary} />
            <Text style={styles.labelText}>CARAVANES</Text>
          </View>
          <Ionicons name="chevron-forward" size={14} color={colors.muted} />
        </View>
        <Text style={styles.detail}>Aucun départ prévu pour le moment</Text>
      </Pressable>
    );
  }

  // Orange only on the last day: when everything is urgent, nothing is.
  const soon = next.departureAt - now < DAY_MS;
  const first = next.pickups[0];
  const open = (id: string) => router.push(`/caravane/${id}`);
  const othersThisWeek = list.slice(1).filter((c) => c.departureAt - now < WEEK_MS).length;

  return (
    <Pressable
      style={[styles.infoCard, shadow.card, { gap: 10 }]}
      onPress={() => open(next.id)}
      accessibilityRole="button"
      accessibilityLabel={`${label.toLowerCase()} : ${next.from} vers ${next.to}, ${next.date} à ${next.time}, ${formatFcfa(next.price)}, ${next.organizer.name}`}>
      <View style={styles.rowBetween}>
        <View style={styles.label}>
          <Ionicons name="bus-outline" size={12} color={colors.primary} />
          <Text style={styles.labelText}>{label}</Text>
        </View>
        <Text style={[styles.timeLeft, soon && { color: colors.orangeText }]}>{formatTimeLeft(next.departureAt - now)}</Text>
      </View>

      {/* Where to, first: what a student scans for. The price on the same line. */}
      <View style={[styles.rowBetween, { alignItems: 'flex-end' }]}>
        <View style={styles.cvRoute}>
          <Text style={styles.cvCity} numberOfLines={1}>
            {next.from}
          </Text>
          <View style={styles.cvTrack}>
            <View style={styles.cvLine} />
            <Ionicons name="bus" size={14} color={colors.primary} />
            <View style={styles.cvLine} />
          </View>
          <Text style={[styles.cvCity, { flexShrink: 1 }]} numberOfLines={1}>
            {next.to}
          </Text>
        </View>
        <Text style={styles.cvPrice}>{formatFcfa(next.price)}</Text>
      </View>
      <Text style={styles.detail} numberOfLines={1}>
        {next.date} · {next.time}
        {first ? ` · ${shortPlace(first.place, next.from)}${next.pickups.length > 1 ? ` +${next.pickups.length - 1}` : ''}` : ''}
      </Text>

      {/* One message: how many bookings it still needs, confirmed, or nearly full. */}
      <FillBar caravan={next} count={false} few={FEW_SEATS} />

      {/* Who runs it, right where the student decides. */}
      <View style={[styles.rowBetween, styles.cvFoot]}>
        <View style={{ flex: 1 }}>
          <OrganizerLine organizer={next.organizer} wrap />
        </View>
        <Pressable style={styles.cta} onPress={() => open(next.id)} hitSlop={6} accessibilityRole="button">
          <Text style={styles.ctaText}>Réserver</Text>
        </Pressable>
      </View>

      {othersThisWeek > 0 && (
        <Pressable style={styles.more} onPress={() => router.push({ pathname: '/(tabs)/caravanes', params: { vue: 'caravanes' } })}>
          <Text style={styles.moreText}>
            {othersThisWeek} autre{othersThisWeek > 1 ? 's' : ''} départ{othersThisWeek > 1 ? 's' : ''} cette semaine
          </Text>
          <Ionicons name="chevron-forward" size={14} color={colors.primary} />
        </Pressable>
      )}

    </Pressable>
  );
}

/**
 * Events on the home screen, like the caravans: the next one for this student (the organizer chose who sees it: UFR,
 * campus, village, region), one tap to book, and the others.
 */
export function EventCard() {
  const now = useNow();
  const { events } = useCampus();
  const upcoming = events.filter((e) => e.salesOpen && Date.parse(e.endsAt) > now);
  const next = upcoming[0];
  if (!next) return null;
  const startsIn = Date.parse(next.startsAt) - now;
  const others = upcoming.length - 1;

  return (
    <View style={[styles.infoCard, shadow.card]}>
      <View style={styles.rowBetween}>
        <View style={styles.label}>
          <Ionicons name="sparkles-outline" size={12} color={colors.primary} />
          <Text style={styles.labelText}>PROCHAIN ÉVÉNEMENT</Text>
        </View>
        <Text style={[styles.timeLeft, startsIn > 0 && startsIn < URGENT_MS && { color: colors.orangeText }]}>{startsIn > 0 ? formatTimeLeft(startsIn) : 'En cours'}</Text>
      </View>

      <Pressable style={styles.eventRow} onPress={() => router.push(`/evenement/${next.id}`)} accessibilityRole="button">
        <Image source={{ uri: next.images[0] }} style={styles.eventThumb} contentFit="cover" />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.eventTitle} numberOfLines={1}>
            {next.title}
          </Text>
          <Text style={styles.detail} numberOfLines={1}>
            {eventWhen(next.startsAt)} · {next.venue.name}
          </Text>
          <Text style={styles.seats}>{next.minPrice ? `Dès ${formatFcfa(next.minPrice)}` : 'Gratuit'}</Text>
        </View>
        <View style={styles.cta}>
          <Text style={styles.ctaText}>Réserver</Text>
        </View>
      </Pressable>

      {others > 0 && (
        <Pressable style={styles.more} onPress={() => router.push('/evenements')}>
          <Text style={styles.moreText}>
            {others} autre{others > 1 ? 's' : ''} événement{others > 1 ? 's' : ''} pour toi
          </Text>
          <Ionicons name="chevron-forward" size={14} color={colors.primary} />
        </Pressable>
      )}
    </View>
  );
}

// First course that hasn't ended today, otherwise the first course of the next school day.

/** Sunu Taxi on the home screen: the next open shared ride, one tap to join. */
export function TaxiCard() {
  const now = useNow();
  const { trips, me, activeTrip } = useTaxi();
  // My trip (proposed or joined), still waiting for its passengers: shown first, « searching ».
  const mine = activeTrip();
  const open = trips
    .filter((t) => !t.departed && t.status === 'open' && t.departureAt > now && !t.passengers.includes(me) && t.seatsTaken < t.seats)
    .sort((a, b) => a.departureAt - b.departureAt);
  const next = open[0];
  const go = () => router.push({ pathname: '/(tabs)/caravanes', params: { vue: 'taxi' } });

  const card = (
    <View style={[styles.infoCard, shadow.card]}>
      <View style={styles.rowBetween}>
        <View style={styles.label}>
          <Ionicons name="car-outline" size={12} color={colors.primary} />
          <Text style={styles.labelText}>SUNU TAXI</Text>
        </View>
        {mine ? <Text style={styles.timeLeft}>Mon trajet</Text> : next && <Text style={styles.timeLeft}>{formatTimeLeft(next.departureAt - now)}</Text>}
      </View>

      {mine && !mine.departed ? (
        <Pressable onPress={() => router.push(`/taxi/${mine.id}`)} style={styles.mineRow} accessibilityRole="button" accessibilityLabel={`Mon trajet vers ${mine.to}, ${mine.seatsTaken} places sur ${mine.seats}`}>
          <View style={styles.searchIcon}>
            {mine.seatsTaken < mine.seats && <LivePulse color={colors.primary} size={40} />}
            <Ionicons name="car" size={20} color="#fff" />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.city} numberOfLines={1}>
              {mine.from.split(' · ').pop()} → {mine.to.split(' · ').pop()}
            </Text>
            {mine.seatsTaken < mine.seats ? (
              <View style={styles.searching}>
                <Text style={styles.searchingText}>Recherche de passagers</Text>
                <SearchingDots color={colors.primary} />
              </View>
            ) : (
              <Text style={styles.seats}>Complet · c’est parti à l’heure</Text>
            )}
            <Text style={styles.detail}>
              {mine.seatsTaken}/{mine.seats} places · départ dans {formatTimeLeft(mine.departureAt - now)}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.primary} />
        </Pressable>
      ) : next ? (
        <>
          <View style={styles.route}>
            <View style={styles.searchIconSmall}>
              <LivePulse color={colors.primary} size={28} />
              <Ionicons name="car" size={15} color="#fff" />
            </View>
            <Text style={styles.city} numberOfLines={1}>
              {next.from.split(' · ').pop()}
            </Text>
            <View style={styles.link}>
              <Ionicons name="arrow-forward" size={12} color={colors.primary} />
            </View>
            <Text style={[styles.city, { flexShrink: 1 }]} numberOfLines={1}>
              {next.to.split(' · ').pop()}
            </Text>
          </View>
          <View style={styles.rowBetween}>
            <View style={{ gap: 2, flexShrink: 1 }}>
              <Text style={styles.detail}>{formatFcfa(next.seatPrice)} / place</Text>
              <Text style={styles.seats}>
                {next.seats - next.seatsTaken} place{next.seats - next.seatsTaken > 1 ? 's' : ''} libre
                {next.seats - next.seatsTaken > 1 ? 's' : ''}
              </Text>
            </View>
            <Pressable style={styles.cta} onPress={go} accessibilityRole="button">
              <Text style={styles.ctaText}>Rejoindre</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <View style={styles.rowBetween}>
          <Text style={[styles.detail, { flexShrink: 1 }]}>Aucun trajet ouvert. Partage le prix d’un taxi avec d’autres étudiants.</Text>
          <Pressable style={styles.cta} onPress={go} accessibilityRole="button">
            <Text style={styles.ctaText}>Proposer</Text>
          </Pressable>
        </View>
      )}

      {!mine && open.length > 1 && (
        <Pressable style={styles.more} onPress={go}>
          <Text style={styles.moreText}>
            {open.length - 1} autre{open.length > 2 ? 's' : ''} trajet{open.length > 2 ? 's' : ''} ouvert{open.length > 2 ? 's' : ''}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={colors.primary} />
        </Pressable>
      )}
    </View>
  );
  // An open trip (mine waiting for passengers, or one to join): the card hops, for every student.
  return mine || next ? <Hop>{card}</Hop> : card;
}

export type HomeCard = 'caravan' | 'event' | 'taxi';

/**
 * How urgent each live card is, to order the home: what happens soonest or is about to run out goes up. Urgent: my
 * taxi still searching or one leaving within 2 h; a caravan within 24 h or with few seats; an event today or tomorrow
 * or nearly sold out. The urgent ones first (soonest first), then the others in their usual order; the first urgent
 * one is the accent.
 */
export function useHomeOrder(): { order: HomeCard[]; accent: HomeCard | null } {
  const now = useNow();
  const { caravans } = useCaravans();
  const { events } = useCampus();
  const { trips, me, activeTrip } = useTaxi();
  const score: Partial<Record<HomeCard, number>> = {};

  const caravan = caravans.filter((c) => c.seats > 0 && c.bookingOpen && c.departureAt > now && !c.myTicketId).sort((x, y) => x.departureAt - y.departureAt)[0];
  if (caravan && (caravan.departureAt - now < DAY_MS || caravan.seats <= FEW_SEATS)) score.caravan = caravan.departureAt - now;

  const event = events.filter((e) => e.salesOpen && Date.parse(e.endsAt) > now).sort((x, y) => Date.parse(x.startsAt) - Date.parse(y.startsAt))[0];
  if (event) {
    const left = event.ticketTypes.reduce((n, t) => n + t.remaining, 0);
    if (Date.parse(event.startsAt) - now < 2 * DAY_MS || left <= 10) score.event = Math.max(0, Date.parse(event.startsAt) - now);
  }

  const mine = activeTrip();
  if (mine && !mine.departed && mine.status === 'open' && mine.seatsTaken < mine.seats) score.taxi = 0;
  else {
    const taxi = trips.filter((t) => !t.departed && t.status === 'open' && t.departureAt > now && !t.passengers.includes(me) && t.seatsTaken < t.seats).sort((x, y) => x.departureAt - y.departureAt)[0];
    if (taxi && taxi.departureAt - now < URGENT_MS) score.taxi = taxi.departureAt - now;
  }

  const base: HomeCard[] = ['caravan', 'event', 'taxi'];
  const urgent = base.filter((k) => score[k] !== undefined).sort((x, y) => score[x]! - score[y]!);
  return { order: [...urgent, ...base.filter((k) => !urgent.includes(k))], accent: urgent[0] ?? null };
}

/** A dot per dish: green available, amber nearly gone, grey sold out (and struck through). */
const DISH: Record<DishStatus, { label: string | null; color: string }> = {
  available: { label: null, color: colors.success },
  low: { label: 'Bientôt fini', color: colors.warning },
  out: { label: 'Rupture', color: colors.muted2 },
};

/**
 * The university restaurants, all on the home screen (no other screen for them): lunch or dinner (the current meal
 * first, live or when it opens), then each restaurant — where, its hours, the way there — and every dish with what's
 * left.
 */
/** Dishes shown per restaurant before « Voir tout le menu ». */
const DISHES_SHOWN = 4;

export function RestoCard() {
  const { restos: day } = useCampus();
  const meal = currentMeal(useNow(), day?.restos ?? []);
  const [picked, setPicked] = useState<'lunch' | 'dinner' | null>(null);
  const shown = picked ?? meal.key;
  // Short by default (the home stays scannable): 4 dishes a restaurant, the rest on demand.
  const [all, setAll] = useState(false);
  const hidden = (day?.restos ?? []).reduce((n, r) => n + Math.max(0, (r.menus[shown]?.dishes.length ?? 0) - DISHES_SHOWN), 0);

  return (
    <View style={[styles.infoCard, shadow.card, { gap: 12 }]}>
      <View style={styles.rowBetween}>
        <View style={styles.label}>
          <Ionicons name="restaurant-outline" size={12} color={colors.primary} />
          <Text style={styles.labelText}>RESTOS PUBLICS</Text>
        </View>
        <View style={[styles.mealNow, meal.live && { backgroundColor: colors.successBg }]}>
          <View style={[styles.liveDot, { backgroundColor: meal.live ? colors.success : colors.muted }]} />
          <Text style={[styles.mealStatus, { color: meal.live ? colors.successText : colors.muted2 }]} numberOfLines={1}>
            {meal.label} · {meal.status}
          </Text>
        </View>
      </View>
      <Segmented options={(['lunch', 'dinner'] as const).map((k) => ({ value: k, label: MEAL_LABEL[k] }))} value={shown} onChange={setPicked} />

      {!day && <Text style={styles.dishLine}>Chargement des menus…</Text>}
      {day?.restos.length === 0 && <Text style={styles.dishLine}>Aucun restaurant pour l’instant.</Text>}
      {day?.restos.map((r) => {
        const service = r.services[shown];
        const dishes = r.menus[shown]?.dishes ?? [];
        return (
          <View key={r.id} style={styles.resto}>
            <View style={styles.restoHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.restoName}>{r.name}</Text>
                <Text style={styles.restoMeta} numberOfLines={1}>
                  {[r.location, `${hmLabel(service.start)}-${hmLabel(service.end)}`].filter(Boolean).join(' · ')}
                </Text>
              </View>
              {r.coords && (
                <Pressable style={styles.restoGo} onPress={() => openDirections(r.coords!, r.name)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Itinéraire vers ${r.name}`}>
                  <Ionicons name="navigate" size={14} color={colors.primary} />
                </Pressable>
              )}
            </View>
            {dishes.length === 0 ? (
              <Text style={styles.dishLine}>Menu pas encore publié.</Text>
            ) : (
              (all ? dishes : dishes.slice(0, DISHES_SHOWN)).map((d) => (
                <View key={d.id} style={styles.dishRow}>
                  <View style={[styles.dishDotView, { backgroundColor: DISH[d.status].color }]} />
                  <Text style={[styles.dishName, d.status === 'out' && styles.dishOut]} numberOfLines={1}>
                    {d.name}
                    {!!d.detail && <Text style={styles.dishDetail}> · {d.detail}</Text>}
                  </Text>
                  {DISH[d.status].label && <Text style={[styles.dishTag, { color: d.status === 'low' ? colors.warningText : colors.muted2 }]}>{DISH[d.status].label}</Text>}
                </View>
              ))
            )}
          </View>
        );
      })}
      {hidden > 0 && (
        <Pressable style={styles.more} onPress={() => setAll((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: all }}>
          <Text style={styles.moreText}>{all ? 'Réduire' : `Voir tout le menu (${hidden} plat${hidden > 1 ? 's' : ''} de plus)`}</Text>
          <Ionicons name={all ? 'chevron-up' : 'chevron-down'} size={14} color={colors.primary} />
        </Pressable>
      )}
      {!!day?.restos.length && <Text style={[styles.dishLine, { textAlign: 'center' }]}>Au ticket, sur présentation de la carte étudiant.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  mealNow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill, backgroundColor: colors.bg, flexShrink: 1 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  resto: { gap: 6, padding: 10, borderRadius: radii.md, backgroundColor: colors.bg },
  restoHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  restoMeta: { ...typo.caption, color: colors.muted2, marginTop: 1 },
  restoGo: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  dishRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 },
  dishDotView: { width: 8, height: 8, borderRadius: 4 },
  dishName: { ...typo.small, flex: 1, fontWeight: '600', color: colors.text },
  dishDetail: { ...typo.caption, fontWeight: '400', color: colors.muted2 },
  dishTag: { ...typo.label },
  shortLabel: { ...typo.captionStrong, color: colors.navy, marginTop: 2 },
  shortHint: { fontSize: 11, color: colors.muted2 },
  alert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.warningBg,
    borderRadius: radii.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.warning,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  alertTitle: { ...typo.bodyStrong, color: colors.navy },
  newsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  newsSection: { ...typo.section, color: colors.navy },
  news: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 14 },
  newsRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  newsIcon: { width: 40, height: 40, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center' },
  newsTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  newsTag: { ...typo.label, letterSpacing: 0.4 },
  newsTime: { fontSize: 11, color: colors.muted2 },
  newsTitle: { ...typo.bodyStrong, color: colors.navy },
  newsBody: { ...typo.small, color: colors.muted2, marginTop: 2 },
  newsFoot: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  newsPeek: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  newsPeekTitle: { ...typo.smallStrong, color: colors.navy },
  newsPeekSub: { ...typo.caption, color: colors.muted2 },
  newsPdf: { width: 30, height: 36, borderRadius: 5, backgroundColor: colors.dangerBg, alignItems: 'center', justifyContent: 'center' },
  newsPdfText: { fontSize: 11, fontWeight: '800', color: colors.dangerText },
  newsThumbs: { flexDirection: 'row' },
  newsThumb: { width: 36, height: 36, borderRadius: 8, borderWidth: 2, borderColor: colors.card, backgroundColor: colors.border },
  newsMore: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, minHeight: 32, borderRadius: radii.pill, backgroundColor: colors.primarySoft },
  newsMoreText: { ...typo.smallStrong, color: colors.primary },
  dishOut: { textDecorationLine: 'line-through', color: colors.muted2 },
  alertSub: { ...typo.caption, color: colors.muted2, marginTop: 2 },

  bannerTrack: { borderRadius: radii.lg },
  banner: {
    borderRadius: radii.lg,
    padding: 16,
    justifyContent: 'space-between',
    overflow: 'hidden',
    backgroundColor: colors.navy,
  },
  tag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.24)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  tagText: { ...typo.label, color: '#fff', letterSpacing: 0.3 },
  bannerTitle: { ...typo.h3, color: '#fff', lineHeight: 22 },
  bannerFoot: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  bannerSub: { ...typo.caption, color: 'rgba(255,255,255,0.92)', flex: 1 },
  bannerBtn: {
    flexShrink: 0,
    maxWidth: 150,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
  },
  bannerBtnText: { ...typo.captionStrong, color: colors.navy },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dotItem: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#C9D0E2' },
  dotOn: { width: 18, backgroundColor: colors.primary },

  infoCard: { backgroundColor: colors.card, borderRadius: radii.md, padding: 12, gap: 6 },
  mineRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  searchIconSmall: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  searchIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  searching: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  searchingText: { ...typo.smallStrong, color: colors.primary },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  label: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  labelText: { ...typo.label, color: colors.muted2, letterSpacing: 0.4 },
  timeLeft: { ...typo.label, color: colors.primary },
  route: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  city: { ...typo.title, color: colors.navy },
  link: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detail: { ...typo.caption, color: colors.muted2 },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  eventThumb: { width: 52, height: 52, borderRadius: radii.sm, backgroundColor: colors.border },
  eventTitle: { ...typo.title, color: colors.navy },
  seats: { fontSize: 12, fontWeight: '600', color: colors.successText },
  caravanState: { ...typo.captionStrong, flexShrink: 1 },
  cvRoute: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  cvCity: { ...typo.title, color: colors.navy },
  cvTrack: { flexDirection: 'row', alignItems: 'center', gap: 4, width: 64 },
  cvLine: { flex: 1, height: 1.5, backgroundColor: colors.border },
  cvPrice: { ...typo.title, color: colors.primary },
  cvFoot: { paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  more: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
    marginTop: 2,
  },
  moreText: { ...typo.label, color: colors.primary },
  mealStatus: { ...typo.label },
  courseTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  courseTitle: { ...typo.smallStrong, flexShrink: 1, color: colors.navy },
  kind: { backgroundColor: '#EEE8FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: radii.pill },
  kindMoved: { backgroundColor: colors.warningBg },
  kindText: { ...typo.label, color: colors.purpleText },
  restoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  restoName: { ...typo.captionStrong, width: 54, color: colors.navy },
  dishLine: { ...typo.caption, flex: 1, color: colors.text },
  dishDot: { fontSize: 9 },
  cta: {
    backgroundColor: colors.accent,
    minHeight: 32,
    paddingHorizontal: 16,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { ...typo.smallStrong, color: '#fff' },
});
