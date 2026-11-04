import { Ionicons } from '@expo/vector-icons';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

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
  const { current, spaces, setSpace } = useAuth();
  const target = spaces.find((x) => x.key === vers) ?? current;

  useEffect(() => {
    if (target && target.key !== current?.key) setSpace(target.key);
  }, [target, current, setSpace]);

  if (!target) return <Redirect href="/(auth)/welcome" />;
  if (target.key === current?.key) return <Redirect href={spaceHome(target.type)} />;

  const info = spaceInfo(target);
  return (
    <View style={styles.root}>
      <Ionicons name={info.icon} size={40} color="#fff" />
      <Text style={styles.text}>{info.title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center', gap: 12 },
  text: { ...typo.h3, color: '#fff' },
});
