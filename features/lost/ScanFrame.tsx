import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { colors, radii, typo } from '@/constants/theme';
import type { ScanPhase } from '@/features/lost/useAutoScan';

type Props = { width: number; height: number; phase: ScanPhase };

/**
 * The card-shaped target of a scan (ID-1 format): corner marks, and a line sweeping up and down while it scans (none
 * before « Scanner » is pressed, nor when the phone asks for reduced motion). « Lecture de la carte… » over it while a frame is being read.
 */
export function ScanFrame({ width, height, phase }: Props) {
  const reduced = useReducedMotion();
  const sweep = useSharedValue(0);

  useEffect(() => {
    if (reduced || phase !== 'scanning') {
      cancelAnimation(sweep);
      return;
    }
    sweep.set(withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.quad) }), -1, true));
    return () => cancelAnimation(sweep);
  }, [reduced, phase, sweep]);

  const line = useAnimatedStyle(() => ({ transform: [{ translateY: sweep.value * (height - 4) }] }));

  return (
    <View style={{ width, height }}>
      {/* Four corners, like a scanner's viewfinder. */}
      <View style={[styles.corner, styles.tl]} />
      <View style={[styles.corner, styles.tr]} />
      <View style={[styles.corner, styles.bl]} />
      <View style={[styles.corner, styles.br]} />
      {phase === 'scanning' && !reduced && <Animated.View style={[styles.line, line]} />}
      {phase === 'reading' && (
        <View style={styles.reading}>
          <ActivityIndicator color="#fff" />
          <Text style={styles.readingText}>Lecture de la carte…</Text>
        </View>
      )}
    </View>
  );
}

const C = 26;
const styles = StyleSheet.create({
  corner: { position: 'absolute', width: C, height: C, borderColor: '#fff' },
  tl: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: radii.md },
  tr: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: radii.md },
  bl: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: radii.md },
  br: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: radii.md },
  line: {
    position: 'absolute',
    left: 10,
    right: 10,
    top: 0,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.8,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  reading: { ...StyleSheet.absoluteFill, borderRadius: radii.md, backgroundColor: 'rgba(10,16,40,0.6)', alignItems: 'center', justifyContent: 'center', gap: 8 },
  readingText: { ...typo.bodyStrong, color: '#fff' },
});
