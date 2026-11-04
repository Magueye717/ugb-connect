import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Field, LabeledField, PrimaryButton, TextButton } from '@/components/ui';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { passwordRules, validatePassword } from '@/features/register/validation';
import { teamApi, type Assignment, type OrgSpace, type TeamMember, type TeamSpace } from '@/features/team/api';
import { MemberCard, SpaceTile } from '@/features/team/MemberCard';
import { ApiError } from '@/lib/api';

const fail = (title: string) => (err: unknown) => Alert.alert(title, err instanceof ApiError ? err.message : 'Réessaie dans un instant.');
const digits = (v: string) => v.replace(/\D/g, '');
type Picked = Partial<Record<OrgSpace, string[]>>;
const pickedFrom = (list: { space: OrgSpace; roles: string[] }[]): Picked => Object.fromEntries(list.map((a) => [a.space, a.roles.filter((r) => r !== 'owner')]));

/** Who the editor is about: a member (by id), or a number checked in step 1 (an account or not). */
type Target = { kind: 'member'; member: TeamMember } | { kind: 'existing'; phone: string; name: string } | { kind: 'new'; phone: string };

/**
 * "Mon équipe" of the whole entity (Khoulé & frère: its restaurant, its shop, its caravans): only its owner opens it.
 * Everyone is listed once with their roles space by space; a role is removed on its own. Adding someone: the number
 * first, then their roles in every space at once (Gérant of the restaurant and Contrôleur of the caravans…). A new
 * number needs a first name, a last name and a password. The person is notified.
 */
export function TeamScreen({ orgId, name, intro }: { orgId: string; name: string; intro: string }) {
  const { user } = useAuth();
  const [spaces, setSpaces] = useState<TeamSpace[]>([]);
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [phone, setPhone] = useState('');
  const [checking, setChecking] = useState(false);
  const [target, setTarget] = useState<Target | null>(null);
  const [picked, setPicked] = useState<Picked>({});
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    teamApi.team(orgId).then(
      (r) => {
        setSpaces(r.spaces);
        setMembers(r.members);
      },
      () => setMembers((m) => m ?? []),
    );
  }, [orgId]);
  useFocusEffect(load);

  const restart = () => {
    setTarget(null);
    setPicked({});
    setPhone('');
    setFirstName('');
    setLastName('');
    setPassword('');
  };

  // Step 1: is this number already on UGB Campus? Already in the team: their roles, ticked.
  const check = async () => {
    setChecking(true);
    try {
      const found = await teamApi.lookup(orgId, digits(phone));
      if (found.exists) {
        setTarget({ kind: 'existing', phone: digits(phone), name: `${found.firstName} ${found.lastName}` });
        setPicked(pickedFrom(found.assignments));
      } else {
        setTarget({ kind: 'new', phone: digits(phone) });
        setPicked({});
      }
    } catch (err) {
      fail('Numéro invalide')(err);
    } finally {
      setChecking(false);
    }
  };

  const edit = (m: TeamMember) => {
    setTarget({ kind: 'member', member: m });
    setPicked(pickedFrom(m.spaces.map((x) => ({ space: x.space, roles: x.roles.map((r) => r.value) }))));
  };

  const toggle = (space: OrgSpace, role: string) =>
    setPicked((p) => {
      const cur = p[space] ?? [];
      return { ...p, [space]: cur.includes(role) ? cur.filter((r) => r !== role) : [...cur, role] };
    });

  // Step 2: the roles in every space at once (a space left empty is taken away).
  const save = async () => {
    if (!target) return;
    setSaving(true);
    const assignments: Assignment[] = spaces.map((s) => ({ space: s.space, roles: picked[s.space] ?? [] }));
    try {
      await teamApi.set(orgId, {
        assignments,
        ...(target.kind === 'member' ? { userId: target.member.userId } : { phone: target.phone }),
        ...(target.kind === 'new' ? { firstName: firstName.trim(), lastName: lastName.trim(), password: password.trim() } : {}),
      });
      Alert.alert(
        target.kind === 'member' ? 'Rôles enregistrés' : 'Ajouté à l’équipe',
        target.kind === 'new' ? 'Le compte est créé : donne-lui son mot de passe pour qu’il se connecte.' : 'La personne est prévenue de ses nouveaux rôles et trouve les espaces dans « Mes espaces ».',
      );
      restart();
      load();
    } catch (err) {
      fail('Enregistrement impossible')(err);
    } finally {
      setSaving(false);
    }
  };

  const removeRole = (m: TeamMember, s: TeamSpace, r: { value: string; label: string }) => {
    const last = m.spaces.length === 1 && s.roles.length === 1;
    Alert.alert(
      `Retirer « ${r.label} » à ${m.firstName} ?`,
      last ? `C’est son dernier rôle : ${m.firstName} n’aura plus accès à ${name}.` : s.roles.length === 1 ? `${m.firstName} n’aura plus accès à l’espace ${s.label.toLowerCase()} ; ses autres rôles restent.` : 'Ses autres rôles restent.',
      [
        { text: 'Garder', style: 'cancel' },
        { text: 'Retirer', style: 'destructive', onPress: () => teamApi.removeRole(orgId, m.userId, s.space, r.value).then(load, fail('Retrait impossible')) },
      ],
    );
  };

  const removeMember = (m: TeamMember) =>
    Alert.alert(`Retirer ${m.firstName} de l’équipe ?`, `${m.firstName} perd tous ses rôles et n’a plus accès à ${name}.`, [
      { text: 'Garder', style: 'cancel' },
      { text: 'Retirer', style: 'destructive', onPress: () => teamApi.remove(orgId, m.userId).then(load, fail('Retrait impossible')) },
    ]);

  const anyRole = spaces.some((s) => (picked[s.space] ?? []).length > 0);
  const newReady = !!firstName.trim() && !!lastName.trim() && !validatePassword(password);
  const ready = anyRole && !saving && (target?.kind !== 'new' || newReady);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={styles.h1}>Mon équipe</Text>
          <Text style={styles.sub}>{intro}</Text>
          {spaces.length > 1 && <Text style={styles.muted}>{`${name} : ${spaces.map((s) => s.label).join(', ')}. Une même personne peut avoir un rôle dans chaque espace.`}</Text>}

          {!members && <ActivityIndicator color={colors.primary} />}
          {!!members?.length && (
            <Text style={styles.section}>
              Membres · {members.length}
            </Text>
          )}
          {members?.map((m) => (
            <MemberCard key={m.userId} m={m} me={m.userId === user?.id} entitySpaces={spaces} onEdit={() => edit(m)} onRemove={(s, r) => removeRole(m, s, r)} onRemoveMember={() => removeMember(m)} />
          ))}

          <Text style={styles.section}>{target?.kind === 'member' ? `Rôles de ${target.member.firstName}` : 'Ajouter quelqu’un'}</Text>
          {!target ? (
            <>
              <LabeledField label="1. Son numéro de téléphone">
                <Field icon="call-outline" keyboardType="phone-pad" placeholder="77 123 45 67" value={phone} onChangeText={setPhone} maxLength={16} returnKeyType="search" onSubmitEditing={() => digits(phone).length >= 9 && check()} />
              </LabeledField>
              <PrimaryButton label="Vérifier le numéro" disabled={digits(phone).length < 9 || checking} loading={checking} onPress={check} />
            </>
          ) : (
            <>
              {target.kind !== 'member' && (
                <View style={[styles.card, shadow.card, styles.row]}>
                  <View style={[styles.state, { backgroundColor: target.kind === 'existing' ? colors.successBg : colors.primarySoft }]}>
                    <Ionicons name={target.kind === 'existing' ? 'person-circle-outline' : 'person-add-outline'} size={22} color={target.kind === 'existing' ? colors.successText : colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{target.kind === 'existing' ? target.name : 'Nouveau compte'}</Text>
                    <Text style={styles.muted}>{target.kind === 'existing' ? `${phone} a déjà un compte UGB Campus.` : `${phone} n’a pas encore de compte : crée-le.`}</Text>
                  </View>
                  <TextButton label="Changer" onPress={restart} />
                </View>
              )}

              {target.kind === 'new' && (
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
                  <Text style={styles.muted}>Donne-lui ce mot de passe : il pourra le changer avec « Mot de passe oublié ».</Text>
                </>
              )}

              <Text style={styles.label}>{target.kind === 'member' ? 'Ses rôles, espace par espace' : '2. Ses rôles (un ou plusieurs)'}</Text>
              {spaces.map((s) => (
                <View key={s.space} style={[styles.card, shadow.card, { gap: 10 }]}>
                  <View style={styles.spaceRow}>
                    <SpaceTile space={s.space} />
                    <Text style={styles.spaceName}>{s.label}</Text>
                  </View>
                  <View style={styles.roles}>
                    {s.roles.map((r) => {
                      const on = (picked[s.space] ?? []).includes(r.value);
                      return (
                        <Pressable key={r.value} onPress={() => toggle(s.space, r.value)} style={[styles.role, on && styles.roleOn]} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`${r.label}, ${s.label}`}>
                          <Ionicons name={on ? 'checkbox' : 'square-outline'} size={18} color={on ? colors.primary : colors.muted} />
                          <Text style={[styles.name, on && { color: colors.primary }]}>{r.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
              <PrimaryButton label={target.kind === 'member' ? 'Enregistrer ses rôles' : target.kind === 'existing' ? 'Enregistrer' : 'Créer le compte et l’ajouter'} disabled={!ready} loading={saving} onPress={save} />
              <TextButton label="Annuler" style={{ alignSelf: 'center' }} onPress={restart} />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 20, gap: 12, paddingBottom: 40 },
  h1: { ...typo.h2, color: colors.navy },
  sub: { ...typo.small, color: colors.muted2, marginTop: -6 },
  section: { ...typo.section, color: colors.navy, marginTop: 8 },
  label: { ...typo.bodyStrong, color: colors.navy },
  card: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  state: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  name: { ...typo.bodyStrong, color: colors.navy },
  muted: { ...typo.caption, color: colors.muted2 },
  roles: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  spaceRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  spaceName: { ...typo.smallStrong, color: colors.navy, width: 92 },
  role: { flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: radii.md, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border },
  roleOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
});
