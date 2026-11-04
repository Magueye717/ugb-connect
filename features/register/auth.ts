// Auth API used by sign-up, sign-in and "mot de passe oublié". Errors are ApiError (lib/api): their `message`
// is French and can be shown as is; `code` drives the screen logic.
import { api, ApiError, deviceInfo, type Tokens } from '@/lib/api';

import type { CampusKey } from './validation';

export const OTP_LENGTH = 4;
export const OTP_RESEND_DELAY_S = 60;

/** Code accepted by the backend in development (OTP_DEV_MODE). Shown on screen in development builds only. */
export const DEV_OTP = '1234';

/** Version of the terms of use the student accepts at sign-up. */
export const TERMS_VERSION = '2026-01';

export type OtpChannel = 'sms' | 'whatsapp' | 'email';
export type OtpPurpose = 'register' | 'reset_password' | 'change_phone';

/** A verification in progress: the id the next calls refer to. */
export type OtpChallenge = { challengeId: string; expiresIn: number; resendAfter: number; codeLength: number };

export type VerifyResult =
  | { ok: true; verificationToken: string }
  | { ok: false; reason: 'invalid'; attemptsLeft: number }
  | { ok: false; reason: 'expired' | 'locked' };

/** Which of the two numbers already has an account. */
export type AccountConflict = 'student_number' | 'phone';

/**
 * Step 1: the number that already has an account (`conflict`), or none. `existingAccount`: the phone has an account
 * that isn't a student's (someone given a role in a team): sign-up completes it, the roles stay.
 */
export async function checkAccount(studentId: string, phone: string): Promise<{ conflict: AccountConflict | null; existingAccount: boolean }> {
  const res = await api<{ available: boolean; conflict?: AccountConflict; existingAccount?: boolean }>('POST', '/auth/register/check', {
    body: { studentNumber: studentId, phone },
  });
  return { conflict: res.available ? null : (res.conflict ?? 'phone'), existingAccount: !!res.existingAccount };
}

/** The backend has no university directory yet, so no e-mail fallback for the code (open question Q-14). */
export async function getLinkedEmail(_studentId: string): Promise<string | null> {
  return null;
}

export function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  return `${user.slice(0, 2)}•••${user.slice(-1)}@${domain}`;
}

export function sendOtp(phone: string, purpose: OtpPurpose, channel: OtpChannel = 'sms'): Promise<OtpChallenge> {
  return api<OtpChallenge>('POST', '/auth/otp', { body: { phone, purpose, channel } });
}

/** New code on the same challenge (after the 60 s delay). */
export function resendOtp(challengeId: string, channel: OtpChannel = 'sms'): Promise<OtpChallenge> {
  return api<OtpChallenge>('POST', `/auth/otp/${challengeId}/resend`, { body: { channel } });
}

export async function verifyOtp(challengeId: string, code: string): Promise<VerifyResult> {
  try {
    const { verificationToken } = await api<{ verificationToken: string }>('POST', `/auth/otp/${challengeId}/verify`, { body: { code } });
    return { ok: true, verificationToken };
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
    if (err.code === 'OTP_INVALID') return { ok: false, reason: 'invalid', attemptsLeft: Number(err.details.attemptsLeft ?? 0) };
    if (err.code === 'OTP_EXPIRED') return { ok: false, reason: 'expired' };
    if (err.code === 'OTP_LOCKED') return { ok: false, reason: 'locked' };
    throw err;
  }
}

export type NewAccount = {
  verificationToken: string;
  studentId: string;
  firstName: string;
  lastName: string;
  campus: CampusKey;
  onCampus: boolean;
  village: string | null;
  room: string | null;
  ufr: string;
  region: string;
  password: string;
};

/** Step 3: creates the account for the verified phone and returns the session tokens (the student is signed in). */
export async function createAccount(input: NewAccount): Promise<Tokens> {
  const { tokens } = await api<{ userId: string; tokens: Tokens }>('POST', '/auth/register', {
    body: {
      verificationToken: input.verificationToken,
      studentNumber: input.studentId,
      firstName: input.firstName,
      lastName: input.lastName,
      campus: input.campus,
      onCampus: input.onCampus,
      village: input.onCampus ? input.village : null,
      room: input.onCampus ? input.room : null,
      ufr: input.ufr,
      region: input.region,
      password: input.password.trim(),
      termsVersion: TERMS_VERSION,
      device: deviceInfo(),
    },
  });
  return tokens;
}

/** Sign-in with a phone number (or a student number) and a password. */
export async function signIn(identifier: string, password: string): Promise<Tokens> {
  const { tokens } = await api<{ userId: string; tokens: Tokens }>('POST', '/auth/login', {
    body: { identifier: identifier.trim(), password: password.trim(), device: deviceInfo() },
  });
  return tokens;
}

/** Last step of "mot de passe oublié": every existing session ends. */
export function resetPassword(verificationToken: string, newPassword: string): Promise<void> {
  return api<void>('POST', '/auth/password/reset', { body: { verificationToken, newPassword: newPassword.trim() } });
}
