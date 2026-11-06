import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState, ErrorState } from '@/components/states';
import { FillBar, OrganizerLine } from '@/components/caravan';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useOrgDepartures } from '@/features/organizer/boarding';
import { useNow } from '@/lib/useNow';

/**
 * Organizer home: their departures, soonest first, each opening its passenger list (a draft opens its form).
 * The owner and managers create departures here; scanners only see the list.
 */
export default function Activites() {
  const { organizer } = useAuth();
  const { items: mine, loading, error, refresh } = useOrgDepartures();
  const canCreate = !!organizer?.roles.some((r) => r === 'owner' || r === 'manager');
  const now = useNow();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} />}>
        <Text style={styles.h1}>Mes activités</Text>
        {organizer && (
          <View style={[styles.card, shadow.card, { gap: 12 }]}>
            <OrganizerLine organizer={organizer} />
            {canCreate && (
              <Pressable style={styles.create} onPress={() => router.push('/depart/edition/nouveau')} accessibilityRole="button">
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.createText}>Nouveau départ</Text>
              </Pressable>
            )}
          </View>
        )}

        <Text style={styles.section}>Caravanes</Text>
        {loading && <ActivityIndicator color={colors.primary} />}
        {!loading && error && mine.length === 0 && <ErrorState text={error} onRetry={refresh} />}
        {!loading && !error && mine.length === 0 && (
          <EmptyState
            icon="bus-outline"
            title="Aucun départ à venir"
            text={canCreate ? 'Crée ton premier départ : trajet, arrêts, prix. Les étudiants réservent depuis l’onglet Caravanes.' : 'Les départs créés par ton organisation apparaissent ici.'}
          />
        )}
        {mine.map((c) => {
          const total = c.counts.booked;
          const on = c.counts.admitted;
          return (
            <Pressable
              key={c.id}
              style={[styles.card, shadow.card, { gap: 12 }]}
              onPress={() => router.push(c.status === 'draft' && canCreate ? `/depart/edition/${c.id}` : `/depart/${c.id}`)}
              accessibilityRole="button"
              accessibilityLabel={c.status === 'draft' ? `Brouillon ${c.from} vers ${c.to}, ${c.date}` : `Liste des passagers ${c.from} vers ${c.to}, ${c.date}, ${total} passagers`}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.route}>
                    {c.from} → {c.to}
                  </Text>
                  <Text style={styles.muted}>
                    {c.date} · {c.time} · {c.plate ?? c.vehicle.label}
                    {c.status === 'draft' ? ' · brouillon' : c.status === 'departed' ? ' · en route' : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </View>
              <View style={styles.chips}>
                <Chip icon="enter-outline" text={`${c.pickups.length} montée${c.pickups.length > 1 ? 's' : ''}`} />
                <Chip icon="exit-outline" text={`${c.dropoffs.length} descente${c.dropoffs.length > 1 ? 's' : ''}`} />
                {on > 0 && <Chip icon="checkmark-circle-outline" text={`${on}/${total} à bord`} tone="success" />}
              </View>
              <FillBar caravan={c} />
              {canCreate && (c.status === 'published' || c.status === 'confirmed') && c.departureAt > now && (
                <Pressable onPress={() => router.push(`/depart/edition/${c.id}`)} style={styles.editLink} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Modifier ${c.from} vers ${c.to}`}>
                  <Ionicons name="create-outline" size={15} color={colors.primary} />
                  <Text style={styles.editLinkText}>Modifier (arrêts, véhicule)</Text>
                </Pressable>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

function Chip({ icon, text, tone }: { icon: keyof typeof Ionicons.glyphMap; text: string; tone?: 'success' }) {
  const fg = tone ? colors.successText : colors.primary;
  return (
    <View style={[styles.chip, tone && { backgroundColor: colors.successBg }]}>
      <Ionicons name={icon} size={13} color={fg} />
      <Text style={[styles.chipText, { color: fg }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 20, gap: 12, paddingBottom: 32 },
  h1: { ...typo.h1, color: colors.navy },
  card: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 14 },
  editLink: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 2 },
  editLinkText: { ...typo.smallStrong, color: colors.primary },
  create: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, borderRadius: radii.sm, backgroundColor: colors.accent },
  createText: { color: '#fff', fontWeight: '700' },
  section: { ...typo.section, color: colors.navy, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  route: { ...typo.title, color: colors.navy },
  muted: { ...typo.caption, color: colors.muted2, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primarySoft, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { ...typo.captionStrong },
});
