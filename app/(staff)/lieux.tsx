import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState, ErrorState } from '@/components/states';
import { Chip, Field, LabeledField, PrimaryButton, SafeBottom, SheetHeader, Toggle } from '@/components/ui';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { PLACE_CATEGORIES, placeIcon, placesApi, placeTone, type PlaceCategory, type PlaceDto } from '@/features/places/api';
import { CAMPUSES } from '@/features/register/validation';
import { ApiError } from '@/lib/api';
import { pickPhoto } from '@/lib/pickPhoto';
import { matches } from '@/lib/search';
import { uploadImage } from '@/lib/upload';
import { askToRelocate } from '@/lib/relocate';

const fail = (title: string) => (err: unknown) => Alert.alert(title, err instanceof ApiError ? err.message : 'Réessaie dans un instant.');
const MAX_PHOTOS = 6;

/**
 * The communication team: the campus places students see in the Lieux tab and on the map. Add, edit (photos, GPS
 * point taken on site, hours), hide or remove.
 */
export default function LieuxAdmin() {
  const [items, setItems] = useState<PlaceDto[] | null>(null);
  // The first load failed (no network…): « Impossible de charger », with « Réessayer » (not an empty list).
  const [loadFailed, setLoadFailed] = useState(false);
  const [editing, setEditing] = useState<PlaceDto | 'new' | null>(null);
  // Find a place among many (before editing it, or to check it's not already there before adding it).
  const [query, setQuery] = useState('');
  const shown = (items ?? []).filter((p) => matches(query, [p.name, p.area, p.category, p.description]));

  const load = useCallback(() => {
    setLoadFailed(false);
    placesApi.all().then((r) => setItems(r.items), () => setLoadFailed(true));
  }, []);
  useFocusEffect(load);

  const toggle = (p: PlaceDto, active: boolean) => {
    setItems((list) => list?.map((x) => (x.id === p.id ? { ...x, active } : x)) ?? null);
    placesApi.update(p.id, { active }).catch((err) => {
      fail('Changement impossible')(err);
      load();
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <View style={styles.row}>
          <Text style={[styles.h1, { flex: 1 }]}>Lieux du campus</Text>
          <Pressable style={styles.add} onPress={() => setEditing('new')} accessibilityRole="button">
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addText}>Ajouter</Text>
          </Pressable>
        </View>
        <Text style={styles.sub}>Ce que les étudiants voient dans l’onglet Lieux et sur la carte du campus.</Text>
        {!!items?.length && (
          <Field
            icon="search"
            placeholder="Nom, quartier, catégorie…"
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Rechercher un lieu"
            right={
              query ? (
                <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Effacer la recherche">
                  <Ionicons name="close-circle" size={18} color={colors.muted} />
                </Pressable>
              ) : null
            }
          />
        )}
        {!!query.trim() && !!items?.length && (
          <Text style={styles.muted}>
            {shown.length} lieu{shown.length > 1 ? 'x' : ''} sur {items.length}
          </Text>
        )}
        {!items && !loadFailed && <ActivityIndicator color={colors.primary} />}
        {!items && loadFailed && <ErrorState onRetry={load} />}
        {items?.length === 0 && <EmptyState icon="map-outline" title="Aucun lieu" text="Ajoute la bibliothèque, le rectorat, le centre médical…" />}
        {!!items?.length && shown.length === 0 && (
          <EmptyState
            icon="search-outline"
            title={`Aucun lieu pour « ${query.trim()} »`}
            text="Vérifie l’orthographe, ou ajoute-le s’il n’existe pas encore."
            action={{ label: 'Effacer la recherche', onPress: () => setQuery('') }}
          />
        )}
        {shown.map((p) => {
          const tone = placeTone(p.category);
          return (
            <Pressable key={p.id} style={[styles.card, shadow.card, !p.active && { opacity: 0.55 }]} onPress={() => setEditing(p)} accessibilityRole="button">
              <View style={[styles.thumb, { backgroundColor: tone.bg }]}>
                {p.photos[0] ? <Image source={{ uri: p.photos[0] }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Ionicons name={placeIcon(p.icon)} size={20} color={tone.tint} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {p.name}
                </Text>
                <Text style={styles.muted} numberOfLines={1}>
                  {[p.category, p.area].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Toggle value={p.active} onValueChange={(v) => toggle(p, v)} accessibilityLabel={`${p.name} visible`} />
            </Pressable>
          );
        })}
      </ScrollView>
      {editing && (
        <PlaceEditor
          place={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </SafeAreaView>
  );
}

function PlaceEditor({ place, onClose, onSaved }: { place: PlaceDto | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(place?.name ?? '');
  const [category, setCategory] = useState<PlaceCategory>(place?.category ?? 'Services');
  const [description, setDescription] = useState(place?.description ?? '');
  const [area, setArea] = useState(place?.area ?? '');
  const [campus, setCampus] = useState(place?.campus ?? null);
  const [hours, setHours] = useState(place?.hours ?? '');
  const [lat, setLat] = useState(place ? String(place.location.lat) : '');
  const [lng, setLng] = useState(place ? String(place.location.lng) : '');
  // Each picture: what the API wants back (an upload id, or a seeded url) and what to show.
  const [photos, setPhotos] = useState<{ ref: string; url: string }[]>(place ? place.photos.map((url, i) => ({ ref: place.photoRefs[i]!, url })) : []);
  const [uploading, setUploading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);

  const pick = async () => {
    const assets = await pickPhoto({ multiple: MAX_PHOTOS - photos.length, title: 'Photos du lieu' });
    if (!assets.length) return;
    setUploading(true);
    try {
      for (const a of assets) {
        const up = await uploadImage(a, 'place');
        setPhotos((list) => [...list, { ref: up.id, url: up.url }]);
      }
    } catch (err) {
      fail('Image refusée')(err);
    } finally {
      setUploading(false);
    }
  };

  // On site: the phone's position is the place's.
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
  // Another campus for something already placed: ask at once whether its position on the map changed too.
  const pickCampus = (key: 'campus1' | 'campus2', label: string) => {
    const next = campus === key ? null : key;
    setCampus(next);
    if (next && next !== campus && (campus !== null || !!location)) askToRelocate(label, here);
  };

  const location = { lat: Number(lat), lng: Number(lng) };
  const locationOk = !!lat && !!lng && Number.isFinite(location.lat) && Number.isFinite(location.lng) && Math.abs(location.lat) <= 90 && Math.abs(location.lng) <= 180;
  const ready = name.trim().length >= 2 && locationOk && !uploading && !saving;

  const save = async () => {
    setSaving(true);
    try {
      const body = { name: name.trim(), category, description: description.trim(), area: area.trim(), campus, hours: hours.trim() || null, location, photos: photos.map((p) => p.ref) };
      if (place) await placesApi.update(place.id, body);
      else await placesApi.create(body);
      onSaved();
    } catch (err) {
      fail('Enregistrement impossible')(err);
    } finally {
      setSaving(false);
    }
  };
  const remove = () =>
    place &&
    Alert.alert(`Supprimer « ${place.name} » ?`, 'Il disparaît de la liste et de la carte. Pour le cacher un temps, désactive-le plutôt.', [
      { text: 'Garder', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => placesApi.remove(place.id).then(onSaved, fail('Suppression impossible')) },
    ]);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior="padding" style={{ flexShrink: 1 }}>
        <ScrollView style={styles.sheet} contentContainerStyle={{ gap: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <SheetHeader onClose={onClose} titleStyle={styles.sheetTitle}>{place ? 'Modifier le lieu' : 'Nouveau lieu'}</SheetHeader>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photos}>
            {photos.map((p, i) => (
              <View key={p.ref}>
                <Image source={{ uri: p.url }} style={styles.photo} contentFit="cover" />
                {i === 0 && (
                  <View style={styles.coverTag}>
                    <Text style={styles.coverTagText}>Couverture</Text>
                  </View>
                )}
                <Pressable style={styles.remove} onPress={() => setPhotos((list) => list.filter((x) => x.ref !== p.ref))} hitSlop={6} accessibilityLabel="Retirer la photo">
                  <Ionicons name="close" size={14} color="#fff" />
                </Pressable>
              </View>
            ))}
            {photos.length < MAX_PHOTOS && (
              <Pressable style={[styles.photo, styles.addPhoto]} onPress={pick} accessibilityRole="button" accessibilityLabel="Ajouter des photos">
                {uploading ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="add" size={26} color={colors.primary} />}
              </Pressable>
            )}
          </ScrollView>

          <LabeledField label="Nom">
            <Field placeholder="Bibliothèque universitaire" value={name} onChangeText={setName} maxLength={60} />
          </LabeledField>
          <View style={styles.wrap}>
            {PLACE_CATEGORIES.map((c) => (
              <Pressable key={c} onPress={() => setCategory(c)} style={[styles.chip, category === c && { backgroundColor: placeTone(c).tint }]}>
                <Text style={[styles.chipText, category === c && { color: '#fff' }]}>{c}</Text>
              </Pressable>
            ))}
          </View>
          <LabeledField label="Description">
            <Field placeholder="Ce qu’on y trouve, à quoi il sert…" value={description} onChangeText={setDescription} maxLength={600} multiline />
          </LabeledField>
          <LabeledField label="Emplacement (en mots)">
            <Field icon="location-outline" placeholder="Campus pédagogique · face à l’amphi A" value={area} onChangeText={setArea} maxLength={80} />
          </LabeledField>
          <View style={styles.wrap}>
            {CAMPUSES.map((c) => (
              <Chip key={c.key} label={c.label} selected={campus === c.key} onPress={() => pickCampus(c.key, c.label)} />
            ))}
          </View>
          <LabeledField label="Horaires (facultatif)">
            <Field icon="time-outline" placeholder="8h-22h · lun.-sam." value={hours} onChangeText={setHours} maxLength={60} />
          </LabeledField>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <LabeledField label="Latitude">
                <Field keyboardType="numbers-and-punctuation" placeholder="16.0629" value={lat} onChangeText={setLat} maxLength={12} />
              </LabeledField>
            </View>
            <View style={{ flex: 1 }}>
              <LabeledField label="Longitude">
                <Field keyboardType="numbers-and-punctuation" placeholder="-16.4232" value={lng} onChangeText={setLng} maxLength={12} />
              </LabeledField>
            </View>
          </View>
          <Pressable style={styles.locBtn} onPress={here} disabled={locating} accessibilityRole="button">
            {locating ? <ActivityIndicator color={colors.primary} size="small" /> : <Ionicons name="locate" size={16} color={colors.primary} />}
            <Text style={styles.locText}>Ma position actuelle (sur place)</Text>
          </Pressable>

          <PrimaryButton label="Enregistrer" disabled={!ready} loading={saving} onPress={save} />
          {place && (
            <Pressable onPress={remove} style={{ alignSelf: 'center' }} hitSlop={8}>
              <Text style={{ color: colors.dangerText, fontWeight: '700' }}>Supprimer le lieu</Text>
            </Pressable>
          )}
          <SafeBottom />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 20, gap: 12, paddingBottom: 32 },
  h1: { ...typo.h1, color: colors.navy },
  sub: { ...typo.small, color: colors.muted2, marginTop: -6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  add: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, minHeight: 38, borderRadius: radii.pill, backgroundColor: colors.primary },
  addText: { ...typo.smallStrong, color: '#fff' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: radii.lg, padding: 10 },
  thumb: { width: 50, height: 50, borderRadius: radii.sm, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  name: { ...typo.bodyStrong, color: colors.navy },
  muted: { ...typo.caption, color: colors.muted2 },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,27,76,0.35)' },
  sheet: { flexShrink: 1, maxHeight: 700, backgroundColor: colors.card, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: 20 },
  sheetTitle: { ...typo.h3, color: colors.navy },
  photos: { flexDirection: 'row', gap: 10 },
  photo: { width: 100, height: 76, borderRadius: radii.md, backgroundColor: colors.border },
  addPhoto: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.primary, backgroundColor: colors.primarySoft },
  coverTag: { position: 'absolute', left: 6, bottom: 6, backgroundColor: 'rgba(10,16,40,0.7)', borderRadius: radii.pill, paddingHorizontal: 6, paddingVertical: 2 },
  coverTagText: { ...typo.label, color: '#fff' },
  remove: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(10,16,40,0.7)', alignItems: 'center', justifyContent: 'center' },
  chip: { paddingHorizontal: 12, minHeight: 34, borderRadius: radii.pill, backgroundColor: colors.bg, justifyContent: 'center' },
  chipText: { ...typo.smallStrong, color: colors.navy },
  locBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 12, minHeight: 38, borderRadius: radii.pill, backgroundColor: colors.primarySoft },
  locText: { ...typo.smallStrong, color: colors.primary },
});
