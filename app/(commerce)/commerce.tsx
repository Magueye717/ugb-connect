import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AvatarPicker } from '@/components/AvatarPicker';
import { SpacesList } from '@/components/SpacesList';
import { ErrorState } from '@/components/states';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { isOwner, useAuth } from '@/context/AuthContext';
import { commerceApi, type BusinessDto } from '@/features/commerce/api';
import { BusinessProfileForm } from '@/features/commerce/BusinessProfileForm';
import { useCommerceReference } from '@/features/commerce/useCommerceReference';


/**
 * What students see of the business: its picture, where it is (GPS point for directions, in words, campus), its
 * number, its hours and delivery prices. Only the owner edits it; everyone sees it, the account and the spaces.
 */
export default function Commerce() {
  const { business, user, logout } = useAuth();
  const [b, setB] = useState<BusinessDto | null>(null);
  // Couldn't be loaded (no network…): an error with « Réessayer » instead of an endless spinner.
  const [failed, setFailed] = useState(false);
  const { reference: ref, failed: refFailed, retry: retryRef } = useCommerceReference();

  const load = useCallback(() => {
    if (!business) return;
    setFailed(false);
    commerceApi.mine(business).then(setB, () => setFailed(true));
  }, [business]);
  useFocusEffect(load);

  if (!business) return null;
  const confirmLogout = () =>
    Alert.alert('Se déconnecter ?', 'Tu ne recevras plus les nouvelles commandes sur ce téléphone.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Se déconnecter', style: 'destructive', onPress: logout },
    ]);
  const canEdit = isOwner(business.roles);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAwareScrollView style={{ flex: 1 }} bottomOffset={24} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.headRow}>
            <Text style={[styles.h1, { flex: 1 }]}>{business.kind === 'restaurant' ? 'Mon restaurant' : 'Ma boutique'}</Text>
            {/* Always in sight, not only under the form. */}
            <Pressable style={styles.headLogout} onPress={confirmLogout} accessibilityRole="button" accessibilityLabel="Se déconnecter">
              <Ionicons name="log-out-outline" size={18} color={colors.dangerText} />
              <Text style={styles.headLogoutText}>Déconnexion</Text>
            </Pressable>
          </View>
          {(!b && failed) || (canEdit && !ref && refFailed) ? (
            <ErrorState
              onRetry={() => {
                if (!b) load();
                if (!ref) retryRef();
              }}
            />
          ) : !b || (canEdit && !ref) ? (
            <ActivityIndicator color={colors.primary} />
          ) : canEdit ? (
            <BusinessProfileForm key={b.id} b={b} target={business} reference={ref!} onSaved={setB} />
          ) : (
            <ProfileView b={b} />
          )}

          <Text style={styles.section}>Compte</Text>
          <View style={[styles.card, shadow.card, styles.row]}>
            <AvatarPicker size={44} tone="soft" />
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>
                {user?.firstName} {user?.lastName}
              </Text>
              <Text style={styles.muted}>{business.roles.includes('owner') ? 'Propriétaire' : business.roles.includes('manager') ? 'Gérant' : 'Employé'}</Text>
            </View>
          </View>
          <SpacesList />
        </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

function ProfileView({ b }: { b: BusinessDto }) {
  return (
    <View style={[styles.card, shadow.card]}>
      {b.photo && <Image source={{ uri: b.photo }} style={styles.cover} contentFit="cover" />}
      <Text style={styles.cardTitle}>{b.name}</Text>
      <Text style={styles.muted}>
        {b.specialty} · {b.address} · {b.hours}
      </Text>
      <View style={styles.lock}>
        <Ionicons name="lock-closed-outline" size={14} color={colors.muted2} />
        <Text style={[styles.muted, { flex: 1 }]}>Seul le propriétaire modifie ces informations.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 20, gap: 12, paddingBottom: 40 },
  h1: { ...typo.h1, color: colors.navy },
  section: { ...typo.section, color: colors.navy, marginTop: 10 },
  card: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 14, gap: 8 },
  cardTitle: { ...typo.title, color: colors.navy },
  muted: { ...typo.caption, color: colors.muted2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  cover: { height: 140, borderRadius: radii.md },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headLogout: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 36, paddingHorizontal: 12, borderRadius: radii.pill, backgroundColor: colors.dangerBg },
  headLogoutText: { ...typo.smallStrong, color: colors.dangerText },
  lock: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
});
