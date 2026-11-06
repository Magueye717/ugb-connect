import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SpaceSwitcher } from '@/components/SpaceSwitcher';
import { colors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';

// The work spaces of the app creator's team, one per job: Administration (the super admin's team and the students'
// events), Restos publics (menus of the restaurants assigned), Communication (alerts, "À la une", paid banners),
// Référencement (places, restaurants, shops, caravan organizers). Each space shows only its own tabs, then the account.
const icons: Record<string, [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap]> = {
  'equipe-plateforme': ['people-outline', 'people'],
  evenements: ['sparkles-outline', 'sparkles'],
  menus: ['restaurant-outline', 'restaurant'],
  alertes: ['megaphone-outline', 'megaphone'],
  bannieres: ['images-outline', 'images'],
  lieux: ['map-outline', 'map'],
  commerces: ['storefront-outline', 'storefront'],
  caravanes: ['bus-outline', 'bus'],
  'mon-compte': ['person-outline', 'person'],
};
const TITLES: Record<string, string> = {
  'equipe-plateforme': 'Équipe', evenements: 'Événements', menus: 'Menus', alertes: 'Communication', bannieres: 'Bannières', lieux: 'Lieux', commerces: 'Commerces', caravanes: 'Caravanes', 'mon-compte': 'Compte',
};

export default function StaffTabLayout() {
  const { space, user } = useAuth();
  const roles = user?.roles ?? [];
  const has = (...r: string[]) => roles.includes('admin') || r.some((x) => roles.includes(x));
  const show = (on: boolean) => (on ? undefined : null);
  // Named after what the editor was given: private restaurants, shops, or both.
  const commercesTitle = has('restaurant_editor') && has('shop_editor') ? 'Commerces' : has('restaurant_editor') ? 'Restos privés' : 'Boutiques';
  const titleOf = (name: string) => (name === 'commerces' ? commercesTitle : (TITLES[name] ?? name));
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, 10);
  return (
    // The space button floats over every tab (only with several spaces).
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={({ route }) => ({
          headerShown: false,
          // Typing: the tab bar steps aside (on Android it would sit over the field above the keyboard).
          tabBarHideOnKeyboard: true,
          tabBarActiveTintColor: colors.primary,
          // Inactive labels must stay readable (11 px): muted2, 4.9:1.
          tabBarInactiveTintColor: colors.muted2,
          tabBarStyle: [styles.bar, { height: 62 + bottom, paddingBottom: bottom }],
          tabBarLabel: ({ focused, color }) => (
            <Text style={[styles.label, { color: String(color), fontWeight: focused ? '700' : '500' }]} maxFontSizeMultiplier={1.3} numberOfLines={1}>
              {titleOf(route.name)}
            </Text>
          ),
          tabBarIcon: ({ focused, color }) => (
            <View style={[styles.iconWrap, focused && styles.iconOn]}>
              <Ionicons name={icons[route.name]?.[focused ? 1 : 0] ?? 'ellipse-outline'} size={22} color={String(color)} />
            </View>
          ),
        })}>
        <Tabs.Screen name="equipe-plateforme" options={{ title: TITLES['equipe-plateforme'], href: show(space === 'admin') }} />
        <Tabs.Screen name="evenements" options={{ title: TITLES.evenements, href: show(space === 'admin') }} />
        <Tabs.Screen name="menus" options={{ title: TITLES.menus, href: show(space === 'resto') }} />
        <Tabs.Screen name="alertes" options={{ title: TITLES.alertes, href: show(space === 'alerts') }} />
        <Tabs.Screen name="bannieres" options={{ title: TITLES.bannieres, href: show(space === 'alerts' && has('content_editor')) }} />
        <Tabs.Screen name="lieux" options={{ title: TITLES.lieux, href: show(space === 'directory' && has('place_editor')) }} />
        <Tabs.Screen name="commerces" options={{ title: commercesTitle, href: show(space === 'directory' && has('restaurant_editor', 'shop_editor')) }} />
        <Tabs.Screen name="caravanes" options={{ title: TITLES.caravanes, href: show(space === 'directory' && has('caravan_editor')) }} />
        {/* The Référencement space's entry: opens its first tab. */}
        <Tabs.Screen name="referencement" options={{ href: null }} />
        <Tabs.Screen name="mon-compte" options={{ title: TITLES['mon-compte'] }} />
      </Tabs>
      <SpaceSwitcher />
    </View>
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
