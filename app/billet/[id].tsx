import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Image } from 'expo-image';
import QRCode from 'react-native-qrcode-svg';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OrganizerLine } from '@/components/caravan';
import { popIn, riseIn } from '@/components/motion';
import { BackButton, Field, LabeledField, PrimaryButton, SafeBottom, SheetHeader } from '@/components/ui';
import { formatDateTime, formatFcfa } from '@/constants/data';
import { colors, motion, radii, shadow, typo } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useCaravans } from '@/context/CaravansContext';
import { caravansApi, dayLabel, hourLabel, isCaravanTicket, isEventTicket, toOrganizer, type EventTicketDto, type TicketDto } from '@/features/caravans/api';
import { ticketMethodLabel } from '@/features/payments/checkout';
import { RatingCard } from '@/features/ratings/RatingCard';
import { ApiError } from '@/lib/api';
import { useNow } from '@/lib/useNow';
import { toast } from '@/lib/toast';

/** "06h15" → "06h00": students wait at the stop 15 min before the bus. */
function minus15(time: string) {
  const [h, m] = time.split('h').map(Number);
  const n = (h * 60 + m - 15 + 1440) % 1440;
  return `${String(Math.floor(n / 60)).padStart(2, '0')}h${String(n % 60).padStart(2, '0')}`;
}

/**
 * Several tickets bought together: one small stub per ticket ("2/3", its type or seat, for whom), side by side and
 * scrollable, the open one highlighted. Nothing is cut, whatever the type's name.
 */
function TicketSwitcher({ items, current }: { items: { id: string; title: string; sub: string }[]; current: string }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stubs} accessibilityRole="tablist">
      {items.map((t, i) => {
        const on = t.id === current;
        return (
          <Pressable
            key={t.id}
            onPress={() => !on && router.replace(`/billet/${t.id}`)}
            style={[styles.stub, on && styles.stubOn]}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`Billet ${i + 1} sur ${items.length} : ${t.title}, ${t.sub}`}>
            <View style={styles.stubTop}>
              <Ionicons name={on ? 'ticket' : 'ticket-outline'} size={14} color={on ? colors.primary : colors.muted2} />
              <Text style={[styles.stubCount, on && { color: colors.primary }]}>
                {i + 1}/{items.length}
              </Text>
            </View>
            <Text style={[styles.stubTitle, on && { color: colors.primary }]} numberOfLines={1}>
              {t.title}
            </Text>
            <Text style={styles.stubSub} numberOfLines={1}>
              {t.sub}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const fail = (title: string) => (err: unknown) => Alert.alert(title, err instanceof ApiError ? err.message : 'Réessaie dans un instant.');

export default function Billet() {
  // `nouveau`: just paid, the ticket is handed over with a short animation (not on later visits).
  const { id, nouveau } = useLocalSearchParams<{ id: string; nouveau?: string }>();
  const fresh = nouveau === '1';
  const { cancel, tickets } = useCaravans();
  const { user } = useAuth();
  const [ticket, setTicket] = useState<TicketDto | null>(() => tickets.find((t) => t.id === id) ?? null);
  const [missing, setMissing] = useState(false);

  // Fresh from the server each time it shows: the QR, the fee and the transfer state change over time.
  const load = useCallback(() => {
    if (!id) return;
    caravansApi.ticket(id).then(setTicket, (err) => {
      if (err instanceof ApiError && err.status === 404) setMissing(true);
    });
  }, [id]);
  useFocusEffect(load);

  const back = () => (router.canGoBack() ? router.back() : router.replace({ pathname: '/(tabs)/caravanes', params: { vue: 'caravanes' } }));

  if (!ticket) {
    return (
      <SafeAreaView style={styles.safe}>
        <Header onBack={back} />
        <View style={styles.missing}>
          {missing ? (
            <>
              <Ionicons name="ticket-outline" size={32} color={colors.muted} />
              <Text style={styles.muted}>Billet introuvable.</Text>
            </>
          ) : (
            <ActivityIndicator color={colors.primary} />
          )}
        </View>
      </SafeAreaView>
    );
  }

  // An event (party, conference…): its own layout, the same actions.
  if (isEventTicket(ticket)) return <EventBillet ticket={ticket} fresh={fresh} onBack={back} load={load} />;

  const d = ticket.details;
  const pickupTime = hourLabel(Date.parse(d.pickup.at));
  const dropoffTime = hourLabel(Date.parse(d.dropoff.at));
  const missingSeats = Math.max(0, d.minPassengers - d.seatsBooked);
  const active = ticket.status === 'active';
  const quote = ticket.cancellationQuote;
  const method = ticketMethodLabel[ticket.paidWith] ?? 'ton compte';
  // Paid in cash: nothing paid in the app, nothing refunded; the price handed over at boarding.
  const cash = ticket.paidWith === 'cash';
  const companion = ticket.passenger;
  const firstName = companion?.name.split(' ')[0] ?? '';
  // The other tickets I hold for this departure (my seat and my companion's): one tap from one to the other.
  const group = tickets
    .filter(isCaravanTicket)
    .filter((t) => t.details.departureId === d.departureId && t.status === 'active')
    .sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0));

  const send = () =>
    Share.share({
      message:
        `${firstName}, ton billet UGB Connect : ${d.from} → ${d.to}, ${dayLabel(Date.parse(ticket.event.startsAt))}, place ${ticket.seat}.\n` +
        `Montée à ${d.pickup.place} à ${minus15(pickupTime)} (15 min avant le bus).\n` +
        `Code à donner au chauffeur : ${ticket.code}`,
    }).catch(() => undefined);

  const askCancel = () => {
    if (!quote) return;
    if (!quote.allowed) return Alert.alert('Annulation impossible', quote.reason);
    // My own seat, with companions' tickets on the same departure: they stay valid unless cancelled too.
    const others = companion ? [] : group.filter((t) => t.id !== ticket.id && t.passenger && t.cancellationQuote?.allowed);
    if (others.length) {
      const refund = (t: TicketDto) => (t.cancellationQuote?.allowed ? t.cancellationQuote.refund : 0);
      const names = others.map((t) => t.passenger!.name.split(' ')[0]).join(' et ');
      const both = async () => {
        for (const t of [ticket, ...others]) await cancel(t.id);
      };
      return Alert.alert(
        'Annuler ton billet ?',
        (cash ? 'Ta place est libérée : rien à rembourser.\n\n' : `${formatFcfa(quote.refund)} remboursés sur ton numéro ${method}${quote.fee ? ` (${formatFcfa(quote.fee)} de frais)` : ''}.\n\n`) +
          `Le billet de ${names} reste valable si tu le gardes. Tu peux aussi l’annuler : ${formatFcfa(quote.refund + others.reduce((n, t) => n + refund(t), 0))} remboursés en tout.`,
        [
          { text: 'Garder', style: 'cancel' },
          { text: 'Seulement le mien', onPress: () => cancel(ticket.id).then(load, fail('Annulation impossible')) },
          { text: `Annuler les ${others.length + 1}`, style: 'destructive', onPress: () => both().then(load, fail('Annulation impossible')) },
        ],
      );
    }
    Alert.alert(
      'Annuler ce billet ?',
      cash
        ? 'Ta place est libérée. Rien n’a été payé, rien à rembourser.'
        : quote.fee === 0
          ? `Annulation gratuite : ${formatFcfa(quote.refund)} remboursés sur ton numéro ${method}.`
          : `Moins de 24 h avant le départ : ${formatFcfa(quote.fee)} de frais. ${formatFcfa(quote.refund)} remboursés sur ton numéro ${method}.`,
      [
        { text: 'Garder mon billet', style: 'cancel' },
        { text: 'Annuler le billet', style: 'destructive', onPress: () => cancel(ticket.id).then(load, fail('Annulation impossible')) },
      ],
    );
  };

  const banner =
    ticket.status === 'cancelled'
      ? {
          tone: 'neutral' as const,
          icon: 'close-circle' as const,
          text:
            ticket.cancellation?.reason === 'holder_cancelled'
              ? cash
                ? 'Billet annulé · rien à payer'
                : `Billet annulé · ${formatFcfa(ticket.cancellation.refundAmount)} remboursés sur ton numéro ${method}`
              : `Départ annulé${ticket.cancellation?.reason === 'min_not_reached' ? ' (pas assez de passagers)' : ''} · ${cash ? 'rien à payer' : `${formatFcfa(ticket.cancellation?.refundAmount ?? ticket.price)} remboursés`}`,
        }
      : ticket.status === 'transferred'
        ? { tone: 'neutral' as const, icon: 'swap-horizontal' as const, text: `Billet transféré à ${ticket.transfer?.to.name ?? 'un ami'} (${ticket.transfer?.to.phoneMasked ?? ''})` }
        : ticket.admittedAt
          ? { tone: 'success' as const, icon: 'checkmark-circle' as const, text: companion ? `${companion.name} est à bord · bon voyage !` : 'Tu es à bord · bon voyage !' }
          : d.confirmed
            ? { tone: 'success' as const, icon: 'checkmark-circle' as const, text: `Départ confirmé · sois à ${d.pickup.place} à ${minus15(pickupTime)}` }
            : {
                tone: 'warning' as const,
                icon: 'hourglass-outline' as const,
                text: `En attente de ${missingSeats} passager${missingSeats > 1 ? 's' : ''} d’ici le ${formatDateTime(Date.parse(d.confirmBy))}. ${cash ? 'Sinon ta réservation est annulée.' : 'Sinon tu es remboursé à 100 %.'}`,
              };

  return (
    <SafeAreaView style={styles.safe}>
      <Header onBack={back} />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <StatusBanner {...banner} />
        {active && (ticket.cashDue ?? 0) > 0 && <CashDue amount={ticket.cashDue!} where="à l’embarquement" />}
        {/* The trip is over: « Noter Sunu Voyage » (optional). */}
        {active && !companion && <RatingCard subject="caravan" id={d.departureId} />}

        {group.length > 1 && (
          <TicketSwitcher
            current={ticket.id}
            items={group.map((t) => ({ id: t.id, title: t.seat ? `Place ${t.seat}` : 'Place libre', sub: t.passenger ? t.passenger.name.split(' ')[0]! : 'Toi' }))}
          />
        )}

        <Animated.View entering={fresh ? riseIn.delay(motion.fast) : undefined} style={[styles.ticket, shadow.raised, !active && { opacity: 0.6 }]}>
          <View style={styles.top}>
            <OrganizerLine organizer={toOrganizer(ticket.event.organizer)} />
            <View style={styles.route}>
              <Text style={styles.city}>{d.from}</Text>
              <Ionicons name="arrow-forward" size={18} color={colors.primary} />
              <Text style={styles.city}>{d.to}</Text>
            </View>
            {active && companion ? (
              <View>
                <Text style={styles.passenger}>{companion.name}</Text>
                <Text style={styles.plate}>Accompagnant · réservé par toi · {companion.phone}</Text>
              </View>
            ) : (
              user &&
              active && (
                <View>
                  <Text style={styles.passenger}>
                    {user.firstName} {user.lastName}
                  </Text>
                  {!ticket.purchaser.isMe && <Text style={styles.plate}>Réservé par {ticket.purchaser.name}</Text>}
                </View>
              )
            )}
            <View style={styles.grid}>
              <Cell label="Date" value={dayLabel(Date.parse(ticket.event.startsAt))} />
              <Cell label="Heure" value={pickupTime} />
              <Cell label="Place" value={`n° ${ticket.seat}`} />
            </View>
            {/* Full width: stop names are long ("Diamniadio · Hôpital des enfants"). */}
            <View style={styles.stops}>
              <StopLine icon="enter-outline" label="Montée" place={d.pickup.place} time={pickupTime} />
              <StopLine icon="exit-outline" label="Descente" place={d.dropoff.place} time={`~${dropoffTime}`} />
            </View>
            <Text style={styles.plate}>
              {d.vehicle.label}
              {d.vehicle.airConditioned ? ' · Climatisé' : ''}
              {d.vehicle.plate ? ` · ${d.vehicle.plate}` : ''}
            </Text>
          </View>

          {/* Tear line between the trip and the code. */}
          <View style={styles.tear}>
            <View style={[styles.notch, { left: -12 }]} />
            <View style={styles.dashes} />
            <View style={[styles.notch, { right: -12 }]} />
          </View>

          <View style={styles.bottom}>
            {active && ticket.qr ? (
              <>
                {/* Signed by the server: a screenshot of a ticket given away or cancelled is refused. */}
                <Animated.View entering={fresh ? popIn.delay(motion.slow) : undefined}>
                  <QRCode value={ticket.qr} size={190} color={colors.navy} backgroundColor={colors.card} ecl="M" />
                </Animated.View>
                <Text style={styles.code}>{ticket.code}</Text>
                <Text style={styles.muted}>
                  {companion ? `Embarquez ensemble, ou envoie le code à ${firstName} : le chauffeur vérifie son nom sur sa pièce d’identité` : 'Montre ce code au chauffeur à l’embarquement'}
                </Text>
              </>
            ) : (
              <View style={styles.void}>
                <Ionicons name="ban-outline" size={36} color={colors.muted} />
                <Text style={styles.muted}>Ce billet n’est plus valable</Text>
              </View>
            )}
          </View>
        </Animated.View>

        {active && companion && !ticket.admittedAt && (
          <Pressable style={[styles.action, shadow.card]} onPress={send} accessibilityRole="button">
            <Ionicons name="paper-plane-outline" size={18} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.actionTitle}>Envoyer à {firstName}</Text>
              <Text style={styles.actionSub}>Par WhatsApp ou SMS : le trajet, l’heure et le code à donner au chauffeur</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </Pressable>
        )}

        <TicketActions
          ticket={ticket}
          load={load}
          onCancel={askCancel}
          transferTitle={companion ? `Mettre le billet dans l’app de ${firstName}` : 'Transférer à un ami'}
          transferText={companion ? `Si ${firstName} a un compte UGB Connect : son propre QR code, à son nom` : 'Ton ami accepte dans son app, la place devient la sienne'}
          lateFee="à moins de 24 h du départ"
          initialPhone={companion?.phone ?? ''}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * What can be done with a ticket, whatever its kind: the transfer in flight (withdraw it), giving it to a friend,
 * cancelling it (the kind decides the fee).
 */
function TicketActions({
  ticket,
  load,
  onCancel,
  transferTitle,
  transferText,
  lateFee,
  initialPhone,
}: {
  ticket: TicketDto;
  load: () => void;
  onCancel: () => void;
  transferTitle: string;
  transferText: string;
  /** "à moins de 24 h du départ" */
  lateFee: string;
  initialPhone: string;
}) {
  const { transfer, withdraw } = useCaravans();
  const [open, setOpen] = useState(false);
  const now = useNow();
  const active = ticket.status === 'active';
  const quote = ticket.cancellationQuote;
  const pending = ticket.transfer?.status === 'pending' ? ticket.transfer : null;
  const canTransfer = active && !pending && !ticket.admittedAt && !!ticket.transferDeadline && Date.parse(ticket.transferDeadline) > now;

  return (
    <>
      {pending && (
        <View style={[styles.action, shadow.card]}>
          <Ionicons name="hourglass-outline" size={18} color={colors.warning} />
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>Transfert en attente</Text>
            <Text style={styles.actionSub}>
              {pending.to.name} ({pending.to.phoneMasked}) doit accepter avant le {formatDateTime(Date.parse(pending.expiresAt))}. Le billet reste à toi d’ici là.
            </Text>
          </View>
          <Pressable onPress={() => withdraw(pending.id).then(load, fail('Action impossible'))} hitSlop={8} accessibilityRole="button">
            <Text style={[styles.actionTitle, { color: colors.dangerText }]}>Annuler</Text>
          </Pressable>
        </View>
      )}

      {active && quote?.allowed && (
        <View style={{ gap: 10 }}>
          {canTransfer && (
            <Pressable style={[styles.action, shadow.card]} onPress={() => setOpen(true)} accessibilityRole="button">
              <Ionicons name="swap-horizontal" size={18} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.actionTitle}>{transferTitle}</Text>
                <Text style={styles.actionSub}>{transferText}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </Pressable>
          )}
          <Pressable style={[styles.action, shadow.card]} onPress={onCancel} accessibilityRole="button">
            <Ionicons name="close-circle-outline" size={18} color={colors.danger} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionTitle, { color: colors.dangerText }]}>Annuler le billet</Text>
              <Text style={styles.actionSub}>
                {quote.fee === 0 && quote.freeUntil ? `Gratuit jusqu’au ${formatDateTime(Date.parse(quote.freeUntil))}` : `${formatFcfa(quote.fee)} de frais ${lateFee}`}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </Pressable>
        </View>
      )}

      <TransferSheet
        key={ticket.id}
        initialPhone={initialPhone}
        visible={open}
        onClose={() => setOpen(false)}
        onConfirm={async (phone) => {
          try {
            await transfer(ticket.id, phone);
            setOpen(false);
            load();
            toast(`Billet proposé à ${phone} : il doit l’accepter dans son app.`);
          } catch (err) {
            fail('Transfert impossible')(err);
          }
        }}
      />
    </>
  );
}

/** A cash ticket not paid yet: what to bring, and to whom. */
function CashDue({ amount, where }: { amount: number; where: string }) {
  return (
    <View style={styles.cash} accessibilityRole="summary">
      <View style={styles.cashIcon}>
        <Ionicons name="cash-outline" size={20} color={colors.successText} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.cashTitle}>À payer {where} : {formatFcfa(amount)}</Text>
        <Text style={styles.cashText}>En espèces, à l’organisateur, quand il scanne ton billet. Prévois l’appoint.</Text>
      </View>
    </View>
  );
}

/** An event ticket: the cover, what and when, the type, the QR code for the entrance. */
function EventBillet({ ticket, fresh, onBack, load }: { ticket: EventTicketDto; fresh: boolean; onBack: () => void; load: () => void }) {
  const { cancel, tickets } = useCaravans();
  const d = ticket.details;
  const active = ticket.status === 'active';
  const method = ticketMethodLabel[ticket.paidWith] ?? 'ton compte';
  // Paid in cash: nothing paid in the app, nothing refunded; the price handed over at boarding.
  const cash = ticket.paidWith === 'cash';
  const at = Date.parse(d.startsAt);
  // My other tickets for this event (bought for friends): one tap from one to the other.
  const group = tickets.filter(isEventTicket).filter((t) => t.details.eventId === d.eventId && t.status === 'active');
  const quote = ticket.cancellationQuote;

  const askCancel = () => {
    if (!quote) return;
    if (!quote.allowed) return Alert.alert('Annulation impossible', quote.reason);
    Alert.alert(
      'Annuler ce billet ?',
      cash
        ? 'Ta place est libérée. Rien n’a été payé, rien à rembourser.'
        : quote.fee === 0
          ? `Annulation gratuite : ${formatFcfa(quote.refund)} remboursés sur ton numéro ${method}.`
          : `Moins de 24 h avant l’événement : ${formatFcfa(quote.fee)} de frais. ${formatFcfa(quote.refund)} remboursés sur ton numéro ${method}.`,
      [
        { text: 'Garder mon billet', style: 'cancel' },
        { text: 'Annuler le billet', style: 'destructive', onPress: () => cancel(ticket.id).then(load, fail('Annulation impossible')) },
      ],
    );
  };

  const banner =
    ticket.status === 'cancelled'
      ? {
          tone: 'neutral' as const,
          icon: 'close-circle' as const,
          text:
            ticket.cancellation?.reason === 'holder_cancelled'
              ? cash
                ? 'Billet annulé · rien à payer'
                : `Billet annulé · ${formatFcfa(ticket.cancellation.refundAmount)} remboursés sur ton numéro ${method}`
              : `Événement annulé · ${cash ? 'rien à payer' : `${formatFcfa(ticket.cancellation?.refundAmount ?? ticket.price)} remboursés`}`,
        }
      : ticket.status === 'transferred'
        ? { tone: 'neutral' as const, icon: 'swap-horizontal' as const, text: `Billet offert à ${ticket.transfer?.to.name ?? 'un ami'} (${ticket.transfer?.to.phoneMasked ?? ''})` }
        : ticket.admittedAt
          ? { tone: 'success' as const, icon: 'checkmark-circle' as const, text: 'Tu es entré · profite bien !' }
          : { tone: 'success' as const, icon: 'sparkles' as const, text: `${dayLabel(at)} à ${hourLabel(at)} · ${d.venue.name}` };

  return (
    <SafeAreaView style={styles.safe}>
      <Header onBack={onBack} />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <StatusBanner {...banner} />
        {active && (ticket.cashDue ?? 0) > 0 && <CashDue amount={ticket.cashDue!} where="à l’entrée" />}
        {active && <RatingCard subject="event" id={d.eventId} />}

        {group.length > 1 && <TicketSwitcher current={ticket.id} items={group.map((t) => ({ id: t.id, title: t.details.typeName, sub: formatFcfa(t.price) }))} />}

        <Animated.View entering={fresh ? riseIn.delay(motion.fast) : undefined} style={[styles.ticket, shadow.raised, !active && { opacity: 0.6 }]}>
          {d.image && <Image source={{ uri: d.image }} style={styles.cover} contentFit="cover" />}
          <View style={styles.top}>
            <OrganizerLine organizer={toOrganizer(ticket.event.organizer)} />
            <Text style={styles.city}>{ticket.event.title}</Text>
            <View style={styles.grid}>
              <Cell label="Date" value={dayLabel(at)} />
              <Cell label="Heure" value={hourLabel(at)} />
              <Cell label="Billet" value={d.typeName} />
            </View>
            <View style={styles.stops}>
              <StopLine icon="location-outline" label="Lieu" place={d.venue.name} time={d.venue.address ?? ''} />
            </View>
            {!ticket.purchaser.isMe && <Text style={styles.plate}>Offert par {ticket.purchaser.name}</Text>}
          </View>

          <View style={styles.tear}>
            <View style={[styles.notch, { left: -12 }]} />
            <View style={styles.dashes} />
            <View style={[styles.notch, { right: -12 }]} />
          </View>

          <View style={styles.bottom}>
            {active && ticket.qr ? (
              <>
                <Animated.View entering={fresh ? popIn.delay(motion.slow) : undefined}>
                  <QRCode value={ticket.qr} size={190} color={colors.navy} backgroundColor={colors.card} ecl="M" />
                </Animated.View>
                <Text style={styles.code}>{ticket.code}</Text>
                <Text style={styles.muted}>Montre ce QR code à l’entrée</Text>
              </>
            ) : (
              <View style={styles.void}>
                <Ionicons name="ban-outline" size={36} color={colors.muted} />
                <Text style={styles.muted}>Ce billet n’est plus valable</Text>
              </View>
            )}
          </View>
        </Animated.View>

        <TicketActions
          ticket={ticket}
          load={load}
          onCancel={askCancel}
          transferTitle="Offrir à un ami"
          transferText="Ton ami accepte dans son app, le billet devient le sien avec son propre QR code"
          lateFee="à moins de 24 h de l’événement"
          initialPhone=""
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.head}>
      <BackButton onPress={onBack} />
      <Text style={styles.h1}>Mon billet</Text>
      <View style={{ width: 44 }} />
    </View>
  );
}

const TONES = {
  success: { fg: colors.successText, bg: colors.successBg, icon: colors.success },
  warning: { fg: colors.warningText, bg: colors.warningBg, icon: colors.warning },
  neutral: { fg: colors.muted2, bg: colors.card, icon: colors.muted },
};

function StatusBanner({ tone, icon, text }: { tone: keyof typeof TONES; icon: keyof typeof Ionicons.glyphMap; text: string }) {
  const t = TONES[tone];
  return (
    <View style={[styles.banner, { backgroundColor: t.bg }]} accessibilityLiveRegion="polite">
      <Ionicons name={icon} size={18} color={t.icon} />
      <Text style={[styles.bannerText, { color: t.fg }]}>{text}</Text>
    </View>
  );
}

function StopLine({ icon, label, place, time }: { icon: keyof typeof Ionicons.glyphMap; label: string; place: string; time: string }) {
  return (
    <View style={styles.stopLine}>
      <Ionicons name={icon} size={16} color={colors.primary} />
      <View style={{ flex: 1 }}>
        <Text style={styles.cellLabel}>{label}</Text>
        <Text style={styles.cellValue}>{place}</Text>
      </View>
      <Text style={styles.stopTime}>{time}</Text>
    </View>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.cell}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={styles.cellValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function TransferSheet({
  visible,
  initialPhone,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  /** A companion's number, ready to send their own ticket to them. */
  initialPhone: string;
  onClose: () => void;
  onConfirm: (phone: string) => Promise<void>;
}) {
  const [digits, setDigits] = useState(() => initialPhone.replace(/^\+221/, '').replace(/\D/g, '').slice(0, 9));
  const [sending, setSending] = useState(false);
  // Senegalese mobile numbers: 9 digits, starting with 7.
  const valid = /^7\d{8}$/.test(digits);
  const shown = digits.replace(/^(\d{2})(\d{0,3})(\d{0,2})(\d{0,2}).*/, (_, a, b, c, d) => [a, b, c, d].filter(Boolean).join(' '));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fermer" />
      <KeyboardAvoidingView behavior="padding" style={{ flexShrink: 1 }}>
        <View style={styles.sheet}>
          <SheetHeader onClose={onClose} titleStyle={styles.sheetTitle}>Transférer le billet</SheetHeader>
          <Text style={styles.actionSub}>
            Ton ami doit avoir un compte étudiant UGB Connect. Une fois qu’il accepte, le billet devient le sien et ton QR code ne marche plus.
          </Text>
          <LabeledField label="Numéro de ton ami" error={digits.length >= 9 && !valid ? 'Numéro invalide' : null}>
            <Field
              prefix="+221"
              placeholder="77 123 45 67"
              keyboardType="phone-pad"
              value={shown}
              onChangeText={(t) => setDigits(t.replace(/\D/g, '').slice(0, 9))}
              invalid={digits.length >= 9 && !valid}
            />
          </LabeledField>
          <PrimaryButton
            label="Proposer le billet"
            disabled={!valid}
            loading={sending}
            onPress={() => {
              setSending(true);
              onConfirm(`+221 ${shown}`).finally(() => setSending(false));
            }}
          />
          <SafeBottom />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  cash: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radii.md, backgroundColor: colors.successBg, borderWidth: 1, borderColor: '#BFE8CF' },
  cashIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  cashTitle: { ...typo.bodyStrong, color: colors.successText },
  cashText: { ...typo.caption, color: colors.successText, marginTop: 2 },
  safe: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 },
  h1: { ...typo.h3, color: colors.navy },
  body: { padding: 20, gap: 14, paddingBottom: 40 },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  muted: { ...typo.caption, color: colors.muted2, textAlign: 'center' },
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: radii.md },
  bannerText: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  ticket: { backgroundColor: colors.card, borderRadius: radii.xl, overflow: 'hidden' },
  cover: { width: '100%', height: 140 },
  top: { padding: 18, gap: 12 },
  route: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  city: { ...typo.h2, color: colors.navy },
  passenger: { ...typo.bodyStrong, color: colors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 12 },
  cell: { width: '33.33%', paddingRight: 8 },
  stops: { gap: 10, padding: 12, borderRadius: radii.md, backgroundColor: colors.primarySoft },
  stopLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stopTime: { ...typo.smallStrong, color: colors.navy, fontVariant: ['tabular-nums'] },
  plate: { ...typo.caption, color: colors.muted2 },
  cellLabel: { fontSize: 11, color: colors.muted2 },
  cellValue: { ...typo.bodyStrong, color: colors.navy, marginTop: 2 },
  tear: { height: 24, justifyContent: 'center' },
  dashes: { marginHorizontal: 18, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: colors.border },
  notch: { position: 'absolute', width: 24, height: 24, borderRadius: 12, backgroundColor: colors.bg },
  bottom: { alignItems: 'center', gap: 8, padding: 18, paddingTop: 8 },
  code: { ...typo.title, color: colors.navy, letterSpacing: 2 },
  void: { height: 170, alignItems: 'center', justifyContent: 'center', gap: 8 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: radii.md, padding: 14 },
  actionTitle: { ...typo.title, color: colors.navy },
  actionSub: { ...typo.caption, color: colors.muted2, marginTop: 2 },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,27,76,0.35)' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: 20, paddingBottom: 36, gap: 14 },
  sheetTitle: { ...typo.h3, color: colors.navy },
  stubs: { gap: 10, paddingVertical: 2 },
  stub: { width: 112, paddingVertical: 10, paddingHorizontal: 12, gap: 2, borderRadius: radii.md, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.border, backgroundColor: colors.card },
  stubOn: { borderStyle: 'solid', borderColor: colors.primary, backgroundColor: colors.primarySoft },
  stubTop: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  stubCount: { ...typo.label, color: colors.muted2 },
  stubTitle: { ...typo.bodyStrong, color: colors.navy },
  stubSub: { ...typo.caption, color: colors.muted2 },
});
