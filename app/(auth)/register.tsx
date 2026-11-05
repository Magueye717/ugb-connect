import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Alert, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Animated, { FadeInLeft, FadeInRight, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandLogo } from '@/components/BrandLogo';
import { colors, radii, typo } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { checkAccount, createAccount, getLinkedEmail, sendOtp, type OtpChallenge } from '@/features/register/auth';
import { ApiError } from '@/lib/api';
import {
  StepIdentification,
  type IdentificationError,
  type IdentificationValues,
} from '@/features/register/StepIdentification';
import { StepOtp } from '@/features/register/StepOtp';
import { StepProfile, type ProfileValues } from '@/features/register/StepProfile';

type Step = 1 | 2 | 3;
const TOTAL_STEPS = 3;

const headings: Record<Step, { title: string; subtitle?: string }> = {
  1: { title: 'Identification', subtitle: 'Ton numéro étudiant et ton numéro de téléphone.' },
  2: { title: 'Vérification', subtitle: 'On vérifie que ce numéro est bien le tien.' },
  3: { title: 'Ton profil', subtitle: 'Dernière étape : ton UFR, ta région, ton campus et ton logement.' },
};

// Inscription in 3 steps. All values live here so they survive going back and forth.
export default function RegisterScreen() {
  const { completeSignIn } = useAuth();
  const insets = useSafeAreaInsets();
  const [step, setStepState] = useState<Step>(1);
  // Slide direction of the next step: forward comes from the right, back from the left.
  const [forward, setForward] = useState(true);
  const setStep = useCallback((next: Step | ((s: Step) => Step)) => {
    setStepState((s) => {
      const n = typeof next === 'function' ? next(s) : next;
      setForward(n > s);
      return n;
    });
  }, []);
  const [identity, setIdentity] = useState<IdentificationValues>({ studentId: '', phone: '' });
  const [profile, setProfile] = useState<ProfileValues>({
    firstName: '',
    lastName: '',
    campus: null,
    onCampus: true,
    village: null,
    room: '',
    ufr: null,
    region: null,
    password: '',
    confirm: '',
    accepted: false,
  });
  const [linkedEmail, setLinkedEmail] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  // Student ID + phone pair that passed OTP verification, with the server's proof (valid 15 min, single use);
  // editing either requires a new code.
  const [verifiedFor, setVerifiedFor] = useState<string | null>(null);
  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [identError, setIdentError] = useState<IdentificationError>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const identityKey = `${identity.studentId}|${identity.phone}`;
  const verified = verifiedFor === identityKey;

  const goBack = useCallback(() => {
    if (step > 1) setStep((s) => (s - 1) as Step);
    else router.back();
    return true;
  }, [step, setStep]);

  // Android hardware back follows the steps too.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', goBack);
    return () => sub.remove();
  }, [goBack]);

  const submitIdentification = async () => {
    setSubmitting(true);
    setIdentError(null);
    try {
      if (verified) {
        setStep(2);
        return;
      }
      const { conflict, existingAccount } = await checkAccount(identity.studentId, identity.phone);
      if (conflict) {
        setIdentError({ exists: conflict });
        return;
      }
      // Given a role in a team (a shop, an organizer…) with this number: sign-up adds the student space to that account.
      if (existingAccount) {
        const go = await new Promise<boolean>((resolve) =>
          Alert.alert(
            'Ce numéro a déjà un compte',
            'Tu fais partie d’une équipe sur UGB Campus. Ton profil étudiant s’ajoute à ce compte : tes rôles restent, et le mot de passe que tu vas choisir remplace l’ancien.',
            [
              { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Continuer', onPress: () => resolve(true) },
            ],
            { cancelable: true, onDismiss: () => resolve(false) },
          ),
        );
        if (!go) return;
      }
      const [email, challenge] = await Promise.all([getLinkedEmail(identity.studentId), sendOtp(identity.phone, 'register')]);
      setLinkedEmail(email);
      setChallenge(challenge);
      setStep(2);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PHONE_TAKEN') setIdentError({ exists: 'phone' });
      else setIdentError({ message: err instanceof ApiError ? err.message : 'Une erreur est survenue. Réessaie.' });
    } finally {
      setSubmitting(false);
    }
  };

  const submitProfile = async () => {
    if (!profile.campus || !profile.ufr || !profile.region || (profile.onCampus && !profile.village) || !verificationToken) return;
    setSubmitting(true);
    setProfileError(null);
    try {
      const tokens = await createAccount({
        verificationToken,
        studentId: identity.studentId,
        firstName: profile.firstName.trim(),
        lastName: profile.lastName.trim(),
        campus: profile.campus,
        onCampus: profile.onCampus,
        village: profile.onCampus ? profile.village : null,
        room: profile.onCampus ? profile.room : null,
        ufr: profile.ufr,
        region: profile.region,
        password: profile.password,
      });
      await completeSignIn(tokens);
    } catch (err) {
      setSubmitting(false);
      if (!(err instanceof ApiError)) {
        setProfileError('Impossible de créer le compte. Réessaie.');
        return;
      }
      setProfileError(err.message);
      // The proof of the phone is spent or too old: verify the number again.
      if (err.code === 'VERIFICATION_EXPIRED') {
        setVerifiedFor(null);
        setVerificationToken(null);
        setIdentError({ message: 'La vérification de ton numéro a expiré. Appuie sur Continuer pour recevoir un nouveau code.' });
        setStep(1);
      }
      // A number was taken meanwhile: both are on step 1.
      if (err.code === 'STUDENT_NUMBER_TAKEN' || err.code === 'PHONE_TAKEN') {
        setIdentError({ exists: err.code === 'PHONE_TAKEN' ? 'phone' : 'student_number' });
        setStep(1);
      }
    }
  };

  const heading = headings[step];

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      {/* Navy header with the brand, like the welcome screen. */}
      <SafeAreaView edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={goBack} style={styles.back} accessibilityRole="button" accessibilityLabel="Retour">
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </Pressable>
          <View style={styles.brand}>
            <BrandLogo size={28} />
            <Text style={styles.brandText}>UGB Campus</Text>
          </View>
          <Text style={styles.stepLabel}>
            {step}/{TOTAL_STEPS}
          </Text>
        </View>
        <View
          style={styles.bars}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 1, max: TOTAL_STEPS, now: step }}>
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <ProgressBar key={i} filled={i < step} />
          ))}
        </View>
        <Animated.View key={step} entering={(forward ? FadeInRight : FadeInLeft).duration(260)} style={styles.heading}>
          <Text style={styles.h1}>{heading.title}</Text>
          {heading.subtitle && <Text style={styles.subtitle}>{heading.subtitle}</Text>}
        </Animated.View>
      </SafeAreaView>

      {/* Light sheet for the form: easy to read, rounded like a card over the navy. */}
      <View style={styles.sheet}>
        <KeyboardAwareScrollView style={{ flex: 1 }} bottomOffset={24}
            contentContainerStyle={[styles.content, { paddingBottom: 48 + insets.bottom }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <Animated.View key={step} entering={(forward ? FadeInRight : FadeInLeft).duration(300)}>
              {step === 1 && (
                <StepIdentification
                  values={identity}
                  onChange={(patch) => {
                    setIdentity((v) => ({ ...v, ...patch }));
                    setIdentError(null);
                  }}
                  onSubmit={submitIdentification}
                  submitting={submitting}
                  submitError={identError}
                />
              )}
              {step === 2 && (
                <StepOtp
                  phone={identity.phone}
                  purpose="register"
                  challengeId={challenge?.challengeId ?? ''}
                  devCode={challenge?.devCode ?? null}
                  onChallenge={setChallenge}
                  linkedEmail={linkedEmail}
                  verified={verified}
                  onEditPhone={() => setStep(1)}
                  onVerified={(token) => {
                    setVerifiedFor(identityKey);
                    setVerificationToken(token);
                    setStep(3);
                  }}
                  onContinue={() => setStep(3)}
                />
              )}
              {step === 3 && (
                <StepProfile
                  values={profile}
                  onChange={(patch) => setProfile((v) => ({ ...v, ...patch }))}
                  onSubmit={submitProfile}
                  submitting={submitting}
                  submitError={profileError}
                />
              )}
            </Animated.View>
          </KeyboardAwareScrollView>
      </View>
    </View>
  );
}

/** One segment of the progress bar; fills with orange when its step is reached. */
function ProgressBar({ filled }: { filled: boolean }) {
  const fill = useAnimatedStyle(() => ({ width: withTiming(filled ? '100%' : '0%', { duration: 350 }) }));
  return (
    <View style={styles.bar}>
      <Animated.View style={[styles.barFill, fill]} />
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
  stepLabel: { ...typo.bodyStrong, width: 44, textAlign: 'right', color: 'rgba(255,255,255,0.7)' },
  bars: { flexDirection: 'row', gap: 6, paddingHorizontal: 20, paddingTop: 18 },
  bar: { flex: 1, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3, backgroundColor: colors.orange },
  heading: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 26, gap: 6 },
  h1: { ...typo.display, color: '#fff', letterSpacing: -0.5 },
  subtitle: { ...typo.body, color: 'rgba(255,255,255,0.75)', lineHeight: 21 },
  sheet: { flex: 1, backgroundColor: colors.card, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, overflow: 'hidden' },
  content: { padding: 24, paddingTop: 28, paddingBottom: 48 },
});
