import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { CatalogEditor } from '@/features/commerce/CatalogEditor';

/** The business's catalog: everyone in the team switches an item off for today; the owner and managers edit it. */
export default function Catalogue() {
  const { business } = useAuth();
  if (!business) return null;
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <CatalogEditor key={`${business.orgId}:${business.kind}`} target={business} kind={business.kind} canManage={business.roles.some((r) => r === 'owner' || r === 'manager')} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 20, gap: 12, paddingBottom: 32 },
});
