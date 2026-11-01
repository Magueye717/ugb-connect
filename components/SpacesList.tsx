import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, shadow, typo } from '@/constants/theme';
import { useAuth, type Space } from '@/context/AuthContext';

type Info = { icon: keyof typeof Ionicons.glyphMap; title: string; text: string };

/** How each space is named wherever spaces are listed or switched. */
export function spaceInfo(space: Space, organizerName?: string, businessName?: string): Info {
  switch (space) {
    case 'student':
      return { icon: 'school-outline', title: 'Espace étudiant', text: 'Caravanes, restos, taxi, campus' };
    case 'organizer':
      return { icon: 'bus-outline', title: organizerName ? `Espace ${organizerName}` : 'Espace organisateur', text: 'Départs, passagers, scanner' };
    case 'business':
      return { icon: 'storefront-outline', title: businessName ?? 'Mon commerce', text: 'Commandes, catalogue, équipe' };
    case 'resto':
      return { icon: 'restaurant-outline', title: 'Restos publics', text: 'Stocks des plats du jour, ruptures' };
    case 'alerts':
      return { icon: 'megaphone-outline', title: 'Communication', text: 'Alertes et « À la une » de l’accueil' };
  }
}

/**
 * "Mes espaces": every space this account can open (student, organizer, and one per platform role), the current
 * one marked. Hidden when there's only one.
 */
export function SpacesList() {
  const { spaces, space, organizer, business, openSpace } = useAuth();
  if (spaces.length < 2) return null;

  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.title}>Mes espaces</Text>
      <View style={[styles.group, shadow.card]}>
        {spaces.map((s, i) => {
          const info = spaceInfo(s, organizer?.name, business?.name);
          const current = s === space;
          return (
            <Pressable
              key={s}
              onPress={() => openSpace(s)}
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
