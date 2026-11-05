// The terms of use and the privacy policy: served by the backend (changed there, without an app update).
import { api } from '@/lib/api';

export type LegalDoc = 'conditions' | 'confidentialite';

export type LegalDocument = {
  doc: LegalDoc;
  title: string;
  /** What a student accepts at sign-up. */
  version: string;
  /** "2026-11-04" */
  updatedAt: string;
  sections: { title: string; paragraphs: string[] }[];
};

/** Public: readable before any account exists (welcome screen, sign-up). */
export const legalApi = { get: (doc: LegalDoc) => api<LegalDocument>('GET', `/reference/legal/${doc}`) };

/** Where each one opens. */
export const legalHref = (doc: LegalDoc) => `/legal/${doc}` as const;
