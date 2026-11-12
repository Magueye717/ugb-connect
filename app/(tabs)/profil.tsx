import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { usePullRefresh } from '@/components/PullRefresh';
import { AvatarPicker } from '@/components/AvatarPicker';
import { LogoutButton } from '@/components/LogoutButton';
import { SpacesList } from '@/components/SpacesList';
import { UnreadBadge } from '@/components/UnreadBadge';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { ownShop, useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationsContext';

/** `todo`: something to fill in ("À compléter"). */
/** Each section's icon colours, a soft tile and a darker icon (≥ 4.5:1): the list is scanned by colour. */
type Tone = { bg: string; fg: string };
const TONES: Record<'account' | 'activity' | 'publish' | 'prefs' | 'help', Tone> = {
  account: { bg: colors.primarySoft, fg: colors.primary },
  activity: { bg: colors.accentSoft, fg: colors.orangeText },
  publish: { bg: colors.successBg, fg: colors.successText },
  prefs: { bg: '#EEEBFE', fg: colors.purpleText },
  help: { bg: colors.input, fg: colors.muted2 },
};

type Row = { icon: keyof typeof Ionicons.glyphMap; label: string; href?: Href; badge?: number; todo?: boolean; done?: boolean; onPress?: () => void };

export default function ProfilScreen() {
  const { user, spaces, reloadAccount } = useAuth();
  // The shop they own: "Ma boutique" once there is one.
  const myShop = ownShop(spaces);
  const cardDone = !!user?.identity?.fromCard;

  const { unreadCount, refresh: refreshNotifications } = useNotifications();
  const pull = usePullRefresh(reloadAccount, refreshNotifications);

  // Grouped lists, like system settings: fewer boxes, clearer sections.
  // What makes the profile complete: a photo, the student number (optional at sign-up), UFR and region (announcements
  // are aimed with them), the card checked.
  const steps = [!!user?.avatarUrl, !!user?.studentId, !!user?.ufrCode && !!user?.niveau && !!user?.region, cardDone];
  const done = steps.filter(Boolean).length;

  const groups: { title: string; tone: Tone; rows: Row[] }[] = [
    {
      title: 'Mon compte',
      tone: TONES.account,
      rows: [
        { icon: 'person-outline', label: 'Informations personnelles', href: '/infos' },
        { icon: 'school-outline', label: 'Mon UFR et mon niveau', href: '/mes-etudes', todo: !user?.ufrCode || !user.niveau },
        // The student number and the card's details both live there.
        // The student number, the région and the card's details all live there.
        { icon: 'card-outline', label: 'Ma carte étudiant', href: '/ma-carte', todo: !cardDone || !user?.studentId || !user.region, done: cardDone && !!user?.studentId && !!user.region },
      ],
    },
    {
      // What I bought or booked…
      title: 'Mes réservations et achats',
      tone: TONES.activity,
      rows: [
        { icon: 'ticket-outline', label: 'Mes billets', href: '/mes-billets' },
        // `as Href`: the route types are regenerated on the next `expo start` (new screen).
        { icon: 'receipt-outline', label: 'Mes commandes', href: '/mes-commandes' as Href },
        { icon: 'bag-handle-outline', label: 'Mon panier', href: '/panier' },
      ],
    },
    {
      // …and what I put out there myself.
      title: 'Je publie',
      tone: TONES.publish,
      rows: [
        { icon: 'sparkles-outline', label: 'Mes événements', href: '/mes-evenements' },
        { icon: 'storefront-outline', label: myShop ? 'Ma boutique' : 'Vendre sur le campus', href: '/ma-boutique' },
        { icon: 'megaphone-outline', label: 'Mes publicités', href: '/mes-publicites' },
        { icon: 'cube-outline', label: 'Mes objets perdus', href: '/mes-objets' },
      ],
    },
    {
      title: 'Préférences',
      tone: TONES.prefs,
      rows: [{ icon: 'notifications-outline', label: 'Notifications et préférences', href: '/notifications', badge: unreadCount }],
    },
    {
      title: 'Aide',
      tone: TONES.help,
      rows: [
        { icon: 'help-circle-outline', label: 'Aide & support', href: '/aide' },
        { icon: 'document-text-outline', label: 'Conditions d’utilisation', href: '/legal/conditions' },
        { icon: 'shield-checkmark-outline', label: 'Confidentialité', href: '/legal/confidentialite' },
      ],
    },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} refreshControl={pull}>
        <Text style={styles.h1}>Profil</Text>
        {/* The student's own block: the one coloured card of the screen. */}
        <View style={[styles.hero, shadow.raised]}>
          <View style={styles.heroTop}>
            <AvatarPicker size={64} tone="solid" ring />
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={styles.name} numberOfLines={2}>
                {user?.firstName} {user?.lastName}
              </Text>
              <View style={styles.chips}>
                {[user?.ufrCode ? `UFR ${user.ufrCode}` : null, user?.niveau, user?.campus].filter(Boolean).map((c) => (
                  <View key={c} style={styles.chip}>
                    <Text style={styles.chipText} numberOfLines={1}>
                      {c}
                    </Text>
                  </View>
                ))}
              </View>
              {/* UFR, filière and level aren't asked at sign-up yet: the line appears once they're known. */}
              {!!user?.filiere && (
                <Text style={styles.heroMeta} numberOfLines={1}>
                  {user.filiere}
                </Text>
              )}
            </View>
          </View>
          {done < steps.length && (
            <View style={styles.progress} accessible accessibilityLabel={`Profil complété : ${done} sur ${steps.length}`}>
              <View style={styles.progressHead}>
                <Text style={styles.progressText}>Profil complété</Text>
                <Text style={styles.progressText}>
                  {done}/{steps.length}
                </Text>
              </View>
              <View style={styles.bar}>
                <View style={[styles.barFill, { width: `${(done / steps.length) * 100}%` }]} />
              </View>
            </View>
          )}
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
                  <View style={[styles.rowIcon, { backgroundColor: g.tone.bg }]}>
                    <Ionicons name={r.icon} size={18} color={g.tone.fg} />
                  </View>
                  <Text style={styles.rowLabel}>{r.label}</Text>
                  {!!r.badge && <UnreadBadge count={r.badge} />}
                  {r.todo && (
                    <View style={styles.todo}>
                      <Text style={styles.todoText}>À compléter</Text>
                    </View>
                  )}
                  {r.done && <Ionicons name="checkmark-circle" size={18} color={colors.successText} accessibilityLabel="Vérifiée" />}
                  <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        {/* In its own group, like the other rows: clear, and not floating where a thumb lands (same in every space). */}
        <LogoutButton />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 20, gap: 18, paddingBottom: 40 },
  h1: { ...typo.h1, color: colors.navy },
  hero: { backgroundColor: colors.primary, borderRadius: radii.lg, padding: 18, gap: 16 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  name: { ...typo.h2, color: '#fff' },
  heroMeta: { ...typo.small, color: 'rgba(255,255,255,0.78)' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { maxWidth: '100%', paddingHorizontal: 9, paddingVertical: 3, borderRadius: radii.pill, backgroundColor: 'rgba(255,255,255,0.14)' },
  chipText: { ...typo.label, color: '#fff' },
  progress: { gap: 6 },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between' },
  progressText: { ...typo.captionStrong, color: 'rgba(255,255,255,0.85)' },
  bar: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3, backgroundColor: colors.orange },
  groupTitle: { ...typo.captionStrong, color: colors.muted2, textTransform: 'uppercase', letterSpacing: 0.6, marginLeft: 4 },
  group: { backgroundColor: colors.card, borderRadius: radii.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 56 },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowIcon: { width: 34, height: 34, borderRadius: radii.sm, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.navy },
  todo: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill, backgroundColor: colors.accentSoft },
  todoText: { ...typo.label, color: colors.orangeText },
});
