import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SpaceBar } from '@/components/SpaceBar';
import { usePullRefresh } from '@/components/PullRefresh';
import { PhoneField, phoneOk } from '@/components/PhoneField';
import { ErrorState } from '@/components/states';
import { Chip, Field, LabeledField, PrimaryButton, SheetFooter, SheetHeader, TextButton } from '@/components/ui';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { passwordRules, validatePassword } from '@/features/register/validation';
import { staffApi, type StaffRestoDto } from '@/features/restos/api';
import { platformTeamApi, type PlatformLookup, type PlatformMember, type PlatformRole } from '@/features/team/api';
import { ApiError } from '@/lib/api';
import { closeGuarded } from '@/lib/leaveGuard';

const fail = (title: string) => (err: unknown) => Alert.alert(title, err instanceof ApiError ? err.message : 'Réessaie dans un instant.');
const digits = (v: string) => v.replace(/\D/g, '');

/**
 * The super admin's team: who publishes alerts, the public restaurants' menus (each on their restaurants), adds places,
 * restaurants and shops… Only the super admin gives these roles. Adding someone: the number first, then the roles (a
 * new number also needs a name and a password). Tap a member to change their roles.
 */
export default function EquipePlateforme() {
  const { user } = useAuth();
  const [members, setMembers] = useState<PlatformMember[] | null>(null);
  // The first load failed (no network…): « Impossible de charger », with « Réessayer » (not an empty list).
  const [loadFailed, setLoadFailed] = useState(false);
  const [roles, setRoles] = useState<PlatformRole[]>([]);
  const [restos, setRestos] = useState<StaffRestoDto[]>([]);
  // The restaurants couldn't be loaded: the sheet offers a retry instead of an empty choice.
  const [restosFailed, setRestosFailed] = useState(false);
  const loadRestos = useCallback(() => {
    setRestosFailed(false);
    staffApi.restos().then((r) => setRestos(r.items), () => setRestosFailed(true));
  }, []);
  const [editing, setEditing] = useState<PlatformMember | 'new' | null>(null);

  const load = useCallback(() => {
    setLoadFailed(false);
    platformTeamApi.list().then(
      (r) => {
        setMembers(r.items);
        setRoles(r.roles);
      },
      () => setLoadFailed(true),
    );
    loadRestos();
  }, [loadRestos]);
  useFocusEffect(load);
  const pull = usePullRefresh(load);

  const label = (r: string) => roles.find((x) => x.value === r)?.label ?? r;
  // Out of the team, from the list: every role goes (the super admin can't remove themself).
  const remove = (m: PlatformMember) =>
    Alert.alert(`Retirer ${m.firstName} ${m.lastName} de l’équipe ?`, `${m.firstName} perd tous ses rôles (${m.roles.map(label).join(', ')}). Sans compte étudiant, ${m.firstName} ne pourra plus se connecter.`, [
      { text: 'Garder', style: 'cancel' },
      { text: 'Retirer', style: 'destructive', onPress: () => platformTeamApi.remove(m.userId).then(load, fail('Retrait impossible')) },
    ]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <SpaceBar>
        <Pressable style={styles.add} onPress={() => setEditing('new')} accessibilityRole="button">
          <Ionicons name="person-add" size={16} color="#fff" />
          <Text style={styles.addText}>Ajouter</Text>
        </Pressable>
      </SpaceBar>
      <ScrollView refreshControl={pull} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Text style={styles.sub}>{members ? `${members.length} membre${members.length > 1 ? 's' : ''}` : ' '}</Text>

        {!members && !loadFailed && <ActivityIndicator color={colors.primary} />}
        {!members && loadFailed && <ErrorState onRetry={load} />}
        {members?.map((m) => (
          <Pressable key={m.userId} style={({ pressed }) => [styles.card, shadow.card, pressed && { opacity: 0.85 }]} onPress={() => setEditing(m)} accessibilityRole="button" accessibilityLabel={`Modifier ${m.firstName} ${m.lastName}`}>
            <View style={styles.avatar}>
              <Text style={styles.initials}>{`${m.firstName[0] ?? ''}${m.lastName[0] ?? ''}`.toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={styles.name}>
                {m.firstName} {m.lastName}
                {m.userId === user?.id ? ' (toi)' : ''}
              </Text>
              <Text style={styles.muted}>{m.phoneMasked}</Text>
              <View style={styles.tags}>
                {m.roles.map((r) => (
                  <View key={r} style={[styles.tag, r === 'admin' && styles.tagAdmin]}>
                    <Text style={[styles.tagText, r === 'admin' && { color: '#fff' }]}>{label(r)}</Text>
                  </View>
                ))}
              </View>
              {m.restos.length > 0 && <Text style={styles.muted}>Restaurants : {m.restos.map((x) => x.name).join(', ')}</Text>}
            </View>
            <View style={styles.actions}>
              <Pressable style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]} onPress={() => setEditing(m)} hitSlop={4} accessibilityRole="button" accessibilityLabel={`Modifier les rôles de ${m.firstName}`}>
                <Ionicons name="create-outline" size={17} color={colors.primary} />
              </Pressable>
              {m.userId !== user?.id && (
                <Pressable style={({ pressed }) => [styles.iconBtn, styles.deleteBtn, pressed && { opacity: 0.7 }]} onPress={() => remove(m)} hitSlop={4} accessibilityRole="button" accessibilityLabel={`Retirer ${m.firstName} de l’équipe`}>
                  <Ionicons name="trash-outline" size={17} color={colors.dangerText} />
                </Pressable>
              )}
            </View>
          </Pressable>
        ))}
      </ScrollView>
      {editing && (
        <MemberSheet
          member={editing === 'new' ? null : editing}
          roles={roles}
          restos={restos}
          restosFailed={restosFailed}
          onRetryRestos={loadRestos}
          self={editing !== 'new' && editing.userId === user?.id}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </SafeAreaView>
  );
}

function MemberSheet({ member, roles, restos, restosFailed, onRetryRestos, self, onClose, onDone }: { member: PlatformMember | null; roles: PlatformRole[]; restos: StaffRestoDto[]; restosFailed: boolean; onRetryRestos: () => void; self: boolean; onClose: () => void; onDone: () => void }) {
  const [phone, setPhone] = useState('');
  const [found, setFound] = useState<PlatformLookup | null>(null);
  const [picked, setPicked] = useState<string[]>(member?.roles ?? []);
  const [restoIds, setRestoIds] = useState<string[]>(member?.restos.map((r) => r.id) ?? []);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  // Editing someone, or step 2 of adding: the roles show.
  const step2 = !!member || !!found;
  const isNew = !member && found?.exists === false;

  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const check = async () => {
    setBusy(true);
    try {
      const r = await platformTeamApi.lookup(digits(phone));
      setFound(r);
      if (r.exists) setPicked(r.roles);
    } catch (err) {
      fail('Numéro invalide')(err);
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    setBusy(true);
    try {
      await platformTeamApi.set({
        ...(member ? { userId: member.userId } : { phone: digits(phone) }),
        roles: picked,
        ...(picked.includes('resto_u_staff') ? { restoIds } : {}),
        ...(isNew ? { firstName: firstName.trim(), lastName: lastName.trim(), password: password.trim() } : {}),
      });
      onDone();
    } catch (err) {
      fail('Enregistrement impossible')(err);
    } finally {
      setBusy(false);
    }
  };
  const remove = () =>
    Alert.alert(`Retirer ${member!.firstName} de l’équipe ?`, 'Il perd tous ses rôles. Sans compte étudiant, il ne pourra plus se connecter.', [
      { text: 'Garder', style: 'cancel' },
      { text: 'Retirer', style: 'destructive', onPress: () => platformTeamApi.remove(member!.userId).then(onDone, fail('Retrait impossible')) },
    ]);

  // Closing with roles picked or a person typed, not saved: asks first.
  const close = () => closeGuarded(!busy && (!!found || (!!member && JSON.stringify(picked) !== JSON.stringify(member.roles))), onClose);
  const ready = picked.length > 0 && (!picked.includes('resto_u_staff') || restoIds.length > 0) && (!isNew || (!!firstName.trim() && !!lastName.trim() && !validatePassword(password))) && !busy;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} />
      <KeyboardAvoidingView behavior="padding" style={{ flexShrink: 1 }}>
        <View style={styles.sheet}>
        <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 12, paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
          <SheetHeader
            onClose={close}
            titleStyle={styles.sheetTitle}
            subtitle={member ? 'Ses rôles changent tout de suite, et la personne est prévenue.' : 'Fais-toi aider : chaque rôle ouvre un espace de travail, et rien de plus.'}>
            {member ? `${member.firstName} ${member.lastName}` : 'Ajouter à l’équipe'}
          </SheetHeader>

          {!member &&
            (!found ? (
              <>
                <PhoneField label="1. Son numéro de téléphone" value={phone} onChange={setPhone} />
              </>
            ) : (
              <View style={[styles.found, { backgroundColor: found.exists ? colors.successBg : colors.primarySoft }]}>
                <Ionicons name={found.exists ? 'person-circle-outline' : 'person-add-outline'} size={20} color={found.exists ? colors.successText : colors.primary} />
                <Text style={[styles.foundText, { color: found.exists ? colors.successText : colors.primary }]}>
                  {found.exists ? `${found.firstName} ${found.lastName} a déjà un compte.` : 'Nouveau compte : son nom et un mot de passe.'}
                </Text>
                <TextButton label="Changer" onPress={() => setFound(null)} />
              </View>
            ))}

          {isNew && (
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
              <LabeledField label="Mot de passe" error={password && validatePassword(password) ? passwordRules.map((r) => r.label).join(' · ') : null}>
                <Field icon="lock-closed-outline" secure value={password} onChangeText={setPassword} autoCapitalize="none" maxLength={64} />
              </LabeledField>
            </>
          )}

          {step2 && (
            <>
              <Text style={styles.section}>{member ? 'Ses rôles' : '2. Ses rôles'}</Text>
              {roles.map((r) => {
                const on = picked.includes(r.value);
                // The team manager never takes their own team role away (nobody could give it back).
                const locked = self && r.value === 'team_manager';
                return (
                  <Pressable key={r.value} disabled={locked} onPress={() => setPicked((p) => toggle(p, r.value))} style={[styles.role, on && styles.roleOn, locked && { opacity: 0.6 }]} accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: locked }}>
                    <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? colors.primary : colors.muted} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.name, on && { color: colors.primary }]}>{r.label}</Text>
                      {r.space && <Text style={styles.muted}>Espace {r.space}</Text>}
                    </View>
                  </Pressable>
                );
              })}
              {picked.includes('resto_u_staff') && (
                <>
                  <Text style={styles.section}>Restaurants qu’il gère</Text>
                  {restosFailed && !restos.length && <TextButton label="Restaurants indisponibles : réessayer" icon="refresh-outline" onPress={onRetryRestos} />}
                  <View style={styles.tags}>
                    {restos.map((r) => {
                      const on = restoIds.includes(r.id);
                      return (
                        <Chip key={r.id} label={r.name} selected={on} onPress={() => setRestoIds((l) => toggle(l, r.id))} role="checkbox" />
                      );
                    })}
                  </View>
                </>
              )}
              {member && !self && <TextButton label="Retirer de l’équipe" tone="danger" icon="person-remove-outline" style={{ alignSelf: 'center' }} onPress={remove} />}
            </>
          )}
        </ScrollView>
        {/* Pinned, as on every form: the step's button. */}
        <SheetFooter>
          {!member && !found ? (
            <PrimaryButton label="Vérifier le numéro" disabled={!phoneOk(phone) || busy} loading={busy} onPress={check} />
          ) : (
            <PrimaryButton label={member ? 'Enregistrer' : isNew ? 'Créer le compte et l’ajouter' : 'Ajouter à l’équipe'} disabled={!ready} loading={busy} onPress={save} />
          )}
        </SheetFooter>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 8, alignSelf: 'flex-start' },
  iconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primarySofter, alignItems: 'center', justifyContent: 'center' },
  deleteBtn: { backgroundColor: colors.dangerBg },
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 20, gap: 12, paddingBottom: 32 },
  sub: { ...typo.small, color: colors.muted2 },
  section: { ...typo.section, color: colors.navy, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  add: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, minHeight: 38, borderRadius: radii.pill, backgroundColor: colors.primary },
  addText: { ...typo.smallStrong, color: '#fff' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: radii.lg, padding: 14 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  initials: { ...typo.smallStrong, color: colors.primary },
  name: { ...typo.bodyStrong, color: colors.navy },
  muted: { ...typo.caption, color: colors.muted2 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill, backgroundColor: colors.primarySoft },
  tagAdmin: { backgroundColor: colors.navy },
  tagText: { ...typo.label, color: colors.primary },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,27,76,0.35)' },
  sheet: { flexShrink: 1, maxHeight: 700, backgroundColor: colors.card, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: 20 },
  sheetTitle: { ...typo.h3, color: colors.navy },
  found: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: radii.md },
  foundText: { ...typo.smallStrong, flex: 1 },
  role: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radii.md, borderWidth: 1.5, borderColor: colors.border },
  roleOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
});
