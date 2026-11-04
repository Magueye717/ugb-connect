import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OtpInput } from '@/components/OtpInput';
import { Select } from '@/components/Select';
import { BackButton, Chip, Field, LabeledField, PrimaryButton, TextButton } from '@/components/ui';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { profileApi } from '@/features/profile/api';
import { sendOtp, verifyOtp, type OtpChallenge } from '@/features/register/auth';
import { CAMPUSES, VILLAGES } from '@/features/register/validation';
import { ApiError } from '@/lib/api';
import { toast } from '@/lib/toast';

const fail = (title: string) => (err: unknown) => Alert.alert(title, err instanceof ApiError ? err.message : 'Réessaie dans un instant.');
const digits = (v: string) => v.replace(/\D/g, '');

/** "Informations personnelles": where the student lives (campus, village, room), their phone number and e-mail. */
export default function Infos() {
  const { user, reloadAccount } = useAuth();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profil'));
  if (!user) return null;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.head}>
        <BackButton onPress={back} />
        <Text style={styles.h1}>Informations personnelles</Text>
      </View>
      <KeyboardAwareScrollView style={{ flex: 1 }} bottomOffset={24} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Residence onSaved={reloadAccount} />
          <Phone current={user.phone} onSaved={reloadAccount} />
          <Email current={user.email} onSaved={reloadAccount} />
        </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

function Residence({ onSaved }: { onSaved: () => Promise<void> }) {
  const { user } = useAuth();
  const [campus, setCampus] = useState<'campus1' | 'campus2'>(user?.campusCode ?? 'campus1');
  const [onCampus, setOnCampus] = useState(!!user?.onCampus);
  const [village, setVillage] = useState<string | null>(user?.village ?? null);
  const [room, setRoom] = useState(user?.room ?? '');
  const [saving, setSaving] = useState(false);
  const villageOk = !onCampus || (!!village && VILLAGES[campus].includes(village));
  const ready = villageOk && (!onCampus || room.trim().length > 0) && !saving;

  const save = async () => {
    setSaving(true);
    try {
      await profileApi.setResidence({ campus, onCampus, ...(onCampus ? { village, room: room.trim() } : {}) });
      await onSaved();
      toast('Logement enregistré : livraisons et annonces de ton campus à jour.');
    } catch (err) {
      fail('Enregistrement impossible')(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.card, shadow.card]}>
      <Text style={styles.section}>Logement</Text>
      <View style={styles.row}>
        {CAMPUSES.map((c) => (
          <Chip key={c.key} label={c.label} selected={campus === c.key} onPress={() => {
              setCampus(c.key);
              if (village && !VILLAGES[c.key].includes(village)) setVillage(null);
            }} />
        ))}
      </View>
      <View style={styles.switchRow}>
        <Text style={[styles.label, { flex: 1 }]}>Je loge dans un village du campus</Text>
        <Switch value={onCampus} onValueChange={setOnCampus} trackColor={{ true: colors.success }} />
      </View>
      {onCampus && (
        <View style={styles.row}>
          <View style={{ flex: 1.3 }}>
            <LabeledField label="Village">
              <Select icon="home-outline" title="Ton village" placeholder="Choisir" value={village} options={VILLAGES[campus]} onChange={setVillage} />
            </LabeledField>
          </View>
          <View style={{ flex: 1 }}>
            <LabeledField label="Chambre">
              <Field placeholder="214" value={room} onChangeText={setRoom} autoCapitalize="characters" maxLength={8} />
            </LabeledField>
          </View>
        </View>
      )}
      <PrimaryButton label="Enregistrer" disabled={!ready} loading={saving} onPress={save} />
    </View>
  );
}

/** A new number: a code is sent to it, then it replaces the old one (to sign in, and for refunds). */
function Phone({ current, onSaved }: { current: string; onSaved: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState('');
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [code, setCode] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [invalid, setInvalid] = useState(false);

  const reset = () => {
    setEditing(false);
    setPhone('');
    setChallenge(null);
    setCode([]);
  };
  const send = async () => {
    setBusy(true);
    try {
      const c = await sendOtp(digits(phone), 'change_phone');
      setChallenge(c);
      setCode(Array(c.codeLength).fill(''));
    } catch (err) {
      fail('Code non envoyé')(err);
    } finally {
      setBusy(false);
    }
  };
  const confirm = async (entered: string[]) => {
    if (!challenge || entered.some((d) => !d)) return;
    setBusy(true);
    try {
      const r = await verifyOtp(challenge.challengeId, entered.join(''));
      if (!r.ok) {
        setInvalid(true);
        return Alert.alert('Code incorrect', r.reason === 'invalid' ? `Il te reste ${r.attemptsLeft} essai(s).` : 'Demande un nouveau code.');
      }
      await profileApi.setPhone(r.verificationToken);
      await onSaved();
      reset();
      Alert.alert('Numéro changé', 'Connecte-toi désormais avec ce numéro.');
    } catch (err) {
      fail('Changement impossible')(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.card, shadow.card]}>
      <Text style={styles.section}>Téléphone</Text>
      <View style={styles.row}>
        <Ionicons name="call-outline" size={18} color={colors.primary} />
        <Text style={[styles.value, { flex: 1 }]}>{current}</Text>
        {!editing && <TextButton label="Changer" onPress={() => setEditing(true)} />}
      </View>
      {editing && !challenge && (
        <>
          <LabeledField label="Nouveau numéro">
            <Field icon="call-outline" keyboardType="phone-pad" placeholder="77 123 45 67" value={phone} onChangeText={setPhone} maxLength={16} />
          </LabeledField>
          <PrimaryButton label="Recevoir un code" disabled={digits(phone).length < 9 || busy} loading={busy} onPress={send} />
          <TextButton label="Annuler" style={{ alignSelf: 'center' }} onPress={reset} />
        </>
      )}
      {challenge && (
        <>
          <Text style={styles.muted}>Code envoyé par SMS au {phone}.</Text>
          <OtpInput
            digits={code}
            invalid={invalid}
            disabled={busy}
            onChange={(d) => {
              setInvalid(false);
              setCode(d);
              if (d.every(Boolean)) confirm(d);
            }}
          />
          <TextButton label="Annuler" style={{ alignSelf: 'center' }} onPress={reset} />
        </>
      )}
    </View>
  );
}

function Email({ current, onSaved }: { current: string | null; onSaved: () => Promise<void> }) {
  const [email, setEmail] = useState(current ?? '');
  const [busy, setBusy] = useState(false);
  const changed = email.trim().toLowerCase() !== (current ?? '').toLowerCase();
  const run = (job: () => Promise<void>, title: string) => async () => {
    setBusy(true);
    try {
      await job();
      await onSaved();
    } catch (err) {
      fail(title)(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.card, shadow.card]}>
      <Text style={styles.section}>E-mail</Text>
      <Field icon="mail-outline" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} placeholder="prenom.nom@ugb.edu.sn" value={email} onChangeText={setEmail} maxLength={254} />
      <PrimaryButton label="Enregistrer l’e-mail" disabled={!changed || !email.includes('@') || busy} loading={busy} onPress={run(() => profileApi.setEmail(email.trim()), 'E-mail refusé')} />
      {current && (
        <TextButton
          label="Retirer l’e-mail"
          tone="danger"
          style={{ alignSelf: 'center' }}
          onPress={run(async () => {
            await profileApi.removeEmail();
            setEmail('');
          }, 'Retrait impossible')}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 8 },
  h1: { ...typo.h3, color: colors.navy, flex: 1 },
  body: { padding: 20, gap: 14, paddingBottom: 40 },
  card: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 16, gap: 12 },
  section: { ...typo.section, color: colors.navy },
  label: { ...typo.bodyStrong, color: colors.navy },
  value: { ...typo.body, color: colors.text },
  muted: { ...typo.caption, color: colors.muted2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
