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
