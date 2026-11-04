import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AdCarousel, AlertStrip, CaravanCard, EventCard, Headlines, OriginPrompt, RestoCard, TaxiCard } from '@/components/home';
import { InProgress } from '@/components/InProgress';
import { colors, radii, typo } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { bellLabel, useNotifications } from '@/context/NotificationsContext';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { unreadCount } = useNotifications();
  const name = user?.firstName ?? 'Awa';

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.row}>
          <Pressable style={styles.avatar} onPress={() => router.push('/(tabs)/profil')} accessibilityRole="button" accessibilityLabel="Mon profil">
            {user?.avatarUrl ? <Image source={{ uri: user.avatarUrl }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Text style={styles.avatarText}>{user?.initials ?? 'AD'}</Text>}
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.hello}>Bonjour, {name}</Text>
            <Text style={styles.campus}>{user?.campus ?? 'UGB · Campus social'}</Text>
          </View>
          <Pressable
            onPress={() => router.push('/notifications')}
            style={styles.bell}
            accessibilityRole="button"
            accessibilityLabel={bellLabel(unreadCount)}>
            <Ionicons name="notifications-outline" size={22} color="#fff" />
            {unreadCount > 0 && <View style={styles.dot} />}
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* The banners (paid ads, events) open the home screen. */}
        <AdCarousel />
        <AlertStrip />
        <OriginPrompt />
        {/* What the student has going on comes first; the tabs cover the rest (no services grid). */}
        <InProgress />
        <CaravanCard />
        <EventCard />
        <TaxiCard />
        <RestoCard />

        <Headlines />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomLeftRadius: radii.xl,
    borderBottomRightRadius: radii.xl,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarText: { color: '#fff', fontWeight: '700' },
  hello: { ...typo.h2, color: '#fff' },
  campus: { color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  bell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    top: 10,
    right: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger,
  },
  body: { padding: 20, paddingBottom: 32, gap: 14 },
});
