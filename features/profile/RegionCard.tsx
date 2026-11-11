import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Select } from '@/components/Select';
import { PrimaryButton } from '@/components/ui';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { REGIONS } from '@/features/register/validation';
import { api, ApiError } from '@/lib/api';
import { rentreeLabel } from '@/lib/rentree';
import { toast } from '@/lib/toast';

/**
 * The région d'origine, on « Ma carte étudiant »: announcements for a region reach the student once it's known. Like
 * the UFR, once given it changes at the next rentrée (`lockedUntil`).
 */
export function RegionCard({ current, lockedUntil, onSaved }: { current: string | null; lockedUntil: string | null; onSaved: () => Promise<void> }) {
  const [region, setRegion] = useState<string | null>(current);
  const [saving, setSaving] = useState(false);
  const locked = !!lockedUntil && !!current;

  const save = async () => {
    if (!region) return;
    setSaving(true);
    try {
      await api('PUT', '/me/origin', { auth: true, body: { region } });
      await onSaved();
      toast('Région enregistrée : les annonces de ta région arrivent sur ton accueil.');
    } catch (err) {
      Alert.alert('Enregistrement impossible', err instanceof ApiError ? err.message : 'Réessaie dans un instant.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.card, shadow.card]}>
      <Text style={styles.section}>Région d’origine</Text>
      <Select icon="map-outline" title="Ta région d’origine" placeholder="Choisir ta région" value={region} options={[...REGIONS]} onChange={setRegion} disabled={locked} />
      {locked ? (
        <View style={styles.row}>
          <Ionicons name="lock-closed-outline" size={14} color={colors.muted2} />
          <Text style={styles.muted}>Modifiable à la rentrée, le {rentreeLabel(lockedUntil!)}.</Text>
        </View>
      ) : (
        <PrimaryButton label="Enregistrer" disabled={!region || region === current || saving} loading={saving} onPress={save} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 16, gap: 12 },
  section: { ...typo.section, color: colors.navy },
  muted: { ...typo.caption, color: colors.muted2, flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
