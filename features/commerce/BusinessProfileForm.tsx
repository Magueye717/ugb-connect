import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { MultiSelect } from '@/components/Select';
import { Field, LabeledField, PrimaryButton, TextButton } from '@/components/ui';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { commerceApi, type BusinessDto, type BusinessTarget, type CommerceReference, type DeliveryZone } from '@/features/commerce/api';
import { CAMPUSES } from '@/features/register/validation';
import { ApiError } from '@/lib/api';
import { openDirections } from '@/lib/maps';
import { pickPhoto } from '@/lib/pickPhoto';
import { uploadImage } from '@/lib/upload';

const fail = (title: string) => (err: unknown) => Alert.alert(title, err instanceof ApiError ? err.message : 'Réessaie dans un instant.');
const HHMM = /^\d{2}:\d{2}$/;

/**
 * A business's profile as students see it: picture, specialty, where it is (GPS point, in words, campus), its number,
 * hours and delivery prices. Its owner fills it in their space; Référencement (`editor`) too, and may rename it.
 */
export function BusinessProfileForm({ b, target, reference, onSaved, editor = false }: { b: BusinessDto; target: BusinessTarget; reference: CommerceReference; onSaved: (b: BusinessDto) => void; editor?: boolean }) {
  const [name, setName] = useState(b.name);
  const [photo, setPhoto] = useState<{ id: string | null; url: string | null }>({ id: null, url: b.photo });
  const [uploading, setUploading] = useState(false);
  const [specialties, setSpecialties] = useState<string[]>(b.specialties);
  const [description, setDescription] = useState(b.description);
  const [address, setAddress] = useState(b.address);
  const [campus, setCampus] = useState(b.campus);
  const [phone, setPhone] = useState(b.phone);
  const [lat, setLat] = useState(b.location ? String(b.location.lat) : '');
  const [lng, setLng] = useState(b.location ? String(b.location.lng) : '');
  const [locating, setLocating] = useState(false);
  const [services, setServices] = useState(b.services.map((s) => ({ ...s })));
  // One price per zone (campus 1, campus 2, outside); empty: no delivery there.
  const [fees, setFees] = useState<Record<DeliveryZone, string>>({
    campus1: b.deliveryFees.campus1 === null ? '' : String(b.deliveryFees.campus1),
    campus2: b.deliveryFees.campus2 === null ? '' : String(b.deliveryFees.campus2),
    outside: b.deliveryFees.outside === null ? '' : String(b.deliveryFees.outside),
  });
  const [saving, setSaving] = useState(false);

  const pick = async () => {
    const [asset] = await pickPhoto({ aspect: [2, 1], title: 'Photo du commerce' });
    if (!asset) return;
    setUploading(true);
    try {
      const up = await uploadImage(asset, 'business');
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
  const ready = locationOk && servicesOk && specialties.length > 0 && name.trim().length >= 2 && !uploading && !saving;

  const save = async () => {
    setSaving(true);
    try {
      const saved = await commerceApi.updateMine(target, {
        ...(editor && name.trim() !== b.name ? { name: name.trim() } : {}),
        ...(photo.id ? { photoId: photo.id } : {}),
        specialties, description: description.trim(), address: address.trim(), campus, phone: phone.trim(), location, services,
        deliveryFees: { campus1: fees.campus1 === '' ? null : Number(fees.campus1), campus2: fees.campus2 === '' ? null : Number(fees.campus2), outside: fees.outside === '' ? null : Number(fees.outside) },
      });
      onSaved(saved);
      Alert.alert('Enregistré', editor ? 'Les étudiants voient les changements tout de suite.' : 'Les étudiants voient tes changements tout de suite.');
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
      {editor ? (
        <LabeledField label="Nom">
          <Field value={name} onChangeText={setName} maxLength={60} />
        </LabeledField>
      ) : (
        <Text style={styles.cardTitle}>{b.name}</Text>
      )}
      <LabeledField label={b.kind === 'restaurant' ? 'Cuisines' : 'Spécialités'}>
        <MultiSelect icon="pricetag-outline" title={b.kind === 'restaurant' ? 'Cuisines' : 'Spécialités'} placeholder="Choisir (une ou plusieurs)" values={specialties} options={reference.specialties[b.kind]} max={reference.maxSpecialties} onChange={setSpecialties} />
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
        <TextButton label="Ajouter un service" icon="add-circle-outline" onPress={() => setServices((list) => [...list, { start: '19:00', end: '22:00' }])} />
      )}
      {!servicesOk && <Text style={styles.warn}>Horaires au format 12:00, la fin après le début.</Text>}

      <Text style={styles.section}>Livraison</Text>
      <Text style={styles.muted}>Les zones livrées et leur prix (0 = gratuite). Sans zone : à emporter uniquement.</Text>
      <View style={[styles.card, shadow.card, { gap: 0, paddingVertical: 4 }]}>
        {reference.zones.map((z, i) => {
          const on = fees[z.value] !== '';
          return (
            <View key={z.value} style={[styles.zone, i > 0 && styles.zoneLine]}>
              <Ionicons name={z.value === 'outside' ? 'navigate-outline' : 'school-outline'} size={18} color={on ? colors.primary : colors.muted} />
              <Text style={[styles.cardTitle, { flex: 1 }]}>{z.label}</Text>
              {on && (
                <View style={{ width: 96 }}>
                  <Field keyboardType="number-pad" value={fees[z.value]} onChangeText={(v) => setFees((f) => ({ ...f, [z.value]: v.replace(/\D/g, '').slice(0, 4) || '0' }))} right={<Text style={styles.muted}>F</Text>} accessibilityLabel={`Prix de livraison, ${z.label}`} />
                </View>
              )}
              <Switch value={on} onValueChange={(v) => setFees((f) => ({ ...f, [z.value]: v ? '200' : '' }))} trackColor={{ true: colors.success }} accessibilityLabel={`Livrer : ${z.label}`} />
            </View>
          );
        })}
      </View>

      <PrimaryButton label="Enregistrer" disabled={!ready} loading={saving} onPress={save} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { ...typo.section, color: colors.navy, marginTop: 10 },
  card: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 14, gap: 8 },
  cardTitle: { ...typo.title, color: colors.navy },
  muted: { ...typo.caption, color: colors.muted2 },
  warn: { ...typo.small, color: colors.dangerText },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  coverPick: { height: 170, borderRadius: radii.lg, backgroundColor: colors.primarySoft, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  coverBadge: { position: 'absolute', right: 10, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: 'rgba(10,16,40,0.65)' },
  coverBadgeText: { ...typo.captionStrong, color: '#fff' },
  chip: { paddingHorizontal: 14, minHeight: 36, borderRadius: radii.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typo.smallStrong, color: colors.navy },
  locBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, minHeight: 38, borderRadius: radii.pill, backgroundColor: colors.primarySoft },
  locText: { ...typo.smallStrong, color: colors.primary },
  zone: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 64 },
  zoneLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
