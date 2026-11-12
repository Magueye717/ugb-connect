import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton, PrimaryButton, StickyFooter, STICKY_FOOTER_SPACE, TextButton } from '@/components/ui';
import { formatDateTime } from '@/constants/data';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useCaravans } from '@/context/CaravansContext';
import { dayLabel, hourLabel, type CaravanTicketDetails, type IncomingTransferDto } from '@/features/caravans/api';
import type { EventTicketDetails } from '@/features/events/api';
import { ApiError } from '@/lib/api';
import { haptics } from '@/lib/haptics';
import { toast } from '@/lib/toast';

const isTrip = (d: IncomingTransferDto['details']): d is CaravanTicketDetails => 'departureId' in d;

/**
 * A ticket a friend offers me (or the seat they booked for me as their companion), opened from its notification: who,
 * what (the event, or the trip with its seat and stops), until when. « Accepter » makes it mine and opens it with its
 * own QR code. Already answered (or opened again later): straight to the ticket if it's mine.
 */
export default function Cadeau() {
  const { id, ticket: ticketId } = useLocalSearchParams<{ id: string; ticket?: string }>();
  const { incoming, tickets, refresh, accept, decline } = useCaravans();
  const offer = incoming.find((x) => x.id === id) ?? null;
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState<'yes' | 'no' | null>(null);

  // Fresh offers and tickets each time it opens (the notification may be older than the list).
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      Promise.resolve(refresh())
        .catch(() => undefined)
        .finally(() => alive && setChecked(true));
      return () => {
        alive = false;
      };
    }, [refresh]),
  );

  // Not waiting any more, and the ticket is mine (accepted already): its own screen.
  const mine = !offer && checked && ticketId ? tickets.find((t) => t.id === ticketId && t.status === 'active') : undefined;
  useEffect(() => {
    if (mine) router.replace(`/billet/${mine.id}`);
  }, [mine]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));
  const answer = async (yes: boolean) => {
    if (!offer) return;
    setBusy(yes ? 'yes' : 'no');
    try {
      if (yes) {
        const got = await accept(offer.id);
        haptics.success();
        if (got) router.replace({ pathname: '/billet/[id]', params: { id: got, nouveau: '1' } });
        else back();
      } else {
        await decline(offer.id);
        toast('Billet refusé : il reste à ton ami.');
        back();
      }
    } catch (err) {
      Alert.alert(yes ? 'Impossible d’accepter' : 'Impossible de refuser', err instanceof ApiError ? err.message : 'Réessaie dans un instant.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.head}>
        <BackButton onPress={back} />
        <Text style={styles.h1}>{offer?.forCompanion ? 'Ta place' : 'Un billet pour toi'}</Text>
        <View style={{ width: 44 }} />
      </View>

      {!offer ? (
        <View style={styles.empty}>
          {!checked || mine ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <>
              <Ionicons name="gift-outline" size={36} color={colors.muted} />
              <Text style={styles.emptyTitle}>Cette offre n’est plus en attente</Text>
              <Text style={styles.muted}>Elle a été acceptée, refusée, retirée par ton ami ou elle a expiré. Tes billets sont dans « Mes billets ».</Text>
              <TextButton label="Retour" onPress={back} style={{ alignSelf: 'center' }} />
            </>
          )}
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={[styles.body, { paddingBottom: STICKY_FOOTER_SPACE.two }]}>
            <View style={styles.intro}>
              <View style={styles.gift}>
                <Ionicons name="gift" size={26} color="#fff" />
              </View>
              <Text style={styles.title}>{offer.forCompanion ? `${offer.from.name} t’a réservé une place` : `${offer.from.name} t’offre son billet`}</Text>
              <Text style={styles.muted}>
                {offer.forCompanion ? 'Ajoute-le à ton app : tu auras ton propre QR code, à ton nom.' : 'Accepte-le : il devient le tien, avec ton propre QR code.'}
              </Text>
            </View>

            <OfferCard offer={offer} />

            <View style={styles.deadline}>
              <Ionicons name="time-outline" size={16} color={colors.warningText} />
              <Text style={styles.deadlineText}>À accepter avant le {formatDateTime(Date.parse(offer.expiresAt))}. Sinon, il reste à {offer.from.name.split(' ')[0]}.</Text>
            </View>
          </ScrollView>
          <StickyFooter>
            <PrimaryButton label={offer.forCompanion ? 'Ajouter à mon app' : 'Accepter le billet'} loading={busy === 'yes'} disabled={!!busy} onPress={() => answer(true)} />
            <TextButton label={busy === 'no' ? 'Un instant…' : 'Refuser'} tone="danger" disabled={!!busy} onPress={() => answer(false)} style={{ alignSelf: 'center' }} />
          </StickyFooter>
        </>
      )}
    </SafeAreaView>
  );
}

/** What is offered: the event (picture, type, place) or the trip (route, seat, stops), and when. */
function OfferCard({ offer }: { offer: IncomingTransferDto }) {
  const d = offer.details;
  if (isTrip(d)) {
    const at = Date.parse(d.pickup.at);
    return (
      <View style={[styles.card, shadow.card]}>
        <View style={styles.route}>
          <Text style={styles.city}>{d.from}</Text>
          <Ionicons name="arrow-forward" size={18} color={colors.primary} />
          <Text style={styles.city}>{d.to}</Text>
        </View>
        <View style={styles.grid}>
          <Cell label="Date" value={dayLabel(at)} />
          <Cell label="Heure" value={hourLabel(at)} />
          <Cell label="Place" value={offer.seat ? `n° ${offer.seat}` : '—'} />
        </View>
        <Line icon="enter-outline" label="Montée" value={d.pickup.place} />
        <Line icon="exit-outline" label="Arrêt" value={d.dropoff.place} />
      </View>
    );
  }
  const e = d as EventTicketDetails;
  const at = Date.parse(e.startsAt);
  return (
    <View style={[styles.card, shadow.card, { padding: 0, overflow: 'hidden' }]}>
      {e.image ? <Image source={{ uri: e.image }} style={styles.cover} contentFit="cover" /> : null}
      <View style={{ padding: 14, gap: 12 }}>
        <Text style={styles.city}>{offer.event?.title ?? 'Événement'}</Text>
        <View style={styles.grid}>
          <Cell label="Date" value={dayLabel(at)} />
          <Cell label="Heure" value={hourLabel(at)} />
          <Cell label="Billet" value={e.typeName} />
        </View>
        <Line icon="location-outline" label="Lieu" value={e.venue.address ? `${e.venue.name} · ${e.venue.address}` : e.venue.name} />
      </View>
    </View>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={styles.cellValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function Line({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.line}>
      <Ionicons name={icon} size={16} color={colors.primary} />
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={styles.lineValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 },
  h1: { ...typo.h3, color: colors.navy },
  body: { padding: 20, gap: 16 },
  intro: { alignItems: 'center', gap: 8, paddingTop: 8 },
  gift: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  title: { ...typo.h3, color: colors.navy, textAlign: 'center' },
  muted: { ...typo.small, color: colors.muted2, textAlign: 'center', lineHeight: 19 },
  card: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 14, gap: 12 },
  cover: { width: '100%', height: 130, backgroundColor: colors.border },
  route: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  city: { ...typo.h3, color: colors.navy },
  grid: { flexDirection: 'row', gap: 8 },
  cellLabel: { fontSize: 11, color: colors.muted2 },
  cellValue: { ...typo.bodyStrong, color: colors.navy, marginTop: 2 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lineLabel: { ...typo.caption, color: colors.muted2, width: 56 },
  lineValue: { ...typo.smallStrong, color: colors.navy, flex: 1 },
  deadline: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: radii.md, backgroundColor: colors.warningBg },
  deadlineText: { ...typo.small, color: colors.warningText, flex: 1, lineHeight: 19 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 },
  emptyTitle: { ...typo.title, color: colors.navy, textAlign: 'center' },
});
