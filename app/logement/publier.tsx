import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DateField } from '@/components/DatePicker';
import { BackButton, Chip, Field, LabeledField, PrimaryButton, StickyFooter, STICKY_FOOTER_SPACE } from '@/components/ui';
import { colors, radii, typo } from '@/constants/theme';
import { housingApi, KIND, type HousingAdDto, type HousingFor, type HousingKind } from '@/features/housing/api';
import { VILLAGES } from '@/features/register/validation';
import { ApiError } from '@/lib/api';
import { haptics } from '@/lib/haptics';
import { notice } from '@/lib/notice';
import { useNow } from '@/lib/useNow';

const DAY = 24 * 3600_000;
const HINT: Record<HousingKind, string> = {
  swap: 'Ta chambre contre une autre',
  host_offer: 'Tu peux accueillir quelqu’un',
  host_need: 'Tu cherches où dormir',
  roommate: 'Tu partages un loyer en ville',
};
const midnight = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d;
};

/** Publishing a housing ad: the kind first (four bright tiles), then only what that kind needs. Online two months. */
export default function PublierLogement() {
  const now = useNow();
  const [kind, setKind] = useState<HousingKind | null>(null);
  const [village, setVillage] = useState<string | null>(null);
  const [room, setRoom] = useState('');
  const [wants, setWants] = useState<string[]>([]);
  const [area, setArea] = useState('');
  const [from, setFrom] = useState<Date | null>(null);
  const [to, setTo] = useState<Date | null>(null);
  const [rent, setRent] = useState('');
  const [places, setPlaces] = useState(1);
  const [forWho, setForWho] = useState<HousingFor>('any');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  // One ad of each kind at a time: the kinds I already have online are marked (a tap opens that ad).
  const [online, setOnline] = useState<HousingAdDto[]>([]);
  useEffect(() => {
    housingApi.list().then((r) => setOnline(r.items.filter((a) => a.mine && a.state === 'open')), () => undefined);
  }, []);
  const back = () => (router.canGoBack() ? router.back() : router.replace({ pathname: '/(tabs)/lieux', params: { vue: 'logement' } }));

  const missing = !kind
    ? 'Choisis le type d’annonce'
    : kind === 'swap' && !village
      ? 'Choisis ton village'
      : kind === 'swap' && !room.trim()
        ? 'Indique ta chambre'
        : kind === 'swap' && !wants.length
          ? 'Choisis où tu voudrais aller'
          : kind === 'host_offer' && !village && area.trim().length < 2
            ? 'Indique où tu héberges'
            : kind === 'roommate' && area.trim().length < 2
              ? 'Indique le quartier'
              : from && to && to < from
                ? 'La fin est avant le début'
                : null;

  const publish = async () => {
    if (!kind || missing) return;
    setSaving(true);
    try {
      const ad = await housingApi.create({
        kind,
        village,
        room: room.trim() || null,
        wants,
        area: area.trim() || null,
        from: from?.toISOString() ?? null,
        to: to ? new Date(to.getTime() + DAY - 1).toISOString() : null,
        rent: rent ? Number(rent) : null,
        places: kind === 'roommate' ? places : null,
        for: forWho,
        note: note.trim() || null,
      });
      haptics.success();
      router.replace(`/logement/${ad.id}` as never);
      notice({
        tone: 'success',
        title: 'Annonce publiée',
        message: kind === 'swap' ? 'Si un étudiant a la chambre que tu cherches et veut la tienne, vous êtes prévenus tous les deux.' : 'Les étudiants intéressés t’écrivent dans l’app : tu reçois une notification.',
        footnote: 'En ligne 2 mois. Trouvé ? Ferme-la depuis l’annonce.',
      });
    } catch (err) {
      Alert.alert('Publication impossible', err instanceof ApiError ? err.message : 'Réessaie dans un instant.');
    } finally {
      setSaving(false);
    }
  };

  const villageChips = (value: string | null, onPick: (v: string | null) => void, allowNone?: string) => (
    <View style={{ gap: 8 }}>
      {allowNone && <Chip label={allowNone} selected={!value} onPress={() => onPick(null)} />}
      {(['campus1', 'campus2'] as const).map((c) => (
        <View key={c} style={{ gap: 6 }}>
          <Text style={styles.campus}>{c === 'campus1' ? 'Campus 1' : 'Campus 2'}</Text>
          <View style={styles.wrap}>
            {VILLAGES[c].map((v) => (
              <Chip key={v} label={v.replace('Village ', '')} selected={value === v} onPress={() => onPick(value === v ? null : v)} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.head}>
        <BackButton onPress={back} />
        <Text style={styles.h1}>Nouvelle annonce</Text>
      </View>
      <KeyboardAwareScrollView alwaysBounceVertical={false} overScrollMode="never" contentContainerStyle={[styles.body, { paddingBottom: STICKY_FOOTER_SPACE.two }]} keyboardShouldPersistTaps="handled" bottomOffset={24}>
        <Text style={styles.label}>Ton annonce</Text>
        <View style={styles.tiles}>
          {(Object.keys(KIND) as HousingKind[]).map((k, i) => {
            const on = kind === k;
            const look = KIND[k];
            const taken = online.find((a) => a.kind === k);
            return (
              <Animated.View key={k} entering={FadeInDown.delay(i * 50).duration(240)} style={styles.tileWrap}>
                <Pressable
                  onPress={() => {
                    haptics.select();
                    if (taken) router.push(`/logement/${taken.id}` as never);
                    else setKind(k);
                  }}
                  style={({ pressed }) => [styles.tile, on && styles.tileOn, taken && styles.tileTaken, pressed && { transform: [{ scale: 0.97 }] }]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}>
                  <LinearGradient colors={look.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.tileIcon}>
                    <Ionicons name={look.icon} size={20} color="#fff" />
                  </LinearGradient>
                  <Text style={styles.tileTitle}>{look.label}</Text>
                  {taken ? (
                    <View style={styles.takenPill}>
                      <Text style={styles.takenText}>Déjà en ligne · voir</Text>
                    </View>
                  ) : (
                    <Text style={styles.tileHint}>{HINT[k]}</Text>
                  )}
                  {on && <Ionicons name="checkmark-circle" size={20} color={colors.primary} style={styles.tileCheck} />}
                </Pressable>
              </Animated.View>
            );
          })}
        </View>

        {kind && (
          <Animated.View key={kind} entering={FadeIn.duration(220)} style={{ gap: 16 }}>
            {kind === 'swap' && (
              <>
                <Text style={styles.label}>Ma chambre actuelle</Text>
                {villageChips(village, setVillage)}
                <LabeledField label="Numéro de chambre">
                  <Field placeholder="B 12" value={room} onChangeText={setRoom} maxLength={12} autoCapitalize="characters" />
                </LabeledField>
                <Text style={styles.label}>Je cherche une chambre au…</Text>
                <View style={styles.wrap}>
                  {[...VILLAGES.campus1, ...VILLAGES.campus2]
                    .filter((v) => v !== village)
                    .map((v) => {
                      const on = wants.includes(v);
                      return <Chip key={v} role="checkbox" label={v} selected={on} onPress={() => setWants(on ? wants.filter((x) => x !== v) : [...wants, v])} />;
                    })}
                </View>
              </>
            )}

            {(kind === 'host_offer' || kind === 'host_need') && (
              <>
                <Text style={styles.label}>{kind === 'host_offer' ? 'Où j’héberge' : 'Où j’aimerais dormir'}</Text>
                {villageChips(village, setVillage, kind === 'host_need' ? 'Peu importe' : undefined)}
                <LabeledField label={kind === 'host_offer' ? 'Ou en ville (quartier)' : 'Précision (facultatif)'}>
                  <Field placeholder="Sanar, Saint-Louis…" value={area} onChangeText={setArea} maxLength={60} autoCapitalize="words" />
                </LabeledField>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <DateField label="Du" value={from} onChange={setFrom} min={midnight(now)} max={new Date(midnight(now).getTime() + 180 * DAY)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <DateField label="Au" value={to} onChange={setTo} min={from ?? midnight(now)} max={new Date(midnight(now).getTime() + 180 * DAY)} />
                  </View>
                </View>
              </>
            )}

            {kind === 'roommate' && (
              <>
                <LabeledField label="Quartier ou logement">
                  <Field icon="location-outline" placeholder="Sanar · près du marché" value={area} onChangeText={setArea} maxLength={60} autoCapitalize="words" />
                </LabeledField>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <LabeledField label="Loyer par personne (F/mois)">
                      <Field placeholder="15000" keyboardType="number-pad" value={rent} onChangeText={(t) => setRent(t.replace(/\D/g, '').slice(0, 7))} />
                    </LabeledField>
                  </View>
                  <View style={styles.places}>
                    <Text style={styles.labelSmall}>Places</Text>
                    <View style={styles.stepper}>
                      <Pressable onPress={() => setPlaces(Math.max(1, places - 1))} style={styles.step} hitSlop={6} accessibilityLabel="Une place de moins">
                        <Ionicons name="remove" size={16} color={colors.primary} />
                      </Pressable>
                      <Text style={styles.stepValue}>{places}</Text>
                      <Pressable onPress={() => setPlaces(Math.min(5, places + 1))} style={styles.step} hitSlop={6} accessibilityLabel="Une place de plus">
                        <Ionicons name="add" size={16} color={colors.primary} />
                      </Pressable>
                    </View>
                  </View>
                </View>
              </>
            )}

            <Text style={styles.label}>Pour</Text>
            <View style={styles.wrap}>
              <Chip label="Tous" selected={forWho === 'any'} onPress={() => setForWho('any')} />
              <Chip icon="woman-outline" label="Filles" selected={forWho === 'girls'} onPress={() => setForWho('girls')} />
              <Chip icon="man-outline" label="Garçons" selected={forWho === 'boys'} onPress={() => setForWho('boys')} />
            </View>

            <LabeledField label="Un mot (facultatif)">
              <Field placeholder="Calme, non-fumeur, près de la BU…" value={note} onChangeText={setNote} maxLength={300} multiline style={{ minHeight: 70, textAlignVertical: 'top', paddingTop: 12 }} />
            </LabeledField>
            <View style={styles.privacy}>
              <Ionicons name="lock-closed-outline" size={14} color={colors.muted2} />
              <Text style={styles.privacyText}>Ton numéro n’est jamais affiché : les étudiants t’écrivent dans l’app. Seuls ton prénom et l’initiale de ton nom apparaissent.</Text>
            </View>
          </Animated.View>
        )}
      </KeyboardAwareScrollView>
      <StickyFooter>
        {missing && <Text style={styles.missing}>{missing}</Text>}
        <PrimaryButton label="Publier l’annonce" disabled={!!missing} loading={saving} onPress={publish} />
      </StickyFooter>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 8 },
  h1: { ...typo.h3, color: colors.navy, flex: 1 },
  body: { padding: 20, gap: 16 },
  label: { ...typo.bodyStrong, color: colors.navy },
  labelSmall: { ...typo.smallStrong, color: colors.navy },
  campus: { ...typo.captionStrong, color: colors.muted2, textTransform: 'uppercase', letterSpacing: 0.4 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tileWrap: { width: '48.4%' },
  tile: { padding: 14, gap: 6, borderRadius: radii.lg, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border, minHeight: 128 },
  tileOn: { borderColor: colors.primary, backgroundColor: colors.primarySofter },
  tileIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  tileTitle: { ...typo.smallStrong, color: colors.navy },
  tileHint: { ...typo.caption, color: colors.muted2, lineHeight: 16 },
  tileCheck: { position: 'absolute', top: 10, right: 10 },
  tileTaken: { opacity: 0.7 },
  takenPill: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill, backgroundColor: colors.primarySoft },
  takenText: { ...typo.label, color: colors.primary },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-end' },
  places: { gap: 6 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 },
  step: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  stepValue: { ...typo.title, color: colors.navy, minWidth: 16, textAlign: 'center' },
  privacy: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: radii.md, backgroundColor: colors.card },
  privacyText: { ...typo.caption, color: colors.muted2, flex: 1, lineHeight: 17 },
  missing: { ...typo.caption, color: colors.muted2, textAlign: 'center' },
});
