import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton, Chip, Field, PrimaryButton, StickyFooter } from '@/components/ui';
import { lostCategories, lostCategory, lostOffice, lostSafetyTip } from '@/constants/data';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useLost } from '@/context/LostContext';
import { lostApi, WHEN_LABEL, type CardType, type LostStatus, type LostWhen } from '@/features/lost/api';
import { PlacePicker } from '@/features/lost/PlacePicker';
import { ApiError } from '@/lib/api';
import { useLeaveGuard } from '@/lib/leaveGuard';
import { uploadImage } from '@/lib/upload';

const WHEN = Object.keys(WHEN_LABEL) as LostWhen[];
/** A found card goes through the scanner, which knows the type of card. */
const SCAN_AS: Record<string, CardType> = { 'student-card': 'student', 'id-card': 'national_id', 'bank-card': 'bank' };

// Declare a found or lost item, step by step. The form adapts to the type: cards never get a photo,
// a found object always does, and the hints match the object.
export default function Declarer() {
  const { mode } = useLocalSearchParams<{ mode?: LostStatus }>();
  const status: LostStatus = mode === 'lost' ? 'lost' : 'found';
  const found = status === 'found';
  const { upsert } = useLost();
  const [sending, setSending] = useState(false);

  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [details, setDetails] = useState('');
  const [secret, setSecret] = useState('');
  const [owner, setOwner] = useState('');
  const [where, setWhere] = useState<string | null>(null);
  const [spot, setSpot] = useState('');
  const [when, setWhen] = useState<LostWhen>('today');
  const [holder, setHolder] = useState<'office' | 'finder'>('office');

  // Something typed or picked, not published yet: leaving asks first.
  const guard = useLeaveGuard(!sending && (!!categoryId || !!photo || !!name.trim() || !!details.trim() || !!spot.trim()));
  const back = () => (router.canGoBack() ? router.back() : router.replace({ pathname: '/(tabs)/lieux', params: { vue: 'objets' } }));
  const cat = categoryId ? lostCategory(categoryId) : null;
  const isObject = cat?.kind === 'object';
  const scanFirst = found && !!cat && cat.kind !== 'object';

  const pick = async (source: 'camera' | 'library') => {
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, quality: 0.6 };
    if (source === 'camera') {
      const { granted } = await ImagePicker.requestCameraPermissionsAsync();
      if (!granted) {
        Alert.alert('Caméra refusée', 'Autorise la caméra dans les réglages, ou choisis une photo dans ta galerie.');
        return;
      }
    }
    const res = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (!res.canceled) setPhoto(res.assets[0].uri);
  };

  const title = isObject ? name.trim() || cat!.label : (cat?.label ?? '');
  const missing = !cat
    ? 'Choisis le type d’objet'
    : isObject && found && !photo
      ? 'Ajoute une photo'
      : !where
        ? 'Indique le lieu'
        : null;

  const submit = async () => {
    if (!cat || !where) return;
    setSending(true);
    try {
      // The photo goes first (checked and re-encoded by the server), then the item with its id.
      const image = isObject && photo ? await uploadImage({ uri: photo }, 'lost') : null;
      const item = await lostApi.declare({
        status,
        category: cat.id,
        name: isObject ? title : undefined,
        details: details.trim() || null,
        secret: found && secret.trim() ? secret.trim() : null,
        where,
        spot: spot.trim() || null,
        when,
        holder: found ? holder : null,
        imageId: image?.id ?? null,
        ownerName: cat.kind === 'id-card' && owner.trim() ? owner.trim() : null,
      });
      upsert(item);
      guard.leave(() => router.replace(`/objet/${item.id}`));
    } catch (err) {
      Alert.alert('Publication impossible', err instanceof ApiError ? err.message : 'Réessaie dans un instant.');
    } finally {
      setSending(false);
    }
  };

  let step = 0;
  const next = () => ++step;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.head}>
        <BackButton onPress={back} />
        <Text style={styles.h1}>{found ? 'J’ai trouvé un objet' : 'J’ai perdu un objet'}</Text>
        <View style={{ width: 44 }} />
      </View>

      <KeyboardAwareScrollView style={{ flex: 1 }} bottomOffset={24} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={[styles.intro, { backgroundColor: found ? colors.successBg : '#FFE8D4' }]}>
            <Ionicons name={found ? 'heart-outline' : 'search-outline'} size={20} color={found ? colors.successText : colors.orangeText} />
            <Text style={[styles.introText, { color: found ? colors.successText : colors.orangeText }]}>
              {found
                ? 'Merci ! Quelques infos et son propriétaire pourra te contacter dans l’app.'
                : 'Décris ton objet : on te prévient si quelqu’un le trouve.'}
            </Text>
          </View>

          <Step n={next()} title="C’est quoi ?">
            <View style={styles.grid}>
              {lostCategories.map((c) => {
                const on = c.id === categoryId;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => setCategoryId(c.id)}
                    style={[styles.tile, on && styles.tileOn]}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}>
                    <Ionicons name={c.icon} size={22} color={on ? '#fff' : colors.primary} />
                    <Text style={[styles.tileText, on && { color: '#fff' }]} numberOfLines={1}>
                      {c.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Step>

          {scanFirst ? (
            // A found card goes through the scanner: its owner is found by name (or number) and warned directly.
            <View style={[styles.card, shadow.card, styles.row]}>
              <Ionicons name="scan-outline" size={24} color={colors.primary} />
              <View style={{ flex: 1, gap: 8 }}>
                <Text style={styles.cardTitle}>Scanne la carte pour prévenir son propriétaire</Text>
                <Text style={styles.muted}>On lit le nom sur la carte et on prévient la personne dans l’app. La photo n’est jamais publiée.</Text>
                <PrimaryButton label="Scanner la carte" onPress={() => router.replace({ pathname: '/objet/scanner', params: { type: SCAN_AS[cat.id] ?? 'student' } })} />
              </View>
            </View>
          ) : (
            cat && (
              <>
                {isObject ? (
                  <Step n={next()} title="Photo" badge={found ? 'Obligatoire' : 'Facultatif'}>
                    {photo ? (
                      <View>
                        <Image source={photo} style={styles.preview} contentFit="cover" />
                        <Pressable style={styles.remove} onPress={() => setPhoto(null)} accessibilityLabel="Retirer la photo">
                          <Ionicons name="close" size={16} color="#fff" />
                        </Pressable>
                      </View>
                    ) : (
                      <View style={styles.photoRow}>
                        <PhotoButton icon="camera-outline" label="Prendre une photo" onPress={() => pick('camera')} />
                        <PhotoButton icon="images-outline" label="Galerie" onPress={() => pick('library')} />
                      </View>
                    )}
                    {found && <Text style={styles.muted}>Montre l’objet en entier, sans ce qu’il contient.</Text>}
                  </Step>
                ) : (
                  <View style={[styles.note, { backgroundColor: colors.warningBg }]}>
                    <Ionicons name="eye-off-outline" size={18} color={colors.warningText} />
                    <Text style={[styles.noteText, { color: colors.warningText }]}>
                      {cat.kind === 'id-card'
                        ? 'Jamais de photo d’une pièce d’identité. Le propriétaire prouve son identité au bureau.'
                        : 'Si quelqu’un scanne ta carte, tu es prévenu automatiquement. Déclare-la quand même pour qu’elle soit recherchée.'}
                    </Text>
                  </View>
                )}

                <Step n={next()} title="Description">
                  {isObject && (
                    <Labeled label="Nom de l’objet">
                      <Field icon={cat.icon} placeholder={`Ex. ${cat.label} ${found ? 'trouvé' : 'perdu'}`} value={name} onChangeText={setName} autoCapitalize="sentences" maxLength={40} />
                    </Labeled>
                  )}
                  {cat.kind === 'id-card' && (
                    <Labeled label={found ? 'Prénom et initiale sur la carte (facultatif)' : 'Ton prénom et l’initiale de ton nom'}>
                      <Field icon="person-outline" placeholder="Ex. Mariama S." value={owner} onChangeText={setOwner} autoCapitalize="words" maxLength={30} />
                    </Labeled>
                  )}
                  {isObject && (
                    <Labeled label="Signes distinctifs (visibles par tous)">
                      <Field icon="color-palette-outline" placeholder={cat.hint} value={details} onChangeText={setDetails} autoCapitalize="sentences" maxLength={80} />
                    </Labeled>
                  )}
                  {found && isObject && (
                    <Labeled label="Détail de vérification (privé)">
                      <Field icon="lock-closed-outline" placeholder={cat.secretHint} value={secret} onChangeText={setSecret} autoCapitalize="sentences" maxLength={80} />
                      <Text style={styles.muted}>Non publié. Tu demanderas ce détail à la personne qui dit que c’est à elle.</Text>
                    </Labeled>
                  )}
                </Step>

                <Step n={next()} title={found ? 'Où et quand l’as-tu trouvé ?' : 'Où et quand l’as-tu perdu ?'}>
                  <PlacePicker value={where} onChange={setWhere} />
                  <Field icon="navigate-outline" placeholder="Précise (facultatif) : 2e étage, près de la fenêtre…" value={spot} onChangeText={setSpot} autoCapitalize="sentences" maxLength={60} />
                  <Chips options={WHEN.map((w) => WHEN_LABEL[w])} value={WHEN_LABEL[when]} onChange={(label) => setWhen(WHEN.find((w) => WHEN_LABEL[w] === label) ?? 'today')} />
                </Step>

                {found && (
                  <Step n={next()} title="Où est-il maintenant ?">
                    <Choice
                      on={holder === 'office'}
                      icon="business-outline"
                      title={`Déposé au ${lostOffice.name.toLowerCase()}`}
                      detail={`${lostOffice.area} · ${lostOffice.hours}`}
                      onPress={() => setHolder('office')}
                    />
                    <Choice
                      on={holder === 'finder'}
                      icon="hand-left-outline"
                      title="Je le garde pour le rendre"
                      detail={lostSafetyTip}
                      onPress={() => setHolder('finder')}
                    />
                  </Step>
                )}

                <Text style={styles.previewLabel}>Aperçu de l’annonce</Text>
                <View style={[styles.card, shadow.card, styles.row]}>
                  <View style={[styles.thumb, { backgroundColor: colors.primarySoft }]}>
                    {isObject && photo ? (
                      <Image source={photo} style={StyleSheet.absoluteFill} contentFit="cover" />
                    ) : (
                      <Ionicons name={cat.icon} size={24} color={colors.primary} />
                    )}
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {title}
                    </Text>
                    {!!details.trim() && (
                      <Text style={styles.muted} numberOfLines={1}>
                        {details.trim()}
                      </Text>
                    )}
                    <Text style={styles.muted} numberOfLines={1}>
                      {where ?? 'Lieu ?'} · {WHEN_LABEL[when]}
                    </Text>
                  </View>
                </View>

              </>
            )
          )}
        </KeyboardAwareScrollView>
      {/* Pinned, as on every form: what's missing, then « Publier ». */}
      {!scanFirst && cat && (
        <StickyFooter>
          <PrimaryButton label={missing ?? (found ? 'Publier l’objet trouvé' : 'Publier la perte')} disabled={!!missing || sending} loading={sending} onPress={submit} />
        </StickyFooter>
      )}
    </SafeAreaView>
  );
}

function Step({ n, title, badge, children }: { n: number; title: string; badge?: string; children: ReactNode }) {
  return (
    <View style={[styles.card, shadow.card, { gap: 12 }]}>
      <View style={styles.stepHead}>
        <View style={styles.stepNum}>
          <Text style={styles.stepNumText}>{n}</Text>
        </View>
        <Text style={styles.stepTitle}>{title}</Text>
        {badge && (
          <View style={[styles.badge, badge === 'Obligatoire' && { backgroundColor: colors.warningBg }]}>
            <Text style={[styles.badgeText, badge === 'Obligatoire' && { color: colors.warningText }]}>{badge}</Text>
          </View>
        )}
      </View>
      {children}
    </View>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function PhotoButton({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.photoBtn} onPress={onPress} accessibilityRole="button">
      <Ionicons name={icon} size={24} color={colors.primary} />
      <Text style={styles.photoBtnText}>{label}</Text>
    </Pressable>
  );
}

function Chips({ options, value, onChange }: { options: string[]; value: string | null; onChange: (v: string) => void }) {
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const on = o === value;
        return (
          <Chip key={o} label={o} selected={on} onPress={() => onChange(o)} />
        );
      })}
    </View>
  );
}

function Choice({
  on,
  icon,
  title,
  detail,
  onPress,
}: {
  on: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.choice, on && styles.choiceOn]} accessibilityRole="radio" accessibilityState={{ checked: on }}>
      <Ionicons name={icon} size={20} color={colors.primary} />
      <View style={{ flex: 1 }}>
        <Text style={styles.choiceTitle}>{title}</Text>
        <Text style={styles.muted}>{detail}</Text>
      </View>
      {on ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} /> : <View style={styles.radio} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 },
  h1: { ...typo.h3, color: colors.navy },
  body: { padding: 20, gap: 14, paddingBottom: 40 },
  intro: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: radii.md },
  introText: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  card: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardTitle: { ...typo.title, color: colors.navy },
  muted: { ...typo.caption, color: colors.muted2, lineHeight: 17 },
  stepHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { ...typo.smallStrong, color: '#fff' },
  stepTitle: { ...typo.title, flex: 1, color: colors.navy },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.pill, backgroundColor: colors.bg },
  badgeText: { ...typo.label, color: colors.muted2 },
  // 3 tiles per row.
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    width: '31.5%',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: radii.md,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tileOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tileText: { ...typo.captionStrong, color: colors.navy },
  note: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: radii.md },
  noteText: { ...typo.small, flex: 1, lineHeight: 18 },
  label: { ...typo.smallStrong, color: colors.navy },
  photoRow: { flexDirection: 'row', gap: 10 },
  photoBtn: {
    flex: 1,
    height: 110,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    backgroundColor: colors.primarySofter,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  photoBtnText: { ...typo.smallStrong, color: colors.primary },
  preview: { height: 200, borderRadius: radii.md },
  remove: { position: 'absolute', top: 8, right: 8, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(15,27,76,0.6)', alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, minHeight: 40, borderRadius: radii.pill, backgroundColor: colors.bg, justifyContent: 'center' },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.bg, borderRadius: radii.md, padding: 14, borderWidth: 1.5, borderColor: 'transparent' },
  choiceOn: { borderColor: colors.primary, backgroundColor: colors.primarySofter },
  choiceTitle: { ...typo.bodyStrong, color: colors.navy },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border },
  previewLabel: { ...typo.smallStrong, color: colors.muted2, marginTop: 4 },
  thumb: { width: 56, height: 56, borderRadius: radii.sm, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});
