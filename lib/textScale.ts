import { Dimensions, PixelRatio, StyleSheet, type TextStyle } from 'react-native';

/**
 * The same text on every phone. Two things made it differ: the system text size (some Android phones ship at 115 %,
 * others at 100 %, plus the user's own setting) and the screen width (360 to 430 dp). Every `StyleSheet.create` of
 * the app goes through here once, at startup: font sizes and line heights are adjusted so that
 *   - the system text size counts between 90 % and 120 % (still bigger for those who need it, never a broken layout);
 *   - narrow phones get slightly smaller text, wide ones slightly larger (± 6 %), around a 390 dp reference.
 * Loaded before anything else (index.ts), so no style is created before the patch.
 */
const BASE_WIDTH = 390;
const TEXT_MIN = 0.9;
const TEXT_MAX = 1.2;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const { width, height } = Dimensions.get('window');
const short = Math.min(width, height) || BASE_WIDTH;
const system = PixelRatio.getFontScale() || 1;

/** What every font size is multiplied by (the system text size is then applied on top by the OS). */
export const TEXT_FACTOR = clamp(short / BASE_WIDTH, 0.94, 1.06) * (clamp(system, TEXT_MIN, TEXT_MAX) / system);

const round = (n: number) => Math.round(n * 2) / 2;

function scaleStyle(style: unknown): unknown {
  if (!style || typeof style !== 'object' || Array.isArray(style)) return style;
  const s = style as TextStyle;
  if (typeof s.fontSize !== 'number' && typeof s.lineHeight !== 'number') return style;
  return {
    ...s,
    ...(typeof s.fontSize === 'number' ? { fontSize: round(s.fontSize * TEXT_FACTOR) } : {}),
    ...(typeof s.lineHeight === 'number' ? { lineHeight: round(s.lineHeight * TEXT_FACTOR) } : {}),
  };
}

/** Text sizes written inline (outside a StyleSheet): the same adjustment. */
export const fs = (size: number) => round(size * TEXT_FACTOR);

if (Math.abs(TEXT_FACTOR - 1) > 0.01) {
  const create = StyleSheet.create;
  // Read-only in the types only: the object is a plain module export.
  (StyleSheet as { create: unknown }).create = ((styles: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    for (const key in styles) out[key] = scaleStyle(styles[key]);
    return create(out as never);
  }) as typeof StyleSheet.create;
}
