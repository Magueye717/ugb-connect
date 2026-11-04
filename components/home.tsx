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

import { caravanState, formatFcfa, schedule, weekDays } from '@/constants/data';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useCampus } from '@/context/CampusContext';
import { useCaravans } from '@/context/CaravansContext';
import { OrganizerLine } from '@/components/caravan';
import { type LiveBannerDto } from '@/features/banners/api';
import { currentMeal, type AlertDto, type DishStatus } from '@/features/restos/api';
import { useTaxi } from '@/context/TaxiContext';

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

/**
 * Students who signed up before the UFR and region were asked: announcements for their UFR can't reach them yet.
 * Can be put off for this session.
 */
export function OriginPrompt() {
  const { user } = useAuth();
  const [later, setLater] = useState(false);
  if (!user?.studentId || (user.ufrCode && user.region) || later) return null;
  return (
    <Pressable style={[styles.alert, { backgroundColor: colors.primarySoft, borderLeftColor: colors.primary }]} onPress={() => router.push('/mes-etudes')} accessibilityRole="link">
      <Ionicons name="school-outline" size={20} color={colors.primary} />
      <View style={{ flex: 1 }}>
        <Text style={styles.alertTitle}>Indique ton UFR et ta région</Text>
        <Text style={styles.alertSub}>Pour recevoir les annonces de ton UFR : examens, élections des délégués…</Text>
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
  const { width } = useWindowDimensions();
  const slideWidth = width - BODY_PADDING * 2;
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
              style={[styles.banner, { width: slideWidth }]}>
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
/** "Plus que N places" from this many down. */
const FEW_SEATS = 5;

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
  const othersThisWeek = list.slice(1).filter((c) => c.departureAt - now < WEEK_MS).length;
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

  const urgent = next.departureAt - now < URGENT_MS;
  const state = caravanState(next);
  const first = next.pickups[0];
  // Stops on the way: where it also drops off before the end of the line.
  const via = next.dropoffs.slice(0, -1).map((d) => d.place);
  const few = next.seats <= FEW_SEATS;

  return (
    <Pressable style={[styles.infoCard, shadow.card]} onPress={() => router.push(`/caravane/${next.id}`)} accessibilityRole="button" accessibilityLabel={`${next.from} vers ${next.to}, ${next.date} à ${next.time}, ${formatFcfa(next.price)}`}>
      {/* What + when */}
      <View style={styles.rowBetween}>
        <View style={styles.label}>
          <Ionicons name="bus-outline" size={12} color={colors.primary} />
          <Text style={styles.labelText}>{label}</Text>
        </View>
        <Text style={[styles.timeLeft, urgent && { color: colors.orangeText }]}>{formatTimeLeft(next.departureAt - now)}</Text>
      </View>

      {/* Where, and the price */}
      <View style={styles.rowBetween}>
        <View style={[styles.route, { flexShrink: 1 }]}>
          <Text style={styles.city} numberOfLines={1}>
            {next.from}
          </Text>
          <View style={styles.link}>
            <Ionicons name="arrow-forward" size={12} color={colors.primary} />
          </View>
          <Text style={[styles.city, { flexShrink: 1 }]} numberOfLines={1}>
            {next.to}
          </Text>
        </View>
        <Text style={styles.caravanPrice}>{formatFcfa(next.price)}</Text>
      </View>

      {/* When, where to get on, the stops on the way */}
      <View style={{ gap: 2 }}>
        <Text style={styles.detail} numberOfLines={1}>
          {next.date} · départ {first ? `${first.place} · ${first.time}` : next.time}
        </Text>
        {via.length > 0 && (
          <Text style={styles.detail} numberOfLines={1}>
            Via {via.join(', ')}
          </Text>
        )}
      </View>

      <OrganizerLine organizer={next.organizer} />

      {/* Confirmed or not, seats left, and the action */}
      <View style={styles.rowBetween}>
        <View style={{ gap: 2, flexShrink: 1 }}>
          <View style={styles.label}>
            <Ionicons name={state.confirmed ? 'checkmark-circle' : 'time-outline'} size={13} color={state.confirmed ? colors.successText : colors.warningText} />
            <Text style={[styles.caravanState, { color: state.confirmed ? colors.successText : colors.warningText }]} numberOfLines={1}>
              {state.confirmed ? 'Départ confirmé' : `Encore ${state.missing} réservation${state.missing > 1 ? 's' : ''} pour confirmer`}
            </Text>
          </View>
          <Text style={[styles.seats, few && { color: colors.orangeText }]}>{few ? `Plus que ${next.seats} place${next.seats > 1 ? 's' : ''}` : `${next.seats} places disponibles`}</Text>
        </View>
        <Pressable style={styles.cta} onPress={() => router.push(`/caravane/${next.id}`)} accessibilityRole="button">
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

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

const dayName = (short: string) => short.charAt(0) + short.slice(1).toLowerCase() + '.';

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
function findNextCourse(now: number) {
  const d = new Date(now);
  const today = d.getDay() - 1; // weekDays starts on Monday; Sunday gives -1
  const mins = d.getHours() * 60 + d.getMinutes();
  for (let offset = 0; offset < 7; offset++) {
    const i = today + offset;
    if (i < 0 || i >= weekDays.length) continue;
    const list = schedule[weekDays[i].id] ?? [];
    const course = offset === 0 ? list.find((c) => toMinutes(c.end) > mins) : list[0];
    if (!course) continue;
    if (offset === 0) {
      const startsIn = toMinutes(course.start) - mins;
      if (startsIn <= 0) return { course, status: `En cours · fin ${course.end}`, tone: colors.successText };
      const h = Math.floor(startsIn / 60);
      return { course, status: h ? `Dans ${h} h ${startsIn % 60} min` : `Dans ${startsIn} min`, tone: colors.orangeText };
    }
    const when = offset === 1 ? 'Demain' : dayName(weekDays[i].short);
    return { course, status: `${when} ${course.start}`, tone: colors.muted2 };
  }
  return null;
}

/** Sunu Taxi on the home screen: the next open shared ride, one tap to join. */
export function TaxiCard() {
  const now = useNow();
  const { trips, me } = useTaxi();
  const open = trips
    .filter((t) => !t.departed && t.status === 'open' && t.departureAt > now && !t.passengers.includes(me) && t.seatsTaken < t.seats)
    .sort((a, b) => a.departureAt - b.departureAt);
  const next = open[0];
  const go = () => router.push({ pathname: '/(tabs)/caravanes', params: { vue: 'taxi' } });

  return (
    <View style={[styles.infoCard, shadow.card]}>
      <View style={styles.rowBetween}>
        <View style={styles.label}>
          <Ionicons name="car-outline" size={12} color={colors.primary} />
          <Text style={styles.labelText}>SUNU TAXI</Text>
        </View>
        {next && <Text style={styles.timeLeft}>{formatTimeLeft(next.departureAt - now)}</Text>}
      </View>

      {next ? (
        <>
          <View style={styles.route}>
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

      {open.length > 1 && (
        <Pressable style={styles.more} onPress={go}>
          <Text style={styles.moreText}>
            {open.length - 1} autre{open.length > 2 ? 's' : ''} trajet{open.length > 2 ? 's' : ''} ouvert{open.length > 2 ? 's' : ''}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={colors.primary} />
        </Pressable>
      )}
    </View>
  );
}

export function CourseCard() {
  const next = findNextCourse(useNow());

  return (
    <Pressable style={[styles.infoCard, shadow.card]} onPress={() => router.push('/services/cours')}>
      <View style={styles.rowBetween}>
        <View style={styles.label}>
          <Ionicons name="calendar" size={12} color={colors.purple} />
          <Text style={styles.labelText}>PROCHAIN COURS</Text>
        </View>
        {next && <Text style={[styles.mealStatus, { color: next.tone }]}>{next.status}</Text>}
      </View>

      {next ? (
        <>
          <View style={styles.courseTitleRow}>
            <Text style={styles.courseTitle} numberOfLines={1}>
              {next.course.title}
            </Text>
            <View style={[styles.kind, next.course.movedFrom && styles.kindMoved]}>
              <Text style={[styles.kindText, next.course.movedFrom && { color: colors.warningText }]}>
                {next.course.movedFrom ? 'Déplacé' : next.course.kind}
              </Text>
            </View>
          </View>
          <Text style={styles.detail}>
            {next.course.start} – {next.course.end} · {next.course.room} · {next.course.teacher}
          </Text>
        </>
      ) : (
        <Text style={styles.detail}>Aucun cours prévu cette semaine</Text>
      )}
    </Pressable>
  );
}

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

export function HeadlineItem({ a }: { a: AlertDto }) {
  const now = useNow();
  // One neutral style; red only for what is urgent.
  const urgent = a.tone === 'danger';
  const content = (
    <>
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
    </>
  );
  return a.href ? (
    <Pressable style={[styles.news, shadow.card]} onPress={() => router.push(a.href as never)} accessibilityRole="link">
      {content}
    </Pressable>
  ) : (
    <View style={[styles.news, shadow.card]}>{content}</View>
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
        <HeadlineItem key={a.id} a={a} />
      ))}
    </View>
  );
}

const dishDot: Record<DishStatus, string> = {
  available: colors.success,
  low: colors.warning,
  out: colors.muted,
};

/** The public restaurants' current meal, one line per restaurant; a sold-out dish is struck through. */
export function RestoCard() {
  const { restos: day } = useCampus();
  const meal = currentMeal(useNow(), day?.restos ?? []);
  const openMenus = () => router.push({ pathname: '/(tabs)/resto', params: { vue: 'publics' } });

  return (
    <View style={[styles.infoCard, shadow.card]}>
      <Pressable style={styles.rowBetween} onPress={openMenus} accessibilityRole="link">
        <View style={styles.label}>
          <Ionicons name="restaurant-outline" size={12} color={colors.primary} />
          <Text style={styles.labelText}>RESTOS PUBLICS · {meal.label.toUpperCase()}</Text>
        </View>
        <Text style={[styles.mealStatus, { color: meal.live ? colors.successText : colors.muted2 }]}>{meal.status}</Text>
      </Pressable>

      {!day && <Text style={styles.dishLine}>Chargement des menus…</Text>}
      {day?.restos.length === 0 && <Text style={styles.dishLine}>Aucun restaurant pour l’instant.</Text>}
      {day?.restos.map((r) => {
        const dishes = r.menus[meal.key]?.dishes ?? [];
        return (
          <Pressable key={r.id} style={styles.restoRow} onPress={openMenus}>
            <Text style={styles.restoName}>{r.name}</Text>
            {/* One line per restaurant: the text shrinks a little rather than wrapping. */}
            <Text style={styles.dishLine} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {dishes.length
                ? dishes.map((d, i) => (
                    <Text key={d.id}>
                      {i > 0 ? '   ' : ''}
                      <Text style={[styles.dishDot, { color: dishDot[d.status] }]}>●</Text>{' '}
                      <Text style={d.status === 'out' ? styles.dishOut : undefined}>{d.name}</Text>
                    </Text>
                  ))
                : 'Menu pas encore publié'}
            </Text>
          </Pressable>
        );
      })}

      <Pressable style={styles.more} onPress={() => router.push('/(tabs)/resto')}>
        <Text style={styles.moreText}>Voir les restos privés</Text>
        <Ionicons name="chevron-forward" size={14} color={colors.primary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
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
  news: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 14, flexDirection: 'row', gap: 12, alignItems: 'center' },
  newsIcon: { width: 40, height: 40, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center' },
  newsTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  newsTag: { ...typo.label, letterSpacing: 0.4 },
  newsTime: { fontSize: 11, color: colors.muted2 },
  newsTitle: { ...typo.bodyStrong, color: colors.navy },
  newsBody: { ...typo.small, color: colors.muted2, marginTop: 2 },
  dishOut: { textDecorationLine: 'line-through', color: colors.muted2 },
  alertSub: { ...typo.caption, color: colors.muted2, marginTop: 2 },

  bannerTrack: { borderRadius: radii.lg },
  banner: {
    height: 172,
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
  caravanPrice: { ...typo.bodyStrong, color: colors.navy },
  caravanState: { ...typo.captionStrong, flexShrink: 1 },
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
