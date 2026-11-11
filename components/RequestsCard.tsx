import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Field } from '@/components/ui';
import { formatFcfa } from '@/constants/data';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { ApiError } from '@/lib/api';
import { haptics } from '@/lib/haptics';
import { noticeValidated } from '@/features/payments/validated';
import { confirmAction, notice } from '@/lib/notice';
import { toast } from '@/lib/toast';

/** One request, as the organizer sees it. */
export type RequestRow = {
  id: string;
  name: string;
  phone: string | null;
  /** « 2 × Standard », « Place 7 · UGB → Dakar »… */
  lines: string[];
  total: number;
  expiresAt: string;
  /** Each ticket (or seat) waiting: validated one by one when only some are paid. */
  units?: { id: string; label: string; price: number }[];
};

type Props = {
  title?: string;
  load: () => Promise<RequestRow[]>;
  /** `unitIds`: only those tickets (paid one by one); all waiting otherwise. */
  validate: (id: string, unitIds?: string[]) => Promise<unknown>;
  refuse: (id: string, reason: string | null) => Promise<unknown>;
  /** After a validation or a refusal (counts, seats…). */
  onChanged?: () => void;
  /** Tickets of an event, or seats of a caravan: how the « Paiement validé » card speaks. */
  kind?: 'event' | 'caravan';
};

const left = (iso: string) => {
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return 'expirée';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
};

/**
 * « Demandes à valider »: students hold places and come to pay in cash; once the money is in hand, « Valider » issues
 * their tickets (valid and scannable). Not validated within 24 h: cancelled on its own. A search by name or phone,
 * for when the student is standing there.
 */
export function RequestsCard({ title = 'Demandes à valider', load, validate, refuse, onChanged, kind = 'event' }: Props) {
  const [items, setItems] = useState<RequestRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const reload = useCallback(() => {
    load().then(
      (list) => {
        setItems(list);
        setFailed(false);
      },
      () => setFailed(true),
    );
  }, [load]);
  useFocusEffect(reload);

  /** `done`: a short toast, or what to show once it worked (the « Paiement validé » card). */
  const run = async (id: string, job: () => Promise<unknown>, done: string | (() => void)) => {
    setBusy(id);
    try {
      await job();
      haptics.success();
      if (typeof done === 'string') toast(done);
      else done();
      reload();
      onChanged?.();
    } catch (err) {
      Alert.alert('Action impossible', err instanceof ApiError ? err.message : 'Réessaie dans un instant.');
      reload();
    } finally {
      setBusy(null);
    }
  };
  const onValidate = (r: RequestRow) => {
    const units = r.units ?? [];
    // Several tickets: all paid, or only one of them (the others keep waiting until the deadline).
    if (units.length > 1)
      return notice({
        tone: 'info',
        title: `Qu’a payé ${r.name} ?`,
        message: 'Les billets payés deviennent valables et scannables ; les autres restent en demande. À faire une fois l’argent en main.',
        choices: [
          { label: `Tout · ${formatFcfa(r.total)}`, tone: 'primary', onPress: () => run(r.id, () => validate(r.id), () => noticeValidated({ name: r.name, kind, amount: r.total, validated: units.map((u) => u.label) })) },
          ...units.slice(0, 4).map((u) => ({
            label: `${u.label} · ${formatFcfa(u.price)}`,
            tone: 'primary' as const,
            onPress: () => run(r.id, () => validate(r.id, [u.id]), () => noticeValidated({ name: r.name, kind, amount: u.price, validated: [u.label], left: units.length - 1 })),
          })),
          { label: 'Pas encore', tone: 'quiet' },
        ],
      });
    notice({
      tone: 'info',
      title: `${formatFcfa(r.total)} reçus de ${r.name} ?`,
      message: 'Ses billets deviennent valables et scannables. À faire seulement une fois l’argent en main.',
      choices: [
        { label: 'Oui, valider', tone: 'primary', onPress: () => run(r.id, () => validate(r.id), () => noticeValidated({ name: r.name, kind, amount: r.total, validated: units.length ? units.map((u) => u.label) : r.lines })) },
        { label: 'Pas encore', tone: 'quiet' },
      ],
    });
  };
  const onRefuse = (r: RequestRow) =>
    confirmAction({
      title: `Refuser la demande de ${r.name} ?`,
      message: 'Les places repartent en vente. L’étudiant est prévenu : « Paiement non reçu ».',
      confirm: 'Refuser',
      keep: 'Garder',
      onConfirm: () => run(r.id, () => refuse(r.id, 'Paiement non reçu.'), 'Demande refusée.'),
    });

  const q = query.trim().toLowerCase().replace(/\s/g, '');
  const shown = (items ?? []).filter((r) => !q || r.name.toLowerCase().replace(/\s/g, '').includes(q) || (r.phone ?? '').replace(/\D/g, '').includes(q.replace(/\D/g, '') || '§'));

  return (
    <View style={[styles.card, shadow.card]}>
      <View style={styles.head}>
        <Ionicons name="hourglass-outline" size={18} color={colors.primary} />
        <Text style={styles.title}>{title}</Text>
        {!!items?.length && (
          <View style={styles.count}>
            <Text style={styles.countText}>{items.length}</Text>
          </View>
        )}
      </View>
      <Text style={styles.muted}>Les étudiants viennent te payer en espèces. Valide dès que tu as l’argent : sans validation, la demande est annulée au bout de 24 h.</Text>
      {items === null && !failed && <ActivityIndicator color={colors.primary} />}
      {failed && (
        <Pressable onPress={reload} accessibilityRole="button">
          <Text style={styles.retry}>Chargement impossible · Réessayer</Text>
        </Pressable>
      )}
      {items?.length === 0 && <Text style={styles.empty}>Aucune demande en attente.</Text>}
      {(items?.length ?? 0) > 3 && <Field icon="search-outline" placeholder="Nom ou numéro" value={query} onChangeText={setQuery} autoCorrect={false} />}
      {shown.map((r) => (
        <View key={r.id} style={styles.row}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.name} numberOfLines={1}>
              {r.name}
            </Text>
            {r.lines.map((l, i) => (
              <Text key={i} style={styles.muted} numberOfLines={1}>
                {l}
              </Text>
            ))}
            <View style={styles.meta}>
              <Text style={styles.total}>{formatFcfa(r.total)}</Text>
              <Text style={styles.muted}> · expire dans {left(r.expiresAt)}</Text>
              {!!r.phone && (
                <Pressable onPress={() => Linking.openURL(`tel:${r.phone!.replace(/\s/g, '')}`)} hitSlop={8} accessibilityLabel={`Appeler ${r.name}`}>
                  <Ionicons name="call-outline" size={15} color={colors.primary} style={{ marginLeft: 8 }} />
                </Pressable>
              )}
            </View>
          </View>
          {busy === r.id ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <View style={{ gap: 6 }}>
              <Pressable style={styles.ok} onPress={() => onValidate(r)} accessibilityRole="button" accessibilityLabel={`Valider la demande de ${r.name}`}>
                <Ionicons name="checkmark" size={16} color="#fff" />
                <Text style={styles.okText}>Payé</Text>
              </Pressable>
              <Pressable style={styles.no} onPress={() => onRefuse(r)} accessibilityRole="button" accessibilityLabel={`Refuser la demande de ${r.name}`}>
                <Text style={styles.noText}>Refuser</Text>
              </Pressable>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 14, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { ...typo.section, color: colors.navy, flex: 1 },
  count: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  countText: { ...typo.label, color: '#fff' },
  muted: { ...typo.caption, color: colors.muted2 },
  empty: { ...typo.small, color: colors.muted2, textAlign: 'center', paddingVertical: 6 },
  retry: { ...typo.smallStrong, color: colors.primary, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  name: { ...typo.bodyStrong, color: colors.navy },
  meta: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  total: { ...typo.smallStrong, color: colors.navy },
  ok: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, minHeight: 34, borderRadius: radii.pill, backgroundColor: colors.successText },
  okText: { ...typo.smallStrong, color: '#fff' },
  no: { alignItems: 'center', justifyContent: 'center', minHeight: 30 },
  noText: { ...typo.smallStrong, color: colors.dangerText },
});
