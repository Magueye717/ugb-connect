import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OrganizerLine } from '@/components/caravan';
import { EmptyState, ErrorState } from '@/components/states';
import { Chip, Field, LabeledField, PrimaryButton, SheetFooter, SheetHeader, Toggle, useDirty } from '@/components/ui';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { caravanOrganizersApi, type CaravanOrganizerDto, type OrganizerCategory, type OrganizerLevel } from '@/features/caravans/api';
import { formatPhone, phoneDigits } from '@/features/register/validation';
import { ApiError } from '@/lib/api';
import { notice } from '@/lib/notice';
import { toast } from '@/lib/toast';

const CATEGORIES: { value: OrganizerCategory; label: string }[] = [
  { value: 'Transporteur', label: 'Transporteur' },
  { value: 'Entreprise', label: 'Entreprise' },
  { value: 'Amicale', label: 'Amicale' },
];
const LEVELS: { value: OrganizerLevel; label: string; hint: string }[] = [
  { value: 'nouveau', label: 'Nouveau', hint: 'Documents vérifiés, payé après l’arrivée.' },
  { value: 'verifie', label: 'Vérifié', hint: 'Plus de 3 trajets notés 4/5 ou plus.' },
  { value: 'confirme', label: 'Certifié', hint: 'Plus de 10 trajets sans incident grave.' },
];
/** "+221771234567" → "77 123 45 67". */
const local = (phone: string | null) => (phone ? formatPhone(phoneDigits(phone.replace(/^\+221/, ''))) : '');
const fail = (title: string) => (err: unknown) => Alert.alert(title, err instanceof ApiError ? err.message : 'Réessaie dans un instant.');

/**
 * Référencement: the caravan organizers (transport companies, amicales). Each is its own organization, apart from any
 * shop or restaurant: the caravan editor registers it with its owner, who then finds the organizer space in « Mes
 * espaces » and creates vehicles and departures. A tap edits it;
 * the switch suspends it (its team loses the space).
 */
export default function Caravanes() {
  const [items, setItems] = useState<CaravanOrganizerDto[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [sheet, setSheet] = useState<CaravanOrganizerDto | 'new' | null>(null);

  const load = useCallback(() => {
    setLoadFailed(false);
    caravanOrganizersApi.list().then((r) => setItems(r.items), () => setLoadFailed(true));
  }, []);
  useFocusEffect(load);

  const setActive = (o: CaravanOrganizerDto, active: boolean) => {
    const go = () => {
      setItems((list) => list?.map((x) => (x.id === o.id ? { ...x, status: active ? 'active' : 'suspended' } : x)) ?? null);
      caravanOrganizersApi.update(o.id, { status: active ? 'active' : 'suspended' }).catch((err) => {
        fail('Changement impossible')(err);
        load();
      });
    };
    if (active) return go();
    Alert.alert(`Suspendre ${o.name} ?`, 'Son équipe n’a plus accès à l’espace organisateur. Tu pourras le réactiver.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Suspendre', style: 'destructive', onPress: go },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.row}>
          <Text style={[styles.h1, { flex: 1 }]}>Caravanes</Text>
          <Pressable style={styles.add} onPress={() => setSheet('new')} accessibilityRole="button">
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addText}>Ajouter</Text>
          </Pressable>
        </View>
        <Text style={styles.muted}>Les organisateurs de caravanes : transporteurs, entreprises, amicales. Leur responsable crée ensuite ses véhicules et ses départs.</Text>
        {!items && !loadFailed && <ActivityIndicator color={colors.primary} />}
        {!items && loadFailed && <ErrorState onRetry={load} />}
        {items && !items.length && <EmptyState icon="bus-outline" title="Aucun organisateur" text="Ajoute le premier : son responsable reçoit l’espace organisateur." />}
        {items?.map((o) => {
          const active = o.status === 'active';
          return (
            <Pressable
              key={o.id}
              style={({ pressed }) => [styles.card, shadow.card, !active && { opacity: 0.6 }, pressed && { opacity: 0.85 }]}
              onPress={() => setSheet(o)}
              accessibilityRole="button"
              accessibilityLabel={`${o.name}, modifier`}>
              <View style={styles.thumb}>
                <Ionicons name="bus" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <OrganizerLine organizer={{ id: o.id, name: o.name, kind: o.category, level: o.level, rating: o.rating, trips: o.trips }} />
                <Text style={styles.muted} numberOfLines={1}>
                  {o.category} · {o.trips ? `${o.trips} trajet${o.trips > 1 ? 's' : ''}` : 'Aucun trajet'}
                </Text>
                <Text style={styles.muted} numberOfLines={1}>
                  {o.owner ? `${o.owner.firstName} ${o.owner.lastName} · ${local(o.owner.phone)}` : 'Sans responsable'}
                </Text>
                {!active && <Text style={styles.suspended}>Suspendu</Text>}
                {active && !o.payoutPhone && <Text style={styles.suspended}>Aucun numéro de versement</Text>}
              </View>
              <Toggle value={active} onValueChange={(v) => setActive(o, v)} accessibilityLabel={`${o.name} actif`} />
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          );
        })}
      </ScrollView>
      {sheet && (
        <OrganizerSheet
          organizer={sheet === 'new' ? null : sheet}
          onClose={() => setSheet(null)}
          onSaved={(o, created) => {
            setSheet(null);
            load();
            if (created) notice({ tone: 'success', title: `${o.name} est ajouté`, message: 'Son responsable le retrouve dans « Mes espaces » :', steps: ['Il ajoute ses véhicules', 'Puis ses départs : les étudiants réservent'] });
            else toast(`${o.name} est à jour.`);
          }}
        />
      )}
    </SafeAreaView>
  );
}

type SheetProps = { organizer: CaravanOrganizerDto | null; onClose: () => void; onSaved: (o: CaravanOrganizerDto, created: boolean) => void };

/**
 * Adding (the owner's number first: an account it has is reused; one caravan organizer per account) or editing an
 * organizer: name, kind, level, payout number.
 */
function OrganizerSheet({ organizer: o, onClose, onSaved }: SheetProps) {
  const [name, setName] = useState(o?.name ?? '');
  const [category, setCategory] = useState<OrganizerCategory>(o?.category ?? 'Transporteur');
  const [level, setLevel] = useState<OrganizerLevel>(o?.level ?? 'verifie');
  const [payout, setPayout] = useState(o?.payoutPhone ? phoneDigits(o.payoutPhone.replace(/^\+221/, '')) : '');
  const [phone, setPhone] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [lookup, setLookup] = useState<{ phone: string; account: { firstName: string; lastName: string } | null; organizer: { name: string } | null } | null>(null);
  const found = lookup && lookup.phone === phone ? lookup : null;
  const looking = !o && phone.length === 9 && lookup?.phone !== phone;

  useEffect(() => {
    if (o || phone.length !== 9) return;
    let live = true;
    caravanOrganizersApi.ownerLookup(phone).then(
      (r) => live && setLookup({ phone, ...r }),
      () => live && setLookup(null),
    );
    return () => {
      live = false;
    };
  }, [o, phone]);

  const taken = !!found?.organizer;
  const ownerOk = !!o || (phone.length === 9 && !!found && !taken && (!!found.account || (firstName.trim().length >= 2 && lastName.trim().length >= 2)));
  const payoutOk = payout.length === 0 || payout.length === 9;
  // Editing: usable once something changed.
  const dirty = useDirty({ name, category, level, payout });
  const ready = name.trim().length >= 2 && ownerOk && payoutOk && (!o || dirty) && !saving;

  const save = async () => {
    setSaving(true);
    try {
      if (o) {
        onSaved(await caravanOrganizersApi.update(o.id, { name: name.trim(), category, level, payoutPhone: payout ? payout : null }), false);
      } else {
        onSaved(
          await caravanOrganizersApi.create({
            name: name.trim(),
            category,
            level,
            ...(payout ? { payoutPhone: payout } : {}),
            owner: { phone, ...(found?.account ? {} : { firstName: firstName.trim(), lastName: lastName.trim(), ...(password.trim() ? { password: password.trim() } : {}) }) },
          }),
          true,
        );
      }
    } catch (err) {
      fail(o ? 'Enregistrement impossible' : 'Ajout impossible')(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fermer" />
      <KeyboardAvoidingView behavior="padding" style={{ flexShrink: 1 }}>
        <View style={styles.sheet}>
        <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 12, paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
          <SheetHeader onClose={onClose} subtitle={o ? undefined : 'Son responsable reçoit l’espace organisateur.'}>
            {o ? `Modifier ${o.name}` : 'Nouvel organisateur'}
          </SheetHeader>

          {!o && (
            <>
              <LabeledField label="Téléphone du responsable (son identifiant)">
                <Field
                  icon="call-outline"
                  prefix="+221"
                  keyboardType="phone-pad"
                  placeholder="77 123 45 67"
                  value={formatPhone(phone)}
                  onChangeText={(t) => setPhone(phoneDigits(t))}
                  right={looking ? <ActivityIndicator size="small" color={colors.primary} /> : undefined}
                />
              </LabeledField>
              {found && (
                <View style={[styles.found, { backgroundColor: taken ? colors.dangerBg : found.account ? colors.successBg : colors.primarySoft }]}>
                  <Ionicons name={taken ? 'alert-circle-outline' : found.account ? 'person-circle-outline' : 'person-add-outline'} size={18} color={taken ? colors.dangerText : found.account ? colors.successText : colors.primary} />
                  <Text style={[styles.foundText, { color: taken ? colors.dangerText : found.account ? colors.successText : colors.primary }]}>
                    {taken
                      ? `Ce numéro gère déjà « ${found.organizer!.name} ».`
                      : found.account
                        ? `${found.account.firstName} ${found.account.lastName} : son compte est utilisé.`
                        : 'Nouveau numéro : son compte sera créé.'}
                  </Text>
                </View>
              )}
            </>
          )}

          <LabeledField label="Nom affiché aux étudiants">
            <Field placeholder="Khoulé et Frères Transport" value={name} onChangeText={setName} maxLength={80} autoCapitalize="words" />
          </LabeledField>
          <Text style={styles.label}>Type</Text>
          <View style={styles.row}>
            {CATEGORIES.map((c) => (
              <Chip key={c.value} label={c.label} selected={category === c.value} onPress={() => setCategory(c.value)} />
            ))}
          </View>
          <Text style={styles.label}>Niveau</Text>
          <View style={styles.row}>
            {LEVELS.map((l) => (
              <Chip key={l.value} label={l.label} selected={level === l.value} onPress={() => setLevel(l.value)} />
            ))}
          </View>
          <Text style={[styles.muted, { marginTop: -4 }]}>{LEVELS.find((l) => l.value === level)?.hint} Affiché aux étudiants sur chaque départ.</Text>

          {!o && !found?.account && !taken && phone.length === 9 && found && (
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
              <LabeledField label="Mot de passe">
                <Field icon="lock-closed-outline" secure value={password} onChangeText={setPassword} autoCapitalize="none" maxLength={64} />
              </LabeledField>
            </>
          )}

          <LabeledField label={o ? 'Numéro de versement' : 'Numéro de versement (facultatif)'} error={payoutOk ? null : '9 chiffres'}>
            <Field icon="wallet-outline" prefix="+221" keyboardType="phone-pad" placeholder="77 123 45 67" value={formatPhone(payout)} onChangeText={(t) => setPayout(phoneDigits(t))} invalid={!payoutOk} />
          </LabeledField>
          <Text style={[styles.muted, { marginTop: -4 }]}>
            {o ? 'L’argent des places payées dans l’app y est versé (Wave / Orange Money).' : 'Vide : le numéro du responsable. L’argent des places payées dans l’app y est versé.'}
          </Text>

          {o?.owner && (
            <Text style={styles.muted}>
              Responsable : {o.owner.firstName} {o.owner.lastName} · {local(o.owner.phone)}
            </Text>
          )}
        </ScrollView>
        <SheetFooter>
          <PrimaryButton label={o ? 'Enregistrer' : 'Ajouter l’organisateur'} disabled={!ready} loading={saving} onPress={save} />
        </SheetFooter>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 20, gap: 12, paddingBottom: 32 },
  h1: { ...typo.h1, color: colors.navy },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  add: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, minHeight: 38, borderRadius: radii.pill, backgroundColor: colors.primary },
  addText: { ...typo.smallStrong, color: '#fff' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: radii.lg, padding: 12 },
  thumb: { width: 48, height: 48, borderRadius: radii.sm, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  muted: { ...typo.caption, color: colors.muted2, lineHeight: 17 },
  label: { ...typo.smallStrong, color: colors.navy },
  suspended: { ...typo.captionStrong, color: colors.warningText },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,27,76,0.35)' },
  sheet: { flexShrink: 1, maxHeight: 680, backgroundColor: colors.card, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: 20 },
  found: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radii.md, marginTop: -4 },
  foundText: { ...typo.small, flex: 1 },
});
