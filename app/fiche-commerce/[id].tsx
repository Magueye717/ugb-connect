import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorState } from '@/components/states';
import { BackButton, Segmented } from '@/components/ui';
import { colors, typo } from '@/constants/theme';
import { commerceApi, type BusinessDto, type BusinessTarget } from '@/features/commerce/api';
import { BusinessProfileForm } from '@/features/commerce/BusinessProfileForm';
import { CatalogEditor } from '@/features/commerce/CatalogEditor';
import { useCommerceReference } from '@/features/commerce/useCommerceReference';
import { ApiError } from '@/lib/api';

type Tab = 'profile' | 'catalog';

/**
 * Référencement, one restaurant or shop: its profile (name, picture, place, hours, delivery) and its catalog (menus,
 * drinks, articles), the same screens as its owner's. Restaurant editors open restaurants, shop editors shops.
 */
export default function FicheCommerce() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const target: BusinessTarget = { editorOf: id };
  const [b, setB] = useState<BusinessDto | null>(null);
  const { reference: ref, failed: refFailed, retry: retryRef } = useCommerceReference();
  const [tab, setTab] = useState<Tab>('profile');
  const back = () => (router.canGoBack() ? router.back() : router.replace('/(staff)/commerces'));

  useEffect(() => {
    commerceApi.mine({ editorOf: id }).then(setB, (err) => {
      Alert.alert('Ouverture impossible', err instanceof ApiError ? err.message : 'Réessaie dans un instant.');
      back();
    });
  }, [id]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.head}>
        <BackButton onPress={back} />
        <View style={{ flex: 1 }}>
          <Text style={styles.h1} numberOfLines={1}>
            {b?.name ?? ' '}
          </Text>
          {b && <Text style={styles.muted}>{[b.kind === 'restaurant' ? 'Restaurant' : 'Boutique', b.specialty, b.active ? null : 'Masqué aux étudiants'].filter(Boolean).join(' · ')}</Text>}
        </View>
      </View>
      <View style={styles.tabs}>
        <Segmented
          options={[
            { value: 'profile', label: 'Fiche' },
            { value: 'catalog', label: b?.kind === 'shop' ? 'Articles' : 'Menus' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      <KeyboardAwareScrollView style={{ flex: 1 }} bottomOffset={24} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {b && !ref && refFailed ? (
            <ErrorState onRetry={retryRef} />
          ) : !b || !ref ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
          ) : tab === 'profile' ? (
            <BusinessProfileForm key={b.id} b={b} target={target} reference={ref} onSaved={setB} editor />
          ) : (
            <CatalogEditor key={b.id} target={target} kind={b.kind} canManage title={b.kind === 'shop' ? 'Articles' : 'Menus et boissons'} />
          )}
        </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 8 },
  h1: { ...typo.h3, color: colors.navy },
  muted: { ...typo.caption, color: colors.muted2 },
  tabs: { paddingHorizontal: 20, paddingTop: 12 },
  body: { padding: 20, gap: 12, paddingBottom: 40 },
});
