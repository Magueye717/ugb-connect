import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/states';
import { Field, LabeledField, PrimaryButton, Segmented } from '@/components/ui';
import { formatDateTime } from '@/constants/data';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useCampus } from '@/context/CampusContext';
import { REGIONS, UFRS } from '@/features/register/validation';
import { audienceLabel, EVERYONE, staffApi, type AdminAlertDto, type AlertBody, type AlertDto, type Audience } from '@/features/restos/api';
import { ApiError } from '@/lib/api';

type Placement = AlertDto['placement'];

const TONES: { tone: AlertDto['tone']; label: string; icon: keyof typeof Ionicons.glyphMap; bg: string; fg: string }[] = [
  { tone: 'info', label: 'Info', icon: 'information-circle-outline', bg: colors.primarySoft, fg: colors.primary },
  { tone: 'success', label: 'Bonne nouvelle', icon: 'checkmark-circle-outline', bg: colors.successBg, fg: colors.successText },
  { tone: 'warning', label: 'Attention', icon: 'warning-outline', bg: colors.warningBg, fg: colors.warningText },
  { tone: 'danger', label: 'Urgent', icon: 'alert-circle-outline', bg: colors.dangerBg, fg: colors.dangerText },
];
const toneOf = (t: AlertDto['tone']) => TONES.find((x) => x.tone === t) ?? TONES[0]!;

/** "À la une" labels the teams use most, each with its icon. Any other label can be typed. */
const TAGS: { tag: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { tag: 'Élections', icon: 'megaphone-outline' },
  { tag: 'Bourses', icon: 'wallet-outline' },
  { tag: 'Examens', icon: 'school-outline' },
  { tag: 'Inscriptions', icon: 'document-text-outline' },
  { tag: 'Culture', icon: 'musical-notes-outline' },
  { tag: 'Sport', icon: 'football-outline' },
  { tag: 'Santé', icon: 'medkit-outline' },
];
const iconForTag = (tag: string | null) => TAGS.find((t) => t.tag.toLowerCase() === tag?.trim().toLowerCase())?.icon ?? 'megaphone-outline';

const STATUS: Record<AdminAlertDto['status'], { label: string; bg: string; fg: string }> = {
  live: { label: 'En ligne', bg: colors.successBg, fg: colors.successText },
  scheduled: { label: 'Programmée', bg: colors.primarySoft, fg: colors.primary },
  ended: { label: 'Terminée', bg: colors.border, fg: colors.muted2 },
  withdrawn: { label: 'Retirée', bg: colors.border, fg: colors.muted2 },
};

const DAYS = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];
const MONTHS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
/** Midnight of a day, `offset` days from today. */
const dayAt = (offset: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
};
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const dayChip = (d: Date) => {
  if (sameDay(d, dayAt(0))) return 'Aujourd’hui';
  if (sameDay(d, dayAt(1))) return 'Demain';
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};
const at = (d: Date, h: number, m = 0) => {
  const x = new Date(d);
  x.setHours(h, m, 0, 0);
  return x;
};
/** The days offered by the pickers: today and the next 4 weeks (no date picker needed), plus an edited value. */
const days = (extra?: Date | null) => {
  const list = Array.from({ length: 29 }, (_, i) => dayAt(i));
  if (extra && !list.some((d) => sameDay(d, extra))) list.unshift(at(extra, 0));
  return list;
};

/**
 * The communication space: what's on the students' home screen (the strip and "À la une"), prepared in advance or
 * online now, with its notification. The communication team handles everything; the academic team its own
 * announcements. Restaurant "ruptures" show here too and can be taken down.
 */
export default function Communication() {
  const { refresh: refreshHome } = useCampus();
  const [items, setItems] = useState<AdminAlertDto[] | null>(null);
  const [placement, setPlacement] = useState<Placement>('headline');
  const [editing, setEditing] = useState<AdminAlertDto | 'new' | null>(null);

  const load = useCallback(() => {
    staffApi.alerts().then((r) => setItems(r.items), () => setItems((x) => x ?? []));
  }, []);
  useFocusEffect(load);

  const mine = (items ?? []).filter((a) => a.placement === placement);
  const groups = [
    { title: 'En ligne', list: mine.filter((a) => a.status === 'live') },
    { title: 'Programmées', list: mine.filter((a) => a.status === 'scheduled').sort((a, b) => a.startsAt.localeCompare(b.startsAt)) },
    { title: 'Terminées', list: mine.filter((a) => a.status === 'ended' || a.status === 'withdrawn').slice(0, 10) },
  ];

  const withdraw = (a: AdminAlertDto) =>
    Alert.alert('Retirer ?', `« ${a.title} » ${a.status === 'live' ? 'disparaît de l’accueil des étudiants' : 'ne sera pas publiée'}.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Retirer',
        style: 'destructive',
        onPress: () =>
          staffApi.withdrawAlert(a.id).then(
            () => {
              load();
              refreshHome();
            },
            (err) => Alert.alert('Action impossible', err instanceof ApiError ? err.message : 'Réessaie dans un instant.'),
          ),
      },
    ]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
        <View style={styles.headRow}>
          <Text style={styles.h1}>Communication</Text>
          <Pressable style={styles.newBtn} onPress={() => setEditing('new')} accessibilityRole="button">
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.newText}>Nouvelle</Text>
          </Pressable>
        </View>
        <Segmented
          options={[
            { value: 'headline', label: 'À la une' },
            { value: 'banner', label: 'Bandeau d’alerte' },
          ]}
          value={placement}
          onChange={setPlacement}
        />
        <Text style={styles.hint}>
          {placement === 'headline'
            ? 'Annonces et actualités (élections, bourses, examens…), sous les cartes de l’accueil.'
            : 'Court et urgent, tout en haut de l’accueil (coupure d’eau, fermeture…). Les ruptures des restos s’y ajoutent seules.'}
        </Text>

        {!items && <ActivityIndicator color={colors.primary} />}
        {items && mine.length === 0 && (
          <EmptyState icon={placement === 'headline' ? 'newspaper-outline' : 'megaphone-outline'} title="Rien pour l’instant" text="Prépare une annonce maintenant, publie-la quand tu veux." />
        )}
        {groups.map(
          (g) =>
            g.list.length > 0 && (
              <View key={g.title} style={{ gap: 10 }}>
                <Text style={styles.section}>{g.title}</Text>
                {g.list.map((a) => (
                  <AlertCard key={a.id} a={a} onEdit={a.editable ? () => setEditing(a) : undefined} onWithdraw={a.withdrawable ? () => withdraw(a) : undefined} />
                ))}
              </View>
            ),
        )}
      </ScrollView>

      {editing && (
        <Composer
          key={editing === 'new' ? `new-${placement}` : editing.id}
          editing={editing === 'new' ? null : editing}
          placement={editing === 'new' ? placement : editing.placement}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setEditing(null);
            setPlacement(saved.placement);
            load();
            refreshHome();
          }}
        />
      )}
    </SafeAreaView>
  );
}

function AlertCard({ a, onEdit, onWithdraw }: { a: AdminAlertDto; onEdit?: () => void; onWithdraw?: () => void }) {
  const t = toneOf(a.tone);
  const s = STATUS[a.status];
  const open = a.status === 'live' || a.status === 'scheduled';
  const team = a.kind === 'academic' ? 'Scolarité' : a.kind === 'resto_stock' ? 'Restaurant' : 'Communication';
  const push = a.pushedAt ? 'Notification envoyée' : a.push && open ? 'Notification à la mise en ligne' : null;
  return (
    <Pressable style={[styles.card, shadow.card, !open && { opacity: 0.6 }]} onPress={onEdit} disabled={!onEdit} accessibilityRole={onEdit ? 'button' : undefined}>
      <View style={[styles.toneIcon, { backgroundColor: t.bg }]}>
        <Ionicons name={a.icon in Ionicons.glyphMap ? (a.icon as keyof typeof Ionicons.glyphMap) : t.icon} size={18} color={t.fg} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={styles.cardTop}>
          <View style={[styles.status, { backgroundColor: s.bg }]}>
            <Text style={[styles.statusText, { color: s.fg }]}>{s.label}</Text>
          </View>
          <Text style={styles.meta} numberOfLines={1}>
            {a.tag ? `${a.tag} · ` : ''}
            {team}
          </Text>
        </View>
        <View style={styles.audienceLine}>
          <Ionicons name="people-outline" size={13} color={colors.primary} />
          <Text style={styles.audienceText} numberOfLines={2}>
            {audienceLabel(a.audience)}
          </Text>
        </View>
        <Text style={styles.cardTitle}>{a.title}</Text>
        {!!a.body && <Text style={styles.cardBody}>{a.body}</Text>}
        <Text style={styles.meta}>
          {a.status === 'scheduled' ? `En ligne le ${formatDateTime(Date.parse(a.startsAt))} · ` : ''}
          {open ? `jusqu’au ${formatDateTime(Date.parse(a.endsAt))}` : a.status === 'withdrawn' ? 'Retirée' : `Terminée le ${formatDateTime(Date.parse(a.endsAt))}`}
          {a.eventAt ? ` · le ${dayChip(new Date(a.eventAt))}` : ''}
        </Text>
        {push && (
          <View style={styles.pushLine}>
            <Ionicons name="notifications-outline" size={13} color={colors.muted2} />
            <Text style={styles.meta}>{push}</Text>
          </View>
        )}
      </View>
      <View style={{ gap: 14, alignItems: 'center' }}>
        {onEdit && <Ionicons name="create-outline" size={20} color={colors.primary} />}
        {onWithdraw && (
          <Pressable onPress={onWithdraw} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Retirer ${a.title}`}>
            <Ionicons name="trash-outline" size={20} color={colors.dangerText} />
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, on && styles.chipOn]} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
      {on && <Ionicons name="checkmark" size={14} color={colors.primary} />}
      <Text style={[styles.chipText, on && { color: colors.primary }]}>{label}</Text>
    </Pressable>
  );
}

/** A row of day chips: the date pickers of the form. */
function DayPicker({ list, value, onChange, none }: { list: Date[]; value: Date | null; onChange: (d: Date | null) => void; none?: string }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {none && (
        <Pressable onPress={() => onChange(null)} style={[styles.chip, !value && styles.chipOn]} accessibilityRole="radio" accessibilityState={{ checked: !value }}>
          <Text style={[styles.chipText, !value && { color: colors.primary }]}>{none}</Text>
        </Pressable>
      )}
      {list.map((d) => {
        const on = !!value && sameDay(d, value);
        return (
          <Pressable key={d.toISOString()} onPress={() => onChange(d)} style={[styles.chip, on && styles.chipOn]} accessibilityRole="radio" accessibilityState={{ checked: on }}>
            <Text style={[styles.chipText, on && { color: colors.primary }]}>{dayChip(d)}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function Composer({ editing, placement: initial, onClose, onSaved }: { editing: AdminAlertDto | null; placement: Placement; onClose: () => void; onSaved: (a: AdminAlertDto) => void }) {
  const live = editing?.status === 'live';
  const [placement, setPlacement] = useState<Placement>(initial);
  const [tag, setTag] = useState(editing?.tag ?? '');
  const [title, setTitle] = useState(editing?.title ?? '');
  const [body, setBody] = useState(editing?.body ?? '');
  const [tone, setTone] = useState<AlertDto['tone']>(editing?.tone ?? (initial === 'headline' ? 'info' : 'warning'));
  const [eventDay, setEventDay] = useState<Date | null>(editing?.eventAt ? new Date(editing.eventAt) : null);
  // Null: now.
  const [startDay, setStartDay] = useState<Date | null>(editing && editing.status === 'scheduled' ? new Date(editing.startsAt) : null);
  const [endDay, setEndDay] = useState<Date>(editing ? new Date(editing.endsAt) : dayAt(initial === 'headline' ? 7 : 0));
  const [push, setPush] = useState(editing?.push ?? false);
  const [audience, setAudience] = useState<Audience>(editing?.audience ?? EVERYONE);
  const targeted = audience !== EVERYONE && (audience.campuses.length > 0 || audience.ufrs.length > 0 || audience.regions.length > 0);
  const [narrowing, setNarrowing] = useState(targeted);
  const toggle = (key: keyof Audience, value: string) =>
    setAudience((a) => ({ ...a, [key]: a[key].includes(value) ? a[key].filter((x) => x !== value) : [...a[key], value] }));
  const [sending, setSending] = useState(false);
  const headline = placement === 'headline';
  const ready = title.trim().length >= 3 && (!headline || tag.trim().length >= 2) && (!narrowing || targeted);

  const save = () => {
    // A scheduled announcement goes online at 8h; it stays until the end of its last day.
    const startsAt = live ? new Date(editing!.startsAt) : startDay ? at(startDay, 8) : new Date();
    const input: AlertBody = {
      placement,
      tag: headline ? tag.trim() : null,
      title: title.trim(),
      body: body.trim(),
      tone,
      icon: headline ? iconForTag(tag) : toneOf(tone).icon,
      eventAt: headline && eventDay ? at(eventDay, 8).toISOString() : null,
      audience: narrowing ? audience : EVERYONE,
      startsAt: startsAt.toISOString(),
      endsAt: at(endDay, 23, 59).toISOString(),
      push,
    };
    setSending(true);
    (editing ? staffApi.updateAlert(editing.id, input) : staffApi.postAlert(input))
      .then(onSaved, (err) => Alert.alert('Enregistrement impossible', err instanceof ApiError ? err.message : 'Réessaie dans un instant.'))
      .finally(() => setSending(false));
  };

  const willPushLater = push && !editing?.pushedAt && !!startDay && !live;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fermer" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.sheet} contentContainerStyle={{ gap: 12, paddingBottom: 36 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.sheetTitle}>{editing ? 'Modifier' : 'Nouvelle annonce'}</Text>
          {!editing && (
            <Segmented
              options={[
                { value: 'headline', label: 'À la une' },
                { value: 'banner', label: 'Bandeau d’alerte' },
              ]}
              value={placement}
              onChange={setPlacement}
            />
          )}
          {headline && (
            <>
              <LabeledField label="Étiquette">
                <Field placeholder="Élections" value={tag} onChangeText={setTag} maxLength={24} />
              </LabeledField>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {TAGS.map((t) => {
                  const on = t.tag === tag;
                  return (
                    <Pressable key={t.tag} onPress={() => setTag(t.tag)} style={[styles.chip, on && styles.chipOn]}>
                      <Ionicons name={t.icon} size={14} color={on ? colors.primary : colors.muted2} />
                      <Text style={[styles.chipText, on && { color: colors.primary }]}>{t.tag}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          )}
          <LabeledField label="Titre">
            <Field placeholder={headline ? 'Élections des délégués' : 'Coupure d’eau · Village E'} value={title} onChangeText={setTitle} maxLength={80} />
          </LabeledField>
          <LabeledField label="Détail">
            <Field placeholder={headline ? 'Vote jeudi · 8h-17h · salle polyvalente' : 'Aujourd’hui de 10h à 16h'} value={body} onChangeText={setBody} maxLength={200} />
          </LabeledField>

          <Text style={styles.label}>Type</Text>
          <View style={styles.wrap}>
            {TONES.map((t) => (
              <Pressable key={t.tone} onPress={() => setTone(t.tone)} style={[styles.chip, tone === t.tone && { backgroundColor: t.bg, borderColor: t.fg }]} accessibilityRole="radio" accessibilityState={{ checked: tone === t.tone }}>
                <Ionicons name={t.icon} size={14} color={tone === t.tone ? t.fg : colors.muted2} />
                <Text style={[styles.chipText, tone === t.tone && { color: t.fg }]}>{t.label}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Pour qui ?</Text>
          <View style={styles.wrap}>
            {[
              { on: false, label: 'Toute l’université', icon: 'globe-outline' as const },
              { on: true, label: 'Une partie', icon: 'filter-outline' as const },
            ].map((o) => (
              <Pressable key={o.label} onPress={() => setNarrowing(o.on)} style={[styles.chip, narrowing === o.on && styles.chipOn]} accessibilityRole="radio" accessibilityState={{ checked: narrowing === o.on }}>
                <Ionicons name={o.icon} size={14} color={narrowing === o.on ? colors.primary : colors.muted2} />
                <Text style={[styles.chipText, narrowing === o.on && { color: colors.primary }]}>{o.label}</Text>
              </Pressable>
            ))}
          </View>
          {narrowing && (
            <View style={styles.audienceBox}>
              <Text style={styles.small}>UFR</Text>
              <View style={styles.wrap}>
                {UFRS.map((u) => (
                  <Chip key={u.code} label={u.code} on={audience.ufrs.includes(u.code)} onPress={() => toggle('ufrs', u.code)} />
                ))}
              </View>
              <Text style={styles.small}>Campus</Text>
              <View style={styles.wrap}>
                {[
                  { key: 'campus1', label: 'Campus 1' },
                  { key: 'campus2', label: 'Campus 2' },
                ].map((c) => (
                  <Chip key={c.key} label={c.label} on={audience.campuses.includes(c.key)} onPress={() => toggle('campuses', c.key)} />
                ))}
              </View>
              <Text style={styles.small}>Région d’origine</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {REGIONS.map((r) => (
                  <Chip key={r} label={r} on={audience.regions.includes(r)} onPress={() => toggle('regions', r)} />
                ))}
              </ScrollView>
              <Text style={styles.meta}>
                {targeted ? `Visible par : ${audienceLabel(audience)}.` : 'Choisis au moins un UFR, un campus ou une région.'} Chaque choix réduit : UFR SAT + Campus 1 = les étudiants de SAT au campus 1.
              </Text>
            </View>
          )}

          {headline && (
            <>
              <Text style={styles.label}>Jour de l’événement</Text>
              <DayPicker list={days(eventDay)} value={eventDay} onChange={setEventDay} none="Aucun" />
            </>
          )}

          <Text style={styles.label}>Mise en ligne</Text>
          {live ? (
            <Text style={styles.meta}>En ligne depuis le {formatDateTime(Date.parse(editing!.startsAt))}</Text>
          ) : (
            <DayPicker list={days(startDay).filter((d) => d > dayAt(0))} value={startDay} onChange={setStartDay} none="Maintenant" />
          )}
          {!!startDay && !live && <Text style={styles.meta}>Programmée : en ligne le {dayChip(startDay)} à 8h.</Text>}

          <Text style={styles.label}>Visible jusqu’au (inclus)</Text>
          <DayPicker list={days(endDay).filter((d) => !startDay || d >= at(startDay, 0))} value={endDay} onChange={(d) => d && setEndDay(d)} />

          <View style={styles.pushRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Envoyer une notification</Text>
              <Text style={styles.meta}>
                {editing?.pushedAt
                  ? 'Déjà envoyée : elle ne repart pas.'
                  : `${narrowing && targeted ? `Aux étudiants concernés (${audienceLabel(audience)})` : 'À tous les utilisateurs de l’app'}${willPushLater ? ', au moment de la mise en ligne' : ''}. Pour l’important seulement.`}
              </Text>
            </View>
            <Switch value={push} onValueChange={setPush} disabled={!!editing?.pushedAt} trackColor={{ true: colors.primary, false: colors.border }} />
          </View>
          <PrimaryButton
            label={editing ? 'Enregistrer' : startDay ? 'Programmer' : push ? 'Publier et notifier' : 'Publier'}
            disabled={!ready}
            loading={sending}
            onPress={save}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 20, gap: 12, paddingBottom: 32 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h1: { ...typo.h1, color: colors.navy },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.accent, borderRadius: radii.pill, paddingHorizontal: 14, minHeight: 40 },
  newText: { color: '#fff', fontWeight: '700' },
  hint: { ...typo.caption, color: colors.muted2, lineHeight: 17 },
  section: { ...typo.section, color: colors.navy, marginTop: 6 },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: colors.card, borderRadius: radii.md, padding: 14 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  status: { borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 2 },
  statusText: { ...typo.label },
  toneIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { ...typo.bodyStrong, color: colors.navy },
  cardBody: { ...typo.small, color: colors.text, lineHeight: 18 },
  meta: { ...typo.caption, color: colors.muted2, flexShrink: 1 },
  pushLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,27,76,0.35)' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: 20, maxHeight: '88%' },
  sheetTitle: { ...typo.h3, color: colors.navy },
  label: { ...typo.smallStrong, color: colors.navy },
  chips: { flexDirection: 'row', gap: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: radii.pill, borderWidth: 1.5, borderColor: colors.border },
  chipOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipText: { ...typo.smallStrong, color: colors.muted2 },
  pushRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  audienceLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  audienceText: { ...typo.captionStrong, color: colors.primary, flexShrink: 1 },
  audienceBox: { gap: 8, padding: 12, borderRadius: radii.md, backgroundColor: colors.primarySofter },
  small: { ...typo.captionStrong, color: colors.muted2 },
});
