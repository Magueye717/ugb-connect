import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radii, typo } from '@/constants/theme';

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  placeholder: string;
  title: string;
  value: string | null;
  options: string[];
  onChange: (value: string) => void;
  /** Called when the picker closes, to mark the field as touched. */
  onClose?: () => void;
  disabled?: boolean;
  invalid?: boolean;
};

// Looks like a Field; opens a bottom sheet with the options.
export function Select({ icon, placeholder, title, value, options, onChange, onClose, disabled, invalid }: Props) {
  const [open, setOpen] = useState(false);
  const close = () => {
    setOpen(false);
    onClose?.();
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !!disabled, expanded: open }}
        accessibilityLabel={value ?? placeholder}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[styles.field, invalid && styles.fieldInvalid, disabled && styles.disabled]}>
        <Ionicons name={icon} size={18} color={invalid ? colors.danger : colors.muted} />
        <Text style={[styles.value, !value && { color: colors.muted }]} numberOfLines={1}>
          {value ?? placeholder}
        </Text>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Fermer" />
        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>{title}</Text>
          <ScrollView style={{ maxHeight: 360 }}>
            {options.map((o) => {
              const selected = o === value;
              return (
                <Pressable
                  key={o}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    onChange(o);
                    close();
                  }}
                  style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.bg }]}>
                  <Text style={[styles.optionText, selected && { color: colors.primary, fontWeight: '700' }]}>{o}</Text>
                  {selected && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                </Pressable>
              );
            })}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

/**
 * Several choices (a restaurant's cuisines, a shop's specialties): looks like a Field showing them joined; the sheet
 * ticks up to `max`, then « Valider ».
 */
export function MultiSelect({ icon, placeholder, title, values, options, onChange, max, disabled, invalid }: { icon: keyof typeof Ionicons.glyphMap; placeholder: string; title: string; values: string[]; options: string[]; onChange: (values: string[]) => void; max: number; disabled?: boolean; invalid?: boolean }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(values);
  const show = () => {
    setDraft(values);
    setOpen(true);
  };
  const toggle = (o: string) => setDraft((d) => (d.includes(o) ? d.filter((x) => x !== o) : d.length < max ? [...d, o] : d));
  const full = draft.length >= max;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !!disabled, expanded: open }}
        accessibilityLabel={values.length ? values.join(', ') : placeholder}
        disabled={disabled}
        onPress={show}
        style={[styles.field, invalid && styles.fieldInvalid, disabled && styles.disabled]}>
        <Ionicons name={icon} size={18} color={invalid ? colors.danger : colors.muted} />
        <Text style={[styles.value, !values.length && { color: colors.muted }]} numberOfLines={2}>
          {values.length ? values.join(' · ') : placeholder}
        </Text>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Fermer" />
        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.multiHead}>
            <Text style={[styles.title, { flex: 1, marginBottom: 0 }]}>{title}</Text>
            <Text style={[styles.count, full && { color: colors.primary }]}>
              {draft.length} / {max}
            </Text>
          </View>
          <Text style={styles.hint}>{full ? `${max} au maximum : retire-en un pour en choisir un autre.` : 'Un ou plusieurs.'}</Text>
          <ScrollView style={{ maxHeight: 360 }}>
            {options.map((o) => {
              const on = draft.includes(o);
              const off = !on && full;
              return (
                <Pressable
                  key={o}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on, disabled: off }}
                  disabled={off}
                  onPress={() => toggle(o)}
                  style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.bg }, off && { opacity: 0.4 }]}>
                  <Text style={[styles.optionText, on && { color: colors.primary, fontWeight: '700' }]}>{o}</Text>
                  <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? colors.primary : colors.muted} />
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable
            style={[styles.done, !draft.length && { opacity: 0.5 }]}
            disabled={!draft.length}
            onPress={() => {
              onChange(draft);
              setOpen(false);
            }}
            accessibilityRole="button">
            <Text style={styles.doneText}>Valider</Text>
          </Pressable>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: 56,
    borderRadius: radii.md,
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
  fieldInvalid: { borderColor: colors.danger, borderWidth: 1.5 },
  disabled: { opacity: 0.6 },
  value: { ...typo.body, flex: 1, color: colors.text },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,27,76,0.4)' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 14 },
  title: { ...typo.title, color: colors.navy, marginBottom: 8 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: radii.sm,
  },
  optionText: { ...typo.body, color: colors.text },
  multiHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  count: { ...typo.smallStrong, color: colors.muted2 },
  hint: { ...typo.caption, color: colors.muted2, marginTop: 2, marginBottom: 6 },
  done: { marginTop: 10, minHeight: 50, borderRadius: radii.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  doneText: { ...typo.bodyStrong, color: '#fff' },
});
