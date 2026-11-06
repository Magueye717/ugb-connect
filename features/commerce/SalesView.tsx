import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { ErrorState } from '@/components/states';
import { SheetHeader } from '@/components/ui';
import { formatFcfa } from '@/constants/data';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { ApiError } from '@/lib/api';
import { commerceApi, type BusinessRef, type SalesDto } from './api';

type Kind = 'day' | 'week' | 'month' | 'custom';
type Period = { kind: Kind; from: Date; to: Date };

const KINDS: { value: Kind; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'day', label: 'Aujourd’hui', icon: 'today-outline' },
  { value: 'week', label: 'Cette semaine', icon: 'calendar-outline' },
  { value: 'month', label: 'Ce mois', icon: 'calendar-number-outline' },
  { value: 'custom', label: 'Choisir des dates', icon: 'options-outline' },
];
/** « Période » opens on the last seven days, ready to change. */
const DEFAULT_RANGE_DAYS = 7;
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const SHORT_MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const DAYS = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];
/** Above this many days, the chart would be bars too thin to read: the totals say enough. */
const CHART_MAX_DAYS = 62;

// Days, at local midnight (the phone is in Dakar, which is UTC all year, like the server's days).
const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const sameDay = (a: Date, b: Date) => iso(a) === iso(b);
const fromIso = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y!, m! - 1, d);
};

/** The period of this kind around `at`: the day, its week (Monday to Sunday), its month. */
function periodOf(kind: Exclude<Kind, 'custom'>, at: Date): Period {
  const d = midnight(at);
  if (kind === 'day') return { kind, from: d, to: d };
  if (kind === 'week') {
    const monday = addDays(d, -((d.getDay() + 6) % 7));
    return { kind, from: monday, to: addDays(monday, 6) };
  }
  return { kind, from: new Date(d.getFullYear(), d.getMonth(), 1), to: new Date(d.getFullYear(), d.getMonth() + 1, 0) };
}

/** The same kind of period, `n` back (−1) or forward (+1). */
function step(p: Period, n: number): Period {
  if (p.kind === 'day') return periodOf('day', addDays(p.from, n));
  if (p.kind === 'week') return periodOf('week', addDays(p.from, 7 * n));
  return periodOf('month', new Date(p.from.getFullYear(), p.from.getMonth() + n, 1));
}

const dayMonth = (d: Date) => `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`;
const fullDay = (d: Date) => `${DAYS[d.getDay()]} ${d.getDate()} ${SHORT_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
const daysBetween = (a: Date, b: Date) => Math.round((midnight(b).getTime() - midnight(a).getTime()) / 86_400_000) + 1;
function labelOf(p: Period, today: Date) {
  if (p.kind === 'day') return sameDay(p.from, today) ? 'Aujourd’hui' : sameDay(p.from, addDays(today, -1)) ? 'Hier' : `${DAYS[p.from.getDay()]} ${dayMonth(p.from)}`;
  if (p.kind === 'month') return `${MONTHS[p.from.getMonth()]![0]!.toUpperCase()}${MONTHS[p.from.getMonth()]!.slice(1)} ${p.from.getFullYear()}`;
  if (sameDay(p.from, p.to)) return dayMonth(p.from);
  const year = p.from.getFullYear() !== p.to.getFullYear() ? ` ${p.from.getFullYear()}` : '';
  return p.from.getMonth() === p.to.getMonth() && !year ? `${p.from.getDate()} – ${dayMonth(p.to)}` : `${dayMonth(p.from)}${year} – ${dayMonth(p.to)}`;
}

/**
 * « Mes ventes »: what the business sold over a day, a week (Monday to Sunday), a month or chosen days. The money
 * counts completed orders only (the server adds it up): in cash (already in hand) and by Wave / Orange Money (what is
 * still to arrive on the owner's number), day by day, the best sellers. Orders being served, refused or cancelled are
 * shown apart.
 */
export function SalesView({ business }: { business: BusinessRef }) {
  const today = midnight(new Date());
  const [period, setPeriod] = useState<Period>(() => periodOf('day', today));
  const [data, setData] = useState<SalesDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The range's field being chosen in the calendar (Du or Au), or none.
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);
  // The list of periods (one tap on the period's name).
  const [choosing, setChoosing] = useState(false);
  const from = iso(period.from);
  const to = iso(period.to);

  const load = useCallback(() => {
    setError(null);
    commerceApi.sales(business, from, to).then(setData, (err) => setError(err instanceof ApiError ? err.message : 'Pas de connexion : réessaie.'));
  }, [business, from, to]);
  useEffect(load, [load]);

  const choose = (kind: Kind) => {
    setChoosing(false);
    // Choosing dates: straight to the first one.
    if (kind === 'custom') setTimeout(() => setPicking('from'), 350);
    setPeriod((p) => (kind === 'custom' ? (p.kind === 'custom' ? p : { kind, from: addDays(today, 1 - DEFAULT_RANGE_DAYS), to: today }) : periodOf(kind, today)));
  };
  // Not past today: there is nothing to see in the future.
  const canGoOn = period.kind !== 'custom' && period.to < today;
  const shown = data && data.from === from && data.to === to ? data : null;

  return (
    <View style={{ gap: 14 }}>
      {/* One control: ‹ the period › ; its name opens the other periods. Chosen dates: the range itself. */}
      {period.kind === 'custom' ? (
        <View style={styles.range}>
          <DateField label="Du" date={period.from} onPress={() => setPicking('from')} />
          <Ionicons name="arrow-forward" size={16} color={colors.muted2} />
          <DateField label="Au" date={period.to} onPress={() => setPicking('to')} />
          <Pressable onPress={() => setChoosing(true)} style={styles.arrow} hitSlop={8} accessibilityRole="button" accessibilityLabel="Changer de période">
            <Ionicons name="swap-vertical" size={18} color={colors.navy} />
          </Pressable>
        </View>
      ) : (
        <View style={[styles.nav, shadow.card]}>
          <Pressable onPress={() => setPeriod(step(period, -1))} style={styles.arrow} hitSlop={8} accessibilityRole="button" accessibilityLabel="Période précédente">
            <Ionicons name="chevron-back" size={18} color={colors.navy} />
          </Pressable>
          <Pressable onPress={() => setChoosing(true)} style={styles.navLabel} accessibilityRole="button" accessibilityLabel={`${labelOf(period, today)}, changer de période`}>
            <View style={styles.navTitle}>
              <Text style={styles.periodLabel}>{labelOf(period, today)}</Text>
              <Ionicons name="chevron-down" size={16} color={colors.primary} />
            </View>
            {period.kind !== 'day' && (
              <Text style={styles.periodSub}>
                {dayMonth(period.from)} – {dayMonth(period.to)}
              </Text>
            )}
          </Pressable>
          <Pressable onPress={() => canGoOn && setPeriod(step(period, 1))} disabled={!canGoOn} style={[styles.arrow, !canGoOn && { opacity: 0.3 }]} hitSlop={8} accessibilityRole="button" accessibilityLabel="Période suivante">
            <Ionicons name="chevron-forward" size={18} color={colors.navy} />
          </Pressable>
        </View>
      )}

      {period.kind === 'custom' && (
        <Text style={styles.rangeDays}>
          {daysBetween(period.from, period.to)} jour{daysBetween(period.from, period.to) > 1 ? 's' : ''}
        </Text>
      )}

      <Modal visible={choosing} transparent animationType="slide" onRequestClose={() => setChoosing(false)}>
        <Pressable style={styles.backdrop} onPress={() => setChoosing(false)} accessibilityLabel="Fermer" />
        <View style={styles.sheet}>
          <SheetHeader onClose={() => setChoosing(false)}>Période</SheetHeader>
          {KINDS.map((k) => {
            const on = period.kind === k.value;
            return (
              <Pressable key={k.value} onPress={() => choose(k.value)} style={[styles.choice, on && styles.choiceOn]} accessibilityRole="radio" accessibilityState={{ checked: on }}>
                <Ionicons name={k.icon} size={18} color={on ? colors.primary : colors.muted2} />
                <Text style={[styles.choiceText, on && { color: colors.primary }]}>{k.label}</Text>
                {on && <Ionicons name="checkmark" size={18} color={colors.primary} />}
              </Pressable>
            );
          })}
        </View>
      </Modal>

      {error ? (
        <ErrorState text={error} onRetry={load} />
      ) : !shown ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
      ) : (
        <Report data={shown} />
      )}

      {period.kind === 'custom' && (
        <RangePicker
          editing={picking}
          range={period}
          today={today}
          onClose={() => setPicking(null)}
          onPick={(a, b) => {
            setPicking(null);
            setPeriod({ kind: 'custom', from: a, to: b });
          }}
        />
      )}
    </View>
  );
}

/** One end of the range: its label (Du, Au) and the day, like a form field. */
function DateField({ label, date, onPress }: { label: string; date: Date; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.dateField, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel={`${label} ${fullDay(date)}, changer`}>
      <Ionicons name="calendar-outline" size={16} color={colors.primary} />
      <View style={{ flex: 1 }}>
        <Text style={styles.dateLabel}>{label}</Text>
        <Text style={styles.dateValue} numberOfLines={1}>
          {dayMonth(date)} {date.getFullYear()}
        </Text>
      </View>
    </Pressable>
  );
}

function Report({ data: d }: { data: SalesDto }) {
  const cash = d.methods.find((m) => m.method === 'cash');
  const online = d.methods.filter((m) => m.method !== 'cash');
  const onlineTotal = online.reduce((n, m) => n + m.amount, 0);
  const apart = [
    d.inProgress && `${d.inProgress} en cours`,
    d.refused && `${d.refused} refusée${d.refused > 1 ? 's' : ''}`,
    d.cancelled && `${d.cancelled} annulée${d.cancelled > 1 ? 's' : ''}`,
  ].filter(Boolean);

  return (
    <View style={{ gap: 14 }}>
      {/* The three numbers first. */}
      <View style={[styles.card, shadow.card, styles.kpis]}>
        <Kpi value={formatFcfa(d.revenue)} label="Chiffre d’affaires" strong />
        <View style={styles.kpiSep} />
        <Kpi value={String(d.orders)} label={d.orders > 1 ? 'Commandes' : 'Commande'} />
        <View style={styles.kpiSep} />
        <Kpi value={d.orders ? formatFcfa(d.average) : '—'} label="Panier moyen" />
      </View>

      {d.orders === 0 ? (
        <Text style={styles.empty}>Aucune vente sur cette période.</Text>
      ) : (
        <>
          {/* Cash is already in hand; Wave / Orange Money arrive on the owner's number. */}
          <View style={[styles.card, shadow.card, { gap: 10 }]}>
            <Text style={styles.cardTitle}>Encaissements</Text>
            {cash && (
              <Line icon="cash-outline" label="Espèces" sub="Encaissées par toi" amount={cash.amount} count={cash.orders} />
            )}
            {online.length > 0 && (
              <Line
                icon="phone-portrait-outline"
                label={online.map((m) => m.label).join(' / ')}
                sub={d.owed > 0 ? `Dont ${formatFcfa(d.owed)} à recevoir` : 'Reçus sur ton numéro'}
                subTone={d.owed > 0 ? 'warning' : 'success'}
                amount={onlineTotal}
                count={online.reduce((n, m) => n + m.orders, 0)}
              />
            )}
          </View>

          {d.days.length > 1 && d.days.length <= CHART_MAX_DAYS && <DayChart days={d.days} />}

          {d.top.length > 0 && (
            <View style={[styles.card, shadow.card, { gap: 10 }]}>
              <Text style={styles.cardTitle}>Les plus vendus</Text>
              {d.top.map((t, i) => (
                <View key={t.itemId} style={styles.topRow}>
                  <Text style={styles.rank}>{i + 1}</Text>
                  <Text style={styles.topName} numberOfLines={1}>
                    {t.name}
                  </Text>
                  <Text style={styles.topQty}>×{t.qty}</Text>
                  <Text style={styles.topAmount}>{formatFcfa(t.revenue)}</Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}

      {apart.length > 0 && (
        <View style={styles.apart}>
          <Ionicons name="information-circle-outline" size={15} color={colors.muted2} />
          <Text style={styles.apartText}>{apart.join(' · ')} : non comptées dans les ventes.</Text>
        </View>
      )}
    </View>
  );
}

function Kpi({ value, label, strong }: { value: string; label: string; strong?: boolean }) {
  return (
    <View style={styles.kpi}>
      <Text style={[styles.kpiValue, strong && { color: colors.successText }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

function Line({ icon, label, sub, subTone, amount, count }: { icon: keyof typeof Ionicons.glyphMap; label: string; sub: string; subTone?: 'warning' | 'success'; amount: number; count: number }) {
  return (
    <View style={styles.line}>
      <View style={styles.lineIcon}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.lineLabel}>{label}</Text>
        <Text style={[styles.lineSub, subTone === 'warning' && { color: colors.warningText }, subTone === 'success' && { color: colors.successText }]}>{sub}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.lineAmount}>{formatFcfa(amount)}</Text>
        <Text style={styles.lineSub}>
          {count} commande{count > 1 ? 's' : ''}
        </Text>
      </View>
    </View>
  );
}

/** One bar a day; the best day in green. Its first and last days written under it. */
function DayChart({ days }: { days: SalesDto['days'] }) {
  const max = Math.max(...days.map((d) => d.revenue), 1);
  const best = days.reduce((b, d) => (d.revenue > b.revenue ? d : b), days[0]!);
  const first = fromIso(days[0]!.date);
  const last = fromIso(days[days.length - 1]!.date);
  return (
    <View style={[styles.card, shadow.card, { gap: 8 }]}>
      <View style={styles.chartHead}>
        <Text style={styles.cardTitle}>Jour par jour</Text>
        {best.revenue > 0 && (
          <Text style={styles.lineSub}>
            Meilleur jour : {DAYS[fromIso(best.date).getDay()]} {dayMonth(fromIso(best.date))}
          </Text>
        )}
      </View>
      <View style={styles.bars} accessible accessibilityLabel={days.map((d) => `${dayMonth(fromIso(d.date))} : ${formatFcfa(d.revenue)}`).join(', ')}>
        {days.map((d) => (
          <View key={d.date} style={styles.barSlot}>
            <View style={[styles.bar, { height: Math.max(2, Math.round((d.revenue / max) * 72)) }, d.revenue === 0 && styles.barEmpty, d === best && d.revenue > 0 && styles.barBest]} />
          </View>
        ))}
      </View>
      <View style={styles.chartHead}>
        <Text style={styles.axis}>{dayMonth(first)}</Text>
        <Text style={styles.axis}>{dayMonth(last)}</Text>
      </View>
    </View>
  );
}

/**
 * The calendar for one end of the range (`editing`): a month at a time, today at the latest. The start can't go after
 * the end and the end not before the start: picking such a day moves the other end with it.
 */
function RangePicker({ editing, range, today, onClose, onPick }: { editing: 'from' | 'to' | null; range: Period; today: Date; onClose: () => void; onPick: (from: Date, to: Date) => void }) {
  const shownDay = editing === 'to' ? range.to : range.from;
  const [month, setMonth] = useState(() => new Date(shownDay.getFullYear(), shownDay.getMonth(), 1));
  const [opened, setOpened] = useState(editing);
  // Opened on the other end: show that end's month (render-time, no effect).
  if (editing !== opened) {
    setOpened(editing);
    if (editing) setMonth(new Date(shownDay.getFullYear(), shownDay.getMonth(), 1));
  }
  const pick = (d: Date) => (editing === 'from' ? onPick(d, d > range.to ? d : range.to) : onPick(d < range.from ? d : range.from, d));
  const lead = (month.getDay() + 6) % 7;
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [...Array<null>(lead).fill(null), ...Array.from({ length: count }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))];
  const canNext = new Date(month.getFullYear(), month.getMonth() + 1, 1) <= today;

  return (
    <Modal visible={editing !== null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fermer" />
      <View style={styles.sheet}>
        <SheetHeader onClose={onClose}>{editing === 'to' ? 'Jusqu’au' : 'À partir du'}</SheetHeader>
        <View style={styles.periodRow}>
          <Pressable onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} style={styles.arrow} hitSlop={8} accessibilityRole="button" accessibilityLabel="Mois précédent">
            <Ionicons name="chevron-back" size={18} color={colors.navy} />
          </Pressable>
          <Text style={[styles.periodLabel, { flex: 1 }]}>
            {MONTHS[month.getMonth()]} {month.getFullYear()}
          </Text>
          <Pressable onPress={() => canNext && setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} disabled={!canNext} style={[styles.arrow, !canNext && { opacity: 0.3 }]} hitSlop={8} accessibilityRole="button" accessibilityLabel="Mois suivant">
            <Ionicons name="chevron-forward" size={18} color={colors.navy} />
          </Pressable>
        </View>
        <View style={styles.grid}>
          {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((w, i) => (
            <Text key={i} style={[styles.cell, styles.weekday]}>
              {w}
            </Text>
          ))}
          {cells.map((d, i) => {
            if (!d) return <View key={`e${i}`} style={styles.cell} />;
            const future = d > today;
            const edge = sameDay(d, range.from) || sameDay(d, range.to);
            const inside = d > range.from && d < range.to;
            return (
              <Pressable key={iso(d)} style={styles.cell} disabled={future} onPress={() => pick(d)} accessibilityRole="button" accessibilityState={{ selected: edge, disabled: future }} accessibilityLabel={fullDay(d)}>
                <View style={[styles.dayDot, inside && styles.dayInside, edge && styles.dayEdge]}>
                  <Text style={[styles.dayText, future && { color: colors.muted }, inside && { color: colors.primary }, edge && { color: '#fff' }, sameDay(d, today) && !edge && { fontWeight: '800' }]}>{d.getDate()}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.periodSub}>
          Du {dayMonth(range.from)} au {dayMonth(range.to)} · touche un jour pour {editing === 'to' ? 'la fin' : 'le début'}
        </Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  navLabel: { flex: 1, alignItems: 'center', paddingVertical: 2 },
  navTitle: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 50, paddingHorizontal: 12, borderRadius: radii.md },
  choiceOn: { backgroundColor: colors.primarySoft },
  choiceText: { ...typo.bodyStrong, color: colors.navy, flex: 1 },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: radii.md, backgroundColor: colors.card },
  periodSub: { ...typo.caption, color: colors.muted2, textAlign: 'center' },
  range: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rangeDays: { ...typo.caption, color: colors.muted2, textAlign: 'center', marginTop: -6 },
  dateField: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, paddingHorizontal: 12, borderRadius: radii.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card },
  dateLabel: { ...typo.caption, color: colors.muted2 },
  dateValue: { ...typo.bodyStrong, color: colors.navy },
  periodRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  arrow: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  periodLabel: { ...typo.title, color: colors.navy, textAlign: 'center' },
  card: { backgroundColor: colors.card, borderRadius: radii.md, padding: 14 },
  cardTitle: { ...typo.smallStrong, color: colors.navy },
  kpis: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  kpi: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: 4 },
  kpiSep: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: colors.border },
  kpiValue: { ...typo.title, color: colors.navy },
  kpiLabel: { ...typo.caption, color: colors.muted2, textAlign: 'center' },
  empty: { ...typo.small, color: colors.muted2, textAlign: 'center', paddingVertical: 12 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lineIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  lineLabel: { ...typo.bodyStrong, color: colors.navy },
  lineSub: { ...typo.caption, color: colors.muted2 },
  lineAmount: { ...typo.bodyStrong, color: colors.navy },
  chartHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: 76, gap: 2 },
  barSlot: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  bar: { width: '100%', maxWidth: 18, borderRadius: 3, backgroundColor: colors.primary },
  barEmpty: { backgroundColor: colors.border },
  barBest: { backgroundColor: colors.success },
  axis: { ...typo.caption, color: colors.muted2 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rank: { width: 20, ...typo.smallStrong, color: colors.muted2 },
  topName: { flex: 1, ...typo.body, color: colors.navy },
  topQty: { ...typo.smallStrong, color: colors.muted2 },
  topAmount: { ...typo.smallStrong, color: colors.navy, minWidth: 76, textAlign: 'right' },
  apart: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  apartText: { ...typo.caption, color: colors.muted2, flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,27,76,0.35)' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: 20, paddingBottom: 36, gap: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: 42, alignItems: 'center', justifyContent: 'center' },
  weekday: { ...typo.caption, color: colors.muted2, textAlign: 'center', textAlignVertical: 'center', lineHeight: 42 },
  dayDot: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dayInside: { backgroundColor: colors.primarySoft, borderRadius: 8 },
  dayEdge: { backgroundColor: colors.primary },
  dayText: { ...typo.body, color: colors.navy },
});
