import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton, Field, PrimaryButton, StickyFooter, TextButton } from '@/components/ui';
import { formatFcfa } from '@/constants/data';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { caravansApi } from '@/features/caravans/api';
import { eventsApi } from '@/features/events/api';
import { noticeValidated } from '@/features/payments/validated';
import { ApiError } from '@/lib/api';
import { haptics } from '@/lib/haptics';
import { confirmAction } from '@/lib/notice';
import { toast } from '@/lib/toast';

/** One ticket (or seat) of the request still waiting: ticked when it's the one paid. */
type Unit = { id: string; label: string; sub: string | null; price: number };
/** A request found by its code: an event's tickets or a caravan's seats, with who asked and how much. */
type Found = { kind: 'event' | 'caravan'; id: string; title: string; name: string; phone: string | null; lines: string[]; total: number; expiresAt: string; units: Unit[] };

const clean = (raw: string) => raw.trim().toUpperCase().replace(/^UGBREQ:/, '').replace(/\s/g, '');

/**
 * « Valider un paiement »: the student pays in cash and shows their request's QR code (or says its code). Scanned or
 * typed, the request shows (who, what, how much); « Payé » issues the tickets (valid and scannable).
 * `org`: a student's own events (from « Mes événements »); the organizer space's organization otherwise.
 */
export default function ValiderPaiement() {
  const params = useLocalSearchParams<{ code?: string; org?: string }>();
  const { organizer } = useAuth();
  const orgId = params.org ?? organizer?.orgId;
  const [permission, requestPermission] = useCameraPermissions();
  const [code, setCode] = useState(params.code ? clean(params.code) : '');
  const [found, setFound] = useState<Found | null>(null);
  const [looking, setLooking] = useState(false);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  // The tickets being paid: the one whose own code was scanned, or all of them (the request's code).
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const show = (f: Found, matched: string | null | undefined) => {
    setFound(f);
    setPicked(new Set(matched && f.units.some((u) => u.id === matched) ? [matched] : f.units.map((u) => u.id)));
  };
  const back = () => (router.canGoBack() ? router.back() : router.replace(params.org ? '/mes-evenements' : '/scanner'));

  const lookup = useCallback(
    async (raw: string) => {
      const c = clean(raw);
      if (!orgId || c.length < 4) return;
      setLooking(true);
      setMissing(false);
      setFound(null);
      try {
        const [ev, car] = await Promise.all([eventsApi.requestByCode(orgId, c).catch(() => ({ request: null })), caravansApi.requestByCode(orgId, c).catch(() => ({ request: null }))]);
        if (ev.request) {
          const r = ev.request;
          show(
            {
              kind: 'event', id: r.id, title: r.title, name: r.student?.name ?? 'Étudiant', phone: r.student?.phone ?? null, total: r.total, expiresAt: r.expiresAt,
              lines: [r.tickets.map((x) => `${x.qty} × ${x.name}`).join(' · ')],
              units: (r.units ?? []).map((u, i) => ({ id: u.id, label: `Billet ${i + 1} · ${u.name}`, sub: null, price: u.price })),
            },
            r.matched,
          );
        } else if (car.request) {
          const r = car.request;
          show(
            {
              kind: 'caravan', id: r.id, title: r.title, name: r.student?.name ?? 'Étudiant', phone: r.student?.phone ?? null, total: r.total, expiresAt: r.expiresAt,
              lines: r.seats.map((x) => `Place ${x.seat}${x.passenger ? ` · ${x.passenger}` : ''} · ${x.pickup} → ${x.dropoff}`),
              units: r.seats.flatMap((x) => (x.id ? [{ id: x.id, label: `Place ${x.seat} · ${x.passenger ?? r.student?.name ?? 'Étudiant'}`, sub: `${x.pickup} → ${x.dropoff}`, price: x.price ?? r.total / r.seats.length }] : [])),
            },
            r.matched,
          );
        } else {
          setMissing(true);
          haptics.warning();
        }
      } finally {
        setLooking(false);
      }
    },
    [orgId],
  );
  // Opened from the scanner with a code: looked up at once.
  useEffect(() => {
    if (!params.code) return;
    const t = setTimeout(() => lookup(params.code!), 0);
    return () => clearTimeout(t);
  }, [params.code, lookup]);

  const reset = () => {
    setFound(null);
    setCode('');
    setMissing(false);
  };
  // Units known (one ticket's code each): only the ticked ones; all of them otherwise.
  const several = (found?.units.length ?? 0) > 1;
  const chosen = found?.units.filter((u) => picked.has(u.id)) ?? [];
  const all = !several || chosen.length === found?.units.length;
  const amount = several ? chosen.reduce((n, u) => n + u.price, 0) : (found?.total ?? 0);
  const toggle = (id: string) => setPicked((p) => (p.has(id) ? new Set([...p].filter((x) => x !== id)) : new Set([...p, id])));
  const validate = async () => {
    if (!found || !orgId || (several && !chosen.length)) return;
    setBusy(true);
    try {
      const ids = all ? undefined : chosen.map((u) => u.id);
      if (found.kind === 'event') await eventsApi.validateRequest(orgId, found.id, ids);
      else await caravansApi.validateRequest(orgId, found.id, ids);
      haptics.success();
      const left = several ? found.units.length - chosen.length : 0;
      noticeValidated({
        name: found.name,
        kind: found.kind,
        amount,
        validated: several ? chosen.map((u) => u.label) : found.units.length ? found.units.map((u) => u.label) : found.lines,
        left,
        next: { label: 'Scanner une autre demande' },
      });
      reset();
    } catch (err) {
      Alert.alert('Validation impossible', err instanceof ApiError ? err.message : 'Réessaie dans un instant.');
    } finally {
      setBusy(false);
    }
  };
  const refuse = () =>
    confirmAction({
      title: `Refuser la demande de ${found!.name} ?`,
      message: 'Les places repartent en vente. L’étudiant est prévenu : « Paiement non reçu ».',
      confirm: 'Refuser',
      keep: 'Garder',
      onConfirm: async () => {
        try {
          if (found!.kind === 'event') await eventsApi.refuseRequest(orgId!, found!.id, 'Paiement non reçu.');
          else await caravansApi.refuseRequest(orgId!, found!.id, 'Paiement non reçu.');
          toast('Demande refusée.');
          reset();
        } catch (err) {
          Alert.alert('Refus impossible', err instanceof ApiError ? err.message : 'Réessaie dans un instant.');
        }
      },
    });

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.head}>
        <BackButton onPress={back} />
        <Text style={styles.h1}>Valider un paiement</Text>
        <View style={{ width: 44 }} />
      </View>
      <KeyboardAwareScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" bottomOffset={24}>
        <Text style={styles.muted}>L’étudiant te paie en espèces et montre le QR code de sa demande. Scanne-le, ou tape son code.</Text>
        {!found && (
          <View style={styles.camera}>
            {permission?.granted ? (
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={looking ? undefined : ({ data }: BarcodeScanningResult) => /^UGBREQ:/i.test(data) && (setCode(clean(data)), lookup(data))}
              />
            ) : (
              <Pressable style={styles.permission} onPress={requestPermission} accessibilityRole="button">
                <Ionicons name="camera-outline" size={28} color="#fff" />
                <Text style={styles.permissionText}>Autoriser la caméra pour scanner</Text>
              </Pressable>
            )}
          </View>
        )}
        {!found && (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field icon="keypad-outline" placeholder="Code de la demande" autoCapitalize="characters" autoCorrect={false} value={code} onChangeText={(t) => setCode(clean(t))} maxLength={8} returnKeyType="search" onSubmitEditing={() => lookup(code)} />
            </View>
            <PrimaryButton label="Chercher" style={styles.search} disabled={code.length < 4 || looking} loading={looking} onPress={() => lookup(code)} />
          </View>
        )}
        {missing && (
          <View style={[styles.card, styles.warn]}>
            <Ionicons name="alert-circle-outline" size={20} color={colors.dangerText} />
            <Text style={[styles.muted, { flex: 1, color: colors.dangerText }]}>Aucune demande en attente avec ce code chez toi : déjà validée, expirée, annulée, ou d’un autre organisateur.</Text>
          </View>
        )}
        {looking && !found && <ActivityIndicator color={colors.primary} />}
        {found && (
          <View style={[styles.card, shadow.card, { gap: 8 }]}>
            <Text style={styles.kind}>{found.kind === 'event' ? 'Événement' : 'Caravane'} · {found.title}</Text>
            <Text style={styles.name}>{found.name}</Text>
            {!!found.phone && <Text style={styles.muted}>{found.phone}</Text>}
            {several ? (
              <>
                <View style={styles.pickHead}>
                  <Text style={styles.pickTitle}>Ce qui est payé</Text>
                  <Pressable onPress={() => setPicked(new Set(all ? [] : found.units.map((u) => u.id)))} hitSlop={8} accessibilityRole="button">
                    <Text style={styles.pickAll}>{all ? 'Tout décocher' : 'Tout cocher'}</Text>
                  </Pressable>
                </View>
                {found.units.map((u) => {
                  const on = picked.has(u.id);
                  return (
                    <Pressable key={u.id} style={[styles.unit, on && styles.unitOn]} onPress={() => toggle(u.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                      <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? colors.primary : colors.muted} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.unitLabel} numberOfLines={1}>
                          {u.label}
                        </Text>
                        {!!u.sub && (
                          <Text style={styles.muted} numberOfLines={1}>
                            {u.sub}
                          </Text>
                        )}
                      </View>
                      <Text style={styles.unitPrice}>{formatFcfa(u.price)}</Text>
                    </Pressable>
                  );
                })}
                {!all && chosen.length > 0 && <Text style={styles.muted}>Les autres restent en demande : l’étudiant peut les payer plus tard, avant l’heure limite.</Text>}
              </>
            ) : (
              found.lines.map((l, i) => (
                <Text key={i} style={styles.line}>
                  {l}
                </Text>
              ))
            )}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>À encaisser</Text>
              <Text style={styles.total}>{formatFcfa(amount)}</Text>
            </View>
            <TextButton label="Refuser la demande" tone="danger" style={{ alignSelf: 'center' }} onPress={refuse} />
            <TextButton label="Scanner une autre demande" style={{ alignSelf: 'center' }} onPress={reset} />
          </View>
        )}
      </KeyboardAwareScrollView>
      {found && (
        <StickyFooter>
          <PrimaryButton
            label={several && !chosen.length ? 'Coche ce qui est payé' : `Payé · valider ${several ? `${chosen.length} · ` : ''}${formatFcfa(amount)}`}
            loading={busy}
            disabled={busy || (several && !chosen.length)}
            onPress={validate}
          />
        </StickyFooter>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 },
  h1: { ...typo.h3, color: colors.navy },
  body: { padding: 20, gap: 14, paddingBottom: 40 },
  muted: { ...typo.small, color: colors.muted2, lineHeight: 19 },
  camera: { height: 260, borderRadius: radii.lg, overflow: 'hidden', backgroundColor: colors.navy },
  permission: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  permissionText: { ...typo.smallStrong, color: '#fff' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  // Its own width (not squeezed by the field), as tall as the field.
  search: { minWidth: 120, paddingHorizontal: 20 },
  card: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 14 },
  warn: { flexDirection: 'row', gap: 10, backgroundColor: colors.dangerBg },
  kind: { ...typo.caption, color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.4 },
  name: { ...typo.h3, color: colors.navy },
  line: { ...typo.body, color: colors.text },
  pickHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  pickTitle: { ...typo.smallStrong, color: colors.navy },
  pickAll: { ...typo.smallStrong, color: colors.primary },
  unit: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: radii.md, borderWidth: 1.5, borderColor: colors.border },
  unitOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  unitLabel: { ...typo.bodyStrong, color: colors.navy },
  unitPrice: { ...typo.smallStrong, color: colors.navy },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  totalLabel: { ...typo.bodyStrong, color: colors.navy },
  total: { ...typo.h3, color: colors.successText },
});
