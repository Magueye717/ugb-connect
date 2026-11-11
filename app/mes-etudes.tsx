import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Select } from '@/components/Select';
import { BackButton, LabeledField, PrimaryButton, StickyFooter } from '@/components/ui';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useCampus } from '@/context/CampusContext';
import { NIVEAUX, UFRS, ufrLabel } from '@/features/register/validation';
import { api, ApiError } from '@/lib/api';
import { useLeaveGuard } from '@/lib/leaveGuard';
import { rentreeLabel } from '@/lib/rentree';

/**
 * "Mon UFR et mon niveau": asked at sign-up. An empty one can be filled here any time; once given, they change at the
 * next rentrée only (a new academic year, maybe a new UFR). Announcements for one UFR reach the student only once it's
 * known. The région d'origine is on « Ma carte étudiant ».
 */
export default function MesEtudes() {
  const { user, reloadAccount } = useAuth();
  const { refresh } = useCampus();
  const [ufr, setUfr] = useState<string | null>(user?.ufrCode ?? null);
  const [niveau, setNiveau] = useState<string | null>(user?.niveau ?? null);
  const [saving, setSaving] = useState(false);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profil'));
  // Given this year: what's filled waits for the rentrée.
  const until = user?.originEditableFrom ?? null;
  const ufrLocked = !!until && !!user?.ufrCode;
  const niveauLocked = !!until && !!user?.niveau;
  const allLocked = ufrLocked && niveauLocked;
  const changed = ufr !== (user?.ufrCode ?? null) || niveau !== (user?.niveau ?? null);
  const guard = useLeaveGuard(changed && !saving);

  const save = async () => {
    if (!ufr || !niveau) return;
    setSaving(true);
    try {
      await api('PUT', '/me/origin', { auth: true, body: { ufr, niveau } });
      await reloadAccount();
      // The home screen now shows this UFR's announcements.
      await refresh();
      guard.leave(back);
    } catch (err) {
      Alert.alert('Enregistrement impossible', err instanceof ApiError ? err.message : 'Réessaie dans un instant.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.head}>
        <BackButton onPress={back} />
        <Text style={styles.h1}>Mon UFR et mon niveau</Text>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, shadow.card, styles.info]}>
          <Ionicons name="megaphone-outline" size={20} color={colors.primary} />
          <Text style={styles.infoText}>Les annonces de ton UFR (examens, élections des délégués…) arrivent sur ton accueil une fois ton UFR renseigné. Ta région d’origine est dans « Ma carte étudiant ».</Text>
        </View>
        {until && (
          <View style={[styles.card, styles.info, { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border }]}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.muted2} />
            <Text style={[styles.infoText, { color: colors.muted2 }]}>
              {allLocked ? 'Renseignés pour cette année' : 'Ce qui est renseigné reste pour cette année'} : modifiables à la rentrée, le {rentreeLabel(until)}.{!allLocked && ' Tu peux compléter ce qui manque.'}
            </Text>
          </View>
        )}
        <LabeledField label="UFR">
          <Select
            disabled={ufrLocked}
            icon="school-outline"
            title="Ton UFR"
            placeholder="Choisir ton UFR"
            value={ufr ? ufrLabel(ufr) : null}
            options={UFRS.map((u) => ufrLabel(u.code))}
            onChange={(label) => setUfr(UFRS.find((u) => ufrLabel(u.code) === label)?.code ?? null)}
          />
        </LabeledField>
        <LabeledField label="Niveau">
          <Select icon="layers-outline" title="Ton niveau" placeholder="Licence 1, Master 2…" value={niveau} options={[...NIVEAUX]} onChange={setNiveau} disabled={niveauLocked} />
        </LabeledField>
      </ScrollView>
      {/* Pinned, as on every form. */}
      {!allLocked && (
        <StickyFooter>
          <PrimaryButton label="Enregistrer" disabled={!ufr || !niveau || !changed} loading={saving} onPress={save} />
        </StickyFooter>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 },
  h1: { ...typo.h3, color: colors.navy },
  body: { padding: 20, gap: 18 },
  card: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 14 },
  info: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  infoText: { ...typo.small, flex: 1, color: colors.text, lineHeight: 19 },
});
