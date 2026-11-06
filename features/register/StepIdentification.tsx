import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Field, LabeledField, PrimaryButton } from '@/components/ui';
import { colors, radii, typo } from '@/constants/theme';
import type { AccountConflict } from './auth';
import {
  formatPhone,
  PHONE_PREFIX,
  phoneDigits,
  validatePhone,
  STUDENT_ID_MAX,
  typeStudentId,
  validateStudentId,
} from './validation';

export type IdentificationValues = { studentId: string; phone: string };
/** `exists`: the account banner with a sign-in link, naming the number taken; otherwise the server's message (rate limit, offline…). */
export type IdentificationError = { exists: AccountConflict } | { message: string } | null;

const existsLabel: Record<AccountConflict, string> = {
  student_number: 'Ce numéro étudiant a déjà un compte.',
  phone: 'Ce numéro de téléphone a déjà un compte.',
};

type Props = {
  values: IdentificationValues;
  onChange: (patch: Partial<IdentificationValues>) => void;
  onSubmit: () => void;
  submitting: boolean;
  submitError: IdentificationError;
};

export function StepIdentification({ values, onChange, onSubmit, submitting, submitError }: Props) {
  const [touched, setTouched] = useState({ studentId: false, phone: false });
  // Optional: checked only once something is typed (it can be added later on the profile).
  const errors = { studentId: values.studentId ? validateStudentId(values.studentId) : null, phone: validatePhone(values.phone) };
  const valid = !errors.studentId && !errors.phone;
  const touch = (k: keyof typeof touched) => setTouched((t) => ({ ...t, [k]: true }));

  return (
    <View style={{ gap: 20 }}>
      <LabeledField label="Numéro étudiant (facultatif)" error={touched.studentId ? errors.studentId : null}>
        <Field
          accent={colors.orange}
          icon="school-outline"
          placeholder="P232055"
          value={values.studentId}
          onChangeText={(t) => onChange({ studentId: typeStudentId(t) })}
          onBlur={() => touch('studentId')}
          invalid={touched.studentId && !!errors.studentId}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={STUDENT_ID_MAX}
          returnKeyType="next"
        />
        {/* Why we ask: hidden while the error shows in its place. */}
        {!(touched.studentId && errors.studentId) && (
          <View style={styles.why}>
            <Ionicons name="shield-checkmark-outline" size={14} color={colors.muted2} />
            <Text style={styles.whyText}>Tu peux l’ajouter plus tard depuis ton profil. Il permet de te rendre ta carte si quelqu’un la trouve.</Text>
          </View>
        )}
      </LabeledField>

      <LabeledField label="Numéro de téléphone" error={touched.phone ? errors.phone : null}>
        <Field
          accent={colors.orange}
          icon="phone-portrait-outline"
          prefix={PHONE_PREFIX}
          placeholder="77 790 28 80"
          value={formatPhone(values.phone)}
          onChangeText={(t) => onChange({ phone: phoneDigits(t) })}
          onBlur={() => touch('phone')}
          invalid={touched.phone && !!errors.phone}
          keyboardType="number-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          maxLength={12}
        />
      </LabeledField>

      {submitError && 'exists' in submitError && (
        <View style={styles.banner} accessibilityLiveRegion="polite">
          <Ionicons name="person-outline" size={18} color={colors.danger} />
          <Text style={styles.bannerText}>{existsLabel[submitError.exists]}</Text>
          <Pressable onPress={() => router.replace('/(auth)/login')} hitSlop={8}>
            <Text style={styles.bannerLink}>Se connecter</Text>
          </Pressable>
        </View>
      )}
      {submitError && 'message' in submitError && (
        <View style={styles.banner} accessibilityLiveRegion="polite">
          <Text style={styles.bannerText}>{submitError.message}</Text>
        </View>
      )}

      <PrimaryButton accent label="Continuer" onPress={onSubmit} disabled={!valid} loading={submitting} />

      <View style={styles.login}>
        <Text style={styles.muted}>Déjà un compte ?</Text>
        <Pressable onPress={() => router.replace('/(auth)/login')} hitSlop={8}>
          <Text style={styles.link}>Se connecter</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: radii.md,
    backgroundColor: colors.dangerBg,
  },
  bannerText: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.danger },
  bannerLink: { ...typo.smallStrong, color: colors.orangeText, textDecorationLine: 'underline' },
  login: { flexDirection: 'row', justifyContent: 'center', gap: 4 },
  muted: { ...typo.body, color: colors.muted2 },
  why: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  whyText: { ...typo.caption, flex: 1, color: colors.muted2, lineHeight: 17 },
  link: { ...typo.bodyStrong, color: colors.orangeText },
});
