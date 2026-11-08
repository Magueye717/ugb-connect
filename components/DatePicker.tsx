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

const styles = StyleSheet.create({
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
