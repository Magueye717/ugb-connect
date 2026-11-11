import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/ui';
import { colors, radii, typo } from '@/constants/theme';
import { TicketScanner } from '@/features/organizer/TicketScanner';
import { useTicketCheck } from '@/features/organizer/useTicketCheck';

/**
 * The door of a student's own event (from « Mes événements »): scans its tickets at the entrance, and validates the
 * cash paid for a request. `org`: their own entity; `event`: the event scanned (a ticket for another one is refused).
 */
export default function ScannerBillets() {
  const { org, event, title } = useLocalSearchParams<{ org: string; event?: string; title?: string }>();
  const check = useTicketCheck(event, org);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/mes-evenements'));

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.head}>
        <BackButton onPress={back} />
        <Text style={styles.h1} numberOfLines={1}>
          {title ?? 'Scanner les billets'}
        </Text>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Pressable style={styles.payBtn} onPress={() => router.push({ pathname: '/valider-paiement', params: { org } })} accessibilityRole="button">
          <Ionicons name="cash-outline" size={20} color={colors.navy} />
          <View style={{ flex: 1 }}>
            <Text style={styles.payTitle}>Valider un paiement</Text>
            <Text style={styles.paySub}>Demande de billet payée en espèces : scanne son QR ou tape son code.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.navy} />
        </Pressable>
        <Text style={styles.hint}>Billets validés : scanne-les ci-dessous à l’entrée. Un billet déjà scanné est signalé.</Text>
        <TicketScanner check={check} org={org} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.navy },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 20, paddingTop: 8 },
  h1: { ...typo.h3, color: '#fff', flex: 1, textAlign: 'center' },
  body: { padding: 20, gap: 16, paddingBottom: 32 },
  payBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radii.lg, backgroundColor: '#FFC46B' },
  payTitle: { ...typo.bodyStrong, color: colors.navy },
  paySub: { ...typo.caption, color: colors.navy, marginTop: 2 },
  hint: { ...typo.caption, color: 'rgba(255,255,255,0.7)' },
});
