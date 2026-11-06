// The student's own profile: picture, residence, phone number, e-mail, notification switches, support contacts.
import { api } from '@/lib/api';

const auth = { auth: true } as const;

/** The categories a student can switch off (the in-app list keeps everything). */
export type NotificationPrefs = { social: boolean; cours: boolean; paiements: boolean; campus?: boolean };
export type Support = { phone: string; whatsapp: string; email: string; hours: string };

export const profileApi = {
  /** Optional at sign-up: given once (or read from the student's own card). */
  setStudentNumber: (studentNumber: string) => api<void>('PUT', '/me/student-number', { auth: true, body: { studentNumber } }),
  /** An upload of purpose `avatar`, or null to remove the picture. */
  setAvatar: (photoId: string | null) => api<void>('PUT', '/me/avatar', { ...auth, body: { photoId } }),
  setResidence: (body: { campus: 'campus1' | 'campus2'; onCampus: boolean; village?: string | null; room?: string | null }) => api<void>('PATCH', '/me/student-profile', { ...auth, body }),
  /** After a code sent to the new number (purpose change_phone) and its verification. */
  setPhone: (verificationToken: string) => api<void>('PUT', '/me/phone', { ...auth, body: { verificationToken } }),
  setEmail: (email: string) => api<void>('PUT', '/me/email', { ...auth, body: { email } }),
  removeEmail: () => api<void>('DELETE', '/me/email', auth),
  prefs: () => api<NotificationPrefs>('GET', '/me/notification-preferences', auth),
  setPrefs: (body: NotificationPrefs) => api<void>('PUT', '/me/notification-preferences', { ...auth, body }),
  support: () => api<Support>('GET', '/reference/support'),
};
