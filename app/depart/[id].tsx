import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/states';
import { BackButton, Segmented } from '@/components/ui';
import type { CaravanStop } from '@/constants/data';
import { formatFcfa } from '@/constants/data';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { methodLabel, type PaymentMethod } from '@/features/payments/checkout';
import { useManifest, type OrgCaravan, type Passenger } from '@/features/organizer/boarding';
import { TicketScanner } from '@/features/organizer/TicketScanner';
import { useTicketCheck } from '@/features/organizer/useTicketCheck';
import { ApiError } from '@/lib/api';

type Tab = 'pickups' | 'dropoffs';

const fail = (title: string) => (err: unknown) => Alert.alert(title, err instanceof ApiError ? err.message : 'Réessaie dans un instant.');

/**
 * The driver's list, stop by stop: who gets on where, who is on board, who gets off where.
 * Boarding is checked by scanning the ticket's QR code (or typing its code), here or from the Scanner tab;
 * every phone of the organization sees the same list, live.
 */
export default function Manifest() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // Only the organization's own departures: the server answers 404 for others (the list holds names and phones).
  const m = useManifest(id);
  const { organizer } = useAuth();
  const isOwner = !!organizer?.roles.includes('owner');
  const check = useTicketCheck(id);
  const [view, setView] = useState<Tab>('pickups');
  const [scanning, setScanning] = useState(false);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/activites'));
  const c = m.caravan;

  if (!c) {
    return (
      <SafeAreaView style={styles.safe}>
        <Header onBack={back} />
        {m.loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <EmptyState
            icon="bus-outline"
            title="Départ introuvable"
            text={m.error ?? 'Il a été supprimé, ou il appartient à un autre organisateur.'}
            action={{ label: 'Mes activités', onPress: () => router.replace('/activites') }}
          />
        )}
      </SafeAreaView>
    );
  }

  const passengers = m.passengers;
  // Stops the bus has left: whoever wasn't scanned there is marked absent.
  const left = c.stopsLeft;
  const isBoarded = (p: Passenger) => p.admitted;
  const isAbsent = (p: Passenger) => !p.admitted && left.includes(p.pickupStopId);
  const boarded = passengers.filter(isBoarded).length;
  // Packs saved before companions existed have no purchaser: each ticket is then its own buyer.
  const buyers = new Set(passengers.map((p) => p.purchaser?.id ?? p.ticketId)).size;
  const absents = passengers.filter(isAbsent).length;
  const stopOf = (stops: CaravanStop[], stopId: string) => stops.find((s) => s.stopId === stopId);
  // First stop not left yet: where the bus is (or is heading).
  const current = c.pickups.find((s) => !left.includes(s.stopId));

  const leave = (stop: CaravanStop) => {
    const missing = passengers.filter((p) => p.pickupStopId === stop.stopId && !isBoarded(p));
    const go = () => m.leave(stop.stopId).catch(fail('Impossible d’enregistrer le départ'));
    if (!missing.length) return go();
    Alert.alert(
      `${missing.length} passager${missing.length > 1 ? 's' : ''} pas encore monté${missing.length > 1 ? 's' : ''}`,
      `${missing.map((p) => `${p.name} (place ${p.seat})`).join('\n')}\n\nAppelle-les avant de partir. Si tu pars, ils sont marqués absents.`,
      [
        { text: 'Attendre', style: 'cancel' },
        { text: 'Partir quand même', style: 'destructive', onPress: go },
      ],
    );
  };

  const toggle = (p: Passenger) =>
    isBoarded(p)
      ? Alert.alert(`Faire descendre ${p.name} ?`, 'À faire seulement si la personne a été scannée par erreur.', [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Faire descendre', style: 'destructive', onPress: () => m.unboard(p).catch(fail('Action impossible')) },
        ])
      : // Manual check for a phone that won't show its QR (battery, broken screen).
        Alert.alert(`Faire monter ${p.name} sans scanner ?`, p.companionOf ? `Accompagnant de ${p.companionOf} : vérifie son nom sur sa pièce d’identité.` : 'Vérifie son nom sur sa carte étudiant.', [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Faire monter', onPress: () => m.board(p).catch(fail('Action impossible')) },
        ]);

  const share = () => Share.share({ message: manifestText(c, passengers) });

  // "Récupérer l’argent": the paid seats (and late-cancellation fees) go to the organization's number.
  const claim = () => {
    if (!c.claim) return;
    const send = (method: PaymentMethod) =>
      m.claim(method).then(
        (p) => p && Alert.alert('Versement demandé', `${formatFcfa(p.amount)} sur le ${methodLabel[method]} de l’organisation (${p.phoneMasked}).`),
        fail('Versement impossible'),
      );
    Alert.alert(`Récupérer ${formatFcfa(c.claim.amount)}`, 'Les places payées de ce départ, sur le numéro de l’organisation. Une seule fois par départ.', [
      { text: 'Annuler', style: 'cancel' },
      { text: methodLabel.wave, onPress: () => send('wave') },
      { text: methodLabel.orange_money, onPress: () => send('orange_money') },
    ]);
  };
  const payoutStatus: Record<string, string> = { requested: 'demandé', processing: 'en cours', succeeded: 'versé', failed: 'nouvel essai en cours', manual_required: 'traité par l’équipe' };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Header onBack={back} onShare={share} />

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={false} onRefresh={m.refresh} />}>
        {(m.offline || m.pending > 0) && (
          <View style={styles.offline} accessibilityLiveRegion="polite">
            <Ionicons name={m.offline ? 'cloud-offline-outline' : 'cloud-upload-outline'} size={18} color={colors.warningText} />
            <Text style={styles.offlineText}>
              {m.offline ? 'Hors ligne · liste gardée sur le téléphone, le scan continue de marcher.' : 'Réseau revenu · envoi des scans…'}
              {m.pending > 0 ? ` ${m.pending} scan${m.pending > 1 ? 's' : ''} en attente d’envoi.` : ''}
            </Text>
          </View>
        )}
        <View style={[styles.card, shadow.card, { gap: 12 }]}>
          <View>
            <Text style={styles.route}>
              {c.from} → {c.to}
            </Text>
            <Text style={styles.muted}>
              {c.date} · {c.time} · {c.vehicle.label} {c.plate}
            </Text>
            {buyers < passengers.length && (
              <Text style={styles.muted}>
                {passengers.length} passagers · {buyers} acheteurs (certains ont réservé pour un accompagnant)
              </Text>
            )}
          </View>
          <View style={styles.stats}>
            <Stat value={passengers.length} label="réservés" />
            <Stat value={boarded} label="à bord" tone={colors.successText} />
            <Stat value={absents} label={absents > 1 ? 'absents' : 'absent'} tone={absents ? colors.dangerText : undefined} />
          </View>
          {current && (
            <View style={styles.next}>
              <Ionicons name="location-outline" size={16} color={colors.primary} />
              <Text style={styles.nextText} numberOfLines={2}>
                Prochain arrêt : <Text style={{ fontWeight: '700' }}>{current.place}</Text> · {current.time} ·{' '}
                {passengers.filter((p) => p.pickupStopId === current.stopId && !isBoarded(p)).length} à faire monter
              </Text>
            </View>
          )}
        </View>

        {c.claim && (
          <View style={[styles.card, shadow.card, styles.claim]}>
            <Ionicons name={c.claim.payout ? 'checkmark-circle' : 'wallet-outline'} size={22} color={c.claim.payout ? colors.success : colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.claimTitle}>
                {c.claim.payout ? `${formatFcfa(c.claim.payout.amount)} · ${payoutStatus[c.claim.payout.status] ?? c.claim.payout.status}` : `${formatFcfa(c.claim.amount)} à récupérer`}
              </Text>
              <Text style={styles.muted}>
                {c.claim.payout ? 'Versement sur le numéro de l’organisation.' : isOwner ? 'Le bus est parti : récupère l’argent des places pour payer le trajet.' : 'Le responsable de l’organisation récupère l’argent.'}
              </Text>
            </View>
            {!c.claim.payout && isOwner && c.claim.amount > 0 && (
              <Pressable style={styles.claimBtn} onPress={claim} accessibilityRole="button">
                <Text style={styles.claimBtnText}>Récupérer</Text>
              </Pressable>
            )}
          </View>
        )}

        <Segmented
          options={[
            { value: 'pickups', label: `Montées · ${c.pickups.length}` },
            { value: 'dropoffs', label: `Descentes · ${c.dropoffs.length}` },
          ]}
          value={view}
          onChange={setView}
        />

        {view === 'pickups'
          ? c.pickups.map((stop) => {
              const list = passengers.filter((p) => p.pickupStopId === stop.stopId);
              const done = left.includes(stop.stopId);
              const on = list.filter(isBoarded).length;
              return (
                <View key={stop.stopId} style={[styles.card, shadow.card, styles.stop, stop === current && styles.stopCurrent]}>
                  <StopHead
                    stop={stop}
                    count={list.length ? `${on}/${list.length} à bord` : 'Personne'}
                    badge={done ? 'Parti' : stop === current ? 'Ici' : undefined}
                  />
                  {list.length === 0 && <Text style={styles.muted}>Aucun passager ne monte ici : tu peux ne pas t’arrêter.</Text>}
                  {groupedRows(list).map(({ p, header }) => (
                    <View key={p.ticketId}>
                      {header && <GroupHead name={header.name} size={header.size} />}
                      <PassengerRow
                        p={p}
                        grouped={(p.groupSize ?? 1) > 1}
                        detail={[
                          p.companionOf ? `Accompagnant de ${p.companionOf}` : '',
                          `Descend à ${stopOf(c.dropoffs, p.dropoffStopId)?.place ?? '?'}`,
                          p.transferred && !p.companionOf ? 'billet transféré' : '',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                        status={isBoarded(p) ? 'boarded' : isAbsent(p) ? 'absent' : 'waiting'}
                        onToggle={() => toggle(p)}
                      />
                    </View>
                  ))}
                  {!done && stop === current && (
                    <Pressable style={styles.leave} onPress={() => leave(stop)} accessibilityRole="button">
                      <Ionicons name="bus-outline" size={16} color={colors.primary} />
                      <Text style={styles.leaveText}>Le bus repart de cet arrêt</Text>
                    </Pressable>
                  )}
                </View>
              );
            })
          : c.dropoffs.map((stop) => {
              const list = passengers.filter((p) => p.dropoffStopId === stop.stopId);
              return (
                <View key={stop.stopId} style={[styles.card, shadow.card, styles.stop]}>
                  <StopHead stop={stop} estimated count={list.length ? `${list.length} descente${list.length > 1 ? 's' : ''}` : 'Personne'} />
                  {list.length === 0 && <Text style={styles.muted}>Aucune descente : arrêt facultatif.</Text>}
                  {groupedRows(list).map(({ p }) => (
                    <PassengerRow
                      key={p.ticketId}
                      p={p}
                      grouped={(p.groupSize ?? 1) > 1}
                      detail={`${p.companionOf ? `Accompagnant de ${p.companionOf} · ` : ''}Monté(e) à ${stopOf(c.pickups, p.pickupStopId)?.place ?? '?'}`}
                      status={isBoarded(p) ? 'boarded' : isAbsent(p) ? 'absent' : 'waiting'}
                    />
                  ))}
                </View>
              );
            })}
      </ScrollView>

      <ScanBar onPress={() => setScanning(true)} />
      <ScannerModal
        visible={scanning}
        onClose={() => {
          setScanning(false);
          m.refresh();
        }}
        check={check}
      />
    </SafeAreaView>
  );
}

/**
 * A stop's passengers with each buyer's seats together, in seat order of the buyer's first seat. The first row of a
 * group of 2+ carries the header ("Moussa Diop · 2 billets").
 */
function groupedRows(list: Passenger[]) {
  const key = (p: Passenger) => p.purchaser?.id ?? p.ticketId;
  const first = new Map<string, number>();
  for (const p of list) first.set(key(p), Math.min(first.get(key(p)) ?? Infinity, p.seat ?? 0));
  const sorted = [...list].sort((a, b) => first.get(key(a))! - first.get(key(b))! || key(a).localeCompare(key(b)) || Number(!!a.companionOf) - Number(!!b.companionOf) || (a.seat ?? 0) - (b.seat ?? 0));
  return sorted.map((p, i) => ({
    p,
    header: (p.groupSize ?? 1) > 1 && (i === 0 || key(sorted[i - 1]!) !== key(p)) ? { name: p.purchaser.name, size: p.groupSize } : null,
  }));
}

function GroupHead({ name, size }: { name: string; size: number }) {
  return (
    <View style={styles.groupHead}>
      <Ionicons name="people-outline" size={14} color={colors.primary} />
      <Text style={styles.groupHeadText} numberOfLines={1}>
        {name} · {size} billets
      </Text>
    </View>
  );
}

/** Plain text for WhatsApp: the driver or a co-organizer keeps the list offline. */
function manifestText(c: OrgCaravan, passengers: Passenger[]) {
  const lines = [
    `${c.organizer.name} · ${c.from} → ${c.to}`,
    `${c.date} · ${c.time} · ${c.plate} · ${passengers.length} passagers`,
    '',
    'MONTÉES',
  ];
  for (const s of c.pickups) {
    const list = passengers.filter((p) => p.pickupStopId === s.stopId);
    lines.push(`${s.time} · ${s.place} (${list.length})`);
    for (const p of list) {
      const via = p.companionOf ? ` (accompagnant de ${p.companionOf})` : '';
      lines.push(`  ${p.seat}. ${p.name}${via} → ${c.dropoffs.find((d) => d.stopId === p.dropoffStopId)?.place ?? '?'} · ${p.phone}`);
    }
  }
  lines.push('', 'DESCENTES');
  for (const s of c.dropoffs) {
    const list = passengers.filter((p) => p.dropoffStopId === s.stopId);
    lines.push(`~${s.time} · ${s.place} (${list.length})${list.length ? ` : places ${list.map((p) => p.seat).join(', ')}` : ''}`);
  }
  return lines.join('\n');
}

function Header({ onBack, onShare }: { onBack: () => void; onShare?: () => void }) {
  return (
    <View style={styles.head}>
      <BackButton onPress={onBack} />
      <Text style={styles.h1}>Liste des passagers</Text>
      {onShare ? (
        <Pressable onPress={onShare} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Partager la liste">
          <Ionicons name="share-outline" size={20} color={colors.navy} />
        </Pressable>
      ) : (
        <View style={{ width: 44 }} />
      )}
    </View>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, tone ? { color: tone } : null]}>{value}</Text>
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

function StopHead({ stop, count, badge, estimated }: { stop: CaravanStop; count: string; badge?: string; estimated?: boolean }) {
  return (
    <View style={styles.stopHead}>
      <Text style={styles.stopTime}>
        {estimated ? '~' : ''}
        {stop.time}
      </Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.stopPlace}>{stop.place}</Text>
        <Text style={styles.muted}>{count}</Text>
      </View>
      {badge && (
        <View style={[styles.badge, badge === 'Parti' && { backgroundColor: colors.border }]}>
          <Text style={[styles.badgeText, badge === 'Parti' && { color: colors.muted2 }]}>{badge}</Text>
        </View>
      )}
    </View>
  );
}

const STATUS = {
  boarded: { icon: 'checkmark-circle', color: colors.success, label: 'à bord' },
  absent: { icon: 'close-circle', color: colors.danger, label: 'absent' },
  waiting: { icon: 'ellipse-outline', color: colors.muted, label: 'attendu' },
} as const;

function PassengerRow({
  p,
  detail,
  status,
  grouped,
  onToggle,
}: {
  p: Passenger;
  detail: string;
  status: keyof typeof STATUS;
  /** One of several seats bought by the same student: drawn under their group header. */
  grouped?: boolean;
  onToggle?: () => void;
}) {
  const s = STATUS[status];
  return (
    <View style={[styles.passenger, grouped && styles.passengerGrouped]}>
      <Pressable
        style={styles.passengerMain}
        onPress={onToggle}
        disabled={!onToggle}
        accessibilityRole={onToggle ? 'button' : undefined}
        accessibilityLabel={`Place ${p.seat}, ${p.name}, ${s.label}`}>
        <Ionicons name={s.icon} size={22} color={s.color} />
        <View style={styles.seat}>
          <Text style={styles.seatText}>{p.seat}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, status === 'absent' && { color: colors.dangerText }]} numberOfLines={1}>
            {p.name}
          </Text>
          <Text style={styles.muted} numberOfLines={1}>
            {detail}
          </Text>
        </View>
      </Pressable>
      {!!p.phone && status !== 'boarded' && (
        <Pressable
          style={styles.call}
          onPress={() => Linking.openURL(`tel:${p.phone.replace(/\s/g, '')}`)}
          accessibilityRole="button"
          accessibilityLabel={`Appeler ${p.name}`}>
          <Ionicons name="call-outline" size={18} color={colors.primary} />
        </Pressable>
      )}
    </View>
  );
}

function ScanBar({ onPress }: { onPress: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.scanBar, { paddingBottom: 12 + insets.bottom }]}>
      <Pressable style={styles.scanBtn} onPress={onPress} accessibilityRole="button">
        <Ionicons name="qr-code-outline" size={20} color="#fff" />
        <Text style={styles.scanText}>Scanner un billet</Text>
      </Pressable>
    </View>
  );
}

function ScannerModal({ visible, onClose, check }: { visible: boolean; onClose: () => void; check: ReturnType<typeof useTicketCheck> }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.scanSafe}>
        <View style={styles.head}>
          <Pressable onPress={onClose} style={styles.iconBtnDark} accessibilityRole="button" accessibilityLabel="Fermer">
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>
          <Text style={[styles.h1, { color: '#fff' }]}>Embarquement</Text>
          <View style={{ width: 44 }} />
        </View>
        <ScrollView contentContainerStyle={styles.scanBody} keyboardShouldPersistTaps="handled">
          <TicketScanner check={check} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  offline: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radii.md, backgroundColor: colors.warningBg },
  offlineText: { ...typo.small, flex: 1, color: colors.warningText },
  claim: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 6, paddingBottom: 2 },
  groupHeadText: { ...typo.label, color: colors.primary, flex: 1 },
  passengerGrouped: { borderLeftWidth: 2, borderLeftColor: colors.primarySoft, paddingLeft: 8 },
  claimTitle: { ...typo.title, color: colors.navy },
  claimBtn: { paddingHorizontal: 14, minHeight: 40, borderRadius: radii.pill, backgroundColor: colors.primary, justifyContent: 'center' },
  claimBtnText: { ...typo.smallStrong, color: '#fff' },
  safe: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 },
  h1: { ...typo.h3, color: colors.navy },
  iconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  iconBtnDark: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  body: { padding: 20, gap: 12, paddingBottom: 120 },
  card: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 14 },
  route: { ...typo.h3, color: colors.navy },
  muted: { ...typo.caption, color: colors.muted2, marginTop: 1 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, backgroundColor: colors.bg, borderRadius: radii.sm, paddingVertical: 10, alignItems: 'center' },
  statValue: { ...typo.h2, color: colors.navy },
  next: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primarySoft, borderRadius: radii.sm, padding: 10 },
  nextText: { ...typo.small, flex: 1, color: colors.primary },
  stop: { gap: 4 },
  stopCurrent: { borderWidth: 1.5, borderColor: colors.primary },
  stopHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  stopTime: { ...typo.bodyStrong, color: colors.primary, minWidth: 48, fontVariant: ['tabular-nums'] },
  stopPlace: { ...typo.bodyStrong, color: colors.navy },
  badge: { backgroundColor: colors.primary, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { ...typo.label, color: '#fff' },
  passenger: { flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  passengerMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52 },
  seat: { width: 32, height: 32, borderRadius: radii.xs, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  seatText: { ...typo.smallStrong, color: colors.primary },
  name: { ...typo.bodyStrong, color: colors.text },
  call: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  leave: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    marginTop: 6,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  leaveText: { ...typo.bodyStrong, color: colors.primary },
  scanBar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12, backgroundColor: colors.bg },
  scanBtn: {
    flexDirection: 'row',
    gap: 8,
    alignSelf: 'stretch',
    backgroundColor: colors.accent,
    minHeight: 52,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanText: { ...typo.title, color: '#fff' },
  scanSafe: { flex: 1, backgroundColor: colors.navy },
  scanBody: { padding: 20, gap: 16 },
});
