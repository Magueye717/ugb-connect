import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SpaceSwitcher } from '@/components/SpaceSwitcher';
import { colors } from '@/constants/theme';
import { useCaravans } from '@/context/CaravansContext';
import { useOrders } from '@/context/OrdersContext';
import { useTaxi } from '@/context/TaxiContext';

const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: 'home-outline',
  resto: 'bag-handle-outline',
  caravanes: 'bus-outline',
  lieux: 'school-outline',
  profil: 'person-outline',
};

const TITLES: Record<string, string> = { index: 'Accueil', resto: 'Commander', caravanes: 'Trajets', lieux: 'Campus', profil: 'Profil' };

const activeIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: 'home',
  resto: 'bag-handle',
  caravanes: 'bus',
  lieux: 'school',
  profil: 'person',
};

export default function TabLayout() {
  // Android edge-to-edge: the system navigation bar sits over the app, so the tab bar grows by its height.
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, 10);
  // A red dot on a tab when something there waits for the student: an order ready to collect (or to pay), a seat
  // request to pay the organizer, a Sunu Taxi trip under way.
  const { orders } = useOrders();
  const { caravans } = useCaravans();
  const { activeTrip } = useTaxi();
  const waiting: Record<string, boolean> = {
    resto: orders.some((o) => o.status === 'ready' || o.status === 'pending_payment'),
    caravanes: caravans.some((c) => !!c.myBooking) || !!activeTrip(),
  };
  return (
    // The space button floats over every tab (only with several spaces).
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={({ route }) => ({
          headerShown: false,
          // Typing: the tab bar steps aside (on Android it would sit over the field above the keyboard).
          tabBarHideOnKeyboard: true,
          tabBarShowLabel: true,
          tabBarActiveTintColor: colors.primary,
          // Inactive labels must stay readable (11 px): muted2, 4.9:1.
          tabBarInactiveTintColor: colors.muted2,
          tabBarStyle: [styles.bar, { height: 56 + bottom, paddingBottom: bottom }],
          tabBarLabel: ({ focused, color }) => Label(TITLES[route.name] ?? route.name, focused, String(color)),
          tabBarLabelStyle: styles.label,
          tabBarIcon: ({ focused, color }) => {
            const name = focused ? activeIcons[route.name] : icons[route.name];
            return (
              <View style={[styles.iconWrap, focused && styles.iconOn]}>
                <Ionicons name={name ?? 'ellipse-outline'} size={22} color={String(color)} />
                {waiting[route.name] && <View style={styles.dot} accessibilityLabel="À voir" />}
              </View>
            );
          },
        })}>
        <Tabs.Screen name="index" options={{ title: 'Accueil' }} />
        {/* Route names stay the same so existing links keep working; labels follow the new structure. */}
        <Tabs.Screen name="resto" options={{ title: 'Commander' }} />
        <Tabs.Screen name="caravanes" options={{ title: 'Trajets' }} />
        <Tabs.Screen name="lieux" options={{ title: 'Campus' }} />
        <Tabs.Screen name="profil" options={{ title: 'Profil' }} />
      </Tabs>
      <SpaceSwitcher />
    </View>
  );
}

function Label(title: string, focused: boolean, color: string) {
  // Grows with the system text size, up to 130 %: the bar has a fixed height.
  return (
    // A long name (« Commander », bold when chosen) shrinks a little to fit whole rather than being cut.
    <Text style={[styles.label, { color, fontWeight: focused ? '700' : '500' }]} maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
      {title}
    </Text>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingTop: 6,
    borderTopWidth: 0,
    backgroundColor: colors.card,
    elevation: 12,
    shadowColor: '#1E2A5A',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
  },
  label: { fontSize: 11, marginTop: 2, textAlign: 'center', alignSelf: 'stretch' },
  iconWrap: {
    width: 42,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconOn: { backgroundColor: colors.primarySoft },
  // Something waits on this tab: a small red dot on the icon's corner, ringed white to stand off it.
  dot: { position: 'absolute', top: 1, right: 7, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.danger, borderWidth: 1.5, borderColor: colors.card },
});
