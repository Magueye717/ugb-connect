import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/states';
import { Field, LabeledField, PrimaryButton, Segmented } from '@/components/ui';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { commerceApi, type BusinessDto, type BusinessKind } from '@/features/commerce/api';
import { CAMPUSES } from '@/features/register/validation';
import { ApiError } from '@/lib/api';

const fail = (title: string) => (err: unknown) => Alert.alert(title, err instanceof ApiError ? err.message : 'Réessaie dans un instant.');

/**
 * Admins: the private restaurants and shops. Creating one makes its organization and its owner's account (they choose
 * their password with "mot de passe oublié"); the owner then fills the profile and the catalog, and adds the team.
 */
export default function Commerces() {
  const [items, setItems] = useState<BusinessDto[] | null>(null);
  const [kind, setKind] = useState<BusinessKind>('restaurant');
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    commerceApi.all().then((r) => setItems(r.items), () => setItems((x) => x ?? []));
  }, []);
  useFocusEffect(load);

  const toggle = (b: BusinessDto, active: boolean) => {
    setItems((list) => list?.map((x) => (x.id === b.id ? { ...x, active } : x)) ?? null);
    commerceApi.setActive(b.id, active).catch((err) => {
      fail('Changement impossible')(err);
      load();
    });
  };
  const list = items?.filter((b) => b.kind === kind) ?? [];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.row}>
          <Text style={[styles.h1, { flex: 1 }]}>Commerces</Text>
          <Pressable style={styles.add} onPress={() => setCreating(true)} accessibilityRole="button">
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addText}>Créer</Text>
          </Pressable>
        </View>
        <Segmented
          options={[
            { value: 'restaurant', label: 'Restos privés' },
            { value: 'shop', label: 'Boutiques' },
          ]}
          value={kind}
          onChange={setKind}
        />
        {!items && <ActivityIndicator color={colors.primary} />}
        {items && !list.length && <EmptyState icon="storefront-outline" title="Aucun commerce" text="Crée le premier : son propriétaire reçoit son espace." />}
        {list.map((b) => (
          <View key={b.id} style={[styles.card, shadow.card, !b.active && { opacity: 0.6 }]}>
            <View style={styles.thumb}>{b.photo ? <Image source={{ uri: b.photo }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Ionicons name={b.kind === 'shop' ? 'storefront' : 'restaurant'} size={20} color={colors.primary} />}</View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{b.name}</Text>
              <Text style={styles.muted} numberOfLines={1}>
                {[b.specialty, b.address, b.campusLabel].filter(Boolean).join(' · ') || b.specialty}
              </Text>
              <Text style={styles.muted}>{b.active ? b.statusLabel : 'Masqué aux étudiants'}</Text>
            </View>
            <Switch value={b.active} onValueChange={(v) => toggle(b, v)} trackColor={{ true: colors.success }} accessibilityLabel={`${b.name} visible`} />
          </View>
        ))}
      </ScrollView>
      {creating && (
        <CreateSheet
          kind={kind}
          onClose={() => setCreating(false)}
          onCreated={(b) => {
            setCreating(false);
            setKind(b.kind);
            load();
            Alert.alert(`${b.name} est créé`, 'Son propriétaire a maintenant son espace : il choisit son mot de passe avec « Mot de passe oublié », puis complète la photo, la position et le catalogue.');
          }}
        />
      )}
    </SafeAreaView>
  );
}

function CreateSheet({ kind: initial, onClose, onCreated }: { kind: BusinessKind; onClose: () => void; onCreated: (b: BusinessDto) => void }) {
  const [kind, setKind] = useState<BusinessKind>(initial);
  const [name, setName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [address, setAddress] = useState('');
  const [campus, setCampus] = useState<'campus1' | 'campus2' | null>(null);
  const [phone, setPhone] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [saving, setSaving] = useState(false);
  const ready = name.trim().length >= 2 && specialty.trim().length >= 2 && phone.replace(/\D/g, '').length >= 9 && firstName.trim().length >= 2 && lastName.trim().length >= 2 && !saving;

  const create = async () => {
    setSaving(true);
    try {
      onCreated(
        await commerceApi.create({
          kind, name: name.trim(), specialty: specialty.trim(), address: address.trim(), campus,
          owner: { phone: phone.replace(/\s/g, ''), firstName: firstName.trim(), lastName: lastName.trim() },
        }),
      );
    } catch (err) {
      fail('Création impossible')(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.sheet} contentContainerStyle={{ gap: 12, paddingBottom: 36 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.sheetTitle}>Nouveau commerce</Text>
          <Segmented
            options={[
              { value: 'restaurant', label: 'Restaurant' },
              { value: 'shop', label: 'Boutique' },
            ]}
            value={kind}
            onChange={setKind}
          />
          <LabeledField label="Nom">
            <Field placeholder={kind === 'restaurant' ? 'Chez Fatou' : 'Papeterie du Campus'} value={name} onChangeText={setName} maxLength={60} />
          </LabeledField>
          <LabeledField label={kind === 'restaurant' ? 'Cuisine' : 'Spécialité'}>
            <Field placeholder={kind === 'restaurant' ? 'Sénégalais, Grillades…' : 'Fournitures, Épicerie…'} value={specialty} onChangeText={setSpecialty} maxLength={40} />
          </LabeledField>
          <LabeledField label="Adresse (facultatif)">
            <Field placeholder="Près du Village E" value={address} onChangeText={setAddress} maxLength={80} />
          </LabeledField>
          <View style={styles.row}>
            {CAMPUSES.map((c) => (
              <Pressable key={c.key} onPress={() => setCampus(campus === c.key ? null : c.key)} style={[styles.chip, campus === c.key && styles.chipOn]}>
                <Text style={[styles.chipText, campus === c.key && { color: '#fff' }]}>{c.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.section}>Propriétaire</Text>
          <LabeledField label="Téléphone (son identifiant)">
            <Field icon="call-outline" keyboardType="phone-pad" placeholder="77 123 45 67" value={phone} onChangeText={setPhone} maxLength={16} />
          </LabeledField>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <LabeledField label="Prénom">
                <Field value={firstName} onChangeText={setFirstName} autoCapitalize="words" maxLength={40} />
              </LabeledField>
            </View>
            <View style={{ flex: 1 }}>
              <LabeledField label="Nom">
                <Field value={lastName} onChangeText={setLastName} autoCapitalize="words" maxLength={40} />
              </LabeledField>
            </View>
          </View>
          <Text style={styles.muted}>Les paiements des commandes vont sur ce numéro (Wave / Orange Money).</Text>
          <PrimaryButton label="Créer le commerce" disabled={!ready} loading={saving} onPress={create} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 20, gap: 12, paddingBottom: 32 },
  h1: { ...typo.h2, color: colors.navy },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  add: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, minHeight: 38, borderRadius: radii.pill, backgroundColor: colors.primary },
  addText: { ...typo.smallStrong, color: '#fff' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: radii.lg, padding: 12 },
  thumb: { width: 52, height: 52, borderRadius: radii.sm, backgroundColor: colors.primarySoft, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  name: { ...typo.bodyStrong, color: colors.navy },
  muted: { ...typo.caption, color: colors.muted2 },
  section: { ...typo.title, color: colors.navy, marginTop: 4 },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,27,76,0.35)' },
  sheet: { maxHeight: 680, backgroundColor: colors.card, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: 20 },
  sheetTitle: { ...typo.h3, color: colors.navy },
  chip: { paddingHorizontal: 14, minHeight: 36, borderRadius: radii.pill, backgroundColor: colors.bg, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.primary },
  chipText: { ...typo.smallStrong, color: colors.navy },
});
