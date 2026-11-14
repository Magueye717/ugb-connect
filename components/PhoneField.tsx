import type { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Field, LabeledField } from '@/components/ui';
import { colors, typo } from '@/constants/theme';
import { formatPhone, phoneDigits, phoneStartWrong, validatePhone } from '@/features/register/validation';

type Props = {
  /** Above the field; none: the field alone. */
  label?: string;
  /** The 9 digits typed ("771234567"), without +221. */
  value: string;
  onChange: (digits: string) => void;
  icon?: keyof typeof Ionicons.glyphMap;
  placeholder?: string;
  right?: ReactNode;
  editable?: boolean;
  returnKeyType?: 'done' | 'search' | 'next';
  onSubmitEditing?: () => void;
  accessibilityLabel?: string;
  /** Shows the error even before 9 digits (after a « Valider »). */
  touched?: boolean;
};

/** A phone is valid when it's a Senegalese mobile number (the login's rule). */
export const phoneOk = (digits: string) => !validatePhone(phoneDigits(digits));

/**
 * Every phone number in the app, as on the login: +221, the digits grouped as typed (77 123 45 67), 9 at most, the
 * error once all 9 are there (or after the field is left).
 */
export function PhoneField({ label, value, onChange, icon = 'call-outline', placeholder = '77 123 45 67', right, editable, returnKeyType, onSubmitEditing, accessibilityLabel, touched }: Props) {
  const [left, setLeft] = useState(false);
  const digits = phoneDigits(value);
  const error = digits ? validatePhone(digits) : null;
  const show = !!error && (touched || left || digits.length === 9 || phoneStartWrong(digits));
  const field = (
    <Field
      icon={icon}
      prefix="+221"
      keyboardType="phone-pad"
      textContentType="telephoneNumber"
      autoComplete="tel"
      placeholder={placeholder}
      value={formatPhone(digits)}
      onChangeText={(t) => onChange(phoneDigits(t))}
      onBlur={() => setLeft(true)}
      invalid={show}
      right={right}
      editable={editable}
      returnKeyType={returnKeyType}
      onSubmitEditing={onSubmitEditing}
      accessibilityLabel={accessibilityLabel ?? label ?? 'Numéro de téléphone'}
    />
  );
  return label ? (
    <LabeledField label={label} error={show ? error : null}>
      {field}
    </LabeledField>
  ) : (
    <View style={{ gap: 6 }}>
      {field}
      {show && (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({ error: { ...typo.caption, color: colors.dangerText } });
