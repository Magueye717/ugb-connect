import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AdCarousel, AlertStrip, CaravanCard, EventCard, Headlines, OriginPrompt, RestoCard, TaxiCard } from '@/components/home';
import { InProgress } from '@/components/InProgress';
import { RatingPrompt } from '@/features/ratings/RatingPrompt';
import { UnreadBadge } from '@/components/UnreadBadge';
import { colors, radii, typo } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { bellLabel, useNotifications } from '@/context/NotificationsContext';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { unreadCount } = useNotifications();
  // While the profile loads: a neutral greeting, never someone else's name.

  return (
    <View style={styles.root}>
      {/* A trip, an event or an order just over and not rated: the question, once per session. */}
      <RatingPrompt />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.row}>
          {/* The orange ring of every profile photo. */}
          <Pressable style={styles.ring} onPress={() => router.push('/(tabs)/profil')} accessibilityRole="button" accessibilityLabel="Mon profil">
            <View style={styles.avatar}>
              {user?.avatarUrl ? <Image source={{ uri: user.avatarUrl }} style={StyleSheet.absoluteFill} contentFit="cover" /> : user?.initials ? <Text style={styles.avatarText}>{user.initials}</Text> : <Ionicons name="person" size={20} color="#fff" />}
            </View>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.hello}>{user?.firstName ? `Bonjour, ${user.firstName}` : 'Bonjour'}</Text>
            <Text style={styles.campus}>{user?.campus ?? 'UGB Connect'}</Text>
          </View>
          <Pressable
            onPress={() => router.push('/notifications')}
            style={styles.bell}
            accessibilityRole="button"
            accessibilityLabel={bellLabel(unreadCount)}>
            <Ionicons name="notifications-outline" size={22} color="#fff" />
            {/* How many are new: a red count (9+ above nine), on the bell's corner. */}
            <UnreadBadge count={unreadCount} style={styles.count} />
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
  // Same as the profiles: 3 of gap and 2.5 of orange around the 48 px photo.
  ring: { width: 59, height: 59, borderRadius: 29.5, borderWidth: 2.5, borderColor: colors.orange, alignItems: 'center', justifyContent: 'center' },
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
  // A ring of the header's colour separates the count from the bell.
  count: { position: 'absolute', top: -2, right: -4, borderWidth: 2, borderColor: colors.primary },
  body: { padding: 20, paddingBottom: 32, gap: 14 },
});
