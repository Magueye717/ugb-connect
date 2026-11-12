import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { Field } from '@/components/ui';
import { formatFcfa } from '@/constants/data';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { ApiError } from '@/lib/api';
import { haptics } from '@/lib/haptics';
import { noticeValidated } from '@/features/payments/validated';
import { confirmAction, notice } from '@/lib/notice';
import { toast } from '@/lib/toast';
import { useNow } from '@/lib/useNow';

/** One request, as the organizer sees it. */
export type RequestRow = {
  id: string;
  name: string;
  phone: string | null;
  /** « 2 × Standard », « Place 7 · UGB → Dakar »… */
  lines: string[];
  total: number;
  expiresAt: string;
  /** Each ticket (or seat) waiting: validated one by one when only some are paid. `sub`: its stops (a seat). */
  units?: { id: string; label: string; price: number; sub?: string; code?: string | null }[];
  /** The whole request's code (« Tout payer »), as on the student's QR. */
  code?: string | null;
  /** When it was asked: « Demandée il y a 2 h ». */
  createdAt?: string;
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

/** « il y a 5 min », « il y a 2 h », « hier ». */
const ago = (iso: string) => {
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (min < 1) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `il y a ${h} h` : 'hier';
};
const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
const intl = (phone: string) => {
  const d = phone.replace(/\D/g, '');
  return d.startsWith('221') ? d : `221${d}`;
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
  // Ticks every minute: the time left and « il y a … » stay current.
  const now = useNow();
  // The request unfolded (the first one until another is tapped; '' : all folded).
  const [opened, setOpen] = useState<string | null>(null);

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
  const openId = opened ?? shown[0]?.id ?? '';

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
      {shown.map((r) => {
        const units = r.units ?? [];
        const urgent = Date.parse(r.expiresAt) - now < 2 * 3_600_000;
        const isOpen = r.id === openId;
        const count = units.length || r.lines.length;
        return (
          <Animated.View key={r.id} layout={LinearTransition.duration(220)} style={[styles.req, isOpen && styles.reqOpen]}>
            {/* The row: who, what in a word, how long left. A tap unfolds it (and folds the others). */}
            <Pressable
              style={styles.who}
              onPress={() => {
                haptics.select();
                setOpen(isOpen ? '' : r.id);
              }}
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
              accessibilityLabel={`${r.name}, ${formatFcfa(r.total)}, expire dans ${left(r.expiresAt)}`}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials(r.name) || '?'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {r.name}
                </Text>
                <Text style={styles.summary} numberOfLines={1}>
                  {units.length ? `${count} ${kind === 'caravan' ? `place${count > 1 ? 's' : ''}` : `billet${count > 1 ? 's' : ''}`} · ` : ''}
                  {formatFcfa(r.total)}
                </Text>
                {/* The request's code in full (as on the student's QR), to match at a glance; else each ticket's own. */}
                {(r.code || units.some((u) => u.code)) && (
                  <View style={styles.summaryCodes}>
                    {(r.code ? [r.code] : units.flatMap((u) => (u.code ? [u.code] : []))).map((c) => (
                      <View key={c} style={styles.codeFull}>
                        <Ionicons name="qr-code-outline" size={12} color={colors.primary} />
                        <Text style={styles.codeChipText} selectable>
                          {c}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
              <View style={[styles.timer, urgent && styles.timerUrgent]}>
                <Ionicons name="time-outline" size={12} color={urgent ? colors.warningText : colors.primary} />
                <Text style={[styles.timerText, urgent && { color: colors.warningText }]}>{left(r.expiresAt)}</Text>
              </View>
              <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted2} />
            </Pressable>

            {isOpen && (
              <Animated.View entering={FadeIn.duration(200)} style={{ gap: 12 }}>
              {!!r.phone && (
                <View style={styles.contact}>
                  <Pressable style={styles.contactBtn} onPress={() => Linking.openURL(`tel:+${intl(r.phone!)}`)} accessibilityRole="button" accessibilityLabel={`Appeler ${r.name}`}>
                    <Ionicons name="call-outline" size={14} color={colors.primary} />
                    <Text style={styles.contactText}>Appeler</Text>
                  </Pressable>
                  <Pressable style={styles.contactBtn} onPress={() => Linking.openURL(`https://wa.me/${intl(r.phone!)}`)} accessibilityRole="button" accessibilityLabel={`Écrire à ${r.name} sur WhatsApp`}>
                    <Ionicons name="logo-whatsapp" size={14} color="#1DA851" />
                    <Text style={styles.contactText}>WhatsApp</Text>
                  </Pressable>
                </View>
              )}

              {/* What: each ticket (or seat), its own code (as on the student's QR) and its price. */}
              <View style={styles.items}>
                {!!r.code && (
                  <View style={styles.reqCode}>
                    <Text style={styles.reqCodeLabel}>{units.length > 1 ? 'Code de la demande (tout payer)' : 'Code de la demande'}</Text>
                    <Text style={styles.codeChipText} selectable>
                      {r.code}
                    </Text>
                  </View>
                )}
                {units.length
                  ? units.map((u) => (
                      <View key={u.id} style={styles.item}>
                        <Ionicons name="ticket-outline" size={16} color={colors.primary} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.itemLabel} numberOfLines={1}>
                            {u.label}
                          </Text>
                          {!!u.sub && (
                            <Text style={styles.muted} numberOfLines={1}>
                              {u.sub}
                            </Text>
                          )}
                          {!!u.code && (
                            <View style={styles.codeChip}>
                              <Ionicons name="qr-code-outline" size={11} color={colors.primary} />
                              <Text style={styles.codeChipText} selectable>
                                {u.code}
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.itemPrice}>{formatFcfa(u.price)}</Text>
                      </View>
                    ))
                  : r.lines.map((l, i) => (
                      <View key={i} style={styles.item}>
                        <Ionicons name="ticket-outline" size={16} color={colors.primary} />
                        <Text style={[styles.itemLabel, { flex: 1 }]}>{l}</Text>
                      </View>
                    ))}
              </View>

              {/* How much, and the answer. */}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>À encaisser</Text>
                <Text style={styles.total}>{formatFcfa(r.total)}</Text>
              </View>
              {busy === r.id ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <View style={styles.answer}>
                  <Pressable style={({ pressed }) => [styles.ok, pressed && { opacity: 0.85 }]} onPress={() => onValidate(r)} accessibilityRole="button" accessibilityLabel={`Valider la demande de ${r.name}`}>
                    <Ionicons name="checkmark" size={16} color="#fff" />
                    <Text style={styles.okText}>Payé · {formatFcfa(r.total)}</Text>
                  </Pressable>
                  <Pressable style={({ pressed }) => [styles.no, pressed && { backgroundColor: colors.dangerBg }]} onPress={() => onRefuse(r)} accessibilityRole="button" accessibilityLabel={`Refuser la demande de ${r.name}`}>
                    <Text style={styles.noText}>Refuser</Text>
                  </Pressable>
                </View>
              )}
              {!!r.createdAt && <Text style={[styles.muted, { textAlign: 'center' }]}>Demandée {ago(r.createdAt)}</Text>}
              </Animated.View>
            )}
          </Animated.View>
        );
      })}
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
  // One request: a card of its own (who, what, how much, the answer).
  req: { gap: 12, padding: 12, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, overflow: 'hidden' },
  reqOpen: { borderColor: colors.primary, backgroundColor: colors.card },
  summary: { ...typo.caption, color: colors.muted2, marginTop: 1 },
  // Never cut: its own line under the name, wrapping if there are several.
  summaryCodes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 5 },
  codeFull: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.sm, backgroundColor: colors.primarySoft },
  who: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { ...typo.bodyStrong, color: colors.primary },
  name: { ...typo.bodyStrong, color: colors.navy },
  timer: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: radii.pill, backgroundColor: colors.primarySoft },
  timerUrgent: { backgroundColor: colors.warningBg },
  timerText: { ...typo.captionStrong, color: colors.primary },
  contact: { flexDirection: 'row', gap: 8 },
  contactBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, minHeight: 34, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  contactText: { ...typo.captionStrong, color: colors.navy },
  items: { gap: 8, padding: 10, borderRadius: radii.sm, backgroundColor: colors.card },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemLabel: { ...typo.smallStrong, color: colors.navy },
  reqCode: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  reqCodeLabel: { ...typo.caption, color: colors.muted2, flex: 1 },
  codeChip: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: radii.sm, backgroundColor: colors.primarySoft },
  codeChipText: { ...typo.captionStrong, color: colors.primary, letterSpacing: 1.5, fontVariant: ['tabular-nums'] },
  itemPrice: { ...typo.smallStrong, color: colors.navy, fontVariant: ['tabular-nums'] },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  totalLabel: { ...typo.small, color: colors.muted2 },
  total: { ...typo.title, color: colors.navy },
  answer: { flexDirection: 'row', gap: 10 },
  ok: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, minHeight: 40, borderRadius: radii.pill, backgroundColor: colors.successText },
  okText: { ...typo.smallStrong, color: '#fff' },
  no: { alignItems: 'center', justifyContent: 'center', minHeight: 40, paddingHorizontal: 16, borderRadius: radii.pill, borderWidth: 1.5, borderColor: colors.dangerText },
  noText: { ...typo.captionStrong, color: colors.dangerText },
});
