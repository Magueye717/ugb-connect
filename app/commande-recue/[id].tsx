import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton, Chip, Field, PrimaryButton, SafeBottom, SheetHeader, StatusChip } from '@/components/ui';
import { formatFcfa } from '@/constants/data';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { commerceApi, nextStep, ORDER_STATUS_LABEL, type OrderDto } from '@/features/commerce/api';
import { ApiError } from '@/lib/api';

const fail = (title: string) => (err: unknown) => Alert.alert(title, err instanceof ApiError ? err.message : 'Réessaie dans un instant.');
const REFUSALS = ['Plus de stock', 'Fermé pour le moment', 'Trop de commandes', 'Adresse hors zone de livraison'];
const STEP_LABEL: Record<string, string> = { placed: 'Payée et reçue', accepted: 'Acceptée', ready: 'Prête / en route', completed: 'Terminée', refused: 'Refusée', cancelled: 'Annulée par le client' };

/** One order received: what, for whom, where; the next step, or a refusal with its reason (the student is refunded). */
export default function CommandeRecue() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { business } = useAuth();
  const [o, setO] = useState<OrderDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [refusing, setRefusing] = useState(false);
  const [reason, setReason] = useState('');

  useFocusEffect(
    useCallback(() => {
      if (business && id) commerceApi.businessOrder(business, id).then(setO, fail('Commande introuvable'));
    }, [business, id]),
  );

  const back = () => (router.canGoBack() ? router.back() : router.replace('/commandes'));
  if (!o || !business) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.head}>
          <BackButton onPress={back} />
        </View>
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  const s = ORDER_STATUS_LABEL[o.status];
  const next = nextStep(o);
  const run = async (action: () => Promise<OrderDto>) => {
    setBusy(true);
    try {
      setO(await action());
    } catch (err) {
      fail('Action impossible')(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.head}>
        <BackButton onPress={back} />
        <Text style={styles.h1}>Commande {o.code}</Text>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.row}>
          <StatusChip label={s.label} tone={s.tone} />
          <Text style={styles.muted}>{new Date(o.createdAt).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
        </View>

        <View style={[styles.card, shadow.card]}>
          {o.lines.map((l) => (
            <View key={l.itemId} style={styles.line}>
              <Text style={styles.qty}>{l.qty} ×</Text>
              <Text style={[styles.lineName, { flex: 1 }]}>{l.name}</Text>
              <Text style={styles.linePrice}>{formatFcfa(l.qty * l.price)}</Text>
            </View>
          ))}
          <View style={styles.divider} />
          {o.deliveryFee > 0 && (
            <View style={styles.line}>
              <Text style={[styles.muted, { flex: 1 }]}>Livraison</Text>
              <Text style={styles.linePrice}>{formatFcfa(o.deliveryFee)}</Text>
            </View>
          )}
          <View style={styles.line}>
            <Text style={[styles.total, { flex: 1 }]}>{o.method === 'cash' ? 'À encaisser en espèces' : `Total payé · ${o.methodLabel}`}</Text>
            <Text style={styles.total}>{formatFcfa(o.total)}</Text>
          </View>
          {o.note && <Text style={styles.note}>Note du client : « {o.note} »</Text>}
        </View>

        <View style={[styles.card, shadow.card]}>
          <Info icon={o.mode === 'delivery' ? 'bicycle-outline' : 'walk-outline'} label={o.mode === 'delivery' ? 'À livrer' : 'À emporter'} value={o.mode === 'delivery' ? [o.zoneLabel, o.address].filter(Boolean).join(' · ') : `Le client donne le code ${o.code}`} />
          {o.customer && (
            <Pressable style={styles.call} onPress={() => Linking.openURL(`tel:+221${o.customer!.phone.replace(/\s/g, '')}`)} accessibilityRole="button" accessibilityLabel={`Appeler ${o.customer.name}`}>
              <Info icon="person-outline" label={o.customer.name} value={o.customer.phone} />
              <View style={styles.callBtn}>
                <Ionicons name="call" size={16} color="#fff" />
              </View>
            </Pressable>
          )}
        </View>

        <View style={[styles.card, shadow.card, { gap: 6 }]}>
          {o.history
            .filter((h) => h.status !== 'pending_payment')
            .map((h, i) => (
              <Text key={i} style={styles.muted}>
                {new Date(h.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · {STEP_LABEL[h.status] ?? h.status}
              </Text>
            ))}
          {o.refusal && <Text style={[styles.muted, { color: colors.dangerText }]}>Motif : {o.refusal}</Text>}
        </View>

        {next && <PrimaryButton label={next.label} loading={busy} disabled={busy} onPress={() => run(() => commerceApi.step(business, o.id, next.step))} />}
        {o.status === 'placed' && (
          <Pressable onPress={() => setRefusing(true)} style={styles.refuse} accessibilityRole="button">
            <Ionicons name="close-circle-outline" size={18} color={colors.dangerText} />
            <Text style={styles.refuseText}>Refuser la commande</Text>
          </Pressable>
        )}
      </ScrollView>

      <Modal visible={refusing} transparent animationType="slide" onRequestClose={() => setRefusing(false)}>
        <Pressable style={styles.backdrop} onPress={() => setRefusing(false)} />
        <KeyboardAvoidingView behavior="padding" style={{ flexShrink: 1 }}>
          <View style={styles.sheet}>
            <SheetHeader onClose={() => setRefusing(false)} titleStyle={styles.sheetTitle}>Refuser la commande {o.code}</SheetHeader>
            <Text style={styles.muted}>{o.method === 'cash' ? 'Le client reçoit ton motif (rien n’a été payé).' : `Le client est remboursé (${formatFcfa(o.total)}) et reçoit ton motif.`}</Text>
            <View style={styles.chips}>
              {REFUSALS.map((r) => (
                <Chip key={r} label={r} selected={reason === r} onPress={() => setReason(r)} />
              ))}
            </View>
            <Field placeholder="Ou écris le motif" value={reason} onChangeText={setReason} maxLength={200} />
            <PrimaryButton
              label="Refuser et rembourser"
              disabled={reason.trim().length < 3 || busy}
              loading={busy}
              onPress={() =>
                run(async () => {
                  const r = await commerceApi.refuse(business, o.id, reason.trim());
                  setRefusing(false);
                  return r;
                })
              }
            />
            <SafeBottom />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function Info({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={[styles.row, { flex: 1 }]}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={16} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.lineName}>{label}</Text>
        <Text style={styles.muted}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 },
  h1: { ...typo.h3, color: colors.navy },
  body: { padding: 20, gap: 12, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  card: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 14, gap: 10 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qty: { ...typo.bodyStrong, color: colors.primary, minWidth: 30 },
  lineName: { ...typo.bodyStrong, color: colors.navy },
  linePrice: { ...typo.body, color: colors.text },
  total: { ...typo.title, color: colors.navy },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  note: { ...typo.small, color: colors.warningText, fontStyle: 'italic' },
  muted: { ...typo.caption, color: colors.muted2 },
  infoIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  call: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  callBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' },
  refuse: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44 },
  refuseText: { ...typo.bodyStrong, color: colors.dangerText },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,27,76,0.35)' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: 20, paddingBottom: 36, gap: 12 },
  sheetTitle: { ...typo.h3, color: colors.navy },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, minHeight: 36, borderRadius: radii.pill, backgroundColor: colors.bg, justifyContent: 'center' },
});
