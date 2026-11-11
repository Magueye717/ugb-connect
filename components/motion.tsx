import { useEffect, type ReactNode } from 'react';
import { StyleSheet, type ColorValue } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  LayoutAnimationConfig,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';

import { motion } from '@/constants/theme';

/** Pops in with a hint of bounce: badges, check marks, an avatar taking a seat. */
export const popIn = ZoomIn.springify().damping(motion.spring.damping).stiffness(motion.spring.stiffness).mass(motion.spring.mass);
/** Rises into place: a ticket, a card that just appeared. */
export const riseIn = FadeInDown.springify().damping(motion.glide.damping).stiffness(motion.glide.stiffness);
export const fadeIn = FadeIn.duration(motion.base);

/**
 * Pops its child each time `id` changes, but not when the screen first shows:
 * a list opening shouldn't bounce, a seat being taken should.
 */
export function PopOnChange({ id, children }: { id: string | number; children: ReactNode }) {
  return (
    <LayoutAnimationConfig skipEntering>
      <Animated.View key={id} entering={popIn}>
        {children}
      </Animated.View>
    </LayoutAnimationConfig>
  );
}

/**
 * An arrow that nudges forward every few seconds: "tap here, it goes somewhere" (an invitation card). Still when the
 * system asks to reduce motion.
 */
export function NudgeRight({ children, distance = 4, everyMs = 2400 }: { children: ReactNode; distance?: number; everyMs?: number }) {
  const reduced = useReducedMotion();
  const x = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    const step = { duration: 220, easing: Easing.out(Easing.quad) };
    x.set(withRepeat(withSequence(withDelay(everyMs, withTiming(distance, step)), withTiming(0, step), withTiming(distance, step), withTiming(0, step)), -1, false));
  }, [x, reduced, distance, everyMs]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/**
 * A ring that keeps expanding behind a dot: "this is happening now" (current order step).
 * Not shown when the system asks to reduce motion, since it never stops.
 */
export function LivePulse({ color, size }: { color: ColorValue; size: number }) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }), -1, false));
  }, [t]);
  const ring = useAnimatedStyle(() => ({ opacity: 0.45 * (1 - t.get()), transform: [{ scale: 1 + t.get() * 0.9 }] }));
  if (reduced) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { borderRadius: size / 2, backgroundColor: color }, ring]}
    />
  );
}

/** « Recherche… »: three dots lighting up one after the other, as long as it's shown (still, with reduced motion). */
export function SearchingDots({ color, size = 5 }: { color: ColorValue; size?: number }) {
  return (
    <Animated.View style={{ flexDirection: 'row', gap: size * 0.7, alignItems: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {[0, 1, 2].map((i) => (
        <Dot key={i} index={i} color={color} size={size} />
      ))}
    </Animated.View>
  );
}

function Dot({ index, color, size }: { index: number; color: ColorValue; size: number }) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0.3);
  useEffect(() => {
    if (reduced) return;
    t.set(withDelay(index * 220, withRepeat(withSequence(withTiming(1, { duration: 420 }), withTiming(0.3, { duration: 420 })), -1, false)));
  }, [t, index, reduced]);
  const style = useAnimatedStyle(() => ({ opacity: t.get(), transform: [{ scale: 0.8 + t.get() * 0.3 }] }));
  return <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style]} />;
}

/**
 * A small hop every few seconds, to say « this is open, join it » (an open taxi trip). Still with reduced motion.
 */
export function Hop({ children, height = 5, everyMs = 2600 }: { children: ReactNode; height?: number; everyMs?: number }) {
  const reduced = useReducedMotion();
  const y = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    y.set(
      withRepeat(
        withSequence(withDelay(everyMs, withTiming(-height, { duration: 180, easing: Easing.out(Easing.quad) })), withTiming(0, { duration: 260, easing: Easing.bounce })),
        -1,
        false,
      ),
    );
  }, [y, height, everyMs, reduced]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}
