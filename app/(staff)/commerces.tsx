import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MultiSelect } from '@/components/Select';
import { EmptyState } from '@/components/states';
import { Field, LabeledField, PrimaryButton, Segmented, TextButton } from '@/components/ui';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { commerceApi, type BusinessDto, type BusinessKind, type CommerceReference, type OwnedEntity } from '@/features/commerce/api';
import { CAMPUSES } from '@/features/register/validation';
import { ApiError } from '@/lib/api';
import { pickPhoto } from '@/lib/pickPhoto';
import { uploadImage } from '@/lib/upload';

const HHMM = /^\d{2}:\d{2}$/;
const fail = (title: string) => (err: unknown) => Alert.alert(title, err instanceof ApiError ? err.message : 'Réessaie dans un instant.');

/**
 * Référencement: the private restaurants and shops. Restaurant editors add restaurants, shop editors shops (the super
 * admin both). A new one is a new entity with its owner, or joins an existing entity (Khoulé & frère's restaurant opens
 * a shop). The form takes the picture, the position (the phone's, on site), the hours. A tap opens its profile and
 * its catalog (menus, articles): the editor keeps them up to date with the owner.
 */
export default function Commerces() {
  const { user } = useAuth();
  const roles = user?.roles ?? [];
  const kinds = (['restaurant', 'shop'] as const).filter((k) => roles.includes('admin') || roles.includes(k === 'restaurant' ? 'restaurant_editor' : 'shop_editor'));
  const [items, setItems] = useState<BusinessDto[] | null>(null);
  const [kind, setKind] = useState<BusinessKind>(kinds[0] ?? 'restaurant');
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
  // Entities that can take this kind too: they run the other one.
  const entities = [...new Map((items ?? []).filter((b) => b.kind !== kind && !(items ?? []).some((x) => x.orgId === b.orgId && x.kind === kind)).map((b) => [b.orgId, { orgId: b.orgId, name: b.name }])).values()];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.row}>
          <Text style={[styles.h1, { flex: 1 }]}>{kinds.length > 1 ? 'Commerces' : kind === 'restaurant' ? 'Restos privés' : 'Boutiques'}</Text>
          <Pressable style={styles.add} onPress={() => setCreating(true)} accessibilityRole="button">
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addText}>Ajouter</Text>
          </Pressable>
        </View>
        {kinds.length > 1 && (
          <Segmented
            options={[
              { value: 'restaurant', label: 'Restos privés' },
              { value: 'shop', label: 'Boutiques' },
            ]}
            value={kind}
            onChange={setKind}
          />
        )}
        {!items && <ActivityIndicator color={colors.primary} />}
        {items && !list.length && <EmptyState icon="storefront-outline" title={kind === 'restaurant' ? 'Aucun restaurant' : 'Aucune boutique'} text="Ajoute le premier : son propriétaire reçoit son espace." />}
        {list.map((b) => (
          <Pressable
            key={b.id}
            style={({ pressed }) => [styles.card, shadow.card, !b.active && { opacity: 0.6 }, pressed && { opacity: 0.85 }]}
            onPress={() => router.push(`/fiche-commerce/${b.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`${b.name}, modifier la fiche et le catalogue`}>
            <View style={styles.thumb}>{b.photo ? <Image source={{ uri: b.photo }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Ionicons name={b.kind === 'shop' ? 'storefront' : 'restaurant'} size={20} color={colors.primary} />}</View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{b.name}</Text>
              <Text style={styles.muted} numberOfLines={1}>
                {[b.specialty, b.address, b.campusLabel].filter(Boolean).join(' · ')}
              </Text>
              <Text style={styles.muted}>{b.active ? b.statusLabel : 'Masqué aux étudiants'}</Text>
            </View>
            <Switch value={b.active} onValueChange={(v) => toggle(b, v)} trackColor={{ true: colors.success }} accessibilityLabel={`${b.name} visible`} />
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        ))}
      </ScrollView>
      {creating && (
        <CreateSheet
          kind={kind}
          entities={entities}
          onClose={() => setCreating(false)}
          onCreated={(b, updated) => {
            setCreating(false);
            load();
            if (updated) return Alert.alert(`${b.name} est à jour`, 'Les étudiants voient les changements tout de suite.');
            Alert.alert(`${b.name} est ajouté`, 'Son propriétaire le retrouve dans « Mes espaces ». Ajoute ses menus ou ses articles maintenant, ou laisse-le faire.', [
              { text: 'Plus tard', style: 'cancel' },
              { text: 'Ajouter au catalogue', onPress: () => router.push(`/fiche-commerce/${b.id}`) },
            ]);
          }}
        />
      )}
    </SafeAreaView>
  );
}

const KIND_LABEL: Record<BusinessKind, string> = { restaurant: 'Restaurant', shop: 'Boutique' };

/**
 * Adding a restaurant or a shop. The owner's number comes first: one account owns one entity (one restaurant, one
 * shop, one organizer at most). A number whose entity doesn't run this kind: it is selected, the business joins it.
 * One whose entity already runs it: that business is loaded in the form, and saving updates it (never a second one).
 */
function CreateSheet({ kind, entities, onClose, onCreated }: { kind: BusinessKind; entities: { orgId: string; name: string }[]; onClose: () => void; onCreated: (b: BusinessDto, updated: boolean) => void }) {
  const [ref, setRef] = useState<CommerceReference | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [address, setAddress] = useState('');
  const [campus, setCampus] = useState<'campus1' | 'campus2' | null>(null);
  const [photo, setPhoto] = useState<{ id: string; url: string } | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [open, setOpen] = useState(kind === 'restaurant' ? '12:00' : '08:00');
  const [close, setClose] = useState(kind === 'restaurant' ? '22:00' : '20:00');
  const [phone, setPhone] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'photo' | 'locate' | 'save' | null>(null);
  // The owner's number, typed first: their account and the entities they own, looked up at 9 digits.
  const [lookup, setLookup] = useState<{ phone: string; failed?: true; account: { firstName: string; lastName: string } | null; entities: OwnedEntity[] } | null>(null);
  const digits = phone.replace(/\D/g, '').replace(/^221(?=\d{9}$)/, '');
  // The answer for the number now typed (an older one is ignored); "looking" until it arrives.
  const found = lookup && lookup.phone === digits && !lookup.failed ? lookup : null;
  const looking = digits.length === 9 && lookup?.phone !== digits;
  // The number's entity already runs this kind: that business, loaded in the form (saving updates it).
  const [editing, setEditing] = useState<{ phone: string; b: BusinessDto } | null>(null);
  const current = editing && editing.phone === digits ? editing.b : null;
  const entity = found?.entities[0] ?? null;

  const fill = (b: BusinessDto) => {
    setName(b.name);
    setSpecialties(b.specialties);
    setAddress(b.address);
    setCampus(b.campus);
    setLocation(b.location);
    setPhoto(b.photo ? { id: '', url: b.photo } : null);
    setOpen(b.services[0]?.start ?? '08:00');
    setClose(b.services[b.services.length - 1]?.end ?? '20:00');
  };
  // Another number than the loaded business's: the form starts over.
  const changePhone = (v: string) => {
    setPhone(v);
    if (editing && v.replace(/\D/g, '').replace(/^221(?=\d{9}$)/, '') !== editing.phone) {
      setEditing(null);
      blank();
    }
  };
  const blank = () => {
    setName('');
    setSpecialties([]);
    setAddress('');
    setCampus(null);
    setLocation(null);
    setPhoto(null);
    setOpen(kind === 'restaurant' ? '12:00' : '08:00');
    setClose(kind === 'restaurant' ? '22:00' : '20:00');
  };

  useEffect(() => {
    commerceApi.reference().then(setRef, () => undefined);
  }, []);

  useEffect(() => {
    if (digits.length !== 9) return;
    let live = true;
    commerceApi
      .ownerLookup(digits)
      .then((r) => {
        if (!live) return;
        setLookup({ phone: digits, ...r });
        if (r.account) {
          setFirstName((v) => v || r.account!.firstName);
          setLastName((v) => v || r.account!.lastName);
        }
        const own = r.entities[0];
        const same = own?.businesses.find((x) => x.kind === kind);
        if (same) {
          // Already theirs: its information fills the form.
          setOrgId(own!.orgId);
          commerceApi.mine({ editorOf: same.id }).then((b) => {
            if (!live) return;
            setEditing({ phone: digits, b });
            fill(b);
          }, fail('Chargement impossible'));
          return;
        }
        setOrgId(own?.orgId ?? null);
      }, () => live && setLookup({ phone: digits, failed: true, account: null, entities: [] }));
    return () => {
      live = false;
    };
  }, [digits, kind]);

  // The entities list: those running the other kind, and the one this number owns (by the entity's name).
  const choices = [...new Map([...entities, ...(found?.entities ?? []).filter((e) => !e.kinds.includes(kind))].map((e) => [e.orgId, { orgId: e.orgId, name: e.name }])).values()];
  // What the number's entity runs: "Restaurant : Khoulé & Frère · Organisateur".
  const runs = entity ? [...entity.businesses.map((x) => `${KIND_LABEL[x.kind]} : ${x.name}`), ...(entity.organizer ? ['Organisateur'] : [])] : [];

  const pick = async () => {
    const [asset] = await pickPhoto({ aspect: [2, 1], title: 'Photo du commerce' });
    if (!asset) return;
    setBusy('photo');
    try {
      const up = await uploadImage(asset, 'business');
      setPhoto({ id: up.id, url: up.url });
    } catch (err) {
      fail('Image refusée')(err);
    } finally {
      setBusy(null);
    }
  };
  // On site: the phone's position is the business's.
  const here = async () => {
    setBusy('locate');
    try {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) return Alert.alert('Position refusée', 'Autorise la localisation pour placer le commerce sur la carte.');
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLocation({ lat: Number(pos.coords.latitude.toFixed(6)), lng: Number(pos.coords.longitude.toFixed(6)) });
    } catch {
      Alert.alert('Position introuvable', 'Réessaie dehors.');
    } finally {
      setBusy(null);
    }
  };

  const hoursOk = HHMM.test(open) && HHMM.test(close) && open < close;
  const ownerOk = !!current || !!orgId || (digits.length >= 9 && firstName.trim().length >= 2 && lastName.trim().length >= 2);
  const ready = name.trim().length >= 2 && specialties.length > 0 && hoursOk && ownerOk && !busy;

  const create = async () => {
    setBusy('save');
    try {
      if (current) {
        // Only what changed; several services (lunch, dinner) stay unless the hours were edited.
        const first = current.services[0];
        const last = current.services[current.services.length - 1];
        const hoursChanged = open !== first?.start || close !== last?.end;
        const b = await commerceApi.updateMine({ editorOf: current.id }, {
          name: name.trim(), specialties, address: address.trim(), campus, location,
          ...(hoursChanged ? { services: [{ start: open, end: close }] } : {}),
          ...(photo?.id ? { photoId: photo.id } : {}),
        });
        onCreated(b, true);
        return;
      }
      onCreated(
        await commerceApi.create({
          kind, name: name.trim(), specialties, address: address.trim(), campus, location, services: [{ start: open, end: close }],
          ...(photo ? { photoId: photo.id } : {}),
          ...(orgId ? { orgId } : { owner: { phone: digits, firstName: firstName.trim(), lastName: lastName.trim(), ...(password.trim() ? { password: password.trim() } : {}) } }),
        }),
        false,
      );
    } catch (err) {
      fail(current ? 'Enregistrement impossible' : 'Ajout impossible')(err);
    } finally {
      setBusy(null);
    }
  };
  const hhmm = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 4);
    return d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.sheet} contentContainerStyle={{ gap: 12, paddingBottom: 36 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.sheetTitle}>{current ? `Modifier ${current.name}` : kind === 'restaurant' ? 'Nouveau restaurant' : 'Nouvelle boutique'}</Text>

          <Pressable style={styles.cover} onPress={pick} accessibilityRole="button" accessibilityLabel="Ajouter une photo">
            {photo ? <Image source={{ uri: photo.url }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Ionicons name="camera-outline" size={26} color={colors.primary} />}
            <View style={styles.coverBadge}>
              {busy === 'photo' ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="camera" size={14} color="#fff" />}
              <Text style={styles.coverBadgeText}>{photo ? 'Changer la photo' : 'Ajouter une photo'}</Text>
            </View>
          </Pressable>
          <LabeledField label="Téléphone du propriétaire (son identifiant)">
            <Field icon="call-outline" keyboardType="phone-pad" placeholder="77 123 45 67" value={phone} onChangeText={changePhone} maxLength={16} right={looking ? <ActivityIndicator size="small" color={colors.primary} /> : undefined} />
          </LabeledField>
          {found && (
            <View style={[styles.found, { backgroundColor: found.account ? colors.successBg : colors.primarySoft }]}>
              <Ionicons name={found.account ? 'person-circle-outline' : 'person-add-outline'} size={18} color={found.account ? colors.successText : colors.primary} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.foundText, { color: found.account ? colors.successText : colors.primary }]}>
                  {found.account ? `${found.account.firstName} ${found.account.lastName}` : 'Nouveau numéro : son compte sera créé.'}
                </Text>
                {entity ? (
                  <>
                    <Text style={[styles.foundSub, { color: colors.successText }]}>Entité : {entity.name}</Text>
                    {runs.length > 0 && <Text style={[styles.foundSub, { color: colors.successText }]}>{runs.join(' · ')}</Text>}
                  </>
                ) : (
                  found.account && <Text style={[styles.foundSub, { color: colors.successText }]}>A un compte, sans entité : une entité sera créée.</Text>
                )}
              </View>
            </View>
          )}
          {current && (
            <Text style={styles.info}>
              {entity?.name} a déjà {kind === 'restaurant' ? 'un restaurant' : 'une boutique'} : ses informations sont chargées, tes changements {kind === 'restaurant' ? 'le' : 'la'} mettent à jour.
            </Text>
          )}
          <LabeledField label="Nom">
            <Field placeholder={kind === 'restaurant' ? 'Chez Fatou' : 'Papeterie du Campus'} value={name} onChangeText={setName} maxLength={60} />
          </LabeledField>
          <LabeledField label={kind === 'restaurant' ? 'Cuisines' : 'Spécialités'}>
            <MultiSelect icon="pricetag-outline" title={kind === 'restaurant' ? 'Cuisines' : 'Spécialités'} placeholder="Choisir (une ou plusieurs)" values={specialties} options={ref?.specialties[kind] ?? []} max={ref?.maxSpecialties ?? 1} onChange={setSpecialties} disabled={!ref} />
          </LabeledField>

          <Text style={styles.section}>Où le trouver</Text>
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
          <TextButton label={busy === 'locate' ? 'Localisation…' : location ? `Position : ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}` : 'Ma position actuelle'} icon="locate" onPress={here} disabled={busy === 'locate'} />

          <Text style={styles.section}>Horaires (tous les jours)</Text>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <LabeledField label="Ouverture">
                <Field keyboardType="number-pad" placeholder="08:00" value={open} onChangeText={(v) => setOpen(hhmm(v))} maxLength={5} />
              </LabeledField>
            </View>
            <View style={{ flex: 1 }}>
              <LabeledField label="Fermeture">
                <Field keyboardType="number-pad" placeholder="20:00" value={close} onChangeText={(v) => setClose(hhmm(v))} maxLength={5} />
              </LabeledField>
            </View>
          </View>
          {!hoursOk && <Text style={styles.warn}>Horaires au format 08:00, la fermeture après l’ouverture.</Text>}

          <Text style={styles.section}>Propriétaire</Text>
          {current ? (
            <Text style={styles.muted}>
              {found?.account ? `${found.account.firstName} ${found.account.lastName}` : 'Le propriétaire'} · {entity?.name}
            </Text>
          ) : entity ? (
            // One account, one entity: the business joins theirs.
            <Text style={styles.muted}>Rejoint l’entité {entity.name} : son propriétaire reçoit aussi cet espace.</Text>
          ) : choices.length > 0 && (
            <View style={styles.row}>
              <Pressable onPress={() => setOrgId(null)} style={[styles.chip, !orgId && styles.chipOn]}>
                <Text style={[styles.chipText, !orgId && { color: '#fff' }]}>Nouvelle entité</Text>
              </Pressable>
              {choices.map((e) => (
                <Pressable key={e.orgId} onPress={() => setOrgId(e.orgId)} style={[styles.chip, orgId === e.orgId && styles.chipOn]}>
                  <Text style={[styles.chipText, orgId === e.orgId && { color: '#fff' }]}>{e.name}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {current || entity ? null : orgId ? (
            <Text style={styles.muted}>Le propriétaire de {choices.find((e) => e.orgId === orgId)?.name} reçoit aussi cet espace.</Text>
          ) : (
            <>
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
              <LabeledField label="Mot de passe (s’il n’a pas encore de compte)">
                <Field icon="lock-closed-outline" secure value={password} onChangeText={setPassword} autoCapitalize="none" maxLength={64} />
              </LabeledField>
              <Text style={styles.muted}>Les paiements des commandes vont sur ce numéro (Wave / Orange Money).</Text>
            </>
          )}
          <PrimaryButton label={current ? 'Enregistrer les modifications' : kind === 'restaurant' ? 'Ajouter le restaurant' : 'Ajouter la boutique'} disabled={!ready} loading={busy === 'save'} onPress={create} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 20, gap: 12, paddingBottom: 32 },
  h1: { ...typo.h2, color: colors.navy },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  add: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, minHeight: 38, borderRadius: radii.pill, backgroundColor: colors.primary },
  addText: { ...typo.smallStrong, color: '#fff' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: radii.lg, padding: 12 },
  thumb: { width: 52, height: 52, borderRadius: radii.sm, backgroundColor: colors.primarySoft, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  name: { ...typo.bodyStrong, color: colors.navy },
  muted: { ...typo.caption, color: colors.muted2 },
  section: { ...typo.section, color: colors.navy, marginTop: 4 },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,27,76,0.35)' },
  sheet: { maxHeight: 680, backgroundColor: colors.card, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: 20 },
  sheetTitle: { ...typo.h3, color: colors.navy },
  chip: { paddingHorizontal: 14, minHeight: 36, borderRadius: radii.pill, backgroundColor: colors.bg, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.primary },
  chipText: { ...typo.smallStrong, color: colors.navy },
  warn: { ...typo.small, color: colors.dangerText },
  found: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radii.md, marginTop: -4 },
  foundText: { ...typo.smallStrong },
  foundSub: { ...typo.caption },
  info: { ...typo.small, color: colors.primary, backgroundColor: colors.primarySoft, padding: 10, borderRadius: radii.md },
  cover: { height: 140, borderRadius: radii.lg, backgroundColor: colors.primarySoft, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  coverBadge: { position: 'absolute', right: 10, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: 'rgba(10,16,40,0.65)' },
  coverBadgeText: { ...typo.captionStrong, color: '#fff' },
});
