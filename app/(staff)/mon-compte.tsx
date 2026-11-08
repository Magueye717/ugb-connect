import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LogoutButton } from '@/components/LogoutButton';
import { ProfileHero } from '@/components/ProfileHero';
import { formatPhone, phoneDigits } from '@/features/register/validation';
import { SpacesList, spaceInfo } from '@/components/SpacesList';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';

/** Account screen of a work space (restaurants, alerts): what's done here, the account's other spaces, sign out. */
export default function StaffCompte() {
  const { user, current } = useAuth();
  const here = current ? spaceInfo(current) : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.h1}>Compte</Text>

        {/* The same card as on the student profile: only the chips say which space. */}
        <ProfileHero chips={['Équipe campus', here?.title, user?.phone ? `+221 ${formatPhone(phoneDigits(user.phone.replace(/^\+221/, '')))}` : null]} />

        {here && (
          <View style={[styles.card, shadow.card, { gap: 10 }]}>
            <View style={styles.job}>
              <Ionicons name={here.icon} size={18} color={colors.primary} />
              <Text style={styles.jobText}>
                <Text style={styles.rowTitle}>{here.title}</Text> · {here.text}
              </Text>
            </View>
          </View>
        )}

        <SpacesList />

        <LogoutButton />
      </ScrollView>
    </SafeAreaView>
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
  rowTitle: { ...typo.bodyStrong, color: colors.navy },
  job: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  jobText: { ...typo.small, flex: 1, color: colors.text, lineHeight: 18 },
});
