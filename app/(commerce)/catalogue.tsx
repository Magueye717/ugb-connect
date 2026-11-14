import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SpaceBar } from '@/components/SpaceBar';
import { colors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { CatalogEditor } from '@/features/commerce/CatalogEditor';
import { InterestsCard } from '@/features/commerce/InterestsCard';

/**
 * The business's catalog: who's interested in an article done on the spot (to call back), then the items: everyone in
 * the team switches one off for today; the owner and managers edit them.
 */
export default function Catalogue() {
  const { business } = useAuth();
  if (!business) return null;
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <SpaceBar />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <InterestsCard target={business} />
        <CatalogEditor key={`${business.orgId}:${business.kind}`} target={business} kind={business.kind} canManage={business.roles.some((r) => r === 'owner' || r === 'manager')} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 20, gap: 12, paddingBottom: 32 },
});
