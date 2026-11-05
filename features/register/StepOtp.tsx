import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { OtpInput } from '@/components/OtpInput';
import { PrimaryButton } from '@/components/ui';
import { colors, radii, typo } from '@/constants/theme';
import { ApiError } from '@/lib/api';
import {
  maskEmail,
  OTP_LENGTH,
  OTP_RESEND_DELAY_S,
  resendOtp,
  sendOtp,
  verifyOtp,
  type OtpChallenge,
  type OtpChannel,
  type OtpPurpose,
} from './auth';
import { formatPhone, PHONE_PREFIX } from './validation';

const EMPTY = Array<string>(OTP_LENGTH).fill('');

const channelLabel = (channel: OtpChannel, email: string | null) =>
  channel === 'sms' ? 'SMS' : channel === 'whatsapp' ? 'WhatsApp' : `e-mail (${email ? maskEmail(email) : ''})`;

type Props = {
  phone: string;
  /** Why the code was sent: a resend after expiry starts a new verification of the same kind. */
  purpose: OtpPurpose;
  /** Current verification, from POST /auth/otp. */
  challengeId: string;
  /** The server's fixed development code, when it uses one (never with real SMS). */
  devCode: string | null;
  /** A new verification replaced the expired one. */
  onChallenge: (challenge: OtpChallenge) => void;
  linkedEmail: string | null;
  verified: boolean;
  onEditPhone: () => void;
  /** Proof that the phone is verified, valid 15 minutes and usable once. */
  onVerified: (verificationToken: string) => void;
  onContinue: () => void;
};

const messageOf = (err: unknown) => (err instanceof ApiError ? err.message : 'Une erreur est survenue. Réessaie.');

export function StepOtp({ phone, purpose, challengeId, devCode, onChallenge, linkedEmail, verified, onEditPhone, onVerified, onContinue }: Props) {
  const [digits, setDigits] = useState(EMPTY);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const [seconds, setSeconds] = useState(OTP_RESEND_DELAY_S);
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [sending, setSending] = useState<OtpChannel | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const code = digits.join('');
  const complete = code.length === OTP_LENGTH;
  const fullPhone = `${PHONE_PREFIX} ${formatPhone(phone)}`;

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  const verify = useCallback(
    async (value: string) => {
      setVerifying(true);
      setError(null);
      setNotice(null);
      let res;
      try {
        res = await verifyOtp(challengeId, value);
      } catch (err) {
        // Offline or rate-limited: the code may be right, keep it so the student can retry.
        setError(messageOf(err));
        return;
      } finally {
        setVerifying(false);
      }
      if (res.ok) {
        onVerified(res.verificationToken);
        return;
      }
      setDigits(EMPTY);
      setShakeKey((k) => k + 1);
      if (res.reason === 'invalid') {
        setError('Code incorrect');
        setAttemptsLeft(res.attemptsLeft);
      } else {
        setLocked(true);
        setAttemptsLeft(null);
        setError(
          res.reason === 'expired'
            ? 'Ce code a expiré. Demande un nouveau code.'
            : 'Trop de tentatives. Demande un nouveau code.',
        );
      }
    },
    [challengeId, onVerified],
  );

  // Auto-submit as soon as the last digit is entered (typed, pasted or autofilled).
  const changeDigits = (next: string[]) => {
    setDigits(next);
    if (next.every(Boolean) && !verifying && !locked) verify(next.join(''));
  };

  const resend = async (channel: OtpChannel) => {
    setSending(channel);
    setNotice(null);
    try {
      try {
        onChallenge(await resendOtp(challengeId, channel));
      } catch (err) {
        // Expired or locked verification: start a new one for the same phone.
        if (!(err instanceof ApiError && err.code === 'OTP_EXPIRED')) throw err;
        onChallenge(await sendOtp(phone, purpose, channel));
      }
    } catch (err) {
      setSending(null);
      setError(messageOf(err));
      setAttemptsLeft(null);
      return;
    }
    setSending(null);
    setDigits(EMPTY);
    setError(null);
    setAttemptsLeft(null);
    setLocked(false);
    setSeconds(OTP_RESEND_DELAY_S);
    setShowAlternatives(false);
    setNotice(`Un nouveau code a été envoyé par ${channelLabel(channel, linkedEmail)}.`);
  };

  if (verified) {
    return (
      <View style={{ gap: 20 }}>
        <View style={styles.success}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={20} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.successTitle}>Numéro vérifié</Text>
            <Text style={styles.muted}>{fullPhone}</Text>
          </View>
        </View>
        <PrimaryButton accent label="Continuer" onPress={onContinue} />
      </View>
    );
  }

  return (
    <View style={{ gap: 20 }}>
      <Text style={styles.intro}>
        Entre le code à 4 chiffres envoyé au <Text style={styles.strong}>{fullPhone}</Text>{' '}
        <Text style={styles.link} onPress={onEditPhone} accessibilityRole="link">
          Modifier
        </Text>
      </Text>

      <View style={{ gap: 10 }}>
        <OtpInput digits={digits} onChange={changeDigits} disabled={verifying || locked} invalid={!!error} shakeKey={shakeKey} />
        {error && (
          <Text style={styles.error} accessibilityLiveRegion="assertive">
            {error}
            {attemptsLeft !== null &&
              ` · ${attemptsLeft} tentative${attemptsLeft > 1 ? 's' : ''} restante${attemptsLeft > 1 ? 's' : ''}`}
          </Text>
        )}
        {notice && !error && <Text style={styles.notice}>{notice}</Text>}
        {devCode && <Text style={styles.dev}>Code de test : {devCode}</Text>}
      </View>

      <PrimaryButton accent label="Continuer" onPress={() => verify(code)} disabled={!complete || locked} loading={verifying} />

      <View style={{ alignItems: 'center', gap: 14 }}>
        {seconds > 0 ? (
          <Text style={styles.muted}>Renvoyer le code dans 0:{String(seconds).padStart(2, '0')}</Text>
        ) : (
          <Pressable onPress={() => resend('sms')} disabled={!!sending} hitSlop={8} style={styles.resend}>
            {sending === 'sms' && <ActivityIndicator size="small" color={colors.orangeText} />}
            <Text style={styles.link}>{sending === 'sms' ? 'Envoi…' : 'Renvoyer le code'}</Text>
          </Pressable>
        )}

        <Pressable
          onPress={() => setShowAlternatives((v) => !v)}
          hitSlop={8}
          accessibilityState={{ expanded: showAlternatives }}>
          <Text style={styles.muted}>
            Tu n’as pas reçu le code ? <Text style={styles.link}>Autres options</Text>
          </Text>
        </Pressable>

        {showAlternatives && (
          <View style={styles.alternatives}>
            <Pressable style={styles.alt} onPress={() => resend('whatsapp')} disabled={!!sending}>
              <View style={[styles.altIcon, { backgroundColor: colors.successBg }]}>
                <Ionicons name="logo-whatsapp" size={18} color={colors.success} />
              </View>
              <Text style={styles.altText}>{sending === 'whatsapp' ? 'Envoi…' : 'Recevoir par WhatsApp'}</Text>
              {sending === 'whatsapp' ? <ActivityIndicator size="small" color={colors.muted} /> : <Ionicons name="chevron-forward" size={18} color={colors.muted} />}
            </Pressable>
            {linkedEmail && (
              <Pressable style={styles.alt} onPress={() => resend('email')} disabled={!!sending}>
                <View style={[styles.altIcon, { backgroundColor: colors.primarySoft }]}>
                  <Ionicons name="mail-outline" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.altText}>{sending === 'email' ? 'Envoi…' : 'Recevoir par e-mail'}</Text>
                  <Text style={styles.altSub}>{maskEmail(linkedEmail)}</Text>
                </View>
                {sending === 'email' ? <ActivityIndicator size="small" color={colors.muted} /> : <Ionicons name="chevron-forward" size={18} color={colors.muted} />}
              </Pressable>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { ...typo.body, lineHeight: 22, color: colors.muted2 },
  strong: { fontWeight: '700', color: colors.text },
  link: { ...typo.bodyStrong, color: colors.orangeText },
  resend: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  muted: { ...typo.body, color: colors.muted2, textAlign: 'center' },
  error: { fontSize: 13, fontWeight: '600', color: colors.danger, textAlign: 'center' },
  notice: { ...typo.small, color: colors.success, textAlign: 'center' },
  dev: { ...typo.caption, color: colors.muted2, textAlign: 'center' },
  alternatives: { alignSelf: 'stretch', gap: 10 },
  alt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  altIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  altText: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
  altSub: { ...typo.caption, color: colors.muted2, marginTop: 2 },
  success: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: radii.lg,
    backgroundColor: colors.successBg,
  },
  successIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: { ...typo.title, color: colors.text },
});
