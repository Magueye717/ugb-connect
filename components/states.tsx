import { Ionicons } from '@expo/vector-icons';
import { useNetworkState } from 'expo-network';
import { useEffect, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View, type DimensionValue } from 'react-native';
import Animated, { FadeInUp, FadeOutUp, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radii, typo } from '@/constants/theme';
import { serverReachability } from '@/lib/api';

type Icon = keyof typeof Ionicons.glyphMap;

/** Nothing to show yet: icon, short title, one helpful line, optional action. */
export function EmptyState({ icon, title, text, action }: { icon: Icon; title: string; text?: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={styles.state}>
      <View style={styles.stateIcon}>
        <Ionicons name={icon} size={26} color={colors.primary} />
      </View>
      <Text style={styles.stateTitle}>{title}</Text>
      {text && <Text style={styles.stateText}>{text}</Text>}
      {action && (
        <Pressable onPress={action.onPress} style={styles.stateAction} hitSlop={6} accessibilityRole="button">
          <Text style={styles.stateActionText}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Something failed (network, server): say it plainly and offer to try again. */
export function ErrorState({ text = 'Vérifie ta connexion et réessaie.', onRetry }: { text?: string; onRetry: () => void }) {
  return (
    <View style={styles.state} accessibilityLiveRegion="polite">
      <View style={[styles.stateIcon, { backgroundColor: colors.dangerBg }]}>
        <Ionicons name="cloud-offline-outline" size={26} color={colors.dangerText} />
      </View>
      <Text style={styles.stateTitle}>Impossible de charger</Text>
      <Text style={styles.stateText}>{text}</Text>
      <Pressable onPress={onRetry} style={styles.stateAction} hitSlop={6} accessibilityRole="button">
        <Ionicons name="refresh-outline" size={16} color={colors.primary} />
        <Text style={styles.stateActionText}>Réessayer</Text>
      </Pressable>
    </View>
  );
}

/** Pulsing grey block, to stand in for content while it loads. */
export function Skeleton({ width = '100%', height = 16, radius = radii.xs }: { width?: DimensionValue; height?: number; radius?: number }) {
  const opacity = useSharedValue(0.5);
  useEffect(() => {
    opacity.set(withRepeat(withTiming(1, { duration: 700 }), -1, true));
  }, [opacity]);
  const pulse = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: colors.border }, pulse]} />;
}

/** Placeholder card with the shape of a list item (photo + two lines). */
export function SkeletonCard() {
  return (
    <View style={styles.skeletonCard} accessibilityLabel="Chargement">
      <Skeleton width={72} height={72} radius={radii.sm} />
      <View style={{ flex: 1, gap: 8 }}>
        <Skeleton width="70%" height={16} />
        <Skeleton width="45%" height={12} />
      </View>
    </View>
  );
}

/** Banner on top of every screen while the phone has no connection. */
export function OfflineBanner() {
  const net = useNetworkState();
  const insets = useSafeAreaInsets();
  const reached = useSyncExternalStore(serverReachability.subscribe, serverReachability.get);
  // No network at all: offline. « No internet » (the phone's own check, which can stay stale after the connection is
  // back): offline unless the server has just answered, so a refresh that works makes the banner go away.
  const offline = net.isConnected === false || (net.isInternetReachable === false && reached !== true) || (reached === false && net.isConnected !== true);
  if (!offline) return null;
  return (
    <Animated.View
      entering={FadeInUp}
      exiting={FadeOutUp}
      style={[styles.offline, { paddingTop: insets.top + 6 }]}
      accessibilityLiveRegion="assertive"
      pointerEvents="none">
      <Ionicons name="cloud-offline-outline" size={16} color="#fff" />
      <Text style={styles.offlineText}>Pas de connexion · les infos peuvent ne pas être à jour</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  state: { alignItems: 'center', gap: 8, paddingVertical: 32, paddingHorizontal: 24 },
  stateIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  stateTitle: { ...typo.title, color: colors.navy, textAlign: 'center' },
  stateText: { ...typo.body, color: colors.muted2, textAlign: 'center', lineHeight: 20 },
  stateAction: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, minHeight: 44, paddingHorizontal: 18, borderRadius: radii.pill, backgroundColor: colors.primarySoft },
  stateActionText: { ...typo.bodyStrong, color: colors.primary },
  skeletonCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radii.lg, backgroundColor: colors.card },
  offline: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: 8,
    paddingHorizontal: 16,
    backgroundColor: colors.dangerText,
  },
  offlineText: { ...typo.smallStrong, color: '#fff' },
});
