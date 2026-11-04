import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AvatarPicker } from '@/components/AvatarPicker';
import { SpacesList } from '@/components/SpacesList';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { ownShop, useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationsContext';

/** `todo`: something to fill in ("À compléter"). */
type Row = { icon: keyof typeof Ionicons.glyphMap; label: string; href?: Href; badge?: number; todo?: boolean; done?: boolean; onPress?: () => void };

export default function ProfilScreen() {
  const { user, logout, spaces } = useAuth();
  // The shop they own: "Ma boutique" once there is one.
  const myShop = ownShop(spaces);
  const cardDone = !!user?.identity?.fromCard;

  const academic = [user?.ufr, user?.filiere, user?.niveau].filter(Boolean).join(' · ');
  const { unreadCount } = useNotifications();

  // Grouped lists, like system settings: fewer boxes, clearer sections.
  const groups: { title: string; rows: Row[] }[] = [
    {
      title: 'Mon compte',
      rows: [
        { icon: 'person-outline', label: 'Informations personnelles', href: '/infos' },
        { icon: 'school-outline', label: 'Mon UFR et ma région', href: '/mes-etudes', todo: !user?.ufrCode || !user.region },
        { icon: 'card-outline', label: 'Ma carte étudiant', href: '/ma-carte', todo: !cardDone, done: cardDone },
      ],
    },
    {
      title: 'Mes activités',
      rows: [
        { icon: 'ticket-outline', label: 'Mes billets', href: '/mes-billets' },
        { icon: 'cube-outline', label: 'Mes objets perdus', href: { pathname: '/(tabs)/lieux', params: { vue: 'objets' } } },
        { icon: 'bag-handle-outline', label: 'Mon panier', href: '/panier' },
        { icon: 'sparkles-outline', label: 'Mes événements', href: '/mes-evenements' },
        { icon: 'megaphone-outline', label: 'Mes publicités', href: '/mes-publicites' },
        { icon: 'storefront-outline', label: myShop ? 'Ma boutique' : 'Vendre sur le campus', href: '/ma-boutique' },
      ],
    },
    {
      title: 'Préférences',
      rows: [{ icon: 'notifications-outline', label: 'Notifications et préférences', href: '/notifications', badge: unreadCount }],
    },
    {
      title: 'Aide',
      rows: [{ icon: 'help-circle-outline', label: 'Aide & support', href: '/aide' }],
    },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.h1}>Profil</Text>
        <View style={[styles.hero, shadow.card]}>
          <AvatarPicker size={64} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>
              {user?.firstName} {user?.lastName}
            </Text>
            {/* UFR, filière and level aren't asked at sign-up yet: the line appears once they're known. */}
            {!!academic && <Text style={styles.meta}>{academic}</Text>}
            <Text style={styles.meta} numberOfLines={1}>
              {user?.campus}
            </Text>
          </View>
        </View>

        {/* An organizer, restaurant staff, the communication team…: their other spaces, one tap away. */}
        <SpacesList />

        {groups.map((g) => (
          <View key={g.title} style={{ gap: 8 }}>
            <Text style={styles.groupTitle}>{g.title}</Text>
            <View style={[styles.group, shadow.card]}>
              {g.rows.map((r, i) => (
                <Pressable
                  key={r.label}
                  onPress={() => (r.onPress ? r.onPress() : r.href && router.push(r.href))}
                  style={({ pressed }) => [styles.row, i > 0 && styles.rowDivider, pressed && { backgroundColor: colors.primarySofter }]}
                  accessibilityRole="button"
                  accessibilityLabel={r.badge ? `${r.label}, ${r.badge} non lues` : r.todo ? `${r.label}, à compléter` : r.label}>
                  <View style={styles.rowIcon}>
                    <Ionicons name={r.icon} size={18} color={colors.primary} />
                  </View>
                  <Text style={styles.rowLabel}>{r.label}</Text>
                  {!!r.badge && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText} maxFontSizeMultiplier={1.2}>{r.badge}</Text>
                    </View>
                  )}
                  {r.todo && <Text style={styles.todo}>À compléter</Text>}
                  {r.done && <Ionicons name="checkmark-circle" size={18} color={colors.successText} accessibilityLabel="Vérifiée" />}
                  <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        <Pressable onPress={logout} style={styles.logout} accessibilityRole="button">
          <Ionicons name="log-out-outline" size={18} color={colors.dangerText} />
          <Text style={styles.logoutText}>Se déconnecter</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 20, gap: 18, paddingBottom: 40 },
  h1: { ...typo.h1, color: colors.navy },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: colors.card, borderRadius: radii.lg, padding: 18 },
  name: { ...typo.h2, color: colors.navy },
  meta: { ...typo.small, color: colors.muted2, marginTop: 2 },
  groupTitle: { ...typo.captionStrong, color: colors.muted2, textTransform: 'uppercase', letterSpacing: 0.6, marginLeft: 4 },
  group: { backgroundColor: colors.card, borderRadius: radii.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 56 },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowIcon: { width: 34, height: 34, borderRadius: radii.sm, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.navy },
  badge: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  badgeText: { ...typo.captionStrong, color: '#fff' },
  todo: { ...typo.captionStrong, color: colors.orangeText },
  logout: { flexDirection: 'row', gap: 8, alignSelf: 'center', alignItems: 'center', padding: 16 },
  logoutText: { ...typo.title, color: colors.dangerText },
});
