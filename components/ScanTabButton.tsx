import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { colors, motion } from '@/constants/theme';
import { haptics } from '@/lib/haptics';

type Props = {
  onPress?: (e: GestureResponderEvent) => void;
  onLongPress?: ((e: GestureResponderEvent) => void) | null;
  /** The Scanner tab is on screen. */
  selected: boolean;
  label?: string;
};

const SIZE = 58;

/**
 * The organizer's Scanner tab: a round QR button raised above the tab bar (one tap away at the bus door), with a small
 * label under it. A soft ring pulses around it while another tab is shown, to say "scan from here"; it stops on the
 * scanner itself and when the phone asks for reduced motion. Pressing it sinks it a little.
 */
export function ScanTabButton({ onPress, onLongPress, selected, label = 'Scanner' }: Props) {
  const reduced = useReducedMotion();
  const pulse = useSharedValue(0);
  const press = useSharedValue(1);

  useEffect(() => {
    if (reduced || selected) {
      cancelAnimation(pulse);
      pulse.set(withTiming(0, { duration: motion.fast }));
      return;
    }
    // Out, fade, rest: one breath every 2.4 s, gentle on the battery.
    pulse.set(withRepeat(withSequence(withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }), withTiming(1, { duration: 1000 })), -1, false));
    return () => cancelAnimation(pulse);
  }, [reduced, selected, pulse]);

  const ring = useAnimatedStyle(() => ({
    opacity: pulse.value === 0 ? 0 : 0.45 * (1 - pulse.value),
    transform: [{ scale: 1 + pulse.value * 0.45 }],
  }));
  const button = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));

  return (
    <Pressable
      onPress={(e) => {
        haptics.select();
        onPress?.(e);
      }}
      onLongPress={onLongPress ?? undefined}
      onPressIn={() => press.set(withSpring(0.92, motion.spring))}
      onPressOut={() => press.set(withSpring(1, motion.spring))}
      style={styles.slot}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel="Scanner un billet">
      <View style={styles.lift}>
        <Animated.View style={[styles.ring, ring]} pointerEvents="none" />
        <Animated.View style={[styles.button, selected && styles.buttonOn, button]}>
          <Ionicons name={selected ? 'qr-code' : 'qr-code-outline'} size={26} color="#fff" />
        </Animated.View>
      </View>
      <Text style={[styles.label, selected && styles.labelOn]} maxFontSizeMultiplier={1.3} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  slot: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  // Raised: half of the button sits above the tab bar.
  lift: { width: SIZE, height: SIZE, marginTop: -SIZE / 2, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: SIZE, height: SIZE, borderRadius: SIZE / 2, backgroundColor: colors.accent },
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    // A white ring separates it from the screen behind, and a soft shadow lifts it.
    borderWidth: 4,
    borderColor: colors.card,
    elevation: 8,
    shadowColor: '#1E2A5A',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  buttonOn: { backgroundColor: colors.primary },
  label: { fontSize: 11, marginTop: 2, fontWeight: '600', color: colors.muted2 },
  labelOn: { color: colors.primary, fontWeight: '700' },
});
