import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, shadow, typo } from '@/constants/theme';
import type { OrgSpace, TeamMember, TeamSpace } from '@/features/team/api';

/** Each space its colour and icon, the same in the list and in the editor. */
const SPACE_LOOK: Record<OrgSpace, { icon: keyof typeof Ionicons.glyphMap; tint: string; bg: string }> = {
  restaurant: { icon: 'restaurant', tint: colors.orangeText, bg: colors.accentSoft },
  shop: { icon: 'storefront', tint: colors.purpleText, bg: '#EEE8FF' },
  organizer: { icon: 'bus', tint: colors.primary, bg: colors.primarySoft },
};

export function SpaceTile({ space, size = 30 }: { space: OrgSpace; size?: number }) {
  const look = SPACE_LOOK[space];
  return (
    <View style={[styles.tile, { width: size, height: size, borderRadius: size / 3, backgroundColor: look.bg }]}>
      <Ionicons name={look.icon} size={size * 0.52} color={look.tint} />
    </View>
  );
}

/**
 * One person of the team: their roles space by space, each a small pill in the space's colour whose ✕ removes that
 * role only; the red bin takes the person out of the whole team. The owner: a badge and the spaces they hold.
 */
export function MemberCard({
  m, me, entitySpaces, onEdit, onRemove, onRemoveMember,
}: { m: TeamMember; me: boolean; entitySpaces: TeamSpace[]; onEdit: () => void; onRemove: (s: TeamSpace, r: { value: string; label: string }) => void; onRemoveMember: () => void }) {
  const count = m.spaces.reduce((n, s) => n + s.roles.length, 0);
  const initials = `${m.firstName[0] ?? ''}${m.lastName[0] ?? ''}`.toUpperCase();
  return (
    <View style={[styles.memberCard, shadow.card, m.owner && styles.ownerCard]}>
      <View style={styles.memberHead}>
        <View style={[styles.avatar, m.owner && { backgroundColor: colors.primary }]}>
          <Text style={[styles.initials, m.owner && { color: '#fff' }]}>{initials}</Text>
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={styles.name} numberOfLines={1}>
            {m.firstName} {m.lastName}
            {me && <Text style={styles.muted}>  (toi)</Text>}
          </Text>
          {m.owner ? (
            <View style={styles.ownerBadge}>
              <Ionicons name="key" size={11} color={colors.warningText} />
              <Text style={styles.ownerBadgeText}>Propriétaire</Text>
            </View>
          ) : (
            <Text style={styles.muted}>
              {count} rôle{count > 1 ? 's' : ''} · {m.spaces.length} espace{m.spaces.length > 1 ? 's' : ''}
            </Text>
          )}
        </View>
        {m.owner ? (
          <View style={styles.ownerSpaces}>
            {entitySpaces.map((s) => (
              <SpaceTile key={s.space} space={s.space} size={26} />
            ))}
          </View>
        ) : (
          <View style={styles.actions}>
            <Pressable style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]} onPress={onEdit} hitSlop={4} accessibilityRole="button" accessibilityLabel={`Modifier les rôles de ${m.firstName}`}>
              <Ionicons name="create-outline" size={17} color={colors.primary} />
            </Pressable>
            <Pressable style={({ pressed }) => [styles.iconBtn, styles.deleteBtn, pressed && { opacity: 0.7 }]} onPress={onRemoveMember} hitSlop={4} accessibilityRole="button" accessibilityLabel={`Retirer ${m.firstName} de l’équipe`}>
              <Ionicons name="trash-outline" size={17} color={colors.dangerText} />
            </Pressable>
          </View>
        )}
      </View>

      {!m.owner && (
        <View style={styles.spaceList}>
          {m.spaces.map((s) => {
            const look = SPACE_LOOK[s.space];
            return (
              <View key={s.space} style={styles.spaceRow}>
                <SpaceTile space={s.space} size={24} />
                <Text style={styles.spaceName}>{s.label}</Text>
                <View style={styles.pills}>
                  {s.roles.map((r) => (
                    <Pressable
                      key={r.value}
                      style={({ pressed }) => [styles.pill, { backgroundColor: look.bg }, pressed && { opacity: 0.7 }]}
                      onPress={() => onRemove(s, r)}
                      // 22 px pill, 44 px to the touch.
                      hitSlop={{ top: 11, bottom: 11, left: 4, right: 4 }}
                      accessibilityRole="button"
                      accessibilityLabel={`Retirer le rôle ${r.label}, ${s.label}`}>
                      <Text style={[styles.pillText, { color: look.tint }]}>{r.label}</Text>
                      <View style={styles.pillX}>
                        <Ionicons name="close" size={10} color={colors.dangerText} />
                      </View>
                    </Pressable>
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  name: { ...typo.bodyStrong, color: colors.navy },
  muted: { ...typo.caption, color: colors.muted2 },
  memberCard: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 14, gap: 12 },
  ownerCard: { borderWidth: 1, borderColor: colors.primarySoft },
  memberHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  initials: { ...typo.bodyStrong, color: colors.primary },
  ownerBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.pill, backgroundColor: colors.warningBg },
  ownerBadgeText: { ...typo.captionStrong, color: colors.warningText },
  ownerSpaces: { flexDirection: 'row', gap: 4 },
  actions: { flexDirection: 'row', gap: 8 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primarySofter, alignItems: 'center', justifyContent: 'center' },
  deleteBtn: { backgroundColor: colors.dangerBg },
  spaceList: { gap: 8, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  spaceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tile: { alignItems: 'center', justifyContent: 'center' },
  spaceName: { ...typo.captionStrong, color: colors.navy, width: 84 },
  pills: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 5 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 8, paddingRight: 3, minHeight: 22, borderRadius: radii.pill },
  pillText: { fontSize: 11, fontWeight: '700' },
  // The role's delete: a small white disc, always visible.
  pillX: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
});
