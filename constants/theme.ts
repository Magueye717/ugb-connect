// Palette of the welcome screen: navy + orange on white.
import type { TextStyle } from 'react-native';

export const colors = {
  /** Headers, selected states, links and icons. */
  primary: '#0F1B4C',
  primaryDark: '#0A1338',
  /** Light navy tint behind icons and selected rows. */
  primarySoft: '#E9ECF5',
  primarySofter: '#F3F4F9',
  /**
   * Main action buttons (Réserver, Commander, Payer…). Darkest orange that keeps white text
   * readable (4.5:1). The brighter `orange` stays for decoration: highlights, progress, badges.
   */
  accent: '#C4501A',
  accentSoft: '#FFF1E6',
  navy: '#0F1B4C',
  text: '#121A3A',
  muted: '#8A93A8',
  /** Secondary text: ≥ 4.5:1 on white and on the page background (`bg`). */
  muted2: '#5F677D',
  bg: '#ECEFF4',
  // Pure white: the cream tint looked yellowish on the cool grey background.
  card: '#FFFFFF',
  input: '#F3F5FA',
  border: '#E2E6EE',
  success: '#1FA35A',
  successBg: '#E7F8EE',
  warning: '#E3921A',
  warningBg: '#FFF4E3',
  danger: '#E25C6A',
  dangerBg: '#FDECEE',
  orange: '#F07A2A',
  purple: '#7B6CF6',
  green: '#2E9B57',
  tabInactive: '#9AA3B8',
  // Darker shades for small colored text on white (≥ 4.5:1 contrast).
  successText: '#157A43',
  warningText: '#9A5B00',
  orangeText: '#B8540F',
  dangerText: '#C23A4A',
  purpleText: '#5A4BD1',
};

/**
 * Corner scale: xs for small chips and thumbnails, sm for icon tiles and small buttons,
 * md for fields, buttons and inner panels, lg for cards, xl for sheets. Circles use size / 2.
 */
export const radii = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 28,
  pill: 999,
};

export const shadow = {
  card: {
    shadowColor: '#1E2A5A',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  /** Stronger, softer lift for cards that should stand out from the page. */
  raised: {
    shadowColor: '#1E2A5A',
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
};

/**
 * Icons (Ionicons): outline by default; the filled version only for an active or selected state
 * (current tab, chosen campus, picked stop) and for status marks (✓, ✕, star, destination pin).
 */

/**
 * Text scale for a phone, in the system font (SF Pro on iOS, Roboto on Android: the most legible at small sizes):
 * 11 · 12 · 13 · 14 · 15 · 16 · 17 · 20 · 24 · 28. Regular for reading, Bold for emphasis, ExtraBold only for screen
 * titles. `section` is every section header inside a screen ("Lieux incontournables", "Ajouter quelqu’un"…).
 * Spread into styles: `title: { ...typo.title, color: colors.navy }`.
 */
export const typo = {
  label: { fontSize: 11, fontWeight: '700' },
  caption: { fontSize: 12, fontWeight: '400' },
  captionStrong: { fontSize: 12, fontWeight: '700' },
  small: { fontSize: 13, fontWeight: '400' },
  smallStrong: { fontSize: 13, fontWeight: '700' },
  body: { fontSize: 14, fontWeight: '400' },
  bodyStrong: { fontSize: 14, fontWeight: '700' },
  section: { fontSize: 15, fontWeight: '700' },
  title: { fontSize: 16, fontWeight: '700' },
  h3: { fontSize: 17, fontWeight: '700' },
  h2: { fontSize: 20, fontWeight: '800' },
  h1: { fontSize: 24, fontWeight: '800', letterSpacing: -0.2 },
  display: { fontSize: 28, fontWeight: '800', letterSpacing: -0.3 },
} satisfies Record<string, TextStyle>;

/**
 * Motion: short, and only to give feedback or show where things come from. Animate transform and opacity
 * (cheap on entry-level Android). Reanimated follows the system "reduce motion" setting by default.
 */
export const motion = {
  fast: 150,
  base: 250,
  slow: 400,
  /** For things that pop in (badges, check marks, verdicts): quick, a hint of bounce. */
  spring: { damping: 14, stiffness: 220, mass: 0.8 },
  /** For things that slide into place (indicators, sheets): no bounce. */
  glide: { damping: 22, stiffness: 240 },
} as const;
