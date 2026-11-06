import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/states';
import { BackButton } from '@/components/ui';
import { colors, typo } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { SalesView } from '@/features/commerce/SalesView';

/** « Mes ventes »: owners and managers, from the Commandes tab's « Aujourd’hui » line. */
export default function Ventes() {
  const { business } = useAuth();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/commandes'));
  const allowed = !!business?.roles.some((r) => r === 'owner' || r === 'manager');
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.head}>
        <BackButton onPress={back} />
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.h1}>Mes ventes</Text>
          {business && <Text style={styles.sub}>{business.name}</Text>}
        </View>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {business && allowed ? (
          <SalesView business={business} />
        ) : (
          <EmptyState icon="lock-closed-outline" title="Réservé aux gérants" text="Le propriétaire et les gérants voient les ventes." />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 },
  h1: { ...typo.h3, color: colors.navy },
  sub: { ...typo.caption, color: colors.muted2 },
  body: { padding: 20, gap: 14, paddingBottom: 40 },
});
