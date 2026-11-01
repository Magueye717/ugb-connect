import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Field, LabeledField, PrimaryButton } from '@/components/ui';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { commerceApi, type Member } from '@/features/commerce/api';
import { ApiError } from '@/lib/api';

const fail = (title: string) => (err: unknown) => Alert.alert(title, err instanceof ApiError ? err.message : 'Réessaie dans un instant.');
const ROLES = [
  { value: 'manager', label: 'Gérant', detail: 'Commandes, catalogue, infos du commerce' },
  { value: 'staff', label: 'Employé', detail: 'Commandes, et article épuisé ou non' },
] as const;
const roleLabel = (roles: string[]) => (roles.includes('owner') ? 'Propriétaire' : roles.includes('manager') ? 'Gérant' : 'Employé');

/**
 * The team: everyone here receives the new orders. The owner adds people by their phone number (an account is created
 * for a new number: they choose their password with "mot de passe oublié") and removes them.
 */
export default function Equipe() {
  const { business, user } = useAuth();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [phone, setPhone] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState<'manager' | 'staff'>('staff');
  const [saving, setSaving] = useState(false);
  const orgId = business?.orgId;
  const isOwner = !!business?.roles.includes('owner');

  const load = useCallback(() => {
    if (orgId && isOwner) commerceApi.members(orgId).then(setMembers, () => setMembers((m) => m ?? []));
  }, [orgId, isOwner]);
  useFocusEffect(load);

  if (!business || !orgId) return null;
  if (!isOwner) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.body}>
          <Text style={styles.h1}>Équipe</Text>
          <View style={[styles.card, shadow.card, styles.row]}>
            <Ionicons name="lock-closed-outline" size={20} color={colors.muted2} />
            <Text style={[styles.muted, { flex: 1 }]}>Seul le propriétaire de {business.name} gère l’équipe. Tu es {roleLabel(business.roles).toLowerCase()}.</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const add = async () => {
    setSaving(true);
    try {
      // The name only creates the account of a number that has none yet.
      await commerceApi.setMember(orgId, { phone: phone.replace(/\s/g, ''), roles: [role], ...(firstName.trim() && lastName.trim() ? { firstName: firstName.trim(), lastName: lastName.trim() } : {}) });
      setPhone('');
      setFirstName('');
      setLastName('');
      load();
      Alert.alert('Ajouté à l’équipe', 'Cette personne reçoit les nouvelles commandes. Si c’est un nouveau compte, elle choisit son mot de passe avec « Mot de passe oublié ».');
    } catch (err) {
      fail('Ajout impossible')(err);
    } finally {
      setSaving(false);
    }
  };

  const remove = (m: Member) =>
    Alert.alert(`Retirer ${m.firstName} ?`, 'Cette personne n’aura plus accès au commerce.', [
      { text: 'Garder', style: 'cancel' },
      { text: 'Retirer', style: 'destructive', onPress: () => commerceApi.removeMember(orgId, m.userId).then(load, fail('Retrait impossible')) },
    ]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={styles.h1}>Équipe</Text>
          <Text style={styles.sub}>Tout le monde ici reçoit les nouvelles commandes.</Text>

          {!members && <ActivityIndicator color={colors.primary} />}
          <View style={[styles.card, shadow.card, { paddingVertical: 4 }]}>
            {members?.map((m, i) => (
              <View key={m.userId} style={[styles.member, i > 0 && styles.divider]}>
                <View style={styles.avatar}>
                  <Text style={styles.initials}>{`${m.firstName[0] ?? ''}${m.lastName[0] ?? ''}`.toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>
                    {m.firstName} {m.lastName}
                    {m.userId === user?.id ? ' (toi)' : ''}
                  </Text>
                  <Text style={styles.muted}>{roleLabel(m.roles)}</Text>
                </View>
                {!m.roles.includes('owner') && (
                  <Pressable onPress={() => remove(m)} hitSlop={8} accessibilityLabel={`Retirer ${m.firstName}`}>
                    <Ionicons name="person-remove-outline" size={20} color={colors.dangerText} />
                  </Pressable>
                )}
              </View>
            ))}
          </View>

          <Text style={styles.section}>Ajouter quelqu’un</Text>
          <View style={styles.roles}>
            {ROLES.map((r) => (
              <Pressable key={r.value} onPress={() => setRole(r.value)} style={[styles.role, role === r.value && styles.roleOn]} accessibilityRole="radio" accessibilityState={{ checked: role === r.value }}>
                <Text style={[styles.name, role === r.value && { color: colors.primary }]}>{r.label}</Text>
                <Text style={styles.muted}>{r.detail}</Text>
              </Pressable>
            ))}
          </View>
          <LabeledField label="Numéro de téléphone">
            <Field icon="call-outline" keyboardType="phone-pad" placeholder="77 123 45 67" value={phone} onChangeText={setPhone} maxLength={16} />
          </LabeledField>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <LabeledField label="Prénom (nouveau compte)">
                <Field value={firstName} onChangeText={setFirstName} autoCapitalize="words" maxLength={40} />
              </LabeledField>
            </View>
            <View style={{ flex: 1 }}>
              <LabeledField label="Nom">
                <Field value={lastName} onChangeText={setLastName} autoCapitalize="words" maxLength={40} />
              </LabeledField>
            </View>
          </View>
          <Text style={styles.muted}>Le prénom et le nom ne servent que si ce numéro n’a pas encore de compte UGB Campus.</Text>
          <PrimaryButton label="Ajouter à l’équipe" disabled={phone.replace(/\D/g, '').length < 9 || saving} loading={saving} onPress={add} />
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
  section: { ...typo.title, color: colors.navy, marginTop: 8 },
  card: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  member: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  initials: { ...typo.smallStrong, color: colors.primary },
  name: { ...typo.bodyStrong, color: colors.navy },
  muted: { ...typo.caption, color: colors.muted2 },
  roles: { flexDirection: 'row', gap: 10 },
  role: { flex: 1, padding: 12, borderRadius: radii.md, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border, gap: 2 },
  roleOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
});
