import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AvatarPicker } from '@/components/AvatarPicker';
import { SpacesList } from '@/components/SpacesList';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { isOwner, useAuth } from '@/context/AuthContext';
import { commerceApi, type BusinessDto, type CommerceReference } from '@/features/commerce/api';
import { BusinessProfileForm } from '@/features/commerce/BusinessProfileForm';
import { ApiError } from '@/lib/api';

const fail = (title: string) => (err: unknown) => Alert.alert(title, err instanceof ApiError ? err.message : 'Réessaie dans un instant.');

/**
 * What students see of the business: its picture, where it is (GPS point for directions, in words, campus), its
 * number, its hours and delivery prices. Only the owner edits it; everyone sees it, the account and the spaces.
 */
export default function Commerce() {
  const { business, user, logout } = useAuth();
  const [b, setB] = useState<BusinessDto | null>(null);
  const [ref, setRef] = useState<CommerceReference | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!business) return;
      commerceApi.mine(business).then(setB, fail('Chargement impossible'));
      commerceApi.reference().then(setRef, () => undefined);
    }, [business]),
  );

  if (!business) return null;
  const confirmLogout = () =>
    Alert.alert('Se déconnecter ?', 'Tu ne recevras plus les nouvelles commandes sur ce téléphone.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Se déconnecter', style: 'destructive', onPress: logout },
    ]);
  const canEdit = isOwner(business.roles);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.headRow}>
            <Text style={[styles.h1, { flex: 1 }]}>{business.kind === 'restaurant' ? 'Mon restaurant' : 'Ma boutique'}</Text>
            {/* Always in sight, not only under the form. */}
            <Pressable style={styles.headLogout} onPress={confirmLogout} accessibilityRole="button" accessibilityLabel="Se déconnecter">
              <Ionicons name="log-out-outline" size={18} color={colors.dangerText} />
              <Text style={styles.headLogoutText}>Déconnexion</Text>
            </Pressable>
          </View>
          {!b || (canEdit && !ref) ? (
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
          <Pressable onPress={confirmLogout} style={styles.logout} accessibilityRole="button">
            <Ionicons name="log-out-outline" size={18} color={colors.dangerText} />
            <Text style={styles.logoutText}>Se déconnecter</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
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
  h1: { ...typo.h2, color: colors.navy },
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
  logout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 48 },
  logoutText: { ...typo.bodyStrong, color: colors.dangerText },
});
