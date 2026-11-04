import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MultiSelect } from '@/components/Select';
import { BackButton, Field, LabeledField, PrimaryButton, Segmented } from '@/components/ui';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { ownShop, useAuth } from '@/context/AuthContext';
import { commerceApi, type BusinessDto, type BusinessRef, type CommerceReference } from '@/features/commerce/api';
import { BusinessProfileForm } from '@/features/commerce/BusinessProfileForm';
import { CatalogEditor } from '@/features/commerce/CatalogEditor';
import { api, ApiError } from '@/lib/api';
import { pickPhoto } from '@/lib/pickPhoto';
import { uploadImage } from '@/lib/upload';

/**
 * "Ma boutique": a student's own shop, inside the student space. Without one: the form to open it (name, what they
 * sell, brand picture). With one: its banner, their articles (add, edit, switch off) and its profile; the orders open
 * the shop's space. Their articles show in Campus › Boutiques with the « Étudiant » badge.
 */
export default function MaBoutique() {
  const { spaces } = useAuth();
  const shop = ownShop(spaces);
  return shop?.orgId ? <MyShop orgId={shop.orgId} spaceKey={shop.key} /> : <OpenShop />;
}

type Tab = 'items' | 'profile';

function MyShop({ orgId, spaceKey }: { orgId: string; spaceKey: string }) {
  const { openSpace } = useAuth();
  const target: BusinessRef = { orgId, kind: 'shop' };
  const [b, setB] = useState<BusinessDto | null>(null);
  const [ref, setRef] = useState<CommerceReference | null>(null);
  const [tab, setTab] = useState<Tab>('items');
  const [saving, setSaving] = useState(false);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profil'));

  useFocusEffect(
    useCallback(() => {
      commerceApi.mine({ orgId, kind: 'shop' }).then(setB, () => undefined);
      commerceApi.reference().then(setRef, () => undefined);
    }, [orgId]),
  );

  // Away for a few days: the shop stays listed, orders are paused.
  const pause = async (accepting: boolean) => {
    if (!b) return;
    setSaving(true);
    try {
      setB(await commerceApi.updateMine(target, { acceptingOrders: accepting }));
    } catch (err) {
      Alert.alert('Changement impossible', err instanceof ApiError ? err.message : 'Réessaie dans un instant.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.head}>
        <BackButton onPress={back} />
        <Text style={styles.h1}>Ma boutique</Text>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {!b ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
          ) : (
            <>
              <View style={[styles.banner, shadow.card]}>
                <View style={styles.bannerImage}>
                  {b.photo ? <Image source={{ uri: b.photo }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Ionicons name="storefront-outline" size={30} color={colors.primary} />}
                </View>
                <View style={styles.bannerBody}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.shopName} numberOfLines={1}>
                      {b.name}
                    </Text>
                    <Text style={styles.muted} numberOfLines={1}>
                      {b.specialty} · {b.acceptingOrders ? 'Commandes ouvertes' : 'Commandes en pause'}
                    </Text>
                  </View>
                  <Switch value={b.acceptingOrders} onValueChange={pause} disabled={saving} trackColor={{ true: colors.success }} accessibilityLabel="Accepter les commandes" />
                </View>
                <View style={styles.bannerActions}>
                  <Pressable style={({ pressed }) => [styles.action, pressed && { opacity: 0.8 }]} onPress={() => openSpace(spaceKey)} accessibilityRole="button">
                    <Ionicons name="receipt-outline" size={16} color="#fff" />
                    <Text style={styles.actionText}>Mes commandes</Text>
                  </Pressable>
                  <Pressable style={({ pressed }) => [styles.action, styles.actionSoft, pressed && { opacity: 0.8 }]} onPress={() => router.push({ pathname: '/(tabs)/lieux', params: { vue: 'boutiques', boutique: b.id } })} accessibilityRole="button">
                    <Ionicons name="eye-outline" size={16} color={colors.primary} />
                    <Text style={[styles.actionText, { color: colors.primary }]}>Voir comme un client</Text>
                  </Pressable>
                </View>
              </View>

              <Segmented
                options={[
                  { value: 'items', label: 'Mes articles' },
                  { value: 'profile', label: 'Ma fiche' },
                ]}
                value={tab}
                onChange={setTab}
              />
              {tab === 'items' ? (
                <CatalogEditor target={target} kind="shop" canManage title="Mes articles" />
              ) : ref ? (
                <BusinessProfileForm key={b.id} b={b} target={target} reference={ref} onSaved={setB} />
              ) : (
                <ActivityIndicator color={colors.primary} />
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function OpenShop() {
  const { reloadAccount } = useAuth();
  const [ref, setRef] = useState<CommerceReference | null>(null);
  const [name, setName] = useState('');
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<{ id: string; url: string } | null>(null);
  const [busy, setBusy] = useState<'photo' | 'save' | null>(null);
  useEffect(() => {
    commerceApi.reference().then(setRef, () => undefined);
  }, []);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profil'));

  const pick = async () => {
    const [asset] = await pickPhoto({ aspect: [2, 1], title: 'Ton image de marque' });
    if (!asset) return;
    setBusy('photo');
    try {
      const up = await uploadImage(asset, 'business');
      setPhoto({ id: up.id, url: up.url });
    } catch (err) {
      Alert.alert('Image refusée', err instanceof ApiError ? err.message : 'Réessaie.');
    } finally {
      setBusy(null);
    }
  };

  const open = async () => {
    setBusy('save');
    try {
      const shop = await api<BusinessDto>('POST', '/me/shop', { auth: true, body: { name: name.trim(), specialties, description: description.trim(), ...(photo ? { photoId: photo.id } : {}) } });
      // The page turns into the shop itself (its articles first).
      await reloadAccount();
      Alert.alert('Ta boutique est ouverte', `${shop.name} : ajoute tes articles, ils apparaissent dans Campus › Boutiques.`);
    } catch (err) {
      Alert.alert('Ouverture impossible', err instanceof ApiError ? err.message : 'Réessaie dans un instant.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.head}>
        <BackButton onPress={back} />
        <Text style={styles.h1}>Vendre sur le campus</Text>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={[styles.intro, shadow.card]}>
            <Ionicons name="storefront-outline" size={22} color={colors.primary} />
            <Text style={styles.introText}>Tes produits ou tes services (tresses, cours, snacks…) dans la rubrique Boutiques. Les étudiants commandent et paient en ligne ; l’argent arrive sur ton numéro.</Text>
          </View>
          <Pressable style={styles.cover} onPress={pick} accessibilityRole="button" accessibilityLabel="Ajouter ton image de marque">
            {photo ? <Image source={{ uri: photo.url }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Ionicons name="image-outline" size={28} color={colors.primary} />}
            <View style={styles.badge}>
              {busy === 'photo' ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="camera" size={14} color="#fff" />}
              <Text style={styles.badgeText}>{photo ? 'Changer l’image' : 'Ton image de marque'}</Text>
            </View>
          </Pressable>
          <LabeledField label="Nom de ta boutique">
            <Field placeholder="Tresses by Awa" value={name} onChangeText={setName} maxLength={60} />
          </LabeledField>
          <LabeledField label="Ce que tu vends">
            <MultiSelect icon="pricetag-outline" title="Ce que tu vends" placeholder="Choisir (un ou plusieurs)" values={specialties} options={ref?.specialties.shop ?? []} max={ref?.maxSpecialties ?? 1} onChange={setSpecialties} disabled={!ref} />
          </LabeledField>
          <LabeledField label="Présentation (facultatif)">
            <Field placeholder="Où te trouver, tes horaires, ce qui te rend unique…" value={description} onChangeText={setDescription} maxLength={500} multiline />
          </LabeledField>
          <PrimaryButton label="Ouvrir ma boutique" disabled={name.trim().length < 2 || !specialties.length || !!busy} loading={busy === 'save'} onPress={open} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 8 },
  h1: { ...typo.h3, color: colors.navy, flex: 1 },
  body: { padding: 20, gap: 14, paddingBottom: 40 },
  intro: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: radii.lg, backgroundColor: colors.card },
  introText: { ...typo.small, color: colors.muted2, flex: 1, lineHeight: 19 },
  cover: { height: 150, borderRadius: radii.lg, backgroundColor: colors.primarySoft, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', right: 10, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: 'rgba(10,16,40,0.65)' },
  badgeText: { ...typo.captionStrong, color: '#fff' },
  muted: { ...typo.caption, color: colors.muted2 },
  banner: { backgroundColor: colors.card, borderRadius: radii.lg, overflow: 'hidden' },
  bannerImage: { height: 120, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  bannerBody: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 12 },
  shopName: { ...typo.title, color: colors.navy },
  bannerActions: { flexDirection: 'row', gap: 8, padding: 14, flexWrap: 'wrap' },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, minHeight: 40, borderRadius: radii.pill, backgroundColor: colors.primary },
  actionSoft: { backgroundColor: colors.primarySoft },
  actionText: { ...typo.smallStrong, color: '#fff' },
});
