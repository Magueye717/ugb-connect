import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { SafeBottom, SheetHeader } from '@/components/ui';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { haptics } from '@/lib/haptics';

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const WEEK = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const DAY_MS = 86_400_000;

const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a: Date | null, b: Date) => !!a && a.toDateString() === b.toDateString();
/** « Ven. 14 nov. » (with the year when it isn't this one). */
export const dateLabel = (d: Date) => {
  const s = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

type FieldProps = {
  label: string;
  /** The chosen day (midnight), or null. */
  value: Date | null;
  onChange: (day: Date) => void;
  /** First and last days that can be chosen (included). */
  min: Date;
  max: Date;
  placeholder?: string;
};

/**
 * A date to choose: the day written in full, tapped to open a month calendar (quick choices first: today, tomorrow,
 * the coming Saturday). Days before `min` or after `max` are greyed out. Replaces the long strips of day chips.
 */
export function DateField({ label, value, onChange, min, max, placeholder = 'Choisir un jour' }: FieldProps) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.field, value && styles.fieldOn, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
        accessibilityLabel={`${label} : ${value ? dateLabel(value) : 'aucun'}`}
        accessibilityHint="Ouvre le calendrier">
        <View style={styles.fieldIcon}>
          <Ionicons name="calendar" size={18} color={colors.primary} />
        </View>
        <Text style={[styles.fieldText, !value && { color: colors.muted2, fontWeight: '500' }]}>{value ? dateLabel(value) : placeholder}</Text>
        <Ionicons name="chevron-down" size={18} color={colors.muted} />
      </Pressable>
      {open && (
        <CalendarSheet
          title={label}
          value={value}
          min={midnight(min)}
          max={midnight(max)}
          onClose={() => setOpen(false)}
          onPick={(d) => {
            haptics.select();
            onChange(d);
            setOpen(false);
          }}
        />
      )}
    </View>
  );
}

function CalendarSheet({ title, value, min, max, onClose, onPick }: { title: string; value: Date | null; min: Date; max: Date; onClose: () => void; onPick: (d: Date) => void }) {
  const start = value ?? min;
  const [month, setMonth] = useState(new Date(start.getFullYear(), start.getMonth(), 1));
  const today = midnight(new Date());
  const allowed = (d: Date) => d >= min && d <= max;

  // Monday first: blanks before the 1st, then each day of the month.
  const lead = (month.getDay() + 6) % 7;
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [...Array.from({ length: lead }, () => null), ...Array.from({ length: count }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))];
  while (cells.length % 7) cells.push(null);

  const canPrev = new Date(month.getFullYear(), month.getMonth(), 0) >= min;
  const canNext = new Date(month.getFullYear(), month.getMonth() + 1, 1) <= max;
  const saturday = new Date(today.getTime() + ((6 - today.getDay() + 7) % 7 || 7) * DAY_MS);
  const quick = [
    { label: 'Aujourd’hui', day: today },
    { label: 'Demain', day: new Date(today.getTime() + DAY_MS) },
    { label: 'Samedi', day: saturday },
  ].filter((q) => allowed(q.day));

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fermer" />
      <View style={styles.sheet}>
        <SheetHeader onClose={onClose}>{title}</SheetHeader>
        {quick.length > 0 && (
          <View style={styles.quick}>
            {quick.map((q) => (
              <Pressable key={q.label} onPress={() => onPick(q.day)} style={[styles.quickChip, sameDay(value, q.day) && styles.quickChipOn]} accessibilityRole="button">
                <Text style={[styles.quickText, sameDay(value, q.day) && { color: '#fff' }]}>{q.label}</Text>
              </Pressable>
            ))}
          </View>
        )}

        <View style={styles.monthRow}>
          <Pressable onPress={() => canPrev && setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} disabled={!canPrev} style={[styles.arrow, !canPrev && { opacity: 0.3 }]} hitSlop={8} accessibilityRole="button" accessibilityLabel="Mois précédent">
            <Ionicons name="chevron-back" size={20} color={colors.primary} />
          </Pressable>
          <Text style={styles.month}>
            {MONTHS[month.getMonth()]} {month.getFullYear()}
          </Text>
          <Pressable onPress={() => canNext && setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} disabled={!canNext} style={[styles.arrow, !canNext && { opacity: 0.3 }]} hitSlop={8} accessibilityRole="button" accessibilityLabel="Mois suivant">
            <Ionicons name="chevron-forward" size={20} color={colors.primary} />
          </Pressable>
        </View>

        <View style={styles.grid}>
          {WEEK.map((w, i) => (
            <Text key={i} style={[styles.cell, styles.week]}>
              {w}
            </Text>
          ))}
          {cells.map((d, i) => {
            if (!d) return <View key={`b${i}`} style={styles.cell} />;
            const ok = allowed(d);
            const on = sameDay(value, d);
            const isToday = sameDay(today, d);
            return (
              <Pressable
                key={d.toISOString()}
                onPress={() => ok && onPick(d)}
                disabled={!ok}
                style={styles.cell}
                accessibilityRole="button"
                accessibilityState={{ selected: on, disabled: !ok }}
                accessibilityLabel={dateLabel(d)}>
                <View style={[styles.day, isToday && styles.dayToday, on && styles.dayOn]}>
                  <Text style={[styles.dayText, !ok && styles.dayOff, on && { color: '#fff' }]}>{d.getDate()}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        <SafeBottom />
      </View>
    </Modal>
  );
}

type TimeProps = { label: string; value: string; onChange: (t: string) => void; times: string[] };

/** A start time: the hour written large, tapped to open a grid of the times offered (every 30 min). */
export function TimeField({ label, value, onChange, times }: TimeProps) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <Pressable onPress={() => setOpen(true)} style={({ pressed }) => [styles.field, styles.fieldOn, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel={`${label} : ${value.replace(':', 'h')}`}>
        <View style={styles.fieldIcon}>
          <Ionicons name="time" size={18} color={colors.primary} />
        </View>
        <Text style={styles.fieldText}>{value.replace(':', 'h')}</Text>
        <Ionicons name="chevron-down" size={18} color={colors.muted} />
      </Pressable>
      {open && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setOpen(false)}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Fermer" />
          <View style={styles.sheet}>
            <SheetHeader onClose={() => setOpen(false)}>{label}</SheetHeader>
            {times.length === 0 ? (
              <Text style={styles.empty}>Plus d’horaire possible ce jour-là : choisis un autre jour.</Text>
            ) : (
              <View style={styles.times}>
                {times.map((t) => {
                  const on = t === value;
                  return (
                    <Pressable
                      key={t}
                      onPress={() => {
                        haptics.select();
                        onChange(t);
                        setOpen(false);
                      }}
                      style={[styles.time, on && styles.timeOn]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}>
                      <Text style={[styles.timeText, on && { color: '#fff' }]}>{t.replace(':', 'h')}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
            <SafeBottom />
          </View>
        </Modal>
      )}
    </View>
  );
}

type StopTimeProps = {
  /** "14:30", or "" while not chosen. */
  value: string;
  onChange: (t: string) => void;
  /** Read by screen readers and shown on the sheet: « Montée 2 ». */
  label: string;
  /** Out of order (red), or the next day (« +1 j »). */
  invalid?: boolean;
  nextDay?: boolean;
  /** What comes before (« après 12h00 »): shown on the sheet. */
  hint?: string | null;
};

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

/**
 * A stop's time, compact: « 14h30 » in a pill, tapped to open a sheet: the hour (a grid), then the minutes. No typing,
 * no impossible time.
 */
export function StopTimeField({ value, onChange, label, invalid, nextDay, hint }: StopTimeProps) {
  const [open, setOpen] = useState(false);
  const [hour, setHour] = useState<string | null>(null);
  const start = () => {
    setHour(value ? value.slice(0, 2) : null);
    setOpen(true);
  };
  const pickMinute = (m: string) => {
    if (!hour) return;
    haptics.select();
    onChange(`${hour}:${m}`);
    setOpen(false);
  };
  return (
    <>
      <Pressable
        onPress={start}
        style={({ pressed }) => [styles.stopTime, !!value && styles.stopTimeSet, invalid && styles.stopTimeBad, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
        accessibilityLabel={`${label} : ${value ? value.replace(':', 'h') : 'heure à choisir'}`}>
        <Ionicons name="time-outline" size={15} color={invalid ? colors.dangerText : value ? colors.primary : colors.muted} />
        <Text style={[styles.stopTimeText, !value && { color: colors.muted }, invalid && { color: colors.dangerText }]}>{value ? value.replace(':', 'h') : '--h--'}</Text>
        {nextDay && <Text style={styles.nextDay}>+1 j</Text>}
      </Pressable>
      {open && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setOpen(false)}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Fermer" />
          <View style={styles.sheet}>
            <SheetHeader onClose={() => setOpen(false)}>{label}</SheetHeader>
            {!!hint && <Text style={styles.sheetHint}>{hint}</Text>}
            <Text style={styles.label}>Heure</Text>
            <View style={styles.hours}>
              {HOURS.map((h) => {
                const on = h === hour;
                return (
                  <Pressable key={h} onPress={() => { haptics.select(); setHour(h); }} style={[styles.hourCell, on && styles.timeOn]} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${Number(h)} heures`}>
                    <Text style={[styles.timeText, on && { color: '#fff' }]}>{h}h</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={[styles.label, !hour && { color: colors.muted }]}>Minutes</Text>
            <View style={styles.hours}>
              {MINUTES.map((m) => {
                const on = !!hour && value === `${hour}:${m}`;
                return (
                  <Pressable key={m} disabled={!hour} onPress={() => pickMinute(m)} style={[styles.hourCell, on && styles.timeOn, !hour && { opacity: 0.4 }]} accessibilityRole="button" accessibilityLabel={`${hour ?? ''}h${m}`}>
                    <Text style={[styles.timeText, on && { color: '#fff' }]}>{hour ? `${hour}h${m}` : `:${m}`}</Text>
                  </Pressable>
                );
              })}
            </View>
            <SafeBottom />
          </View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  stopTime: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 48, paddingHorizontal: 10, borderRadius: radii.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card },
  stopTimeSet: { borderColor: colors.primarySoft, backgroundColor: colors.primarySoft },
  stopTimeBad: { borderColor: colors.dangerText, backgroundColor: colors.dangerBg },
  stopTimeText: { ...typo.bodyStrong, color: colors.primary },
  nextDay: { ...typo.label, color: colors.orangeText },
  sheetHint: { ...typo.small, color: colors.muted2, marginTop: -6 },
  hours: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  hourCell: { width: '15%', flexGrow: 1, minHeight: 40, borderRadius: radii.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  label: { ...typo.smallStrong, color: colors.navy },
  field: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 12, borderRadius: radii.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card },
  fieldOn: { borderColor: colors.primarySoft },
  fieldIcon: { width: 34, height: 34, borderRadius: radii.sm, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  fieldText: { ...typo.bodyStrong, color: colors.navy, flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,27,76,0.35)' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: 20, gap: 14, ...shadow.raised },
  quick: { flexDirection: 'row', gap: 8 },
  quickChip: { flex: 1, minHeight: 40, borderRadius: radii.pill, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  quickChipOn: { backgroundColor: colors.primary },
  quickText: { ...typo.smallStrong, color: colors.primary },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  month: { ...typo.title, color: colors.navy, textTransform: 'capitalize' },
  arrow: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  week: { ...typo.label, color: colors.muted2, textAlign: 'center', textAlignVertical: 'center', aspectRatio: 1.6 },
  day: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  dayToday: { borderWidth: 1.5, borderColor: colors.primary },
  dayOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayText: { ...typo.bodyStrong, color: colors.navy },
  dayOff: { color: colors.border, fontWeight: '400' },
  times: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  time: { width: '23%', minHeight: 44, borderRadius: radii.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  timeOn: { backgroundColor: colors.primary },
  timeText: { ...typo.bodyStrong, color: colors.primary },
  empty: { ...typo.small, color: colors.muted2, textAlign: 'center', paddingVertical: 20 },
});
