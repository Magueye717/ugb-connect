import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandLogo } from '@/components/BrandLogo';
import { Field, LabeledField, OutlineButton, PrimaryButton } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { colors, radii, typo } from '@/constants/theme';
import { formatPhone, PHONE_PREFIX, phoneDigits, phoneStartWrong, validatePhone } from '@/features/register/validation';
import { ApiError } from '@/lib/api';

export default function LoginScreen() {
  const { login } = useAuth();
  const insets = useSafeAreaInsets();
  // 9 digits, shown spaced after +221 as on sign-up ("77 790 28 80"), checked the same way.
  const [phone, setPhone] = useState('');
  const [touched, setTouched] = useState(false);
  const phoneError = validatePhone(phone);
  const showError = (touched || phone.length === 9 || phoneStartWrong(phone)) && !!phoneError;
  const [password, setPassword] = useState('');
  const [hidden, setHidden] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      // 9 digits: the backend adds +221.
      await login(phone, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Une erreur est survenue. Réessaie.');
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={[styles.hero, { paddingTop: insets.top + 28 }]}>
        {/* The logo carries the name: no separate title. */}
        <BrandLogo size={112} />
        <Text style={styles.tagline}>Ton campus dans ta poche</Text>
      </View>

      <KeyboardAvoidingView behavior="padding" style={styles.sheet}>
        <ScrollView contentContainerStyle={styles.sheetInner} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Se connecter</Text>
          <Text style={styles.subtitle}>Bon retour sur le campus !</Text>

          <LabeledField label="Numéro de téléphone" error={showError ? phoneError : null}>
            <Field
              icon="phone-portrait-outline"
              prefix={PHONE_PREFIX}
              placeholder="77 790 28 80"
              keyboardType="number-pad"
              value={formatPhone(phone)}
              onChangeText={(t) => {
                setPhone(phoneDigits(t));
                setError(null);
              }}
              onBlur={() => setTouched(true)}
              invalid={showError}
              maxLength={12}
              autoComplete="tel"
              textContentType="telephoneNumber"
            />
          </LabeledField>
          <Field
            icon="lock-closed-outline"
            placeholder="Mot de passe"
            secureTextEntry={hidden}
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              setError(null);
            }}
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={() => !phoneError && phone && password && !submitting && submit()}
            right={
              <Pressable
                onPress={() => setHidden((v) => !v)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={hidden ? 'Afficher le mot de passe' : 'Masquer le mot de passe'}>
                <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.muted} />
              </Pressable>
            }
          />

          <Pressable onPress={() => router.push('/(auth)/forgot')} style={styles.forgotWrap}>
            <Text style={styles.forgot}>Mot de passe oublié ?</Text>
          </Pressable>

          {error && (
            <Text style={styles.error} accessibilityLiveRegion="assertive">
              {error}
            </Text>
          )}

          <PrimaryButton accent label="Se connecter" onPress={submit} loading={submitting} disabled={!phone || !!phoneError || !password} />

          <View style={styles.divider}>
            <View style={styles.line} />
            <Text style={styles.or}>ou</Text>
            <View style={styles.line} />
          </View>

          <OutlineButton label="Créer un compte" onPress={() => router.push('/(auth)/register')} />

          <Text style={[styles.footer, { marginBottom: insets.bottom + 8 }]}>Une application au service des étudiants</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.primary },
  hero: { alignItems: 'center', paddingBottom: 48, paddingHorizontal: 24 },
  tagline: { ...typo.body, color: 'rgba(255,255,255,0.85)', marginTop: 6 },
  sheet: {
    flex: 1,
    backgroundColor: colors.card,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    marginTop: -16,
  },
  sheetInner: { padding: 24, gap: 14, paddingTop: 28 },
  title: { ...typo.display, color: colors.navy },
  subtitle: { ...typo.body, color: colors.muted2, marginTop: -6, marginBottom: 6 },
  forgotWrap: { alignSelf: 'flex-end', marginTop: -4 },
  forgot: { ...typo.bodyStrong, color: colors.orangeText },
  error: { fontSize: 13, fontWeight: '600', color: colors.danger, textAlign: 'center' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 4 },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  or: { ...typo.small, color: colors.muted2 },
  footer: { ...typo.small, textAlign: 'center', color: colors.muted2, marginTop: 8 },
});
