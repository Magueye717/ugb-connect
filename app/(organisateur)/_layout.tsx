import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SpaceSwitcher } from '@/components/SpaceSwitcher';
import { colors } from '@/constants/theme';
import { isOwner, useAuth } from '@/context/AuthContext';

// Organizer space: few tabs, the scanner in the middle, one tap away at the bus door.
const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
  activites: 'calendar-outline',
  scanner: 'qr-code-outline',
  'mon-equipe': 'people-outline',
  compte: 'person-outline',
};

const TITLES: Record<string, string> = { activites: 'Activités', scanner: 'Scanner', 'mon-equipe': 'Équipe', compte: 'Compte' };

const activeIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
  activites: 'calendar',
  scanner: 'qr-code',
  'mon-equipe': 'people',
  compte: 'person',
};

export default function OrganizerTabLayout() {
  const { organizer } = useAuth();
  // Android edge-to-edge: the system navigation bar sits over the app, so the tab bar grows by its height.
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
          tabBarShowLabel: true,
          tabBarActiveTintColor: colors.primary,
          // Inactive labels must stay readable (11 px): muted2, 4.9:1.
          tabBarInactiveTintColor: colors.muted2,
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
        <Tabs.Screen name="activites" options={{ title: 'Activités' }} />
        <Tabs.Screen name="scanner" options={{ title: 'Scanner' }} />
        {/* The team is the owner's: managers and scanners never see this tab. */}
        <Tabs.Screen name="mon-equipe" options={{ title: 'Équipe', href: isOwner(organizer?.roles) ? undefined : null }} />
        <Tabs.Screen name="compte" options={{ title: 'Compte' }} />
      </Tabs>
      <SpaceSwitcher />
    </View>
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
