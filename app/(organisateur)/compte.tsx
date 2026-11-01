import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OrganizerLine } from '@/components/caravan';
import { SpacesList } from '@/components/SpacesList';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';

const onWeb = (label: string) => Alert.alert(label, 'Ça se gère sur la plateforme web organisateur, depuis un ordinateur.');

export default function Compte() {
  const { user, organizer, logout } = useAuth();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.h1}>Compte</Text>

        <View style={[styles.card, shadow.card, styles.hero]}>
          <View style={styles.avatar}>
            <Text style={styles.initials}>{user?.initials}</Text>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.name}>
              {user?.firstName} {user?.lastName}
            </Text>
            {organizer && <OrganizerLine organizer={organizer} />}
            {organizer && (
              <Text style={styles.muted}>
                {organizer.kind} · {organizer.trips} trajets effectués
              </Text>
            )}
          </View>
        </View>

        <SpacesList />

        <View style={[styles.card, shadow.card, { paddingVertical: 4 }]}>
          <Row icon="megaphone-outline" label="Promouvoir un événement (bannière)" onPress={() => router.push('/mes-publicites')} />
          <Row icon="people-outline" label="Mon équipe (chauffeurs, contrôleurs)" onPress={() => onWeb('Mon équipe')} />
          <Row icon="wallet-outline" label="Paiements reçus" onPress={() => onWeb('Paiements reçus')} />
          <Row icon="help-circle-outline" label="Aide organisateur" onPress={() => onWeb('Aide organisateur')} last />
        </View>

        <Pressable onPress={logout} style={styles.logout} accessibilityRole="button">
          <Ionicons name="log-out-outline" size={18} color={colors.dangerText} />
          <Text style={styles.logoutText}>Se déconnecter</Text>
        </Pressable>
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
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  initials: { ...typo.h3, color: '#fff' },
  name: { ...typo.h3, color: colors.navy },
  muted: { ...typo.caption, color: colors.muted2 },
  switch: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchIcon: { width: 40, height: 40, borderRadius: radii.sm, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowTitle: { ...typo.bodyStrong, color: colors.navy },
  logout: { flexDirection: 'row', gap: 8, alignSelf: 'center', alignItems: 'center', padding: 16 },
  logoutText: { ...typo.title, color: colors.dangerText },
});
