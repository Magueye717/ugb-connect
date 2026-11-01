import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { eventWhen, openCta } from '@/components/home';
import { PaymentLogo } from '@/components/PaymentLogo';
import { BackButton, Field, LabeledField, PrimaryButton, Segmented } from '@/components/ui';
import { formatFcfa, paymentMethods } from '@/constants/data';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { bannersApi, type BannerPackageDto, type CtaTarget } from '@/features/banners/api';
import { eventsApi, type OrgEventDto } from '@/features/events/api';
import { payInBrowser, type PaymentMethod } from '@/features/payments/checkout';
import { ApiError } from '@/lib/api';
import { uploadImage } from '@/lib/upload';

const METHOD: Record<string, PaymentMethod> = { wave: 'wave', om: 'orange_money' };
const TARGETS: { value: Exclude<CtaTarget, 'app'>; label: string; placeholder: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'url', label: 'Site web', placeholder: 'https://…', icon: 'globe-outline' },
  { value: 'whatsapp', label: 'WhatsApp', placeholder: '77 123 45 67', icon: 'logo-whatsapp' },
  { value: 'phone', label: 'Appel', placeholder: '77 123 45 67', icon: 'call-outline' },
];
const DAYS = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** From today to four weeks ahead. */
const startDays = () =>
  Array.from({ length: 29 }, (_, i) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + i);
    return d;
  });

type Kind = 'ad' | 'event';
const DAY_MS = 86_400_000;
/** The server counts days from midnight in Dakar (UTC all year). */
const dayStart = (key: string) => Date.parse(`${key}T00:00:00Z`);

/**
 * A new paid banner: an ad (picture, short title and text, optional button), or — for an organization's owner or
 * manager — one of its published events. Paid with the chosen package, then checked by the UGB Campus team.
 */
export default function NouvellePublicite() {
  const { organizer } = useAuth();
  // Opened from a student's own event ("Mettre en bannière"): that event, preselected.
  const { eventId: fromEvent } = useLocalSearchParams<{ eventId?: string }>();
  const isManager = !!organizer?.roles.some((r) => r === 'owner' || r === 'manager');
  const canPromote = isManager || !!fromEvent;
  const [kind, setKind] = useState<Kind>(fromEvent ? 'event' : 'ad');
  const [packages, setPackages] = useState<BannerPackageDto[] | null>(null);
  const [events, setEvents] = useState<OrgEventDto[]>([]);
  // Events already on the carousel (or about to be): eventId → last day. A new banner once it has ended.
  const [promoted, setPromoted] = useState<Record<string, string>>({});
  const [eventId, setEventId] = useState<string | null>(fromEvent ?? null);
  const [image, setImage] = useState<{ id: string; url: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [withCta, setWithCta] = useState(false);
  const [ctaLabel, setCtaLabel] = useState('Voir');
  const [ctaTarget, setCtaTarget] = useState<Exclude<CtaTarget, 'app'>>('url');
  const [ctaValue, setCtaValue] = useState('');
  const [pkg, setPkg] = useState<string | null>(null);
  const [startsOn, setStartsOn] = useState<string>(ymd(startDays()[0]!));
  const [method, setMethod] = useState(paymentMethods[0].id);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    bannersApi.packages().then((r) => setPackages(r.items), () => setPackages([]));
    // Only published events still to come can be promoted.
    const promotable = (e: OrgEventDto) => e.status === 'published' && Date.parse(e.endsAt) > Date.now();
    const add = (list: OrgEventDto[]) => setEvents((cur) => [...cur, ...list.filter((e) => promotable(e) && !cur.some((x) => x.id === e.id))]);
    if (isManager && organizer) eventsApi.ofOrg(organizer.orgId).then((r) => add(r.items), () => undefined);
    if (fromEvent) eventsApi.mineOne(fromEvent).then((e) => add([e]), () => undefined);
    bannersApi.mine().then(
      (r) =>
        setPromoted(
          Object.fromEntries(
            r.items
              .filter((b) => b.eventId && (b.status === 'approved' || b.status === 'pending_review' || (b.status === 'pending_payment' && !!b.payment)) && Date.parse(b.endsAt) > Date.now())
              .map((b) => [b.eventId!, b.endsAt]),
          ),
        ),
      () => undefined,
    );
  }, [isManager, organizer, fromEvent]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/mes-publicites'));
  const event = events.find((e) => e.id === eventId && !promoted[e.id]) ?? null;
  const until = (iso: string) => new Date(Date.parse(iso) - 1).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  // An event's banner can't run more than a day past the event: longer packages are greyed out.
  const fits = (days: number) => kind !== 'event' || !event || dayStart(startsOn) + days * DAY_MS <= Date.parse(event.endsAt) + DAY_MS;
  const best = packages?.filter((p) => fits(p.days)).sort((a, b) => b.days - a.days)[0] ?? null;
  const picked = packages?.find((p) => p.code === pkg) ?? null;
  const chosen = picked && fits(picked.days) ? picked : null;
  const eventEnd = event ? new Date(event.endsAt).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) : '';

  const pick = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [16, 9], quality: 0.85 });
    if (res.canceled || !res.assets[0]) return;
    setUploading(true);
    try {
      const up = await uploadImage(res.assets[0], 'banner');
      setImage({ id: up.id, url: up.url });
    } catch (err) {
      Alert.alert('Image refusée', err instanceof ApiError ? err.message : 'Réessaie avec une autre image.');
    } finally {
      setUploading(false);
    }
  };

  const ready =
    !!chosen &&
    !paying &&
    !uploading &&
    (kind === 'event' ? !!event : !!image && title.trim().length >= 3 && (!withCta || (ctaLabel.trim().length >= 2 && ctaValue.trim().length > 3)));

  const submit = async () => {
    if (!chosen) return;
    setPaying(true);
    try {
      const { payment } = await bannersApi.create({
        kind,
        ...(kind === 'event' && event ? { orgId: event.organizer.id, eventId: event.id } : {}),
        ...(title.trim() ? { title: title.trim() } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(image ? { imageId: image.id } : {}),
        cta: kind === 'ad' && withCta ? { label: ctaLabel.trim(), target: ctaTarget, value: ctaValue.trim() } : null,
        packageCode: chosen.code,
        startsOn,
        method: METHOD[method] ?? 'wave',
      });
      const paid = await payInBrowser(payment);
      router.replace('/mes-publicites');
      const done = paid.status === 'succeeded';
      Alert.alert(
        done ? (kind === 'event' ? 'Bannière en ligne' : 'Bannière envoyée') : 'Paiement en attente',
        done
          ? kind === 'event'
            ? 'Ton événement s’affiche sur l’accueil à partir du premier jour choisi.'
            : 'L’équipe UGB Campus la vérifie. Tu reçois une notification dès qu’elle est validée.'
          : 'Termine le paiement depuis « Mes publicités » : la place est gardée 15 minutes.',
      );
    } catch (err) {
      Alert.alert('Impossible de créer la bannière', err instanceof ApiError ? err.message : 'Réessaie dans un instant.');
    } finally {
      setPaying(false);
    }
  };

  // What students will see on the home screen.
  const previewImage = image?.url ?? (kind === 'event' ? event?.images[0] : undefined);
  const previewTitle = title.trim() || (kind === 'event' ? (event?.title ?? 'Ton événement') : 'Ton titre');
  const previewText = kind === 'event' ? (event ? `${eventWhen(event.startsAt)} · ${event.minPrice ? `Dès ${formatFcfa(event.minPrice)}` : 'Gratuit'}` : 'Date · prix') : description.trim() || 'Ta description courte';
  const previewAction = kind === 'event' ? 'Voir l’événement' : withCta ? ctaLabel.trim() || 'Voir' : null;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.head}>
        <BackButton onPress={back} />
        <Text style={styles.h1}>Nouvelle bannière</Text>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {canPromote && (
          <Segmented
            options={[
              { value: 'ad', label: 'Publicité' },
              { value: 'event', label: 'Événement' },
            ]}
            value={kind}
            onChange={setKind}
          />
        )}

        <View style={[styles.preview, shadow.card]}>
          {previewImage ? <Image source={{ uri: previewImage }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.navy }]} />}
          <LinearGradient colors={['rgba(10,16,40,0.05)', 'rgba(10,16,40,0.78)']} style={StyleSheet.absoluteFill} />
          <View style={styles.tag}>
            <Text style={styles.tagText}>{kind === 'event' ? 'ÉVÉNEMENT' : 'SPONSORISÉ'}</Text>
          </View>
          <View style={{ paddingRight: previewAction ? 110 : 0 }}>
            <Text style={styles.previewTitle} numberOfLines={2}>
              {previewTitle}
            </Text>
            <Text style={styles.previewText} numberOfLines={1}>
              {previewText}
            </Text>
          </View>
          {previewAction && (
            <Pressable
              style={styles.previewBtn}
              onPress={() => {
                // Try it: the event page, or the ad's link / WhatsApp / call.
                if (kind === 'event') {
                  if (event) router.push({ pathname: '/evenement/[id]', params: { id: event.id } });
                  else Alert.alert('Choisis ton événement', 'Le bouton ouvrira la page de l’événement choisi.');
                } else if (ctaValue.trim().length > 3) openCta({ target: ctaTarget, value: ctaValue.trim() });
                else Alert.alert('Complète le bouton', ctaTarget === 'url' ? 'Ajoute le lien à ouvrir.' : 'Ajoute le numéro.');
              }}
              accessibilityRole="button">
              <Text style={styles.previewBtnText} numberOfLines={1}>
                {previewAction}
              </Text>
            </Pressable>
          )}
        </View>
        <Text style={styles.hint}>Aperçu : ce que les étudiants verront sur l’accueil.</Text>

        {kind === 'event' ? (
          <View style={{ gap: 10 }}>
            <Text style={styles.label}>Ton événement</Text>
            {events.length === 0 && <Text style={styles.hint}>Aucun événement publié à venir. Crée et publie d’abord ton événement depuis « Mes événements ».</Text>}
            {events.map((e) => {
              const busy = promoted[e.id];
              const on = !busy && e.id === eventId;
              return (
                <Pressable
                  key={e.id}
                  onPress={() => setEventId(e.id)}
                  disabled={!!busy}
                  style={[styles.option, on && styles.optionOn, !!busy && { opacity: 0.5 }]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on, disabled: !!busy }}>
                  <Image source={{ uri: e.images[0] }} style={styles.eventThumb} contentFit="cover" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.optionTitle}>{e.title}</Text>
                    <Text style={styles.hint}>{busy ? `Déjà en bannière jusqu’au ${until(busy)}` : `${eventWhen(e.startsAt)} · ${e.venue.name}`}</Text>
                  </View>
                  {on && <Ionicons name="checkmark-circle" size={22} color={colors.primary} />}
                </Pressable>
              );
            })}
            <LabeledField label="Titre (facultatif)">
              <Field placeholder={event?.title ?? 'Le titre de l’événement'} value={title} onChangeText={setTitle} maxLength={40} />
            </LabeledField>
            <Pressable onPress={pick} style={styles.option}>
              <Ionicons name="image-outline" size={20} color={colors.primary} />
              <Text style={[styles.optionTitle, { flex: 1 }]}>{image ? 'Image choisie' : 'Autre image que la couverture (facultatif)'}</Text>
              {uploading && <ActivityIndicator color={colors.primary} />}
            </Pressable>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            <Pressable onPress={pick} style={[styles.option, !image && styles.optionDashed]} accessibilityRole="button">
              <Ionicons name="image-outline" size={20} color={colors.primary} />
              <Text style={[styles.optionTitle, { flex: 1 }]}>{image ? 'Changer l’image' : 'Choisir une image (format paysage)'}</Text>
              {uploading && <ActivityIndicator color={colors.primary} />}
            </Pressable>
            <LabeledField label="Titre court">
              <Field placeholder="-20 % sur tes forfaits" value={title} onChangeText={setTitle} maxLength={40} />
            </LabeledField>
            <LabeledField label="Description courte">
              <Field placeholder="Offre valable jusqu’au 30 nov." value={description} onChangeText={setDescription} maxLength={90} />
            </LabeledField>
            <Pressable onPress={() => setWithCta(!withCta)} style={styles.option} accessibilityRole="switch" accessibilityState={{ checked: withCta }}>
              <Ionicons name={withCta ? 'checkbox' : 'square-outline'} size={20} color={colors.primary} />
              <Text style={[styles.optionTitle, { flex: 1 }]}>Ajouter un bouton (site, WhatsApp, appel)</Text>
            </Pressable>
            {withCta && (
              <>
                <View style={styles.wrap}>
                  {TARGETS.map((t) => (
                    <Pressable key={t.value} onPress={() => setCtaTarget(t.value)} style={[styles.chip, ctaTarget === t.value && styles.chipOn]}>
                      <Ionicons name={t.icon} size={14} color={ctaTarget === t.value ? colors.primary : colors.muted2} />
                      <Text style={[styles.chipText, ctaTarget === t.value && { color: colors.primary }]}>{t.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <LabeledField label="Texte du bouton">
                  <Field placeholder="J’en profite" value={ctaLabel} onChangeText={setCtaLabel} maxLength={16} />
                </LabeledField>
                <LabeledField label={ctaTarget === 'url' ? 'Lien' : 'Numéro'}>
                  <Field
                    placeholder={TARGETS.find((t) => t.value === ctaTarget)!.placeholder}
                    value={ctaValue}
                    onChangeText={setCtaValue}
                    autoCapitalize="none"
                    keyboardType={ctaTarget === 'url' ? 'url' : 'phone-pad'}
                  />
                </LabeledField>
              </>
            )}
          </View>
        )}

        <Text style={styles.label}>Formule</Text>
        {!packages && <ActivityIndicator color={colors.primary} />}
        {packages?.map((p) => {
          const ok = fits(p.days);
          const on = ok && p.code === pkg;
          return (
            <Pressable
              key={p.code}
              onPress={() => setPkg(p.code)}
              disabled={!ok}
              style={[styles.option, on && styles.optionOn, !ok && { opacity: 0.45 }]}
              accessibilityRole="radio"
              accessibilityState={{ checked: on, disabled: !ok }}>
              <View style={{ flex: 1 }}>
                <View style={styles.wrap}>
                  <Text style={styles.optionTitle}>{p.name}</Text>
                  {kind === 'event' && event && best?.code === p.code && (
                    <View style={styles.bestTag}>
                      <Text style={styles.bestTagText}>Conseillée</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.hint}>
                  {ok ? `${p.days} jour${p.days > 1 ? 's' : ''} sur l’accueil` : `Trop long : ton événement finit le ${eventEnd}`}
                </Text>
              </View>
              <Text style={styles.price}>{formatFcfa(p.price)}</Text>
            </Pressable>
          );
        })}
        {kind === 'event' && event && !best && packages && packages.length > 0 && (
          <Text style={[styles.hint, { color: colors.dangerText }]}>Ton événement est trop proche de ce premier jour : choisis un jour plus tôt.</Text>
        )}

        <Text style={styles.label}>Premier jour</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {startDays()
            .filter((d) => kind !== 'event' || !event || dayStart(ymd(d)) < Date.parse(event.endsAt))
            .map((d) => {
            const key = ymd(d);
            const on = key === startsOn;
            return (
              <Pressable key={key} onPress={() => setStartsOn(key)} style={[styles.chip, on && styles.chipOn]}>
                <Text style={[styles.chipText, on && { color: colors.primary }]}>
                  {key === ymd(new Date()) ? 'Aujourd’hui' : `${DAYS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Text style={styles.hint}>
          {kind === 'event'
            ? 'Ton événement a déjà été validé : sa bannière s’affiche dès le paiement (à partir du premier jour choisi).'
            : 'L’équipe UGB Campus vérifie chaque bannière avant sa diffusion (le jour même si tu choisis aujourd’hui). Refusée, elle est remboursée.'}
        </Text>

        <Text style={styles.label}>Moyen de paiement</Text>
        {paymentMethods.map((m) => {
          const on = m.id === method;
          return (
            <Pressable key={m.id} onPress={() => setMethod(m.id)} style={[styles.option, on && styles.optionOn]}>
              <PaymentLogo method={m} />
              <Text style={[styles.optionTitle, { flex: 1 }]}>{m.name}</Text>
              {on && <Ionicons name="checkmark-circle" size={22} color={colors.primary} />}
            </Pressable>
          );
        })}

        <PrimaryButton label={chosen ? `Payer ${formatFcfa(chosen.price)}` : picked ? 'Choisis une formule plus courte' : 'Choisis une formule'} disabled={!ready} loading={paying} onPress={submit} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 },
  h1: { ...typo.h3, color: colors.navy },
  body: { padding: 20, gap: 12, paddingBottom: 40 },
  bestTag: { backgroundColor: colors.successBg, borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 2 },
  bestTagText: { ...typo.label, color: colors.successText },
  preview: { height: 172, borderRadius: radii.lg, padding: 16, justifyContent: 'space-between', overflow: 'hidden' },
  tag: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.24)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill },
  tagText: { ...typo.label, color: '#fff', letterSpacing: 0.3 },
  previewTitle: { ...typo.h3, color: '#fff', lineHeight: 23 },
  previewText: { ...typo.caption, color: 'rgba(255,255,255,0.92)', marginTop: 4 },
  previewBtn: { position: 'absolute', right: 14, bottom: 16, maxWidth: 140, backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.pill },
  previewBtnText: { ...typo.captionStrong, color: colors.navy },
  hint: { ...typo.caption, color: colors.muted2, lineHeight: 17 },
  label: { ...typo.title, color: colors.navy, marginTop: 6 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: radii.md, padding: 12, borderWidth: 1.5, borderColor: 'transparent' },
  optionOn: { borderColor: colors.primary },
  optionDashed: { borderColor: colors.border, borderStyle: 'dashed' },
  optionTitle: { ...typo.bodyStrong, color: colors.navy },
  eventThumb: { width: 54, height: 54, borderRadius: radii.sm, backgroundColor: colors.border },
  price: { ...typo.title, color: colors.primary },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chipsRow: { flexDirection: 'row', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: radii.pill, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card },
  chipOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipText: { ...typo.smallStrong, color: colors.muted2 },
});
