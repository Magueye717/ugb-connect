import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorState } from '@/components/states';
import { BackButton, Segmented, Toggle } from '@/components/ui';
import { colors, radii, shadow, typo } from '@/constants/theme';
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
  const [verifying, setVerifying] = useState(false);
  // A student's shop: Wave and Orange Money once the team has checked who runs it.
  const setOnline = async (on: boolean) => {
    if (!b) return;
    setVerifying(true);
    try {
      setB(await commerceApi.setOnlinePayments(b.id, on));
    } catch (err) {
      Alert.alert('Changement impossible', err instanceof ApiError ? err.message : 'Réessaie dans un instant.');
    } finally {
      setVerifying(false);
    }
  };

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
            <>
              {b.byStudent && (
                <View style={[styles.verify, shadow.card]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.verifyTitle}>Paiements Wave et Orange Money</Text>
                    <Text style={styles.muted}>
                      {b.onlinePayments ? 'Boutique vérifiée : ses clients peuvent payer en ligne.' : 'Boutique d’étudiant non vérifiée : espèces seulement. Active après avoir vérifié qui la tient.'}
                    </Text>
                  </View>
                  <Toggle value={b.onlinePayments} onValueChange={setOnline} disabled={verifying} accessibilityLabel="Paiements Wave et Orange Money" />
                </View>
              )}
              {/* Re-created when the permission changes: its payment choices follow. */}
              <BusinessProfileForm key={`${b.id}:${b.onlinePayments}`} b={b} target={target} reference={ref} onSaved={setB} editor />
            </>
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
  verify: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: radii.lg, padding: 14 },
  verifyTitle: { ...typo.title, color: colors.navy },
});
