import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { usePullRefresh } from '@/components/PullRefresh';
import { SpacesList } from '@/components/SpacesList';
import { ErrorState } from '@/components/states';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { isOwner, useAuth } from '@/context/AuthContext';
import { commerceApi, type BusinessDto } from '@/features/commerce/api';
import { BusinessProfileForm } from '@/features/commerce/BusinessProfileForm';
import { confirmAction } from '@/lib/notice';
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
  const pull = usePullRefresh(load);

  if (!business) return null;
  const confirmLogout = () =>
    confirmAction({
      title: 'Se déconnecter ?',
      bullets: ['Tu ne recevras plus les nouvelles commandes sur ce téléphone', 'Tu pourras te reconnecter à tout moment avec ton numéro'],
      confirm: 'Se déconnecter',
      keep: 'Rester connecté',
      onConfirm: logout,
    });
  const canEdit = isOwner(business.roles);
  const role = business.roles.includes('owner') ? 'Propriétaire' : business.roles.includes('manager') ? 'Gérant' : 'Employé';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAwareScrollView refreshControl={pull} style={{ flex: 1 }} bottomOffset={24} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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

          {/* Who is signed in on this phone, and as what (a shop's phone is often shared): one line. */}
          <View style={[styles.who, shadow.card]}>
            <View style={styles.whoAvatar}>
              {user?.avatarUrl ? <Image source={{ uri: user.avatarUrl }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Text style={styles.whoInitials}>{user?.initials ?? '?'}</Text>}
            </View>
            <Text style={styles.whoText} numberOfLines={1}>
              Connecté : <Text style={styles.whoName}>{user ? `${user.firstName} ${user.lastName}` : '—'}</Text> · {role}
            </Text>
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
  who: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, padding: 10, borderRadius: radii.md, backgroundColor: colors.card },
  whoAvatar: { width: 32, height: 32, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  whoInitials: { ...typo.captionStrong, color: colors.primary },
  whoText: { ...typo.small, color: colors.muted2, flex: 1 },
  whoName: { ...typo.smallStrong, color: colors.navy },
});
