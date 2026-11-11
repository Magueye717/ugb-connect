import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Field, LabeledField, PrimaryButton, TextButton } from '@/components/ui';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { profileApi } from '@/features/profile/api';
import { STUDENT_ID_MAX, typeStudentId, validateStudentId } from '@/features/register/validation';
import { ApiError } from '@/lib/api';
import { toast } from '@/lib/toast';

const dayLabel = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

/**
 * The student number on « Ma carte étudiant »: it lets a found card come back to its owner. Given once, it can be
 * corrected for 3 days (`editableUntil`); afterwards it's locked and a mistake is fixed by the UGB Connect team.
 */
export function StudentNumberCard({ current, editableUntil, onSaved }: { current: string | null; editableUntil: string | null; onSaved: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const error = value ? validateStudentId(value) : null;
  const open = !current || editing;

  const save = async () => {
    setSaving(true);
    try {
      await profileApi.setStudentNumber(value);
      await onSaved();
      setEditing(false);
      setValue('');
      toast(current ? 'Numéro étudiant corrigé.' : 'Numéro étudiant enregistré : si tu perds ta carte, elle te revient.');
    } catch (err) {
      Alert.alert('Enregistrement impossible', err instanceof ApiError ? err.message : 'Réessaie dans un instant.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.card, shadow.card]}>
      <Text style={styles.section}>Numéro étudiant</Text>
      {!open ? (
        <>
          <View style={styles.row}>
            <Ionicons name="school-outline" size={18} color={colors.primary} />
            <Text style={[styles.label, { flex: 1 }]}>{current}</Text>
            {editableUntil ? <TextButton label="Corriger" onPress={() => { setValue(current ?? ''); setEditing(true); }} /> : <Ionicons name="lock-closed" size={14} color={colors.muted} />}
          </View>
          <Text style={styles.muted}>
            {editableUntil
              ? `Une faute de frappe ? Tu peux le corriger jusqu’au ${dayLabel(editableUntil)}.`
              : 'Une erreur ? Écris à l’équipe UGB Connect depuis « Aide & support ».'}
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.muted}>
            {current
              ? 'Corrige ton numéro : il doit être celui de ta carte étudiant.'
              : 'Ajoute-le pour qu’une carte trouvée te revienne. Il est sur ta carte étudiant (P suivi de chiffres). Tu pourras le corriger pendant 3 jours.'}
          </Text>
          <LabeledField label="Ton numéro étudiant" error={error}>
            <Field
              icon="school-outline"
              placeholder="P232055"
              value={value}
              onChangeText={(t) => setValue(typeStudentId(t))}
              invalid={!!error}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={STUDENT_ID_MAX}
            />
          </LabeledField>
          <PrimaryButton label="Enregistrer" disabled={!value || !!error || saving || value === current} loading={saving} onPress={save} />
          {editing && <TextButton label="Annuler" style={{ alignSelf: 'center' }} onPress={() => setEditing(false)} />}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 16, gap: 12 },
  section: { ...typo.section, color: colors.navy },
  label: { ...typo.bodyStrong, color: colors.navy },
  muted: { ...typo.caption, color: colors.muted2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
