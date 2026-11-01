import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SpacesList } from '@/components/SpacesList';
import { Field, LabeledField, PrimaryButton } from '@/components/ui';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { commerceApi, type BusinessDto } from '@/features/commerce/api';
import { CAMPUSES } from '@/features/register/validation';
import { ApiError } from '@/lib/api';
import { openDirections } from '@/lib/maps';
import { uploadImage } from '@/lib/upload';

const fail = (title: string) => (err: unknown) => Alert.alert(title, err instanceof ApiError ? err.message : 'Réessaie dans un instant.');
const HHMM = /^\d{2}:\d{2}$/;

/**
 * What students see of the business: its picture, where it is (GPS point for directions, in words, campus), its
 * number, its hours and delivery. The owner and managers edit it; everyone sees the account and the spaces.
 */
export default function Commerce() {
  const { business, user, logout } = useAuth();
  const [b, setB] = useState<BusinessDto | null>(null);
  const orgId = business?.orgId;

  useFocusEffect(
    useCallback(() => {
      if (orgId) commerceApi.mine(orgId).then(setB, fail('Chargement impossible'));
    }, [orgId]),
  );

  if (!business || !orgId) return null;
  const confirmLogout = () =>
    Alert.alert('Se déconnecter ?', 'Tu ne recevras plus les nouvelles commandes sur ce téléphone.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Se déconnecter', style: 'destructive', onPress: logout },
    ]);
  const canManage = business.roles.some((r) => r === 'owner' || r === 'manager');

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
          {!b ? <ActivityIndicator color={colors.primary} /> : canManage ? <ProfileForm key={b.id} b={b} orgId={orgId} onSaved={setB} /> : <ProfileView b={b} />}

          <Text style={styles.section}>Compte</Text>
          <View style={[styles.card, shadow.card, styles.row]}>
            <View style={styles.avatar}>
              <Text style={styles.initials}>{user?.initials}</Text>
            </View>
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
    </View>
  );
}

function ProfileForm({ b, orgId, onSaved }: { b: BusinessDto; orgId: string; onSaved: (b: BusinessDto) => void }) {
  const [photo, setPhoto] = useState<{ id: string | null; url: string | null }>({ id: null, url: b.photo });
  const [uploading, setUploading] = useState(false);
  const [specialty, setSpecialty] = useState(b.specialty);
  const [description, setDescription] = useState(b.description);
  const [address, setAddress] = useState(b.address);
  const [campus, setCampus] = useState(b.campus);
  const [phone, setPhone] = useState(b.phone);
  const [lat, setLat] = useState(b.location ? String(b.location.lat) : '');
  const [lng, setLng] = useState(b.location ? String(b.location.lng) : '');
  const [locating, setLocating] = useState(false);
  const [services, setServices] = useState(b.services.map((s) => ({ ...s })));
  const [delivers, setDelivers] = useState(b.deliveryFee !== null);
  const [fee, setFee] = useState(String(b.deliveryFee ?? 0));
  const [saving, setSaving] = useState(false);

  const pick = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [2, 1], quality: 0.85 });
    if (res.canceled || !res.assets[0]) return;
    setUploading(true);
    try {
      const up = await uploadImage(res.assets[0], 'business');
      setPhoto({ id: up.id, url: up.url });
    } catch (err) {
      fail('Image refusée')(err);
    } finally {
      setUploading(false);
    }
  };

  // Standing at the counter: the phone's position is the business's.
  const here = async () => {
    setLocating(true);
    try {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) return Alert.alert('Position refusée', 'Autorise la localisation, ou saisis la latitude et la longitude.');
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLat(pos.coords.latitude.toFixed(6));
      setLng(pos.coords.longitude.toFixed(6));
    } catch {
      Alert.alert('Position introuvable', 'Réessaie dehors, ou saisis-la à la main.');
    } finally {
      setLocating(false);
    }
  };

  const location = lat && lng ? { lat: Number(lat), lng: Number(lng) } : null;
  const locationOk = (!lat && !lng) || (!!location && Math.abs(location.lat) <= 90 && Math.abs(location.lng) <= 180);
  const servicesOk = services.length > 0 && services.every((s) => HHMM.test(s.start) && HHMM.test(s.end) && s.start < s.end);
  const ready = locationOk && servicesOk && (!delivers || /^\d+$/.test(fee)) && !uploading && !saving;

  const save = async () => {
    setSaving(true);
    try {
      const saved = await commerceApi.updateMine(orgId, {
        ...(photo.id ? { photoId: photo.id } : {}),
        specialty: specialty.trim(), description: description.trim(), address: address.trim(), campus, phone: phone.trim(), location, services,
        deliveryFee: delivers ? Number(fee) : null,
      });
      onSaved(saved);
      Alert.alert('Enregistré', 'Les étudiants voient tes changements tout de suite.');
    } catch (err) {
      fail('Enregistrement impossible')(err);
    } finally {
      setSaving(false);
    }
  };

  const setService = (i: number, key: 'start' | 'end', v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 4);
    const value = digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
    setServices((list) => list.map((s, j) => (j === i ? { ...s, [key]: value } : s)));
  };

  return (
    <View style={{ gap: 12 }}>
      <Pressable style={styles.coverPick} onPress={pick} accessibilityRole="button" accessibilityLabel="Changer la photo">
        {photo.url ? <Image source={{ uri: photo.url }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Ionicons name="camera-outline" size={28} color={colors.primary} />}
        <View style={styles.coverBadge}>
          {uploading ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="camera" size={14} color="#fff" />}
          <Text style={styles.coverBadgeText}>{photo.url ? 'Changer la photo' : 'Ajouter une photo'}</Text>
        </View>
      </Pressable>
      <Text style={styles.cardTitle}>{b.name}</Text>
      <LabeledField label={b.kind === 'restaurant' ? 'Cuisine' : 'Spécialité'}>
        <Field placeholder={b.kind === 'restaurant' ? 'Sénégalais, Grillades…' : 'Fournitures, Épicerie…'} value={specialty} onChangeText={setSpecialty} maxLength={40} />
      </LabeledField>
      <LabeledField label="Présentation">
        <Field placeholder="Ce qui vous rend uniques…" value={description} onChangeText={setDescription} maxLength={500} multiline />
      </LabeledField>
      <LabeledField label="Téléphone">
        <Field icon="call-outline" keyboardType="phone-pad" value={phone} onChangeText={setPhone} maxLength={20} />
      </LabeledField>

      <Text style={styles.section}>Où vous trouver</Text>
      <LabeledField label="Adresse (comme les étudiants la disent)">
        <Field icon="location-outline" placeholder="Près du Village E" value={address} onChangeText={setAddress} maxLength={80} />
      </LabeledField>
      <View style={styles.row}>
        {CAMPUSES.map((c) => (
          <Pressable key={c.key} onPress={() => setCampus(campus === c.key ? null : c.key)} style={[styles.chip, campus === c.key && styles.chipOn]}>
            <Text style={[styles.chipText, campus === c.key && { color: '#fff' }]}>{c.label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <LabeledField label="Latitude">
            <Field keyboardType="numbers-and-punctuation" placeholder="16.0603" value={lat} onChangeText={setLat} maxLength={12} />
          </LabeledField>
        </View>
        <View style={{ flex: 1 }}>
          <LabeledField label="Longitude">
            <Field keyboardType="numbers-and-punctuation" placeholder="-16.4262" value={lng} onChangeText={setLng} maxLength={12} />
          </LabeledField>
        </View>
      </View>
      <View style={styles.row}>
        <Pressable style={styles.locBtn} onPress={here} disabled={locating} accessibilityRole="button">
          {locating ? <ActivityIndicator color={colors.primary} size="small" /> : <Ionicons name="locate" size={16} color={colors.primary} />}
          <Text style={styles.locText}>Ma position actuelle</Text>
        </Pressable>
        {location && locationOk && (
          <Pressable style={styles.locBtn} onPress={() => openDirections(location, b.name)} accessibilityRole="button">
            <Ionicons name="map-outline" size={16} color={colors.primary} />
            <Text style={styles.locText}>Vérifier sur la carte</Text>
          </Pressable>
        )}
      </View>

      <Text style={styles.section}>Horaires (tous les jours)</Text>
      {services.map((s, i) => (
        <View key={i} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Field placeholder="12:00" keyboardType="number-pad" value={s.start} onChangeText={(v) => setService(i, 'start', v)} maxLength={5} />
          </View>
          <Text style={styles.muted}>à</Text>
          <View style={{ flex: 1 }}>
            <Field placeholder="15:00" keyboardType="number-pad" value={s.end} onChangeText={(v) => setService(i, 'end', v)} maxLength={5} />
          </View>
          {services.length > 1 && (
            <Pressable onPress={() => setServices((list) => list.filter((_, j) => j !== i))} hitSlop={8} accessibilityLabel="Retirer ce service">
              <Ionicons name="close-circle" size={22} color={colors.muted} />
            </Pressable>
          )}
        </View>
      ))}
      {services.length < 4 && (
        <Pressable onPress={() => setServices((list) => [...list, { start: '19:00', end: '22:00' }])} hitSlop={8}>
          <Text style={styles.link}>+ Ajouter un service</Text>
        </Pressable>
      )}
      {!servicesOk && <Text style={styles.warn}>Horaires au format 12:00, la fin après le début.</Text>}

      <Text style={styles.section}>Livraison</Text>
      <View style={[styles.card, shadow.card, styles.row]}>
        <Ionicons name="bicycle-outline" size={20} color={colors.primary} />
        <Text style={[styles.cardTitle, { flex: 1 }]}>Je livre sur le campus</Text>
        <Switch value={delivers} onValueChange={setDelivers} trackColor={{ true: colors.success }} />
      </View>
      {delivers && (
        <LabeledField label="Frais de livraison (FCFA, 0 = gratuite)">
          <Field keyboardType="number-pad" value={fee} onChangeText={(v) => setFee(v.replace(/\D/g, ''))} maxLength={4} />
        </LabeledField>
      )}

      <PrimaryButton label="Enregistrer" disabled={!ready} loading={saving} onPress={save} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 20, gap: 12, paddingBottom: 40 },
  h1: { ...typo.h2, color: colors.navy },
  section: { ...typo.title, color: colors.navy, marginTop: 10 },
  card: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 14, gap: 8 },
  cardTitle: { ...typo.title, color: colors.navy },
  muted: { ...typo.caption, color: colors.muted2 },
  warn: { ...typo.small, color: colors.dangerText },
  link: { color: colors.primary, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  cover: { height: 140, borderRadius: radii.md },
  coverPick: { height: 170, borderRadius: radii.lg, backgroundColor: colors.primarySoft, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  coverBadge: { position: 'absolute', right: 10, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: 'rgba(10,16,40,0.65)' },
  coverBadgeText: { ...typo.captionStrong, color: '#fff' },
  chip: { paddingHorizontal: 14, minHeight: 36, borderRadius: radii.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typo.smallStrong, color: colors.navy },
  locBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, minHeight: 38, borderRadius: radii.pill, backgroundColor: colors.primarySoft },
  locText: { ...typo.smallStrong, color: colors.primary },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  initials: { ...typo.bodyStrong, color: colors.primary },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headLogout: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 36, paddingHorizontal: 12, borderRadius: radii.pill, backgroundColor: colors.dangerBg },
  headLogoutText: { ...typo.smallStrong, color: colors.dangerText },
  logout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 48 },
  logoutText: { ...typo.bodyStrong, color: colors.dangerText },
});
