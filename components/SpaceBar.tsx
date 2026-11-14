import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { spaceInfo } from '@/components/SpacesList';
import { SpaceSheet } from '@/components/SpaceSwitcher';
import { BellButton } from '@/components/ui';
import { colors, radii, typo } from '@/constants/theme';
import { useAuth, type AppSpace } from '@/context/AuthContext';
import { haptics } from '@/lib/haptics';

const ROLES: Record<string, string> = { owner: 'Propriétaire', manager: 'Gérant', staff: 'Employé', scanner: 'Contrôleur' };

/** The space as its top bar says it: its name, then what it is and my role there. */
export function spaceLabel(s: AppSpace) {
  const role = ROLES[s.roles.find((r) => ROLES[r]) ?? ''];
  switch (s.type) {
    case 'organizer':
      return { name: s.name, sub: ['Organisateur', role].filter(Boolean).join(' · ') };
    case 'business':
      return { name: s.name, sub: [s.kind === 'shop' ? 'Boutique' : 'Restaurant', role].filter(Boolean).join(' · ') };
    case 'student':
      return { name: 'Espace étudiant', sub: 'Caravanes, restos, campus' };
    default:
      return { name: spaceInfo(s).title, sub: 'Équipe campus' };
  }
}

/**
 * The top of every screen of a work space (organizer, restaurant, shop, campus team): which space I'm in (its logo,
 * its name, my role), not a big title. With several spaces it's also the switch: a tap lists them all. `children`:
 * the screen's own buttons (Ajouter…), before the bell.
 */
export function SpaceBar({ children, bell = true }: { children?: ReactNode; bell?: boolean }) {
  const { spaces, current } = useAuth();
  const [open, setOpen] = useState(false);
  if (!current) return null;
  const many = spaces.length > 1;
  const { name, sub } = spaceLabel(current);
  const icon = spaceInfo(current).icon;

  return (
    <View style={styles.bar}>
      <Pressable
        disabled={!many}
        onPress={() => {
          haptics.select();
          setOpen(true);
        }}
        style={({ pressed }) => [styles.who, many && styles.whoTap, pressed && { opacity: 0.85 }]}
        hitSlop={4}
        accessibilityRole={many ? 'button' : undefined}
        accessibilityLabel={many ? `${name}, ${sub}. Changer d’espace` : `${name}, ${sub}`}>
        <View style={styles.logo}>
          {current.logoUrl ? <Image source={{ uri: current.logoUrl }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Ionicons name={icon} size={18} color="#fff" />}
        </View>
        <View style={{ flexShrink: 1 }}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            {many && <Ionicons name="chevron-down" size={15} color={colors.navy} />}
          </View>
          <Text style={styles.sub} numberOfLines={1}>
            {sub}
          </Text>
        </View>
      </Pressable>
      <View style={styles.actions}>
        {children}
        {bell && <BellButton onPress={() => router.push('/notifications')} />}
      </View>
      {many && <SpaceSheet visible={open} onClose={() => setOpen(false)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 8 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1, paddingVertical: 4, paddingLeft: 4, paddingRight: 10, borderRadius: radii.pill },
  whoTap: { backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  logo: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden', backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { ...typo.bodyStrong, color: colors.navy, flexShrink: 1 },
  sub: { ...typo.caption, color: colors.muted2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
