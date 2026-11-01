import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';

// The work spaces opened by platform roles: "resto" (restaurant staff update stock levels during the service)
// and "alerts" (the communication team posts alerts). Each shows its own screen and the account tab; menus are
// planned on the back office.
const icons: Record<string, [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap]> = {
  menus: ['restaurant-outline', 'restaurant'],
  alertes: ['megaphone-outline', 'megaphone'],
  bannieres: ['images-outline', 'images'],
  evenements: ['sparkles-outline', 'sparkles'],
  commerces: ['storefront-outline', 'storefront'],
  lieux: ['map-outline', 'map'],
  'mon-compte': ['person-outline', 'person'],
};
const TITLES: Record<string, string> = { menus: 'Menus du jour', alertes: 'Communication', bannieres: 'Bannières', evenements: 'Événements', commerces: 'Commerces', lieux: 'Lieux', 'mon-compte': 'Compte' };

export default function StaffTabLayout() {
  const { space, user } = useAuth();
  // Paid banners are reviewed by the communication team (not the academic team).
  const reviewsBanners = space === 'alerts' && !!user?.roles.some((r) => r === 'admin' || r === 'content_editor');
  // Students' events are approved by the admins, who also create the restaurants and shops.
  const reviewsEvents = space === 'alerts' && !!user?.roles.includes('admin');
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, 10);
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarStyle: [styles.bar, { height: 62 + bottom, paddingBottom: bottom }],
        tabBarLabel: ({ focused, color }) => (
          <Text style={[styles.label, { color: String(color), fontWeight: focused ? '700' : '500' }]} maxFontSizeMultiplier={1.3} numberOfLines={1}>
            {TITLES[route.name] ?? route.name}
          </Text>
        ),
        tabBarIcon: ({ focused, color }) => (
          <View style={[styles.iconWrap, focused && styles.iconOn]}>
            <Ionicons name={icons[route.name]?.[focused ? 1 : 0] ?? 'ellipse-outline'} size={22} color={String(color)} />
          </View>
        ),
      })}>
      {/* Only the current space's screen: the other spaces are under "Mes espaces". */}
      <Tabs.Screen name="menus" options={{ title: TITLES.menus, href: space === 'resto' ? undefined : null }} />
      <Tabs.Screen name="alertes" options={{ title: TITLES.alertes, href: space === 'alerts' ? undefined : null }} />
      <Tabs.Screen name="bannieres" options={{ title: TITLES.bannieres, href: reviewsBanners ? undefined : null }} />
      <Tabs.Screen name="evenements" options={{ title: TITLES.evenements, href: reviewsEvents ? undefined : null }} />
      <Tabs.Screen name="lieux" options={{ title: TITLES.lieux, href: reviewsBanners ? undefined : null }} />
      <Tabs.Screen name="commerces" options={{ title: TITLES.commerces, href: reviewsEvents ? undefined : null }} />
      <Tabs.Screen name="mon-compte" options={{ title: TITLES['mon-compte'] }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingTop: 8,
    borderTopWidth: 0,
    backgroundColor: colors.card,
    elevation: 12,
    shadowColor: '#1E2A5A',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
  },
  label: { fontSize: 11, marginTop: 2 },
  iconWrap: { width: 42, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  iconOn: { backgroundColor: colors.primarySoft },
});
