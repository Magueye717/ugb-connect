import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import { Field, LabeledField, PrimaryButton, SafeBottom } from '@/components/ui';
import { colors, radii, typo } from '@/constants/theme';
import type { PassengerDto } from '@/features/caravans/api';
import { formatPhone, phoneDigits, validatePhone } from '@/features/register/validation';

type Props = {
  /** The seat being given to a companion; null hides the sheet. */
  seat: number | null;
  /** Editing a companion already added. */
  initial: PassengerDto | null;
  /** "UGB · Village E → Dakar · Colobane": a companion boards and gets off with the student. */
  route: string | null;
  onClose: () => void;
  onSave: (passenger: PassengerDto) => void;
  onRemove: () => void;
};

/** Digits of a stored companion phone ("+221 77 123 45 67" → "771234567"). */
const localDigits = (phone: string) => phoneDigits(phone.replace(/^\+221\s?/, ''));

/**
 * "Place 8 · Pour qui ?": shown when the student picks a second seat. Name and phone of the companion, who needs
 * no account; same pickup and drop-off as the student. Mount it with a `key` per seat so it opens fresh.
 */
export function CompanionSheet({ seat, initial, route, onClose, onSave, onRemove }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [digits, setDigits] = useState(initial ? localDigits(initial.phone) : '');
  const [touched, setTouched] = useState(false);
  const cleanName = name.trim().replace(/\s+/g, ' ');
  const nameError = cleanName.split(' ').length < 2 || cleanName.length < 4 ? 'Indique son prénom et son nom, comme sur sa pièce d’identité' : null;
  const phoneError = validatePhone(digits);
  const valid = !nameError && !phoneError;

  return (
    <Modal visible={seat !== null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fermer" />
      <KeyboardAvoidingView behavior="padding" style={{ flexShrink: 1 }}>
        <View style={styles.sheet}>
          <View style={styles.titleRow}>
            <View style={styles.seat}>
              <Text style={styles.seatText}>{seat}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Place {seat} · Pour qui ?</Text>
              <Text style={styles.sub}>Ton accompagnant n’a pas besoin de l’app. Son nom sera vérifié à l’embarquement.</Text>
            </View>
          </View>
          <LabeledField label="Nom complet" error={touched ? nameError : null}>
            <Field placeholder="Awa Ndiaye" autoCapitalize="words" autoComplete="name" value={name} onChangeText={setName} invalid={touched && !!nameError} />
          </LabeledField>
          <LabeledField label="Téléphone" error={touched || digits.length === 9 ? phoneError : null}>
            <Field
              prefix="+221"
              placeholder="77 123 45 67"
              keyboardType="phone-pad"
              value={formatPhone(digits)}
              onChangeText={(t) => setDigits(phoneDigits(t))}
              invalid={(touched || digits.length === 9) && !!phoneError}
            />
          </LabeledField>
          {route && (
            <View style={styles.route}>
              <Ionicons name="git-commit-outline" size={16} color={colors.primary} />
              <Text style={styles.routeText}>Même montée et descente que toi : {route}</Text>
            </View>
          )}
          <PrimaryButton
            label={initial ? 'Enregistrer' : 'Valider'}
            disabled={touched && !valid}
            onPress={() => {
              setTouched(true);
              if (valid) onSave({ name: cleanName, phone: `+221 ${formatPhone(digits)}` });
            }}
          />
          <Pressable onPress={initial ? onRemove : onClose} hitSlop={8} accessibilityRole="button" style={styles.secondary}>
            <Text style={styles.secondaryText}>{initial ? 'Retirer cette place' : 'Annuler'}</Text>
          </Pressable>
          <SafeBottom />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,27,76,0.35)' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: 20, paddingBottom: 36, gap: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  seat: { width: 44, height: 44, borderRadius: radii.sm, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  seatText: { ...typo.title, color: '#fff' },
  title: { ...typo.h3, color: colors.navy },
  sub: { ...typo.caption, color: colors.muted2, marginTop: 2, lineHeight: 17 },
  route: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, borderRadius: radii.md, backgroundColor: colors.primarySoft },
  routeText: { ...typo.small, flex: 1, color: colors.navy, lineHeight: 18 },
  secondary: { alignSelf: 'center', paddingVertical: 4 },
  secondaryText: { color: colors.orangeText, fontWeight: '700' },
});
