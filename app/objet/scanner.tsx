import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton, Field, LabeledField, OutlineButton, PrimaryButton } from '@/components/ui';
import { lostOffice } from '@/constants/data';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useLost } from '@/context/LostContext';
import { CARD_TYPES, lostApi, readCardPhoto, type CardType, type StudentMatch } from '@/features/lost/api';
import { CardVisual } from '@/features/lost/CardVisual';
import { PlacePicker } from '@/features/lost/PlacePicker';
import { ApiError } from '@/lib/api';

type HandOver = 'office' | 'finder';
const fail = (title: string) => (err: unknown) => Alert.alert(title, err instanceof ApiError ? err.message : 'Réessaie dans un instant.');
const STUDENT_NUMBER = /^P\d{6}$/;
const YOUR: Record<CardType, string> = { student: 'sa carte étudiant', national_id: 'sa carte d’identité', driving_licence: 'son permis', bank: 'sa carte bancaire' };
const isCardType = (v: string | undefined): v is CardType => CARD_TYPES.some((t) => t.value === v);

/**
 * Found a card (student, identity, licence, bank): a photo of it is read on the server (OCR), which recognises the
 * type, a student card's number (P232055) and the names. The number gives the owner; otherwise the people with
 * those names are listed, or the finder types the number or a name. The owner gets a push and an alert on their
 * home screen with the finder's name and phone.
 */
export default function ScanCard() {
  const params = useLocalSearchParams<{ type?: string }>();
  const { upsert } = useLost();
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [cardType, setCardType] = useState<CardType>(isCardType(params.type) ? params.type : 'student');
  const [reading, setReading] = useState(false);
  const [number, setNumber] = useState('');
  const [name, setName] = useState('');
  const [searching, setSearching] = useState(false);
  /** People the card may belong to (the names read, or typed); null: nothing looked up yet. */
  const [candidates, setCandidates] = useState<StudentMatch[] | null>(null);
  /** The names searched, to say what was looked for. */
  const [searched, setSearched] = useState<string | null>(null);
  /** The owner chosen; null: nobody matches (the card goes to the office). Undefined: not decided yet. */
  const [owner, setOwner] = useState<StudentMatch | null | undefined>(undefined);
  const [where, setWhere] = useState<string | null>(null);
  const [spot, setSpot] = useState('');
  const [handOver, setHandOver] = useState<HandOver>('office');
  const [sending, setSending] = useState(false);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/services/objets'));
  const restart = () => {
    setOwner(undefined);
    setCandidates(null);
    setSearched(null);
  };

  const read = async (uri: string) => {
    setReading(true);
    try {
      const r = await readCardPhoto(uri);
      if (r.cardType) setCardType(r.cardType);
      if (r.studentNumber) setNumber(r.studentNumber);
      if (r.owner) setOwner(r.owner);
      else {
        setSearched(r.names.join(' ') || null);
        setCandidates(r.candidates);
      }
    } catch (err) {
      fail('Lecture impossible')(err);
    } finally {
      setReading(false);
    }
  };

  const shoot = async () => {
    const photo = await camera.current?.takePictureAsync({ quality: 0.8 }).catch(() => null);
    if (photo) await read(photo.uri);
  };

  const fromGallery = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!res.canceled && res.assets[0]) await read(res.assets[0].uri);
  };

  const lookup = async () => {
    const n = number.toUpperCase().replace(/\s/g, '');
    setSearching(true);
    try {
      const r = await lostApi.lookupCard(n);
      if (r.owner) setOwner(r.owner);
      else {
        setSearched(n);
        setCandidates([]);
      }
    } catch (err) {
      fail('Recherche impossible')(err);
    } finally {
      setSearching(false);
    }
  };

  const search = async (q = name) => {
    setSearching(true);
    try {
      setCandidates((await lostApi.searchCard(q.trim())).items);
      setSearched(q.trim());
    } catch (err) {
      fail('Recherche impossible')(err);
    } finally {
      setSearching(false);
    }
  };

  const submit = async () => {
    if (owner === undefined || !where) return;
    setSending(true);
    try {
      const { item } = await lostApi.cardFound({ ownerRef: owner?.ref ?? null, cardType, where, spot: spot.trim() || null, holder: owner ? handOver : 'office' });
      upsert(item);
      Alert.alert(
        'Merci !',
        owner
          ? `${owner.name} a reçu une notification avec ton nom et ton numéro. ${handOver === 'office' ? `Dépose la carte au ${lostOffice.name.toLowerCase()}.` : 'Cette personne va te contacter pour la récupérer.'}`
          : `Dépose la carte au ${lostOffice.name.toLowerCase()} : son propriétaire pourra la récupérer là-bas.`,
        [{ text: 'Voir l’annonce', onPress: () => router.replace(`/objet/${item.id}`) }],
      );
    } catch (err) {
      fail('Envoi impossible')(err);
    } finally {
      setSending(false);
    }
  };

  const type = CARD_TYPES.find((t) => t.value === cardType)!;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.head}>
        <BackButton onPress={back} />
        <Text style={styles.h1}>Carte trouvée</Text>
        <View style={{ width: 44 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* 1. Photo, or type the number / a name. */}
          {owner === undefined && candidates === null && (
            <>
              <TypePicker value={cardType} onChange={setCardType} />
              <View style={styles.camera}>
                {!permission ? null : permission.granted ? (
                  <>
                    <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" />
                    <View style={styles.frame} pointerEvents="none" />
                    {reading && (
                      <View style={styles.reading}>
                        <ActivityIndicator color="#fff" />
                        <Text style={styles.readingText}>Lecture de la carte…</Text>
                      </View>
                    )}
                  </>
                ) : (
                  <View style={styles.permission}>
                    <Ionicons name="camera-outline" size={32} color="#fff" />
                    <Text style={styles.permissionText}>La caméra sert à photographier la carte pour lire le nom de son propriétaire.</Text>
                    <Pressable style={styles.permissionBtn} onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())}>
                      <Text style={styles.permissionBtnText}>{permission.canAskAgain ? 'Autoriser la caméra' : 'Ouvrir les réglages'}</Text>
                    </Pressable>
                  </View>
                )}
              </View>
              <Text style={styles.hint}>Cadre la carte à plat, avec de la lumière. La photo sert juste à lire le nom (et le numéro d’une carte étudiant) : elle n’est pas gardée.</Text>
              <PrimaryButton label="Photographier la carte" disabled={!permission?.granted || reading} loading={reading} onPress={shoot} />
              <Pressable onPress={fromGallery} disabled={reading} hitSlop={8} style={{ alignSelf: 'center' }}>
                <Text style={styles.link}>Choisir une photo dans la galerie</Text>
              </Pressable>

              <View style={styles.or}>
                <View style={styles.orLine} />
                <Text style={styles.orText}>ou cherche toi-même</Text>
                <View style={styles.orLine} />
              </View>
              {cardType === 'student' && (
                <>
                  <LabeledField label="Numéro étudiant écrit sur la carte">
                    <Field icon="card-outline" placeholder="Ex. P232055" autoCapitalize="characters" value={number} onChangeText={setNumber} returnKeyType="search" onSubmitEditing={lookup} maxLength={10} />
                  </LabeledField>
                  <OutlineButton label="Chercher par numéro" disabled={!STUDENT_NUMBER.test(number.toUpperCase().replace(/\s/g, '')) || searching} onPress={lookup} />
                </>
              )}
              <LabeledField label="Prénom et nom sur la carte">
                <Field icon="person-outline" placeholder="Ex. Fatou Ndiaye" autoCapitalize="words" value={name} onChangeText={setName} returnKeyType="search" onSubmitEditing={() => search()} maxLength={60} />
              </LabeledField>
              <OutlineButton label="Chercher par nom" disabled={name.trim().length < 2 || searching} onPress={() => search()} />
            </>
          )}

          {/* 2. The people it may belong to. */}
          {owner === undefined && candidates !== null && candidates.length > 0 && (
            <>
              <View style={styles.detected}>
                <Ionicons name={type.icon as keyof typeof Ionicons.glyphMap} size={16} color={colors.primary} />
                <Text style={styles.detectedText}>
                  {type.label}
                  {searched ? ` · « ${searched} »` : ''}
                </Text>
              </View>
              <Text style={styles.section}>
                {candidates.length} personne{candidates.length > 1 ? 's' : ''} trouvée{candidates.length > 1 ? 's' : ''}
              </Text>
              <Text style={styles.hintLeft}>Touche le nom écrit sur la carte. Compare aussi l’UFR, le campus et le numéro quand ils y sont.</Text>
              {candidates.map((c) => (
                <Pressable
                  key={c.ref}
                  style={({ pressed }) => [styles.person, shadow.card, pressed && { transform: [{ scale: 0.98 }] }]}
                  onPress={() => setOwner(c)}
                  accessibilityRole="button"
                  accessibilityLabel={c.name}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{c.initials}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.personName}>{c.name}</Text>
                    <Text style={styles.personMeta} numberOfLines={1}>
                      {[c.ufr ? `UFR ${c.ufr}` : null, c.campus, c.village, c.numberHint].filter(Boolean).join(' · ') || 'Compte UGB Campus'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                </Pressable>
              ))}
              <OfficeOption title="Personne ne correspond ?" onPress={() => setOwner(null)} />
              <Pressable onPress={restart} hitSlop={8} style={{ alignSelf: 'center' }}>
                <Text style={styles.link}>Reprendre la photo ou chercher autrement</Text>
              </Pressable>
            </>
          )}

          {/* Nobody found. */}
          {owner === undefined && candidates !== null && candidates.length === 0 && (
            <NoMatch searched={searched} name={name} setName={setName} searching={searching} onSearch={search} onOffice={() => setOwner(null)} onRestart={restart} />
          )}

          {/* 3. Confirm: whose it is, where it was found, how it goes back. */}
          {owner !== undefined && (
            <>
              <View style={{ paddingTop: 10 }}>
                <CardVisual type={cardType} holder={owner} badge={owner ? 'Propriétaire trouvé' : undefined} />
              </View>
              {owner ? (
                <View style={[styles.notice, { backgroundColor: colors.successBg }]}>
                  <Ionicons name="notifications-outline" size={18} color={colors.successText} />
                  <Text style={[styles.noticeText, { color: colors.successText }]}>
                    {owner.name} va recevoir une notification avec ton nom et ton numéro de téléphone pour récupérer {YOUR[cardType]}.
                  </Text>
                </View>
              ) : (
                <View style={[styles.notice, { backgroundColor: colors.warningBg }]}>
                  <Ionicons name="business-outline" size={18} color={colors.warningText} />
                  <Text style={[styles.noticeText, { color: colors.warningText }]}>
                    Son propriétaire n’est pas encore dans l’app : dépose la carte au {lostOffice.name.toLowerCase()} ({lostOffice.area}).
                  </Text>
                </View>
              )}
              <Pressable onPress={restart} hitSlop={8} style={{ alignSelf: 'center' }}>
                <Text style={styles.link}>Ce n’est pas la bonne personne</Text>
              </Pressable>

              <Text style={styles.section}>Où l’as-tu trouvée ?</Text>
              <PlacePicker value={where} onChange={setWhere} />
              <Field icon="navigate-outline" placeholder="Précise (facultatif) : 2e étage, près de la fenêtre…" value={spot} onChangeText={setSpot} maxLength={60} />

              {owner && (
                <>
                  <Text style={styles.section}>Comment la rendre ?</Text>
                  <Choice on={handOver === 'office'} icon="business-outline" title="Je la dépose au bureau des objets trouvés" detail="Recommandé : pas besoin de se rencontrer" onPress={() => setHandOver('office')} />
                  <Choice on={handOver === 'finder'} icon="hand-left-outline" title="Je la garde pour la remettre" detail="Le propriétaire t’appelle ou t’écrit dans l’app" onPress={() => setHandOver('finder')} />
                </>
              )}

              <PrimaryButton
                label={!where ? 'Indique où tu l’as trouvée' : owner ? `Prévenir ${owner.firstName}` : 'Déclarer la carte'}
                disabled={!where || sending}
                loading={sending}
                onPress={submit}
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** "Quelle carte ?": preset by the OCR, changeable by hand. */
function TypePicker({ value, onChange }: { value: CardType; onChange: (t: CardType) => void }) {
  return (
    <View style={styles.types}>
      {CARD_TYPES.map((t) => {
        const on = t.value === value;
        return (
          <Pressable key={t.value} onPress={() => onChange(t.value)} style={[styles.type, on && styles.typeOn]} accessibilityRole="radio" accessibilityState={{ checked: on }}>
            <Ionicons name={t.icon as keyof typeof Ionicons.glyphMap} size={18} color={on ? '#fff' : colors.primary} />
            <Text style={[styles.typeText, on && { color: '#fff' }]} numberOfLines={1}>
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Nobody with that name or number: try another spelling, or take the card to the office. */
function NoMatch({
  searched,
  name,
  setName,
  searching,
  onSearch,
  onOffice,
  onRestart,
}: {
  searched: string | null;
  name: string;
  setName: (v: string) => void;
  searching: boolean;
  onSearch: (q: string) => void;
  onOffice: () => void;
  onRestart: () => void;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyArt}>
        <View style={[styles.emptyRing, { width: 150, height: 150, borderRadius: 75 }]} />
        <View style={[styles.emptyRing, { width: 110, height: 110, borderRadius: 55, backgroundColor: colors.primarySoft }]} />
        <View style={styles.emptyIcon}>
          <Ionicons name="person-outline" size={34} color={colors.primary} />
          <View style={styles.emptyBadge}>
            <Ionicons name="search" size={14} color="#fff" />
          </View>
        </View>
      </View>
      <Text style={styles.emptyTitle}>Aucun propriétaire trouvé</Text>
      <Text style={styles.emptyText}>
        {searched ? `Personne ne correspond à « ${searched} » dans UGB Campus.` : 'Le nom n’a pas pu être lu sur la photo.'} Essaie une autre orthographe, juste le nom de famille, ou dépose la carte au bureau.
      </Text>
      <View style={{ alignSelf: 'stretch', gap: 10 }}>
        <Field icon="person-outline" placeholder="Ex. Ndiaye" autoCapitalize="words" value={name} onChangeText={setName} returnKeyType="search" onSubmitEditing={() => onSearch(name)} maxLength={60} />
        <PrimaryButton label="Chercher ce nom" disabled={name.trim().length < 2 || searching} loading={searching} onPress={() => onSearch(name)} />
        <OfficeOption title="Ou dépose-la au bureau" onPress={onOffice} />
      </View>
      <Pressable onPress={onRestart} hitSlop={8}>
        <Text style={styles.link}>Reprendre la photo</Text>
      </Pressable>
    </View>
  );
}

/** The way out when nobody matches: the card goes to the lost and found office. A clear button, the office below. */
function OfficeOption({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <View style={[styles.office, shadow.card]}>
      <View style={styles.officeHead}>
        <View style={styles.officeIcon}>
          <Ionicons name="help-circle-outline" size={20} color={colors.warningText} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.officeTitle}>{title}</Text>
          <Text style={styles.officeText}>Le bureau la garde jusqu’à ce que son propriétaire vienne la chercher.</Text>
        </View>
      </View>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.officeBtn, pressed && styles.officeBtnPressed]}
        accessibilityRole="button"
        accessibilityLabel={`Déposer la carte au ${lostOffice.name.toLowerCase()}`}>
        <Ionicons name="business" size={18} color="#fff" />
        <Text style={styles.officeBtnText}>Déposer au bureau des objets trouvés</Text>
      </Pressable>
      <View style={styles.officeMeta}>
        <Ionicons name="location-outline" size={13} color={colors.muted2} />
        <Text style={styles.officeMetaText}>{lostOffice.area}</Text>
        <Text style={styles.officeMetaText}>·</Text>
        <Ionicons name="time-outline" size={13} color={colors.muted2} />
        <Text style={styles.officeMetaText}>{lostOffice.hours}</Text>
      </View>
    </View>
  );
}

function Choice({ on, icon, title, detail, onPress }: { on: boolean; icon: keyof typeof Ionicons.glyphMap; title: string; detail: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.choice, on && styles.choiceOn]} accessibilityRole="radio" accessibilityState={{ checked: on }}>
      <Ionicons name={icon} size={20} color={colors.primary} />
      <View style={{ flex: 1 }}>
        <Text style={styles.choiceTitle}>{title}</Text>
        <Text style={styles.choiceDetail}>{detail}</Text>
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
  types: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  type: { width: '48.5%', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, minHeight: 44, borderRadius: radii.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  typeOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeText: { ...typo.smallStrong, color: colors.navy, flexShrink: 1 },
  camera: { height: 240, borderRadius: radii.lg, overflow: 'hidden', backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
  // Card-shaped target in the middle of the camera (ID-1 format).
  frame: { width: '86%', aspectRatio: 1.586, borderRadius: radii.md, borderWidth: 3, borderColor: '#fff' },
  reading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(10,16,40,0.6)', alignItems: 'center', justifyContent: 'center', gap: 8 },
  readingText: { ...typo.bodyStrong, color: '#fff' },
  permission: { alignItems: 'center', gap: 10, padding: 24 },
  permissionText: { ...typo.body, color: '#fff', textAlign: 'center' },
  permissionBtn: { backgroundColor: '#fff', paddingHorizontal: 16, minHeight: 38, borderRadius: radii.pill, justifyContent: 'center' },
  permissionBtnText: { color: colors.navy, fontWeight: '700' },
  hint: { ...typo.small, color: colors.muted2, textAlign: 'center', lineHeight: 18 },
  hintLeft: { ...typo.small, color: colors.muted2, lineHeight: 18, marginTop: -6 },
  link: { color: colors.primary, fontWeight: '700' },
  or: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 4 },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  orText: { ...typo.caption, color: colors.muted2 },
  detected: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: colors.primarySoft },
  detectedText: { ...typo.smallStrong, color: colors.primary },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: radii.md, padding: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { ...typo.smallStrong, color: colors.primary },
  personName: { ...typo.bodyStrong, color: colors.navy },
  personMeta: { ...typo.caption, color: colors.muted2, marginTop: 2 },
  office: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 14, gap: 12, marginTop: 6 },
  officeHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  officeIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.warningBg, alignItems: 'center', justifyContent: 'center' },
  officeTitle: { ...typo.bodyStrong, color: colors.navy },
  officeText: { ...typo.caption, color: colors.muted2, lineHeight: 17, marginTop: 1 },
  officeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 50, borderRadius: radii.pill, backgroundColor: colors.navy },
  officeBtnPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  officeBtnText: { ...typo.bodyStrong, color: '#fff' },
  officeMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, flexWrap: 'wrap' },
  officeMetaText: { ...typo.caption, color: colors.muted2 },
  notice: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: radii.md },
  noticeText: { ...typo.small, flex: 1, lineHeight: 19 },
  empty: { alignItems: 'center', gap: 14, paddingTop: 12 },
  emptyArt: { width: 160, height: 160, alignItems: 'center', justifyContent: 'center' },
  emptyRing: { position: 'absolute', backgroundColor: colors.primarySofter },
  emptyIcon: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', ...shadow.card },
  emptyBadge: { position: 'absolute', right: -4, bottom: -2, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.bg },
  emptyTitle: { ...typo.h3, color: colors.navy, textAlign: 'center' },
  emptyText: { ...typo.body, color: colors.muted2, textAlign: 'center', lineHeight: 21 },
  section: { ...typo.title, color: colors.navy, marginTop: 4 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: radii.md, padding: 14, borderWidth: 1.5, borderColor: 'transparent' },
  choiceOn: { borderColor: colors.primary },
  choiceTitle: { ...typo.bodyStrong, color: colors.navy },
  choiceDetail: { ...typo.caption, color: colors.muted2, marginTop: 2 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border },
});
