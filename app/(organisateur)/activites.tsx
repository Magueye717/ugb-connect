import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState, ErrorState } from '@/components/states';
import { FillBar, OrganizerLine } from '@/components/caravan';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useOrgDepartures } from '@/features/organizer/boarding';

/**
 * Organizer home: their departures, soonest first, each opening its passenger list.
 * Creating and editing happen on the web platform; the app is for the day of the trip.
 * Events will be listed here too, with the same list + scanner.
 */
export default function Activites() {
  const { organizer } = useAuth();
  const { items: mine, loading, error, refresh } = useOrgDepartures();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} />}>
        <Text style={styles.h1}>Mes activités</Text>
        {organizer && (
          <View style={[styles.card, shadow.card, { gap: 6 }]}>
            <OrganizerLine organizer={organizer} />
            <View style={styles.web}>
              <Ionicons name="desktop-outline" size={16} color={colors.muted2} />
              <Text style={styles.webText}>Pour créer ou modifier un départ, utilise la plateforme web organisateur.</Text>
            </View>
          </View>
        )}

        <Text style={styles.section}>Caravanes</Text>
        {loading && <ActivityIndicator color={colors.primary} />}
        {!loading && error && mine.length === 0 && <ErrorState text={error} onRetry={refresh} />}
        {!loading && !error && mine.length === 0 && (
          <EmptyState icon="bus-outline" title="Aucun départ publié" text="Les départs créés sur la plateforme web apparaissent ici." />
        )}
        {mine.map((c) => {
          const total = c.counts.booked;
          const on = c.counts.admitted;
          return (
            <Pressable
              key={c.id}
              style={[styles.card, shadow.card, { gap: 12 }]}
              onPress={() => router.push(`/depart/${c.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`Liste des passagers ${c.from} vers ${c.to}, ${c.date}, ${total} passagers`}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.route}>
                    {c.from} → {c.to}
                  </Text>
                  <Text style={styles.muted}>
                    {c.date} · {c.time} · {c.plate}
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
  web: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  webText: { ...typo.caption, flex: 1, color: colors.muted2, lineHeight: 17 },
  section: { ...typo.section, color: colors.navy, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  route: { ...typo.title, color: colors.navy },
  muted: { ...typo.caption, color: colors.muted2, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primarySoft, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { ...typo.captionStrong },
});
