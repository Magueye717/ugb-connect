import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePullRefresh } from '@/components/PullRefresh';
import { AdCarousel, AlertStrip, CaravanCard, EventCard, Headlines, OriginPrompt, RestoCard, TaxiCard, useHomeOrder, type HomeCard } from '@/components/home';
import { InProgress } from '@/components/InProgress';
import { RatingPrompt } from '@/features/ratings/RatingPrompt';
import { UnreadBadge } from '@/components/UnreadBadge';
import { colors, radii, typo } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useCampus } from '@/context/CampusContext';
import { useCaravans } from '@/context/CaravansContext';
import { useOrders } from '@/context/OrdersContext';
import { useTaxi } from '@/context/TaxiContext';
import { refreshMethods } from '@/features/payments/methods';
import { bellLabel, useNotifications } from '@/context/NotificationsContext';

const WEEKDAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
/** « Jeudi 13 novembre » (written out here: Hermes' French dates vary between phones). */
const today = () => {
  const d = new Date();
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

/** The live cards the home orders by urgency. */
const CARDS: Record<HomeCard, () => React.JSX.Element | null> = { caravan: CaravanCard, event: EventCard, taxi: TaxiCard };

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { user, reloadAccount } = useAuth();
  const { unreadCount, refresh: refreshNotifications } = useNotifications();
  // Pull: banners, alerts, menus, trips, tickets, orders and the bell.
  const campus = useCampus();
  const caravans = useCaravans();
  const taxi = useTaxi();
  const orders = useOrders();
  // The live cards in order of urgency, the most urgent ringed.
  const { order, accent } = useHomeOrder();
  const pull = usePullRefresh(campus.refresh, caravans.refresh, taxi.refresh, orders.refresh, refreshNotifications, reloadAccount, () => refreshMethods(true));
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
            {/* Today's date (context for the menus and the « ce soir »), not where the student lives: that stays private. */}
            <Text style={styles.campus}>{today()}</Text>
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
        {/* « Où se trouve… ? »: the campus places, search ready to type (an occasional need: one slim line, no card). */}
        <Pressable
          style={({ pressed }) => [styles.find, pressed && { opacity: 0.85 }]}
          onPress={() => router.push({ pathname: '/(tabs)/lieux', params: { vue: 'lieux', chercher: '1', n: String(Date.now()) } })}
          accessibilityRole="search"
          accessibilityLabel="Rechercher un lieu du campus">
          <Ionicons name="search" size={16} color="rgba(255,255,255,0.85)" />
          <Text style={styles.findText} numberOfLines={1}>
            Où se trouve… ? (amphi, bureau, resto…)
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} refreshControl={pull}>
        {/* The banners (paid ads, events) open the home screen. */}
        <AdCarousel />
        <AlertStrip />
        <OriginPrompt />
        {/* What the student has going on comes first; then the next caravan, event and taxi, and today's menus. */}
        <InProgress />
        {/* The live cards, most urgent first; the first urgent one ringed (it's the one to see). */}
        {order.map((k) => {
          const Card = CARDS[k];
          return k === accent ? (
            <View key={k} style={styles.accent}>
              <Card />
            </View>
          ) : (
            <Card key={k} />
          );
        })}
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
  find: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, minHeight: 42, paddingHorizontal: 14, borderRadius: radii.pill, backgroundColor: 'rgba(255,255,255,0.16)' },
  findText: { ...typo.small, color: 'rgba(255,255,255,0.85)', flex: 1 },
  // The card to see first: an orange ring around it (the card keeps its own look inside).
  accent: { borderRadius: radii.md + 4, borderWidth: 2, borderColor: colors.accent, padding: 2 },
});
