import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/constants/theme';

// A restaurant's or a shop's space: the orders first (they ring), then the catalog, the business, the team.
const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
  commandes: 'receipt-outline',
  catalogue: 'grid-outline',
  commerce: 'storefront-outline',
  equipe: 'people-outline',
};

const TITLES: Record<string, string> = { commandes: 'Commandes', catalogue: 'Catalogue', commerce: 'Commerce', equipe: 'Équipe' };

const activeIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
  commandes: 'receipt',
  catalogue: 'grid',
  commerce: 'storefront',
  equipe: 'people',
};

export default function CommerceTabLayout() {
  // Android edge-to-edge: the system navigation bar sits over the app, so the tab bar grows by its height.
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, 10);
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarStyle: [styles.bar, { height: 62 + bottom, paddingBottom: bottom }],
        tabBarLabel: ({ focused, color }) => Label(TITLES[route.name] ?? route.name, focused, String(color)),
        tabBarLabelStyle: styles.label,
        tabBarIcon: ({ focused, color }) => {
          const name = focused ? activeIcons[route.name] : icons[route.name];
          return (
            <View style={[styles.iconWrap, focused && styles.iconOn]}>
              <Ionicons name={name ?? 'ellipse-outline'} size={22} color={String(color)} />
            </View>
          );
        },
      })}>
      <Tabs.Screen name="commandes" options={{ title: 'Commandes' }} />
      <Tabs.Screen name="catalogue" options={{ title: 'Catalogue' }} />
      <Tabs.Screen name="commerce" options={{ title: 'Commerce' }} />
      <Tabs.Screen name="equipe" options={{ title: 'Équipe' }} />
    </Tabs>
  );
}

function Label(title: string, focused: boolean, color: string) {
  // Grows with the system text size, up to 130 %: the bar has a fixed height.
  return (
    <Text style={[styles.label, { color, fontWeight: focused ? '700' : '500' }]} maxFontSizeMultiplier={1.3} numberOfLines={1}>
      {title}
    </Text>
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
  iconWrap: {
    width: 42,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconOn: { backgroundColor: colors.primarySoft },
});
