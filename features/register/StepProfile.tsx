import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOut, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { Select } from '@/components/Select';
import { Field, LabeledField, PrimaryButton } from '@/components/ui';
import { colors, radii, typo } from '@/constants/theme';
import { legalHref } from '@/features/legal/api';
import {
  CAMPUSES,
  normalizeRoom,
  passwordRules,
  validateConfirm,
  validateName,
  validatePassword,
  NIVEAUX,
  REGIONS,
  UFRS,
  ufrLabel,
  validateRoom,
  VILLAGES,
  type CampusKey,
} from './validation';

export type ProfileValues = {
  firstName: string;
  lastName: string;
  campus: CampusKey | null;
  /** Lives in a campus residence: then village and room are asked. */
  onCampus: boolean;
  village: string | null;
  room: string;
  /** UFR code: announcements for a UFR reach the student. */
  ufr: string | null;
  /** Year of study (with the UFR). */
  niveau: string | null;
  /** Home region. */
  region: string | null;
  password: string;
  confirm: string;
  accepted: boolean;
};

type Props = {
  values: ProfileValues;
  onChange: (patch: Partial<ProfileValues>) => void;
  onSubmit: () => void;
  submitting: boolean;
  submitError: string | null;
};

type FieldKey = 'firstName' | 'lastName' | 'ufr' | 'niveau' | 'region' | 'campus' | 'village' | 'room' | 'password' | 'confirm' | 'accepted';

// Same accent as the welcome screen.
const ACCENT = colors.orange;

export function StepProfile({ values, onChange, onSubmit, submitting, submitError }: Props) {
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const touch = (k: FieldKey) => setTouched((t) => ({ ...t, [k]: true }));

  const errors: Record<FieldKey, string | null> = {
    firstName: validateName(values.firstName, 'prénom'),
    lastName: validateName(values.lastName, 'nom'),
    ufr: values.ufr ? null : 'Choisis ton UFR',
    niveau: values.niveau ? null : 'Choisis ton niveau',
    region: values.region ? null : 'Choisis ta région d’origine',
    campus: values.campus ? null : 'Choisis ton campus',
    village: !values.onCampus || values.village ? null : 'Choisis ton village',
    room: values.onCampus ? validateRoom(values.room) : null,
    password: validatePassword(values.password),
    confirm: validateConfirm(values.password, values.confirm),
    accepted: values.accepted ? null : 'Tu dois accepter les conditions pour continuer',
  };
  const valid = Object.values(errors).every((e) => !e);
  const shown = (k: FieldKey) => (touched[k] ? errors[k] : null);
  const campus = CAMPUSES.find((c) => c.key === values.campus);

  return (
    <View style={{ gap: 26 }}>
      <Section icon="person-outline" title="Toi">
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <LabeledField label="Prénom" error={shown('firstName')}>
              <Field
                accent={ACCENT}
                placeholder="Awa"
                value={values.firstName}
                onChangeText={(firstName) => onChange({ firstName })}
                onBlur={() => touch('firstName')}
                invalid={!!shown('firstName')}
                autoCapitalize="words"
                autoComplete="given-name"
                textContentType="givenName"
              />
            </LabeledField>
          </View>
          <View style={{ flex: 1 }}>
            <LabeledField label="Nom" error={shown('lastName')}>
              <Field
                accent={ACCENT}
                placeholder="Diop"
                value={values.lastName}
                onChangeText={(lastName) => onChange({ lastName })}
                onBlur={() => touch('lastName')}
                invalid={!!shown('lastName')}
                autoCapitalize="words"
                autoComplete="family-name"
                textContentType="familyName"
              />
            </LabeledField>
          </View>
        </View>
      </Section>

      <Section icon="school-outline" title="Tes études et ta région">
        <LabeledField label="UFR" error={shown('ufr')}>
          <Select
            icon="school-outline"
            title="Ton UFR"
            placeholder="Choisir ton UFR"
            value={values.ufr ? ufrLabel(values.ufr) : null}
            options={UFRS.map((u) => ufrLabel(u.code))}
            onChange={(label) => onChange({ ufr: UFRS.find((u) => ufrLabel(u.code) === label)?.code ?? null })}
            onClose={() => touch('ufr')}
            invalid={!!shown('ufr')}
          />
        </LabeledField>
        <LabeledField label="Niveau" error={shown('niveau')}>
          <Select
            icon="layers-outline"
            title="Ton niveau"
            placeholder="Licence 1, Master 2…"
            value={values.niveau}
            options={[...NIVEAUX]}
            onChange={(niveau) => onChange({ niveau })}
            onClose={() => touch('niveau')}
            invalid={!!shown('niveau')}
          />
        </LabeledField>
        <LabeledField label="Région d’origine" error={shown('region')}>
          <Select
            icon="map-outline"
            title="Ta région d’origine"
            placeholder="Choisir ta région"
            value={values.region}
            options={[...REGIONS]}
            onChange={(region) => onChange({ region })}
            onClose={() => touch('region')}
            invalid={!!shown('region')}
          />
        </LabeledField>
      </Section>

      <Section icon="business-outline" title="Ton campus" hint="Obligatoire">
        <View style={styles.row} accessibilityRole="radiogroup">
          {CAMPUSES.map((c) => (
            <CampusCard
              key={c.key}
              label={c.label}
              detail={c.detail}
              selected={values.campus === c.key}
              onPress={() => {
                // Changing campus resets the village, since the list differs.
                if (c.key !== values.campus) onChange({ campus: c.key, village: null });
                touch('campus');
              }}
            />
          ))}
        </View>
        {shown('campus') && (
          <Animated.Text entering={FadeInDown.duration(180)} style={styles.error}>
            {errors.campus}
          </Animated.Text>
        )}
      </Section>

      {campus && (
        <Animated.View entering={FadeInDown.duration(260)}>
          <Section icon="home-outline" title="Ton logement">
            <View style={styles.toggle}>
              {[
                { on: true, label: 'J’habite au campus', icon: 'bed-outline' as const },
                { on: false, label: 'Hors campus', icon: 'walk-outline' as const },
              ].map((o) => {
                const active = values.onCampus === o.on;
                return (
                  <Pressable
                    key={o.label}
                    onPress={() => onChange({ onCampus: o.on })}
                    style={[styles.toggleBtn, active && styles.toggleOn]}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}>
                    <Ionicons name={o.icon} size={16} color={active ? colors.navy : colors.muted2} />
                    <Text style={[styles.toggleText, active && { color: colors.navy }]}>{o.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {values.onCampus ? (
              <Animated.View entering={FadeInDown.duration(220)} exiting={FadeOut.duration(120)} style={styles.row}>
                <View style={{ flex: 1.4 }}>
                  <LabeledField label="Village" error={shown('village')}>
                    <Select
                      icon="location-outline"
                      title={`Ton village · ${campus.label}`}
                      placeholder="Choisir"
                      value={values.village}
                      options={VILLAGES[campus.key]}
                      onChange={(village) => onChange({ village })}
                      onClose={() => touch('village')}
                      invalid={!!shown('village')}
                    />
                  </LabeledField>
                </View>
                <View style={{ flex: 1 }}>
                  <LabeledField label="Chambre" error={shown('room')}>
                    <Field
                      accent={ACCENT}
                      icon="key-outline"
                      placeholder="214"
                      value={values.room}
                      onChangeText={(t) => onChange({ room: normalizeRoom(t) })}
                      onBlur={() => touch('room')}
                      invalid={!!shown('room')}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      maxLength={6}
                    />
                  </LabeledField>
                </View>
              </Animated.View>
            ) : (
              <Animated.Text entering={FadeInDown.duration(220)} exiting={FadeOut.duration(120)} style={styles.note}>
                Pas de souci : tu pourras ajouter ta chambre plus tard dans ton profil.
              </Animated.Text>
            )}
            {values.onCampus && (
              <Text style={styles.note}>Sert à la livraison de tes repas et à te rendre un objet perdu.</Text>
            )}
          </Section>
        </Animated.View>
      )}

      <Section icon="lock-closed-outline" title="Sécurité">
        <LabeledField label="Mot de passe">
          <Field
            accent={ACCENT}
            icon="lock-closed-outline"
            placeholder="••••••••"
            secure
            value={values.password}
            onChangeText={(password) => onChange({ password })}
            onBlur={() => touch('password')}
            invalid={!!shown('password')}
            autoComplete="new-password"
            textContentType="newPassword"
          />
          <View style={styles.rules}>
            {passwordRules.map((r) => (
              <Rule key={r.label} ok={r.test(values.password)} label={r.label} />
            ))}
          </View>
        </LabeledField>

        <LabeledField label="Confirmer le mot de passe" error={shown('confirm')}>
          <Field
            accent={ACCENT}
            icon="lock-closed-outline"
            placeholder="••••••••"
            secure
            value={values.confirm}
            onChangeText={(confirm) => onChange({ confirm })}
            onBlur={() => touch('confirm')}
            invalid={!!shown('confirm')}
            autoComplete="new-password"
            textContentType="newPassword"
          />
        </LabeledField>
      </Section>

      <View style={{ gap: 6 }}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: values.accepted }}
          onPress={() => {
            onChange({ accepted: !values.accepted });
            touch('accepted');
          }}
          style={styles.checkRow}>
          <View
            style={[styles.checkbox, values.accepted && styles.checkboxOn, !!shown('accepted') && styles.checkboxInvalid]}>
            {values.accepted && <Ionicons name="checkmark" size={15} color="#fff" />}
          </View>
          <Text style={styles.checkText}>
            J’accepte les{' '}
            <Text style={styles.link} onPress={() => router.push(legalHref('conditions'))} accessibilityRole="link">
              Conditions d’utilisation
            </Text>{' '}
            et la{' '}
            <Text style={styles.link} onPress={() => router.push(legalHref('confidentialite'))} accessibilityRole="link">
              Politique de confidentialité
            </Text>
          </Text>
        </Pressable>
        {shown('accepted') && (
          <Animated.Text entering={FadeInDown.duration(180)} style={styles.error}>
            {errors.accepted}
          </Animated.Text>
        )}
      </View>

      {submitError && <Text style={[styles.error, { textAlign: 'center' }]}>{submitError}</Text>}

      <PrimaryButton accent label="Créer mon compte" onPress={onSubmit} disabled={!valid} loading={submitting} />
    </View>
  );
}

function Section({ icon, title, hint, children }: { icon: keyof typeof Ionicons.glyphMap; title: string; hint?: string; children: ReactNode }) {
  return (
    <View style={{ gap: 14 }}>
      <View style={styles.sectionHead}>
        <View style={styles.sectionIcon}>
          <Ionicons name={icon} size={13} color={ACCENT} />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
        {hint && <Text style={styles.sectionHint}>{hint}</Text>}
      </View>
      {children}
    </View>
  );
}

/** Big tappable campus choice; springs a little when picked. */
function CampusCard({ label, detail, selected, onPress }: { label: string; detail: string; selected: boolean; onPress: () => void }) {
  const scale = useSharedValue(1);
  useEffect(() => {
    if (selected) {
      scale.set(0.96);
      scale.set(withSpring(1, { damping: 8, stiffness: 260 }));
    }
  }, [selected, scale]);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return (
    <Animated.View style={[{ flex: 1 }, animated]}>
      <Pressable
        onPress={onPress}
        style={[styles.campus, selected && styles.campusOn]}
        accessibilityRole="radio"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={`${label}, ${detail}`}>
        <View style={[styles.campusIcon, selected && { backgroundColor: ACCENT }]}>
          <Ionicons name={selected ? 'business' : 'business-outline'} size={20} color={selected ? '#fff' : colors.navy} />
        </View>
        <Text style={[styles.campusLabel, selected && { color: '#fff' }]}>{label}</Text>
        <Text style={[styles.campusDetail, selected && { color: 'rgba(255,255,255,0.75)' }]}>{detail}</Text>
        {selected && (
          <Animated.View entering={FadeInDown.duration(160)} style={styles.check}>
            <Ionicons name="checkmark" size={13} color="#fff" />
          </Animated.View>
        )}
      </Pressable>
    </Animated.View>
  );
}

function Rule({ ok, label }: { ok: boolean; label: string }) {
  return (
    <View style={styles.rule}>
      <View style={[styles.ruleDot, ok && styles.ruleDotOk]}>{ok && <Ionicons name="checkmark" size={11} color="#fff" />}</View>
      <Text style={[styles.ruleText, ok && { color: colors.successText }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionIcon: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFE8D4', alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { ...typo.smallStrong, flex: 1, color: colors.navy, textTransform: 'uppercase', letterSpacing: 0.6 },
  sectionHint: { ...typo.label, color: colors.orangeText },
  // Navy when picked, like the welcome screen.
  campus: {
    minHeight: 112,
    padding: 14,
    borderRadius: radii.lg,
    backgroundColor: colors.input,
    borderWidth: 1.5,
    borderColor: colors.border,
    gap: 4,
  },
  campusOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  campusIcon: { width: 36, height: 36, borderRadius: radii.sm, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  campusLabel: { ...typo.title, color: colors.navy },
  campusDetail: { ...typo.caption, color: colors.muted2 },
  check: { position: 'absolute', top: 10, right: 10, width: 22, height: 22, borderRadius: 11, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  toggle: { flexDirection: 'row', padding: 4, borderRadius: radii.pill, backgroundColor: colors.input },
  toggleBtn: { flex: 1, flexDirection: 'row', gap: 6, minHeight: 40, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  toggleOn: { backgroundColor: colors.card, shadowColor: '#1E2A5A', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  toggleText: { ...typo.smallStrong, color: colors.muted2 },
  note: { ...typo.caption, color: colors.muted2, lineHeight: 17 },
  rules: { gap: 6, marginTop: 4 },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ruleDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ruleDotOk: { backgroundColor: colors.success, borderColor: colors.success },
  ruleText: { ...typo.caption, color: colors.muted2 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxOn: { backgroundColor: ACCENT, borderColor: ACCENT },
  checkboxInvalid: { borderColor: colors.danger },
  checkText: { ...typo.small, flex: 1, lineHeight: 20, color: colors.text },
  link: { fontWeight: '700', color: colors.orangeText },
  error: { ...typo.caption, color: colors.danger },
});
