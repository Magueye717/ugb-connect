import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandLogo } from '@/components/BrandLogo';
import { Field, LabeledField, PrimaryButton } from '@/components/ui';
import { colors, radii, typo } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { resetPassword, sendOtp, type OtpChallenge } from '@/features/register/auth';
import { StepOtp } from '@/features/register/StepOtp';
import { formatPhone, PHONE_PREFIX, phoneDigits, passwordRules, validateConfirm, validatePassword, validatePhone } from '@/features/register/validation';
import { ApiError } from '@/lib/api';

type Stage = 'phone' | 'code' | 'password';

const headings: Record<Stage, { title: string; subtitle: string }> = {
  phone: { title: 'Mot de passe oublié', subtitle: 'Entre ton numéro, on t’envoie un code SMS pour le réinitialiser.' },
  code: { title: 'Vérification', subtitle: 'On vérifie que ce numéro est bien le tien.' },
  password: { title: 'Nouveau mot de passe', subtitle: 'Choisis-en un que tu n’utilises nulle part ailleurs.' },
};

const messageOf = (err: unknown) => (err instanceof ApiError ? err.message : 'Une erreur est survenue. Réessaie.');

// Same look as sign-up: navy header with the brand, form on a white sheet. Phone → code → new password, then signed in.
export default function ForgotScreen() {
  const { login } = useAuth();
  const insets = useSafeAreaInsets();
  const [stage, setStage] = useState<Stage>('phone');
  const [phone, setPhone] = useState('');
  const [touched, setTouched] = useState({ phone: false, password: false, confirm: false });
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phoneError = validatePhone(phone);
  const passwordError = validatePassword(password);
  const confirmError = validateConfirm(password, confirm);

  const goBack = useCallback(() => {
    setError(null);
    if (stage === 'password') setStage('code');
    else if (stage === 'code') setStage('phone');
    else router.back();
    return true;
  }, [stage]);

  // Android hardware back follows the stages too.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', goBack);
    return () => sub.remove();
  }, [goBack]);

  const sendCode = async () => {
    setSubmitting(true);
    setError(null);
    try {
      // A number without an account gets « Aucun compte sur ce numéro. » and no code.
      const challenge = await sendOtp(phone, 'reset_password');
      setChallenge(challenge);
      setVerificationToken(null);
      setStage('code');
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSubmitting(false);
    }
  };

  const savePassword = async () => {
    if (!verificationToken) return;
    setSubmitting(true);
    setError(null);
    try {
      await resetPassword(verificationToken, password);
    } catch (err) {
      setSubmitting(false);
      setError(messageOf(err));
      // The proof of the phone is spent or too old: verify the number again.
      if (err instanceof ApiError && err.code === 'VERIFICATION_EXPIRED') {
        setVerificationToken(null);
        setStage('phone');
      }
      return;
    }
    try {
      // Every other session was closed by the reset; this device signs in with the new password.
      await login(phone, password);
    } catch {
      router.replace('/(auth)/login');
    }
  };

  const heading = headings[stage];

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <SafeAreaView edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={goBack} style={styles.back} accessibilityRole="button" accessibilityLabel="Retour">
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </Pressable>
          <View style={styles.brand}>
            <BrandLogo size={28} />
            <Text style={styles.brandText}>UGB Connect</Text>
          </View>
          <View style={{ width: 44 }} />
        </View>
        <View style={styles.heading}>
          <Text style={styles.h1}>{heading.title}</Text>
          <Text style={styles.sub}>{heading.subtitle}</Text>
        </View>
      </SafeAreaView>

      <View style={styles.sheet}>
        <KeyboardAwareScrollView style={{ flex: 1 }} bottomOffset={24}
            contentContainerStyle={[styles.content, { paddingBottom: 48 + insets.bottom }]}
            keyboardShouldPersistTaps="handled">
            {stage === 'phone' && (
              <>
                <LabeledField label="Numéro de téléphone" error={touched.phone ? phoneError : null}>
                  <Field
                    accent={colors.orange}
                    icon="phone-portrait-outline"
                    prefix={PHONE_PREFIX}
                    placeholder="77 790 28 80"
                    keyboardType="number-pad"
                    value={formatPhone(phone)}
                    onChangeText={(t) => {
                      setPhone(phoneDigits(t));
                      setError(null);
                    }}
                    onBlur={() => setTouched((v) => ({ ...v, phone: true }))}
                    invalid={touched.phone && !!phoneError}
                    maxLength={12}
                  />
                </LabeledField>
                {error && <Text style={styles.error}>{error}</Text>}
                <PrimaryButton accent label="Envoyer le code" disabled={!!phoneError} loading={submitting} onPress={sendCode} />
                <Pressable onPress={() => router.back()} hitSlop={8} style={{ alignSelf: 'center' }}>
                  <Text style={styles.link}>Je me souviens, me connecter</Text>
                </Pressable>
              </>
            )}

            {stage === 'code' && challenge && (
              <StepOtp
                phone={phone}
                purpose="reset_password"
                challengeId={challenge.challengeId}
                devCode={challenge.devCode ?? null}
                onChallenge={setChallenge}
                linkedEmail={null}
                verified={!!verificationToken}
                onEditPhone={() => setStage('phone')}
                onVerified={(token) => {
                  setVerificationToken(token);
                  setStage('password');
                }}
                onContinue={() => setStage('password')}
              />
            )}

            {stage === 'password' && (
              <>
                <LabeledField label="Nouveau mot de passe" error={touched.password ? passwordError : null}>
                  <Field
                    accent={colors.orange}
                    icon="lock-closed-outline"
                    secure
                    placeholder="••••••••"
                    value={password}
                    onChangeText={(t) => {
                      setPassword(t);
                      setError(null);
                    }}
                    onBlur={() => setTouched((v) => ({ ...v, password: true }))}
                    invalid={touched.password && !!passwordError}
                    autoComplete="new-password"
                    textContentType="newPassword"
                  />
                </LabeledField>
                <Text style={styles.rules}>{passwordRules.map((r) => r.label).join(' · ')}</Text>
                <LabeledField label="Confirmer le mot de passe" error={touched.confirm ? confirmError : null}>
                  <Field
                    accent={colors.orange}
                    icon="lock-closed-outline"
                    secure
                    placeholder="••••••••"
                    value={confirm}
                    onChangeText={(t) => {
                      setConfirm(t);
                      setError(null);
                    }}
                    onBlur={() => setTouched((v) => ({ ...v, confirm: true }))}
                    invalid={touched.confirm && !!confirmError}
                    autoComplete="new-password"
                    textContentType="newPassword"
                  />
                </LabeledField>
                {error && <Text style={styles.error}>{error}</Text>}
                <PrimaryButton
                  accent
                  label="Changer le mot de passe"
                  disabled={!!passwordError || !!confirmError}
                  loading={submitting}
                  onPress={savePassword}
                />
              </>
            )}
          </KeyboardAwareScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.navy },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 },
  back: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 5,
    paddingLeft: 5,
    paddingRight: 12,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  brandText: { ...typo.smallStrong, color: '#fff', letterSpacing: 0.4 },
  heading: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 26, gap: 6 },
  h1: { ...typo.display, color: '#fff', letterSpacing: -0.5 },
  sub: { ...typo.body, color: 'rgba(255,255,255,0.75)', lineHeight: 21 },
  sheet: { flex: 1, backgroundColor: colors.card, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, overflow: 'hidden' },
  content: { padding: 24, paddingTop: 28, gap: 20 },
  link: { ...typo.bodyStrong, color: colors.orangeText },
  error: { fontSize: 13, fontWeight: '600', color: colors.danger, textAlign: 'center' },
  rules: { ...typo.caption, color: colors.muted2, marginTop: -12 },
});
