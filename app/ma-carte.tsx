import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton, Field, LabeledField, PrimaryButton, TextButton } from '@/components/ui';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { readMyCardPhoto, saveIdentity } from '@/features/lost/api';
import { CardVisual } from '@/features/lost/CardVisual';
import { CAMPUSES } from '@/features/register/validation';
import { ApiError } from '@/lib/api';
import { toast } from '@/lib/toast';
import { rentreeLabel } from '@/lib/rentree';

/** "2002-03-12" ⇄ "12/03/2002". */
const toFr = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '');
const toIso = (fr: string) => {
  const m = fr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};
/** Types the slashes: "12032002" → "12/03/2002". */
const maskDate = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean).join('/');
};

/**
 * The student's card in the app, and what it adds to the profile: birth date, place of birth, nationality. Optional
 * but recommended. Read from the card itself (OCR on the server): its student number must be the student's own. They
 * check it, then save it once: afterwards it can't be changed.
 */
export default function MaCarte() {
  const { user, reloadAccount } = useAuth();
  const id = user?.identity ?? null;
  const [editing, setEditing] = useState(false);
  // Saved from the card this year: what's filled waits for the rentrée (new card); an empty detail can be completed.
  const until = user?.identityEditableFrom ?? null;
  const missing = !id?.birthDate || !id?.birthPlace || !id?.nationality;
  const locked = !!until && !missing;
  const keep = (v: string | null | undefined) => !!until && !!v;
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [birthDate, setBirthDate] = useState(toFr(id?.birthDate ?? null));
  const [birthPlace, setBirthPlace] = useState(id?.birthPlace ?? '');
  const [nationality, setNationality] = useState(id?.nationality ?? '');

  if (!user) return null;
  const campus = CAMPUSES.find((c) => user.campus.includes(c.label))?.label ?? null;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profil'));

  const scan = async (source: 'camera' | 'library') => {
    if (source === 'camera') {
      const { granted } = await ImagePicker.requestCameraPermissionsAsync();
      if (!granted) {
        Alert.alert('Caméra refusée', 'Autorise la caméra dans les réglages, ou choisis une photo de ta carte.');
        return;
      }
    }
    const res = source === 'camera' ? await ImagePicker.launchCameraAsync({ quality: 0.8 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (res.canceled || !res.assets[0]) return;
    setReading(true);
    try {
      const r = await readMyCardPhoto(res.assets[0].uri);
      // What was read fills the form; what wasn't keeps what the student had.
      // Kept until the rentrée: what's already saved isn't replaced by the new reading.
      if (r.birthDate && !keep(id?.birthDate)) setBirthDate(toFr(r.birthDate));
      if (r.birthPlace && !keep(id?.birthPlace)) setBirthPlace(r.birthPlace);
      if (r.nationality && !keep(id?.nationality)) setNationality(r.nationality);
      setEditing(true);
      if (!r.birthDate && !r.birthPlace && !r.nationality) Alert.alert('Rien de lisible', 'C’est bien ta carte, mais ces informations n’ont pas pu être lues. Complète-les ou réessaie avec une photo plus nette.');
    } catch (err) {
      Alert.alert('Lecture impossible', err instanceof ApiError ? err.message : 'Réessaie dans un instant.');
    } finally {
      setReading(false);
    }
  };

  const dateOk = !birthDate || !!toIso(birthDate);
  const save = async () => {
    setSaving(true);
    try {
      await saveIdentity({ birthDate: toIso(birthDate), birthPlace: birthPlace.trim() || null, nationality: nationality.trim() || null, fromCard: true });
      await reloadAccount();
      setEditing(false);
      toast('Profil complété : tes informations sont vérifiées avec ta carte.');
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
        <Text style={styles.h1}>Ma carte étudiant</Text>
        <View style={{ width: 44 }} />
      </View>
      <KeyboardAwareScrollView style={{ flex: 1 }} bottomOffset={24} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <CardVisual
            type="student"
            holder={{
              firstName: user.firstName,
              lastName: user.lastName,
              initials: user.initials,
              ufr: user.ufrCode,
              campus,
              village: user.village,
              numberHint: user.studentId,
              birthDate: id?.birthDate ?? null,
              birthPlace: id?.birthPlace ?? null,
            }}
            badge={id?.fromCard ? 'Vérifiée avec ta carte' : undefined}
          />

          {!editing ? (
            <>
              <View style={[styles.infoCard, shadow.card]}>
                <Info icon="calendar-outline" label="Date de naissance" value={toFr(id?.birthDate ?? null) || null} />
                <View style={styles.divider} />
                <Info icon="location-outline" label="Lieu de naissance" value={id?.birthPlace ?? null} />
                <View style={styles.divider} />
                <Info icon="flag-outline" label="Nationalité" value={id?.nationality ?? null} />
              </View>

              {locked ? (
                <View style={[styles.notice, { backgroundColor: colors.successBg }]}>
                  <Ionicons name="lock-closed" size={16} color={colors.successText} />
                  <Text style={[styles.noticeText, { color: colors.successText }]}>Enregistré depuis ta carte étudiant cette année : modifiable à la rentrée, le {rentreeLabel(until!)}, avec ta nouvelle carte.</Text>
                </View>
              ) : (
                <>
                  <View style={styles.tip}>
                    <Ionicons name="sparkles-outline" size={18} color={colors.primary} />
                    <Text style={styles.tipText}>
                      Facultatif mais conseillé : photographie ta carte étudiant. Son numéro doit être le tien ({user.studentId}) ; on remplit tes informations, tu vérifies, puis tu enregistres pour l’année (modifiable à chaque rentrée). La photo n’est pas gardée.
                    </Text>
                  </View>
                  <PrimaryButton label={reading ? 'Lecture de ta carte…' : 'Scanner ma carte étudiant'} loading={reading} disabled={reading} onPress={() => scan('camera')} />
                  <TextButton label="Choisir une photo de ma carte" icon="images-outline" style={{ alignSelf: 'center' }} disabled={reading} onPress={() => scan('library')} />
                </>
              )}
              {reading && <ActivityIndicator color={colors.primary} />}
            </>
          ) : (
            <>
              <View style={[styles.notice, { backgroundColor: colors.successBg }]}>
                <Ionicons name="checkmark-circle" size={18} color={colors.successText} />
                <Text style={[styles.noticeText, { color: colors.successText }]}>
                  {until ? 'C’est bien ta carte. Complète ce qui manque : le reste est gardé jusqu’à la rentrée.' : 'C’est bien ta carte. Vérifie et corrige si besoin : une fois enregistré, ce ne sera plus modifiable avant la prochaine rentrée.'}
                </Text>
              </View>
              <LabeledField label="Date de naissance">
                <Field icon={keep(id?.birthDate) ? 'lock-closed-outline' : 'calendar-outline'} editable={!keep(id?.birthDate)} placeholder="JJ/MM/AAAA" keyboardType="number-pad" value={birthDate} onChangeText={(v) => setBirthDate(maskDate(v))} maxLength={10} />
              </LabeledField>
              {!dateOk && birthDate.length === 10 && <Text style={styles.warn}>Date invalide : JJ/MM/AAAA.</Text>}
              <LabeledField label="Lieu de naissance">
                <Field icon={keep(id?.birthPlace) ? 'lock-closed-outline' : 'location-outline'} editable={!keep(id?.birthPlace)} placeholder="Ex. Saint-Louis" autoCapitalize="words" value={birthPlace} onChangeText={setBirthPlace} maxLength={60} />
              </LabeledField>
              <LabeledField label="Nationalité">
                <Field icon={keep(id?.nationality) ? 'lock-closed-outline' : 'flag-outline'} editable={!keep(id?.nationality)} placeholder="Ex. Sénégalaise" autoCapitalize="words" value={nationality} onChangeText={setNationality} maxLength={40} />
              </LabeledField>
              <PrimaryButton label="Enregistrer" loading={saving} disabled={saving || !dateOk || (!!birthDate && birthDate.length < 10)} onPress={save} />
              <TextButton label="Annuler" style={{ alignSelf: 'center' }} onPress={() => setEditing(false)} />
            </>
          )}
        </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

function Info({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string | null }) {
  return (
    <View style={styles.info}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={16} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={[styles.infoValue, !value && { color: colors.muted2 }]}>{value ?? 'À compléter'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 },
  h1: { ...typo.h3, color: colors.navy },
  body: { padding: 20, paddingTop: 24, gap: 14, paddingBottom: 40 },
  infoCard: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 14, gap: 12, marginTop: 6 },
  info: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  infoLabel: { ...typo.caption, color: colors.muted2 },
  infoValue: { ...typo.bodyStrong, color: colors.navy, marginTop: 1 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  tip: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: radii.md, backgroundColor: colors.primarySoft },
  tipText: { ...typo.small, flex: 1, color: colors.primary, lineHeight: 19 },
  notice: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: radii.md },
  noticeText: { ...typo.small, flex: 1, lineHeight: 19 },
  warn: { ...typo.small, color: colors.dangerText, marginTop: -8 },
});
