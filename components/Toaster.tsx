import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radii, shadow, typo } from '@/constants/theme';
import { dismissToast, subscribeToast, type Toast } from '@/lib/toast';

/**
 * Where `toast()` shows: at the top (never over the tab bar, the space button, a cart bar or the keyboard), for a few
 * seconds, read out by screen readers. A tap closes it.
 */
export function Toaster() {
  const insets = useSafeAreaInsets();
  const [t, setT] = useState<Toast | null>(null);
  useEffect(() => subscribeToast(setT), []);
  useEffect(() => {
    if (!t) return;
    AccessibilityInfo.announceForAccessibility(t.message);
    const timer = setTimeout(() => dismissToast(t.id), t.ms);
    return () => clearTimeout(timer);
  }, [t]);
  if (!t) return null;
  return (
    <Animated.View key={t.id} entering={FadeInUp.duration(200)} exiting={FadeOutUp.duration(180)} style={[styles.wrap, { top: insets.top + 8 }]} pointerEvents="box-none">
      <Pressable style={[styles.toast, shadow.raised]} onPress={() => dismissToast(t.id)} accessibilityRole="alert" accessibilityLiveRegion="polite">
        <Ionicons name={t.tone === 'success' ? 'checkmark-circle' : 'information-circle'} size={20} color={t.tone === 'success' ? '#7EE2A8' : '#fff'} />
        <Text style={styles.text}>{t.message}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: 520, paddingHorizontal: 16, paddingVertical: 12, borderRadius: radii.md, backgroundColor: colors.navy },
  text: { ...typo.bodyStrong, color: '#fff', flexShrink: 1, lineHeight: 19 },
});
