import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, shadow, typo } from '@/constants/theme';
import { useAuth, type AppSpace } from '@/context/AuthContext';

type Info = { icon: keyof typeof Ionicons.glyphMap; title: string; text: string };

/** How each space is named wherever spaces are listed or switched: "Khoulé & frère · Restaurant". */
export function spaceInfo(s: AppSpace): Info {
  switch (s.type) {
    case 'student':
      return { icon: 'school-outline', title: 'Espace étudiant', text: 'Caravanes, restos, taxi, campus' };
    case 'organizer':
      return { icon: 'bus-outline', title: `${s.name} · Organisateur`, text: 'Départs, événements, passagers, scanner' };
    case 'business':
      // The shop they own is "Ma boutique" (a student's own entity bears their name: not repeated).
      if (s.kind === 'shop' && s.roles.includes('owner')) return { icon: 'storefront-outline', title: 'Ma boutique', text: s.personal ? 'Commandes, articles, équipe' : `${s.name} · commandes, articles, équipe` };
      return s.kind === 'shop'
        ? { icon: 'storefront-outline', title: `${s.name} · Boutique`, text: 'Commandes, articles, équipe' }
        : { icon: 'restaurant-outline', title: `${s.name} · Restaurant`, text: 'Commandes, menus, équipe' };
    case 'admin':
      return { icon: 'shield-checkmark-outline', title: 'Administration', text: 'Équipe UGB Connect, événements, entités' };
    case 'resto':
      return { icon: 'restaurant-outline', title: 'Restos publics', text: 'Menus du déjeuner et du dîner, ruptures' };
    case 'alerts':
      return { icon: 'megaphone-outline', title: 'Communication', text: 'Alertes, « À la une », bannières' };
    case 'directory':
      return { icon: 'map-outline', title: 'Référencement', text: 'Lieux, restaurants et boutiques du campus' };
  }
}

/**
 * "Mes espaces": every space this account can open (student, each space of each organization, the platform team's),
 * the current one marked. Hidden when there's only one. Also always one tap away: the space button (SpaceSwitcher).
 */
export function SpacesList() {
  const { spaces } = useAuth();
  if (spaces.length < 2) return null;

  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.title}>Mes espaces</Text>
      <SpaceRows />
    </View>
  );
}

/** The spaces, one row each (the current one marked); `onOpen` runs before switching (closing a sheet). */
export function SpaceRows({ onOpen }: { onOpen?: () => void }) {
  const { spaces, current: here, openSpace } = useAuth();
  return (
      <View style={[styles.group, shadow.card]}>
        {spaces.map((s, i) => {
          const info = spaceInfo(s);
          const current = s.key === here?.key;
          return (
            <Pressable
              key={s.key}
              onPress={() => {
                onOpen?.();
                openSpace(s.key);
              }}
              disabled={current}
              style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && { backgroundColor: colors.primarySofter }]}
              accessibilityRole="button"
              accessibilityState={{ selected: current }}
              accessibilityLabel={`${info.title}${current ? ', espace actuel' : ''}`}>
              <View style={[styles.icon, current && styles.iconOn]}>
                <Ionicons name={info.icon} size={18} color={current ? '#fff' : colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{info.title}</Text>
                <Text style={styles.rowText}>{info.text}</Text>
              </View>
              {current ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>Actuel</Text>
                </View>
              ) : (
                <Ionicons name="chevron-forward" size={16} color={colors.muted} />
              )}
            </Pressable>
          );
        })}
      </View>
  );
}

const styles = StyleSheet.create({
  title: { ...typo.captionStrong, color: colors.muted2, textTransform: 'uppercase', letterSpacing: 0.5, marginLeft: 4 },
  group: { backgroundColor: colors.card, borderRadius: radii.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 60 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  icon: { width: 36, height: 36, borderRadius: radii.sm, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  iconOn: { backgroundColor: colors.primary },
  rowTitle: { ...typo.bodyStrong, color: colors.navy },
  rowText: { ...typo.caption, color: colors.muted2, marginTop: 1 },
  badge: { backgroundColor: colors.successBg, borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { ...typo.label, color: colors.successText },
});
