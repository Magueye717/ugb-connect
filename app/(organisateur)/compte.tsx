import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LogoutButton } from '@/components/LogoutButton';
import { ProfileHero } from '@/components/ProfileHero';
import { SpacesList } from '@/components/SpacesList';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { isOwner, useAuth } from '@/context/AuthContext';

export default function Compte() {
  const { organizer } = useAuth();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.h1}>Compte</Text>

        {/* The same card as on the student profile: only the chips say which organization. */}
        <ProfileHero chips={[organizer?.name, organizer?.kind, organizer ? `${organizer.trips} trajet${organizer.trips > 1 ? 's' : ''} effectué${organizer.trips > 1 ? 's' : ''}` : null]} />

        <SpacesList />

        <View style={[styles.card, shadow.card, { paddingVertical: 4 }]}>
          <Row icon="megaphone-outline" label="Promouvoir un événement (bannière)" onPress={() => router.push('/mes-publicites')} last={!isOwner(organizer?.roles)} />
          {isOwner(organizer?.roles) && <Row icon="people-outline" label="Mon équipe" onPress={() => router.push('/mon-equipe')} last />}
        </View>

        <LogoutButton note="Tu ne recevras plus les réservations ni les alertes de l’espace organisateur sur ce téléphone." />
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ icon, label, onPress, last }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; last?: boolean }) {
  return (
    <Pressable style={[styles.row, !last && styles.rowBorder]} onPress={onPress} accessibilityRole="button">
      <Ionicons name={icon} size={20} color={colors.primary} />
      <Text style={[styles.rowTitle, { flex: 1 }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 20, gap: 12, paddingBottom: 32 },
  h1: { ...typo.h1, color: colors.navy },
  card: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 14 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  name: { ...typo.h3, color: colors.navy },
  muted: { ...typo.caption, color: colors.muted2 },
  switch: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchIcon: { width: 40, height: 40, borderRadius: radii.sm, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowTitle: { ...typo.bodyStrong, color: colors.navy },
});
