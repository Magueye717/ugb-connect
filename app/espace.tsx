import { Ionicons } from '@expo/vector-icons';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { colors, typo } from '@/constants/theme';
import { spaceInfo } from '@/components/SpacesList';
import { spaceHome, useAuth } from '@/context/AuthContext';

/**
 * Switching space goes through this neutral screen: the guards flip while it's on screen, never under
 * a screen they protect (the router loops when the focused screen loses its guard mid-redirect).
 * It also makes the change visible: different tabs, different job.
 */
export default function SwitchSpace() {
  // `vers`: a space's key ("shop:<orgId>"): from "Mes espaces", or a notification ("you joined the team").
  const { vers } = useLocalSearchParams<{ vers?: string }>();
  const { current, spaces, setSpace, user } = useAuth();
  const target = spaces.find((x) => x.key === vers) ?? current;

  useEffect(() => {
    if (target && target.key !== current?.key) setSpace(target.key);
  }, [target, current, setSpace]);

  if (!target) return <Redirect href="/(auth)/welcome" />;
  if (target.key === current?.key) return <Redirect href={spaceHome(target.type, user?.roles)} />;

  const info = spaceInfo(target);
  return (
    <Animated.View entering={FadeIn.duration(160)} style={styles.root}>
      <Animated.View entering={ZoomIn.duration(220)} style={styles.badge}>
        <Ionicons name={info.icon} size={34} color="#fff" />
      </Animated.View>
      <Text style={styles.text}>{info.title}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center', gap: 12 },
  badge: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  text: { ...typo.h3, color: '#fff', textAlign: 'center', paddingHorizontal: 24 },
});
