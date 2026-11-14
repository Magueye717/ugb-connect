import { Ionicons } from '@expo/vector-icons';
import { useLayoutEffect, useState, type ReactNode } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, typo } from '@/constants/theme';
import { haptics } from '@/lib/haptics';

const ACTION = 96;
/** Past this, letting go deletes at once (a long swipe), without tapping the red button. */
const FULL = 200;

/**
 * A card that slides left to show a red « Supprimer » behind it (a long swipe deletes at once). Only horizontal drags
 * are taken, so the list still scrolls. `enabled: false` (an event on sale): the card doesn't move.
 * Screen readers get a « Supprimer » action instead of the gesture.
 */
export function SwipeToDelete({ children, onDelete, enabled = true, label = 'Supprimer' }: { children: ReactNode; onDelete: () => void; enabled?: boolean; label?: string }) {
  const [open, setOpen] = useState(false);
  // The gesture is made once (a controller per card): it reads the latest props given by `update`.
  const [ctl] = useState(() => new SwipeController(setOpen));
  useLayoutEffect(() => ctl.update(enabled, onDelete));

  if (!enabled) return <>{children}</>;
  return (
    <View
      style={styles.wrap}
      accessible={false}
      accessibilityActions={[{ name: 'delete', label }]}
      onAccessibilityAction={(e) => e.nativeEvent.actionName === 'delete' && onDelete()}>
      <Pressable style={styles.action} onPress={ctl.remove} accessibilityRole="button" accessibilityLabel={label}>
        <Ionicons name="trash-outline" size={22} color="#fff" />
        <Text style={styles.actionText}>{label}</Text>
      </Pressable>
      <Animated.View style={{ transform: [{ translateX: ctl.x }] }} {...ctl.pan.panHandlers}>
        {children}
        {/* Open: a tap on the card closes it (rather than opening the event). */}
        {open && <Pressable style={StyleSheet.absoluteFill} onPress={() => ctl.settle(0)} accessibilityLabel="Fermer" />}
      </Animated.View>
    </View>
  );
}

/** The card's position and its drag: made once per card, outside render. */
class SwipeController {
  readonly x = new Animated.Value(0);
  private latest: { enabled: boolean; onDelete: () => void } = { enabled: true, onDelete: () => undefined };
  private open = false;
  constructor(private readonly setOpen: (open: boolean) => void) {}

  update(enabled: boolean, onDelete: () => void) {
    this.latest = { enabled, onDelete };
  }
  settle = (to: number) => {
    this.open = to !== 0;
    this.setOpen(this.open);
    Animated.spring(this.x, { toValue: to, useNativeDriver: true, bounciness: 0, speed: 18 }).start();
  };
  remove = () => {
    haptics.select();
    this.settle(0);
    this.latest.onDelete();
  };
  readonly pan = PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => this.latest.enabled && Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_, g) => this.x.setValue(Math.min(0, (this.open ? -ACTION : 0) + g.dx)),
    onPanResponderRelease: (_, g) => {
      const end = (this.open ? -ACTION : 0) + g.dx;
      if (end < -FULL) return this.remove();
      this.settle(end < -ACTION / 2 || g.vx < -0.6 ? -ACTION : 0);
    },
    onPanResponderTerminate: () => this.settle(this.open ? -ACTION : 0),
  });
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radii.lg },
  action: { position: 'absolute', top: 0, bottom: 0, right: 0, width: ACTION + 40, paddingLeft: 40, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: radii.lg },
  actionText: { ...typo.captionStrong, color: '#fff' },
});
