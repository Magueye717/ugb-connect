import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SpaceBar } from '@/components/SpaceBar';
import { usePullRefresh } from '@/components/PullRefresh';
import { PhoneField } from '@/components/PhoneField';
import { MultiSelect } from '@/components/Select';
import { EmptyState, ErrorState } from '@/components/states';
import { Chip, Field, LabeledField, PrimaryButton, Segmented, SheetFooter, SheetHeader, TextButton, Toggle, useDirty } from '@/components/ui';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { commerceApi, type BusinessDto, type BusinessKind, type OrderMethod, type OwnedEntity } from '@/features/commerce/api';
import { useCommerceReference } from '@/features/commerce/useCommerceReference';
import { hoursValid, joinOvernight, normalizeHours } from '@/features/commerce/hours';
import { payoutDigitsOf, payoutNumbersBody, payoutNumbersOk, type PayoutDigits } from '@/features/commerce/PayoutNumbers';
import { CAMPUSES } from '@/features/register/validation';
import { ALL_DAY, isAllDay } from '@/features/commerce/allDay';
import { ApiError } from '@/lib/api';
import { closeGuarded } from '@/lib/leaveGuard';
import { pickPhoto } from '@/lib/pickPhoto';
import { uploadImage } from '@/lib/upload';
import { toast } from '@/lib/toast';
import { askToRelocate } from '@/lib/relocate';

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
  // The first load failed (no network…): « Impossible de charger », with « Réessayer » (not an empty list).
  const [loadFailed, setLoadFailed] = useState(false);
  const [kind, setKind] = useState<BusinessKind>(kinds[0] ?? 'restaurant');
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    setLoadFailed(false);
    commerceApi.all().then((r) => setItems(r.items), () => setLoadFailed(true));
  }, []);
  useFocusEffect(load);
  const pull = usePullRefresh(load);

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
      <SpaceBar>
        <Pressable style={styles.add} onPress={() => setCreating(true)} accessibilityRole="button">
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.addText}>Ajouter</Text>
        </Pressable>
      </SpaceBar>
      <ScrollView refreshControl={pull} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
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
        {!items && !loadFailed && <ActivityIndicator color={colors.primary} />}
        {!items && loadFailed && <ErrorState onRetry={load} />}
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
            <Toggle value={b.active} onValueChange={(v) => toggle(b, v)} accessibilityLabel={`${b.name} visible`} />
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        ))}
      </ScrollView>
      {creating && (
        <CreateSheet
          kind={kind}
          onClose={() => setCreating(false)}
          onCreated={(b, updated) => {
            setCreating(false);
            load();
            if (updated) return toast(`${b.name} est à jour : les étudiants le voient tout de suite.`);
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

type Slot = { start: string; end: string };
const MAX_SLOTS = 3;
/** A restaurant: lunch and dinner; a shop: the day. */
const defaultSlots = (kind: BusinessKind): Slot[] => (kind === 'restaurant' ? [{ start: '12:00', end: '15:00' }, { start: '19:00', end: '23:00' }] : [{ start: '08:00', end: '20:00' }]);
/** The next slot proposed: two hours after the last one closes (adjustable). */
const nextSlot = (list: Slot[]): Slot => {
  const last = list[list.length - 1]?.end ?? '08:00';
  const h = Math.min(21, Number(last.slice(0, 2)) + 2);
  return { start: `${String(h).padStart(2, '0')}:00`, end: `${String(Math.min(23, h + 2)).padStart(2, '0')}:00` };
};

/**
 * Adding a restaurant or a shop. The owner's number comes first: one account owns one entity (one restaurant, one
 * shop, one organizer at most). A number whose entity doesn't run this kind: it is selected, the business joins it.
 * One whose entity already runs it: that business is loaded in the form, and saving updates it (never a second one).
 */
function CreateSheet({ kind, onClose, onCreated }: { kind: BusinessKind; onClose: () => void; onCreated: (b: BusinessDto, updated: boolean) => void }) {
  const { reference: ref, failed: refFailed, retry: retryRef } = useCommerceReference();
  const [name, setName] = useState('');
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [address, setAddress] = useState('');
  const [campus, setCampus] = useState<'campus1' | 'campus2' | null>(null);
  const [photo, setPhoto] = useState<{ id: string; url: string } | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  // Opening hours, every day: up to 3 slots (a restaurant: lunch and dinner).
  const [services, setServices] = useState<Slot[]>(defaultSlots(kind));
  // How students may pay; the editor can add cash.
  // Orders are paid in cash only (Wave / Orange Money are for UGB Connect's own fees).
  const methods: OrderMethod[] = ['cash'];
  // Where Wave / Orange Money pay out: the owner's number unless changed here (a loaded business: its own numbers).
  const [payout, setPayout] = useState<PayoutDigits>({});
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
  // The entity this business joins: the one the number typed owns (never a stale one from a previous number).
  const orgId = entity && !current ? entity.orgId : null;

  const fill = useCallback(
    (b: BusinessDto) => {
      setName(b.name);
      setSpecialties(b.specialties);
      setAddress(b.address);
      setCampus(b.campus);
      setLocation(b.location);
      setPhoto(b.photo ? { id: '', url: b.photo } : null);
      setServices(b.services.length ? joinOvernight(b.services) : defaultSlots(kind));
      setPayout(payoutDigitsOf(b.payoutNumbers));
    },
    [kind],
  );
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
    setServices(defaultSlots(kind));
    setPayout({});
  };

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
          commerceApi.mine({ editorOf: same.id }).then((b) => {
            if (!live) return;
            setEditing({ phone: digits, b });
            fill(b);
          }, fail('Chargement impossible'));
          return;
        }
      }, () => live && setLookup({ phone: digits, failed: true, account: null, entities: [] }));
    return () => {
      live = false;
    };
  }, [digits, kind, fill]);

  // What the number's entity runs: "Restaurant : Khoulé & Frère · Organisateur".
  const runs = entity ? [...entity.businesses.map((x) => `${KIND_LABEL[x.kind]} : ${x.name}`), ...(entity.organizer ? ['Organisateur'] : [])] : [];

  const pick = async () => {
    const [asset] = await pickPhoto({ title: 'Photo du commerce' });
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
  // Another campus for something already placed: ask at once whether its position on the map changed too.
  const pickCampus = (key: 'campus1' | 'campus2', label: string) => {
    const next = campus === key ? null : key;
    setCampus(next);
    if (next && next !== campus && (campus !== null || !!location)) askToRelocate(label, here);
  };

  // Each slot well formed, ending after it starts, and none overlapping the previous one.
  const allDay = isAllDay(services);
  // As the server saves them: 00:00 closing is midnight, a closing before the opening runs past it (19:00 → 02:00).
  const sorted = normalizeHours(services) ?? services;
  const hoursOk = services.length > 0 && hoursValid(services);
  const ownerOk = !!current || !!orgId || (digits.length >= 9 && firstName.trim().length >= 2 && lastName.trim().length >= 2);
  // A business loaded in the form (the number's own): usable once something changed. Its loading starts this over.
  const payoutShown: PayoutDigits = { wave: payout.wave ?? digits, orange_money: payout.orange_money ?? digits };
  const dirty = useDirty({ name, specialties, address, campus, photo: photo?.url ?? null, location, services, methods, payout: payoutNumbersBody(methods, payoutShown) }, current?.id ?? null);
  // Closing with changes not saved asks first.
  const close = () => closeGuarded(dirty && busy !== 'save', onClose);
  // On the map: taken on site with « Ma position actuelle » (required).
  const ready = name.trim().length >= 2 && specialties.length > 0 && !!location && hoursOk && ownerOk && payoutNumbersOk(methods, payoutShown) && (!current || dirty) && !busy;

  const create = async () => {
    setBusy('save');
    try {
      if (current) {
        const b = await commerceApi.updateMine({ editorOf: current.id }, {
          name: name.trim(), specialties, address: address.trim(), campus, location, services: sorted, paymentMethods: methods, payoutNumbers: payoutNumbersBody(methods, payoutShown),
          ...(photo?.id ? { photoId: photo.id } : {}),
        });
        onCreated(b, true);
        return;
      }
      onCreated(
        await commerceApi.create({
          kind, name: name.trim(), specialties, address: address.trim(), campus, location, services: sorted, paymentMethods: methods, payoutNumbers: payoutNumbersBody(methods, payoutShown),
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
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} />
      <KeyboardAvoidingView behavior="padding" style={{ flexShrink: 1 }}>
        <View style={styles.sheet}>
        <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 12, paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
          <SheetHeader onClose={close} titleStyle={styles.sheetTitle}>{current ? `Modifier ${current.name}` : kind === 'restaurant' ? 'Nouveau restaurant' : 'Nouvelle boutique'}</SheetHeader>

          <Pressable style={styles.cover} onPress={pick} accessibilityRole="button" accessibilityLabel="Ajouter une photo">
            {photo ? <Image source={{ uri: photo.url }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Ionicons name="camera-outline" size={26} color={colors.primary} />}
            <View style={styles.coverBadge}>
              {busy === 'photo' ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="camera" size={14} color="#fff" />}
              <Text style={styles.coverBadgeText}>{photo ? 'Changer la photo' : 'Ajouter une photo'}</Text>
            </View>
          </Pressable>
          <PhoneField label="Téléphone du propriétaire (son identifiant)" value={phone} onChange={changePhone} right={looking ? <ActivityIndicator size="small" color={colors.primary} /> : undefined} />
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
            {refFailed && <TextButton label="Liste indisponible : réessayer" icon="refresh-outline" onPress={retryRef} />}
          </LabeledField>

          <Text style={styles.section}>Où le trouver</Text>
          <LabeledField label="Adresse (comme les étudiants la disent)">
            <Field icon="location-outline" placeholder="Près du Village E" value={address} onChangeText={setAddress} maxLength={80} />
          </LabeledField>
          <View style={styles.row}>
            {CAMPUSES.map((c) => (
              <Chip key={c.key} label={c.label} selected={campus === c.key} onPress={() => pickCampus(c.key, c.label)} />
            ))}
          </View>
          <Pressable style={[styles.locate, location ? styles.locateDone : styles.locateTodo]} onPress={here} disabled={busy === 'locate'} accessibilityRole="button">
            {busy === 'locate' ? <ActivityIndicator color={colors.primary} size="small" /> : <Ionicons name={location ? 'checkmark-circle' : 'locate'} size={18} color={location ? colors.successText : colors.primary} />}
            <View style={{ flex: 1 }}>
              <Text style={[styles.locateTitle, location && { color: colors.successText }]}>{busy === 'locate' ? 'Localisation…' : location ? 'Position enregistrée' : 'Ma position actuelle *'}</Text>
              <Text style={styles.muted}>{location ? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)} · appuie à nouveau pour la reprendre` : 'Obligatoire : sur place, devant le commerce.'}</Text>
            </View>
          </Pressable>

          <Text style={styles.section}>Horaires (tous les jours)</Text>
          {kind === 'shop' && (
            <View style={styles.allDay}>
              <View style={{ flex: 1 }}>
                <Text style={styles.allDayTitle}>Ouvert 24h/24</Text>
                <Text style={styles.muted}>Les clients commandent à toute heure, tous les jours.</Text>
              </View>
              <Toggle value={allDay} onValueChange={(v) => setServices(v ? ALL_DAY.map((x) => ({ ...x })) : defaultSlots(kind))} accessibilityLabel="Ouvert 24h/24" />
            </View>
          )}
          {!allDay && services.map((x, i) => (
            <View key={i} style={styles.slot}>
              {services.length > 1 && <Text style={styles.slotLabel}>Créneau {i + 1}</Text>}
              <View style={{ flex: 1 }}>
                <Field keyboardType="number-pad" placeholder="12:00" value={x.start} onChangeText={(v) => setServices((list) => list.map((y, j) => (j === i ? { ...y, start: hhmm(v) } : y)))} maxLength={5} accessibilityLabel={`Ouverture, créneau ${i + 1}`} />
              </View>
              <Text style={styles.muted}>à</Text>
              <View style={{ flex: 1 }}>
                <Field keyboardType="number-pad" placeholder="15:00" value={x.end} onChangeText={(v) => setServices((list) => list.map((y, j) => (j === i ? { ...y, end: hhmm(v) } : y)))} maxLength={5} accessibilityLabel={`Fermeture, créneau ${i + 1}`} />
              </View>
              {services.length > 1 && (
                <Pressable onPress={() => setServices((list) => list.filter((_, j) => j !== i))} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Retirer le créneau ${i + 1}`}>
                  <Ionicons name="close-circle" size={22} color={colors.muted} />
                </Pressable>
              )}
            </View>
          ))}
          {!allDay && services.length < MAX_SLOTS && (
            <TextButton label="Ajouter un créneau" icon="add-circle-outline" onPress={() => setServices((list) => [...list, nextSlot(list)])} />
          )}
          {!hoursOk && <Text style={styles.warn}>Horaires au format 08:00 (00:00 pour minuit), sans chevauchement. Une fermeture avant l’ouverture passe minuit : 19:00 → 02:00.</Text>}

          <Text style={styles.section}>Paiement</Text>
          <Text style={styles.muted}>Les commandes se paient en espèces, au livreur ou au retrait : rien ne passe par l’app.</Text>

          <Text style={styles.section}>Propriétaire</Text>
          {current ? (
            <Text style={styles.muted}>
              {found?.account ? `${found.account.firstName} ${found.account.lastName}` : 'Le propriétaire'} · {entity?.name}
            </Text>
          ) : entity ? (
            // One account, one entity: the number decides, the business joins theirs (nothing to pick).
            <Text style={styles.muted}>Rejoint l’entité {entity.name} : son propriétaire reçoit aussi cet espace.</Text>
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
              {/* A number that already has an account keeps its password: the field is for a new account only. */}
              {!found?.account && (
                <LabeledField label="Mot de passe">
                  <Field icon="lock-closed-outline" secure value={password} onChangeText={setPassword} autoCapitalize="none" maxLength={64} />
                </LabeledField>
              )}
              <Text style={styles.muted}>Les paiements des commandes vont sur ce numéro (Wave / Orange Money).</Text>
            </>
          )}
        </ScrollView>
        <SheetFooter>
          <PrimaryButton label={current ? 'Enregistrer les modifications' : kind === 'restaurant' ? 'Ajouter le restaurant' : 'Ajouter la boutique'} disabled={!ready} loading={busy === 'save'} onPress={create} />
        </SheetFooter>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 20, gap: 12, paddingBottom: 32 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  add: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, minHeight: 38, borderRadius: radii.pill, backgroundColor: colors.primary },
  addText: { ...typo.smallStrong, color: '#fff' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: radii.lg, padding: 12 },
  thumb: { width: 52, height: 52, borderRadius: radii.sm, backgroundColor: colors.primarySoft, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  name: { ...typo.bodyStrong, color: colors.navy },
  muted: { ...typo.caption, color: colors.muted2 },
  section: { ...typo.section, color: colors.navy, marginTop: 4 },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,27,76,0.35)' },
  sheet: { flexShrink: 1, maxHeight: 680, backgroundColor: colors.card, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: 20 },
  sheetTitle: { ...typo.h3, color: colors.navy },
  warn: { ...typo.small, color: colors.dangerText },
  slot: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  slotLabel: { ...typo.captionStrong, color: colors.muted2, width: 64 },
  found: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radii.md, marginTop: -4 },
  foundText: { ...typo.smallStrong },
  foundSub: { ...typo.caption },
  info: { ...typo.small, color: colors.primary, backgroundColor: colors.primarySoft, padding: 10, borderRadius: radii.md },
  cover: { height: 140, borderRadius: radii.lg, backgroundColor: colors.primarySoft, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  coverBadge: { position: 'absolute', right: 10, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: 'rgba(10,16,40,0.65)' },
  coverBadgeText: { ...typo.captionStrong, color: '#fff' },
  allDay: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radii.md, backgroundColor: colors.primarySofter },
  allDayTitle: { ...typo.bodyStrong, color: colors.navy },
  locate: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radii.md, borderWidth: 1.5 },
  locateTodo: { borderColor: colors.primary, borderStyle: 'dashed', backgroundColor: colors.primarySofter },
  locateDone: { borderColor: colors.successBg, backgroundColor: colors.successBg },
  locateTitle: { ...typo.smallStrong, color: colors.primary },
});
