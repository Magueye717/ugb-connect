import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState, ErrorState, SkeletonCard } from '@/components/states';
import { BackButton, StatusChip, TextButton } from '@/components/ui';
import { formatFcfa } from '@/constants/data';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { BANNER_STATUS, bannersApi, type BannerDto } from '@/features/banners/api';
import { payInBrowser } from '@/features/payments/checkout';
import { ApiError } from '@/lib/api';

const day = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

/** "Mes publicités": the banners I paid for, where they stand (validation, diffusion, refund). */
export default function MesPublicites() {
  const [items, setItems] = useState<BannerDto[] | null>(null);
  // The first load failed (no network…): « Impossible de charger », with « Réessayer » (not an empty list).
  const [loadFailed, setLoadFailed] = useState(false);
  const load = useCallback(() => {
    setLoadFailed(false);
    bannersApi.mine().then((r) => setItems(r.items), () => setLoadFailed(true));
  }, []);
  useFocusEffect(load);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const fail = (err: unknown) => Alert.alert('Action impossible', err instanceof ApiError ? err.message : 'Réessaie dans un instant.');

  const cancel = (b: BannerDto) =>
    Alert.alert('Annuler cette bannière ?', b.status === 'pending_review' ? `${formatFcfa(b.price)} te sont remboursés.` : 'La place est libérée.', [
      { text: 'Garder', style: 'cancel' },
      { text: 'Annuler', style: 'destructive', onPress: () => bannersApi.cancel(b.id).then(load, fail) },
    ]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.head}>
        <BackButton onPress={back} />
        <Text style={styles.h1}>Mes publicités</Text>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
        <Pressable style={[styles.new, shadow.card]} onPress={() => router.push('/publicite')} accessibilityRole="button">
          <View style={styles.newIcon}>
            <Ionicons name="add" size={22} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Nouvelle bannière</Text>
            <Text style={styles.muted}>Une publicité, ou ton événement, sur l’accueil de tous les étudiants</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>

        {!items && !loadFailed && (<><SkeletonCard /><SkeletonCard /></>)}
        {!items && loadFailed && <ErrorState onRetry={load} />}
        {items?.length === 0 && <EmptyState icon="megaphone-outline" title="Aucune bannière" text="Elle passe par une validation de l’équipe UGB Connect avant de s’afficher." />}
        {items?.map((b) => {
          const s = BANNER_STATUS[b.status];
          return (
            <View key={b.id} style={[styles.card, shadow.card]}>
              <Image source={{ uri: b.image }} style={styles.thumb} contentFit="cover" />
              <View style={{ flex: 1, gap: 4 }}>
                <StatusChip label={s.label} tone={s.tone} />
                <Text style={styles.title} numberOfLines={1}>
                  {b.title}
                </Text>
                <Text style={styles.muted}>
                  {b.kind === 'event' ? 'Événement · ' : ''}
                  {day(b.startsAt)} → {day(new Date(Date.parse(b.endsAt) - 1).toISOString())} · {b.packageName} · {formatFcfa(b.price)}
                </Text>
                {b.reviewReason && <Text style={styles.reason}>Motif : {b.reviewReason}</Text>}
                {b.refunded && <Text style={styles.muted}>Remboursée sur ton numéro.</Text>}
                {b.status === 'pending_review' && <Text style={styles.muted}>L’équipe UGB Connect la vérifie avant la diffusion.</Text>}
                <View style={styles.actions}>
                  {b.status === 'pending_payment' && b.payment && (
                    <TextButton label="Payer" icon="card-outline" onPress={() => payInBrowser(b.payment!).then(load, fail)} />
                  )}
                  {(b.status === 'pending_payment' || b.status === 'pending_review') && (
                    <TextButton label="Annuler" tone="danger" onPress={() => cancel(b)} />
                  )}
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 },
  h1: { ...typo.h3, color: colors.navy },
  body: { padding: 20, gap: 12, paddingBottom: 32 },
  new: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: radii.lg, padding: 14 },
  newIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  card: { flexDirection: 'row', gap: 12, backgroundColor: colors.card, borderRadius: radii.lg, padding: 12 },
  thumb: { width: 84, height: 84, borderRadius: radii.md, backgroundColor: colors.border },
  title: { ...typo.bodyStrong, color: colors.navy },
  muted: { ...typo.caption, color: colors.muted2, lineHeight: 17 },
  reason: { ...typo.caption, color: colors.dangerText },
  actions: { flexDirection: 'row', gap: 18, marginTop: 2 },
});
