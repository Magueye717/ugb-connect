import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { eventWhen } from '@/components/home';
import { PaymentLogo } from '@/components/PaymentLogo';
import { BackButton, Field, LabeledField, PrimaryButton, StatusChip, TextButton } from '@/components/ui';
import { formatFcfa, paymentMethods } from '@/constants/data';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { CATEGORIES, EVENT_STATUS, eventsApi, EVERYONE, type EventAudience, type EventCategory, type EventInput, type OrgEventDto } from '@/features/events/api';
import { payInBrowser, type PaymentMethod } from '@/features/payments/checkout';
import { CAMPUSES, REGIONS, UFRS, VILLAGES, type CampusKey } from '@/features/register/validation';
import { ApiError } from '@/lib/api';
import { uploadImage } from '@/lib/upload';
import { useNow } from '@/lib/useNow';

const MAX_IMAGES = 8;
const DAYS = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];
const MONTHS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
/** Start times offered: every 30 minutes from 8h to 23h30. */
const TIMES = Array.from({ length: 32 }, (_, i) => `${String(8 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);
const DURATIONS = [1, 2, 3, 4, 5, 6, 8, 10, 12];
const ACTION: Record<OrgEventDto['reviewLog'][number]['action'], string> = {
  submitted: 'Envoyé pour validation',
  approved: 'Validé',
  changes_requested: 'Corrections demandées',
  rejected: 'Refusé',
};

type TicketRow = { name: string; price: string; capacity: string };
const dayKey = (d: Date) => d.toDateString();
const days = (now: number) =>
  Array.from({ length: 60 }, (_, i) => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + i);
    return d;
  });
/** The chosen day at the chosen "HH:MM". */
const startOf = (day: Date, time: string) => {
  const [h, m] = time.split(':').map(Number);
  const start = new Date(day);
  start.setHours(h!, m!, 0, 0);
  return start;
};
const METHOD: Record<string, PaymentMethod> = { wave: 'wave', om: 'orange_money' };
type Photo = { id: string; url: string };
const photosOf = (e: OrgEventDto): Photo[] => e.imageIds.map((imgId, i) => ({ id: imgId, url: e.images[i]! }));
/** "Toute l'université", or "Campus 1 · Village E · UFR SAT · Ziguinchor". */
const audienceLabel = (a: EventAudience) => {
  const parts = [
    a.campuses.map((c) => CAMPUSES.find((x) => x.key === c)?.label ?? c).join(', '),
    a.villages.join(', '),
    a.ufrs.length ? `UFR ${a.ufrs.join(', ')}` : '',
    a.regions.join(', '),
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Toute l’université';
};
const fail = (title: string) => (err: unknown) => Alert.alert(title, err instanceof ApiError ? err.message : 'Réessaie dans un instant.');

/**
 * A student's event: the form to create it or correct it (draft, corrections asked), then submitted to the UGB
 * Campus team. Once published, its state (tickets sold) and the history of the review.
 */
export default function MonEvenement() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'nouveau';
  const { reloadAccount } = useAuth();
  const [event, setEvent] = useState<OrgEventDto | null>(null);
  const [loading, setLoading] = useState(!isNew);

  // Reloaded each time the screen shows: opened again from a notification ("publié"), it must not keep the state it
  // had before the payment.
  useFocusEffect(
    useCallback(() => {
      if (isNew || !id) return;
      eventsApi.mineOne(id).then(setEvent, fail('Événement introuvable')).finally(() => setLoading(false));
    }, [id, isNew]),
  );

  const back = () => (router.canGoBack() ? router.back() : router.replace('/mes-evenements'));
  const editable = isNew || event?.status === 'draft' || event?.status === 'changes_requested';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.head}>
        <BackButton onPress={back} />
        <Text style={styles.h1}>{isNew ? 'Nouvel événement' : 'Mon événement'}</Text>
        <View style={{ width: 44 }} />
      </View>
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : event?.status === 'approved' ? (
        <PublishForm key={event.id} event={event} onChanged={setEvent} />
      ) : editable ? (
        <EventForm
          key={event?.id ?? 'new'}
          event={event}
          onSaved={(saved, submitted) => {
            // The first event creates the student's own organization: the organizer space appears.
            if (isNew) reloadAccount().catch(() => undefined);
            if (submitted) {
              Alert.alert('Envoyé pour validation', 'L’équipe UGB Campus vérifie ton événement. Une fois validé, tu choisis qui le voit et tu le publies. Tu reçois une notification dans tous les cas.');
              router.replace('/mes-evenements');
            } else if (isNew) router.replace(`/mes-evenements/${saved.id}`);
            else setEvent(saved);
          }}
        />
      ) : (
        event && <EventState event={event} onChanged={setEvent} />
      )}
    </SafeAreaView>
  );
}

/** Read-only once submitted: where it stands, what the team said, tickets sold. */
function EventState({ event: e, onChanged }: { event: OrgEventDto; onChanged: (e: OrgEventDto) => void }) {
  const s = EVENT_STATUS[e.status];
  const cancel = () =>
    Alert.alert('Annuler l’événement ?', e.counts.booked ? `Les ${e.counts.booked} billets vendus sont remboursés à 100 %.` : 'La billetterie est fermée.', [
      { text: 'Garder', style: 'cancel' },
      {
        text: 'Annuler l’événement',
        style: 'destructive',
        onPress: () => eventsApi.cancelMine(e.id, 'Annulé par l’organisateur').then(() => eventsApi.mineOne(e.id).then(onChanged), fail('Annulation impossible')),
      },
    ]);
  return (
    <ScrollView contentContainerStyle={styles.body}>
      <Image source={{ uri: e.images[0] }} style={styles.cover} contentFit="cover" />
      <StatusChip label={s.label} tone={s.tone} />
      <Text style={styles.title}>{e.title}</Text>
      <Text style={styles.muted}>{eventWhen(e.startsAt)} · {e.venue.name}</Text>
      {e.review && (e.status === 'rejected' || e.status === 'changes_requested') && (
        <View style={styles.reviewBox}>
          <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.dangerText} />
          <Text style={styles.reviewText}>{e.review.message}</Text>
        </View>
      )}
      {e.status === 'pending_review' && <Text style={styles.muted}>L’équipe UGB Campus vérifie ton événement. Tu seras notifié de sa décision.</Text>}
      {(e.status === 'published' || e.status === 'completed') && (
        <View style={[styles.card, shadow.card, { gap: 8 }]}>
          {e.ticketTypes.map((t) => (
            <View key={t.typeId} style={styles.row}>
              <Text style={[styles.label, { flex: 1 }]}>{t.name} · {t.price ? formatFcfa(t.price) : 'Gratuit'}</Text>
              <Text style={styles.muted}>
                {t.sold}/{t.capacity} vendus
              </Text>
            </View>
          ))}
          <Text style={styles.muted}>Visible par : {audienceLabel(e.audience)}.</Text>
          <Text style={styles.muted}>{e.counts.admitted} personne{e.counts.admitted > 1 ? 's' : ''} entrée{e.counts.admitted > 1 ? 's' : ''}. Scanne les billets depuis l’espace organisateur.</Text>
        </View>
      )}
      {e.status === 'published' && (
        <>
          <PrimaryButton label="Mettre en bannière sur l’accueil" onPress={() => router.push({ pathname: '/publicite', params: { eventId: e.id } })} />
          <TextButton label="Annuler l’événement" onPress={cancel} style={{ alignSelf: 'center' }} tone="danger" />
        </>
      )}
      {e.reviewLog.length > 0 && (
        <View style={{ gap: 6 }}>
          <Text style={styles.section}>Historique</Text>
          {e.reviewLog.map((r, i) => (
            <Text key={i} style={styles.muted}>
              {new Date(r.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} · {ACTION[r.action]}
              {r.message ? ` : ${r.message}` : ''}
            </Text>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

type PhotosProps = {
  images: Photo[];
  setImages: (f: (list: Photo[]) => Photo[]) => void;
  uploading: boolean;
  setUploading: (v: boolean) => void;
  fixedCover: boolean;
  setFixedCover: (v: boolean) => void;
};

/**
 * Up to 8 pictures, all shown on the event page (they slide). The banner shows one at random, unless the organizer
 * taps the star of one: it becomes the cover (moved first).
 */
function Photos({ images, setImages, uploading, setUploading, fixedCover, setFixedCover }: PhotosProps) {
  const makeCover = (img: Photo) => {
    setImages((list) => [img, ...list.filter((x) => x.id !== img.id)]);
    setFixedCover(true);
  };
  const pick = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: MAX_IMAGES - images.length, quality: 0.85 });
    if (res.canceled) return;
    setUploading(true);
    try {
      for (const asset of res.assets.slice(0, MAX_IMAGES - images.length)) {
        const up = await uploadImage(asset, 'event');
        setImages((list) => [...list, { id: up.id, url: up.url }]);
      }
    } catch (err) {
      fail('Image refusée')(err);
    } finally {
      setUploading(false);
    }
  };
  return (
    <>
      <Text style={styles.section}>Photos ({images.length}/{MAX_IMAGES})</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photos}>
        {images.map((img, i) => (
          <View key={img.id}>
            <Image source={{ uri: img.url }} style={styles.photo} contentFit="cover" />
            {i === 0 && fixedCover && (
              <View style={styles.coverTag}>
                <Text style={styles.coverTagText}>Couverture</Text>
              </View>
            )}
            {images.length > 1 && (
              <Pressable
                style={styles.star}
                onPress={() => (i === 0 && fixedCover ? setFixedCover(false) : makeCover(img))}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={i === 0 && fixedCover ? 'Ne plus fixer la couverture' : 'Choisir comme couverture'}>
                <Ionicons name={i === 0 && fixedCover ? 'star' : 'star-outline'} size={14} color={i === 0 && fixedCover ? '#FFD34E' : '#fff'} />
              </Pressable>
            )}
            <Pressable style={styles.remove} onPress={() => setImages((list) => list.filter((x) => x.id !== img.id))} hitSlop={6} accessibilityLabel="Retirer la photo">
              <Ionicons name="close" size={14} color="#fff" />
            </Pressable>
          </View>
        ))}
        {images.length < MAX_IMAGES && (
          <Pressable style={[styles.photo, styles.addPhoto]} onPress={pick} accessibilityRole="button" accessibilityLabel="Ajouter des photos">
            {uploading ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="add" size={26} color={colors.primary} />}
          </Pressable>
        )}
      </ScrollView>
      {images.length > 1 && (
        <Text style={styles.muted}>
          {fixedCover
            ? 'La photo étoilée est la couverture de ta bannière. Touche son étoile pour varier au hasard.'
            : 'Toutes les photos défilent sur la page de l’événement. Sur la bannière, une photo est tirée au hasard : touche l’étoile d’une photo pour en faire la couverture.'}
        </Text>
      )}
    </>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, on && styles.chipOn]} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
      <Text style={[styles.chipText, on && { color: colors.primary }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * Validated by the team: the owner chooses who sees the event on the home screen (campus, village, UFR, region),
 * the places to sell, may touch up the pictures and the text, and pays the publication (per place). The date, the
 * place and the prices stay as validated.
 */
function PublishForm({ event: e, onChanged }: { event: OrgEventDto; onChanged: (e: OrgEventDto) => void }) {
  const [images, setImages] = useState<Photo[]>(photosOf(e));
  const [uploading, setUploading] = useState(false);
  const [fixedCover, setFixedCover] = useState(e.fixedCover);
  const [description, setDescription] = useState(e.description);
  const [address, setAddress] = useState(e.venue.address ?? '');
  const [places, setPlaces] = useState<Record<string, string>>(Object.fromEntries(e.ticketTypes.map((t) => [t.typeId, String(t.capacity)])));
  const [maxPer, setMaxPer] = useState(e.maxPerStudent);
  const [audience, setAudience] = useState<EventAudience>(e.audience);
  const [targeted, setTargeted] = useState(audienceLabel(e.audience) !== audienceLabel(EVERYONE));
  const [method, setMethod] = useState(paymentMethods[0].id);
  const [paying, setPaying] = useState(false);

  const toggle = (key: keyof EventAudience, value: string) =>
    setAudience((a) => ({ ...a, [key]: a[key].includes(value) ? a[key].filter((x) => x !== value) : [...a[key], value] }));
  const pickCampus = (c: CampusKey) =>
    setAudience((a) => {
      const campuses = a.campuses.includes(c) ? a.campuses.filter((x) => x !== c) : [...a.campuses, c];
      // Villages stay those of the campuses still chosen.
      const allowed = campuses.length ? campuses.flatMap((k) => VILLAGES[k as CampusKey]) : null;
      return { ...a, campuses, villages: allowed ? a.villages.filter((v) => allowed.includes(v)) : a.villages };
    });
  const villages = audience.campuses.length ? audience.campuses.flatMap((c) => VILLAGES[c as CampusKey]) : [...VILLAGES.campus1, ...VILLAGES.campus2];
  const chosen = targeted ? audience : EVERYONE;
  const narrowed = audienceLabel(chosen) !== audienceLabel(EVERYONE);

  const counts = e.ticketTypes.map((t) => Number(places[t.typeId] || 0));
  const total = counts.reduce((n, c) => n + c, 0);
  const fee = Math.max(e.publicationFee.minimum, total * e.publicationFee.perPlace);
  const ready = images.length > 0 && counts.every((c) => c > 0) && (!targeted || narrowed) && !uploading && !paying;

  const publish = async () => {
    setPaying(true);
    try {
      const { payment } = await eventsApi.publishMine(e.id, {
        audience: chosen,
        places: e.ticketTypes.map((t, i) => ({ typeId: t.typeId, capacity: counts[i]! })),
        description: description.trim(),
        imageIds: images.map((i) => i.id),
        fixedCover,
        address: address.trim() || null,
        maxPerStudent: maxPer,
        method: METHOD[method] ?? 'wave',
      });
      const paid = await payInBrowser(payment);
      onChanged(await eventsApi.mineOne(e.id));
      Alert.alert(
        paid.status === 'succeeded' ? 'Événement publié' : 'Paiement en attente',
        paid.status === 'succeeded'
          ? `La billetterie est ouverte. Ton événement est sur l’accueil de : ${audienceLabel(chosen)}.`
          : 'Ton événement sera publié dès que le paiement est confirmé. Tu peux aussi relancer le paiement ici.',
      );
    } catch (err) {
      fail('Publication impossible')(err);
    } finally {
      setPaying(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <View style={styles.okBox}>
        <Ionicons name="checkmark-circle" size={20} color={colors.successText} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.okText, { fontWeight: '700' }]}>Validé par l’équipe UGB Campus</Text>
          <Text style={styles.okText}>Choisis qui voit ton événement, le nombre de places à vendre, puis publie-le.</Text>
        </View>
      </View>

      <View style={[styles.card, shadow.card, { gap: 4 }]}>
        <Text style={styles.title}>{e.title}</Text>
        <Text style={styles.muted}>{eventWhen(e.startsAt)} · {e.venue.name}</Text>
        <Text style={styles.muted}>La date, le lieu et les prix restent ceux validés.</Text>
      </View>

      <Photos images={images} setImages={setImages} uploading={uploading} setUploading={setUploading} fixedCover={fixedCover} setFixedCover={setFixedCover} />
      <LabeledField label="Description">
        <Field value={description} onChangeText={setDescription} maxLength={3000} multiline />
      </LabeledField>
      <LabeledField label="Précision sur le lieu (facultatif)">
        <Field placeholder="Campus 1, à côté du terrain" value={address} onChangeText={setAddress} maxLength={160} />
      </LabeledField>

      <Text style={styles.section}>Places à vendre</Text>
      {e.ticketTypes.map((t) => (
        <View key={t.typeId} style={styles.row}>
          <Text style={[styles.label, { flex: 1 }]}>
            {t.name} · {t.price ? formatFcfa(t.price) : 'Gratuit'}
          </Text>
          <View style={{ width: 110 }}>
            <Field keyboardType="number-pad" value={places[t.typeId]} onChangeText={(v) => setPlaces((p) => ({ ...p, [t.typeId]: v.replace(/\D/g, '') }))} />
          </View>
        </View>
      ))}
      <View style={styles.row}>
        <Text style={[styles.label, { flex: 1 }]}>Billets max par étudiant</Text>
        <Pressable onPress={() => setMaxPer(Math.max(1, maxPer - 1))} style={styles.step}>
          <Ionicons name="remove" size={16} color={colors.primary} />
        </Pressable>
        <Text style={styles.label}>{maxPer}</Text>
        <Pressable onPress={() => setMaxPer(Math.min(10, maxPer + 1))} style={styles.step}>
          <Ionicons name="add" size={16} color={colors.primary} />
        </Pressable>
      </View>

      <Text style={styles.section}>Qui voit ton événement ?</Text>
      <View style={styles.wrap}>
        <Chip label="Toute l’université" on={!targeted} onPress={() => setTargeted(false)} />
        <Chip label="Un public précis" on={targeted} onPress={() => setTargeted(true)} />
      </View>
      {targeted && (
        <View style={styles.audienceBox}>
          <Text style={styles.label}>Campus</Text>
          <View style={styles.wrap}>
            {CAMPUSES.map((c) => (
              <Chip key={c.key} label={c.label} on={audience.campuses.includes(c.key)} onPress={() => pickCampus(c.key)} />
            ))}
          </View>
          <Text style={styles.label}>Village</Text>
          <View style={styles.wrap}>
            {villages.map((v) => (
              <Chip key={v} label={v.replace('Village ', '')} on={audience.villages.includes(v)} onPress={() => toggle('villages', v)} />
            ))}
          </View>
          <Text style={styles.label}>UFR</Text>
          <View style={styles.wrap}>
            {UFRS.map((u) => (
              <Chip key={u.code} label={u.code} on={audience.ufrs.includes(u.code)} onPress={() => toggle('ufrs', u.code)} />
            ))}
          </View>
          <Text style={styles.label}>Région d’origine</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            {REGIONS.map((r) => (
              <Chip key={r} label={r} on={audience.regions.includes(r)} onPress={() => toggle('regions', r)} />
            ))}
          </ScrollView>
          <Text style={styles.muted}>
            {narrowed ? `Visible par : ${audienceLabel(chosen)}.` : 'Choisis au moins un campus, un village, un UFR ou une région.'} Chaque choix réduit : Village E + UFR SAT = les étudiants de SAT qui habitent le village E.
          </Text>
        </View>
      )}

      <View style={[styles.card, shadow.card, { gap: 6 }]}>
        <View style={styles.row}>
          <Text style={[styles.muted, { flex: 1 }]}>
            {total} place{total > 1 ? 's' : ''} × {formatFcfa(e.publicationFee.perPlace)}
          </Text>
          <Text style={styles.label}>{formatFcfa(fee)}</Text>
        </View>
        {total * e.publicationFee.perPlace < e.publicationFee.minimum && <Text style={styles.muted}>Minimum {formatFcfa(e.publicationFee.minimum)}.</Text>}
        <Text style={styles.muted}>L’argent des billets t’est versé après l’événement. La bannière sur l’accueil est une option à part.</Text>
      </View>

      {e.publication?.payment && <Text style={styles.warn}>Un paiement de {formatFcfa(e.publication.fee)} est en attente : payer à nouveau le remplace.</Text>}

      <Text style={styles.label}>Moyen de paiement</Text>
      {paymentMethods.map((m) => {
        const on = m.id === method;
        return (
          <Pressable key={m.id} onPress={() => setMethod(m.id)} style={[styles.option, on && styles.optionOn]}>
            <PaymentLogo method={m} />
            <Text style={[styles.label, { flex: 1 }]}>{m.name}</Text>
            {on && <Ionicons name="checkmark-circle" size={22} color={colors.primary} />}
          </Pressable>
        );
      })}
      <PrimaryButton label={`Payer ${formatFcfa(fee)} et publier`} disabled={!ready} loading={paying} onPress={publish} />
    </ScrollView>
  );
}

function EventForm({ event, onSaved }: { event: OrgEventDto | null; onSaved: (e: OrgEventDto, submitted: boolean) => void }) {
  const start0 = event ? new Date(event.startsAt) : null;
  const [title, setTitle] = useState(event?.title ?? '');
  const [category, setCategory] = useState<EventCategory>((event?.category as EventCategory) ?? 'soiree');
  const [description, setDescription] = useState(event?.description ?? '');
  const [images, setImages] = useState<Photo[]>(event ? photosOf(event) : []);
  const [uploading, setUploading] = useState(false);
  const [fixedCover, setFixedCover] = useState(event?.fixedCover ?? false);
  const [feeRule, setFeeRule] = useState(event?.publicationFee ?? null);
  const [venue, setVenue] = useState(event?.venue.name ?? '');
  const [address, setAddress] = useState(event?.venue.address ?? '');
  const [day, setDay] = useState<Date | null>(start0 ? new Date(start0.getFullYear(), start0.getMonth(), start0.getDate()) : null);
  const [time, setTime] = useState(start0 ? `${String(start0.getHours()).padStart(2, '0')}:${String(start0.getMinutes()).padStart(2, '0')}` : '20:00');
  const [hours, setHours] = useState(event ? Math.max(1, Math.round((Date.parse(event.endsAt) - Date.parse(event.startsAt)) / 3_600_000)) : 4);
  const [tickets, setTickets] = useState<TicketRow[]>(event ? event.ticketTypes.map((t) => ({ name: t.name, price: String(t.price), capacity: String(t.capacity) })) : [{ name: 'Entrée', price: '1000', capacity: '100' }]);
  const [maxPer, setMaxPer] = useState(event?.maxPerStudent ?? 4);
  const [saving, setSaving] = useState<'draft' | 'submit' | null>(null);
  const now = useNow();
  // Today only offers the start times still ahead.
  const times = day ? TIMES.filter((t) => startOf(day, t).getTime() > now) : TIMES;
  const inPast = !!day && startOf(day, time).getTime() <= now;

  const setTicket = (i: number, patch: Partial<TicketRow>) => setTickets((list) => list.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  // The price of the publication (paid once the event is approved), known from the start.
  useEffect(() => {
    if (!feeRule) eventsApi.publicationFee().then(setFeeRule, () => undefined);
  }, [feeRule]);
  const totalPlaces = tickets.reduce((n, t) => n + (Number(t.capacity) || 0), 0);
  const fee = feeRule ? Math.max(feeRule.minimum, totalPlaces * feeRule.perPlace) : null;

  const ticketsOk = tickets.length > 0 && tickets.every((t) => t.name.trim().length >= 2 && /^\d+$/.test(t.price) && /^\d+$/.test(t.capacity) && Number(t.capacity) > 0);
  const ready = title.trim().length >= 3 && images.length > 0 && venue.trim().length >= 2 && !!day && !inPast && ticketsOk && !uploading && !saving;

  const input = (): EventInput => {
    const start = startOf(day!, time);
    return {
      title: title.trim(),
      category,
      description: description.trim(),
      imageIds: images.map((i) => i.id),
      fixedCover,
      venue: { name: venue.trim(), address: address.trim() || null },
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + hours * 3_600_000).toISOString(),
      ticketTypes: tickets.map((t) => ({ name: t.name.trim(), description: null, price: Number(t.price), capacity: Number(t.capacity) })),
      maxPerStudent: maxPer,
    };
  };

  const save = async (submit: boolean) => {
    setSaving(submit ? 'submit' : 'draft');
    try {
      let saved = event ? await eventsApi.update(event.id, input()) : await eventsApi.create(input());
      if (submit) saved = await eventsApi.submit(saved.id);
      onSaved(saved, submit);
    } catch (err) {
      fail(submit ? 'Envoi impossible' : 'Enregistrement impossible')(err);
    } finally {
      setSaving(null);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      {event?.status === 'changes_requested' && event.review && (
        <View style={styles.reviewBox}>
          <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.dangerText} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.reviewText, { fontWeight: '700' }]}>Corrections demandées par l’équipe UGB Campus</Text>
            <Text style={styles.reviewText}>{event.review.message}</Text>
          </View>
        </View>
      )}

      <Photos images={images} setImages={setImages} uploading={uploading} setUploading={setUploading} fixedCover={fixedCover} setFixedCover={setFixedCover} />

      <LabeledField label="Titre">
        <Field placeholder="Soirée karaoké du Village E" value={title} onChangeText={setTitle} maxLength={80} />
      </LabeledField>
      <Text style={styles.label}>Type</Text>
      <View style={styles.wrap}>
        {CATEGORIES.map((c) => (
          <Pressable key={c.value} onPress={() => setCategory(c.value)} style={[styles.chip, category === c.value && styles.chipOn]}>
            <Ionicons name={c.icon as keyof typeof Ionicons.glyphMap} size={14} color={category === c.value ? colors.primary : colors.muted2} />
            <Text style={[styles.chipText, category === c.value && { color: colors.primary }]}>{c.label}</Text>
          </Pressable>
        ))}
      </View>
      <LabeledField label="Description">
        <Field placeholder="Programme, ambiance, ce qui est compris…" value={description} onChangeText={setDescription} maxLength={3000} multiline />
      </LabeledField>
      <LabeledField label="Lieu">
        <Field placeholder="Foyer du Village E" value={venue} onChangeText={setVenue} maxLength={80} />
      </LabeledField>
      <LabeledField label="Précision (facultatif)">
        <Field placeholder="Campus 1, à côté du terrain" value={address} onChangeText={setAddress} maxLength={160} />
      </LabeledField>

      <Text style={styles.label}>Jour</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
        {days(now).map((d) => {
          const on = !!day && dayKey(d) === dayKey(day);
          return (
            <Pressable key={d.toISOString()} onPress={() => setDay(d)} style={[styles.chip, on && styles.chipOn]}>
              <Text style={[styles.chipText, on && { color: colors.primary }]}>
                {DAYS[d.getDay()]} {d.getDate()} {MONTHS[d.getMonth()]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Text style={styles.label}>Heure de début</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
        {times.map((t) => (
          <Pressable key={t} onPress={() => setTime(t)} style={[styles.chip, time === t && styles.chipOn]}>
            <Text style={[styles.chipText, time === t && { color: colors.primary }]}>{t.replace(':', 'h')}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {inPast && <Text style={styles.warn}>{times.length ? 'Cette heure est passée : choisis une heure à venir.' : 'Plus d’horaire possible aujourd’hui : choisis un autre jour.'}</Text>}
      <Text style={styles.label}>Durée</Text>
      <View style={styles.wrap}>
        {DURATIONS.map((h) => (
          <Pressable key={h} onPress={() => setHours(h)} style={[styles.chip, hours === h && styles.chipOn]}>
            <Text style={[styles.chipText, hours === h && { color: colors.primary }]}>{h} h</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.section}>Billets</Text>
      {tickets.map((t, i) => (
        <View key={i} style={[styles.card, shadow.card, { gap: 8 }]}>
          <View style={styles.row}>
            <Text style={[styles.label, { flex: 1 }]}>Type {i + 1}</Text>
            {tickets.length > 1 && (
              <TextButton label="Retirer" tone="danger" icon="trash-outline" onPress={() => setTickets((list) => list.filter((_, j) => j !== i))} />
            )}
          </View>
          <Field placeholder="Standard, VIP…" value={t.name} onChangeText={(v) => setTicket(i, { name: v })} maxLength={40} />
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <LabeledField label="Prix (FCFA, 0 = gratuit)">
                <Field keyboardType="number-pad" value={t.price} onChangeText={(v) => setTicket(i, { price: v.replace(/\D/g, '') })} />
              </LabeledField>
            </View>
            <View style={{ flex: 1 }}>
              <LabeledField label="Places">
                <Field keyboardType="number-pad" value={t.capacity} onChangeText={(v) => setTicket(i, { capacity: v.replace(/\D/g, '') })} />
              </LabeledField>
            </View>
          </View>
        </View>
      ))}
      {tickets.length < 6 && (
        <TextButton label="Ajouter un type de billet" icon="add-circle-outline" onPress={() => setTickets((list) => [...list, { name: '', price: '0', capacity: '50' }])} />
      )}
      <View style={styles.row}>
        <Text style={[styles.label, { flex: 1 }]}>Billets max par étudiant</Text>
        <Pressable onPress={() => setMaxPer(Math.max(1, maxPer - 1))} style={styles.step}>
          <Ionicons name="remove" size={16} color={colors.primary} />
        </Pressable>
        <Text style={styles.label}>{maxPer}</Text>
        <Pressable onPress={() => setMaxPer(Math.min(10, maxPer + 1))} style={styles.step}>
          <Ionicons name="add" size={16} color={colors.primary} />
        </Pressable>
      </View>

      {feeRule && fee !== null && (
        <View style={[styles.card, shadow.card, styles.feeCard]}>
          <View style={styles.row}>
            <Ionicons name="pricetag-outline" size={18} color={colors.primary} />
            <Text style={[styles.label, { flex: 1 }]}>Prix de publication</Text>
            <Text style={styles.feeAmount}>{formatFcfa(fee)}</Text>
          </View>
          <Text style={styles.muted}>
            {totalPlaces} place{totalPlaces > 1 ? 's' : ''} × {formatFcfa(feeRule.perPlace)}
            {totalPlaces * feeRule.perPlace < feeRule.minimum ? ` (minimum ${formatFcfa(feeRule.minimum)})` : ''}. À payer seulement une fois l’événement validé ; tu pourras encore ajuster le nombre de places.
          </Text>
        </View>
      )}

      <Text style={styles.muted}>1. L’équipe UGB Campus vérifie ton événement. 2. Une fois validé, tu choisis qui le voit (campus, village, UFR, région) et tu paies la publication, selon le nombre de places. 3. La billetterie ouvre. L’argent des billets t’est versé après l’événement, sur ton numéro.</Text>
      <PrimaryButton label="Envoyer pour validation" disabled={!ready} loading={saving === 'submit'} onPress={() => save(true)} />
      <TextButton label={saving === 'draft' ? 'Enregistrement…' : 'Enregistrer le brouillon'} icon="save-outline" disabled={!ready} style={{ alignSelf: 'center' }} onPress={() => save(false)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 },
  h1: { ...typo.h3, color: colors.navy },
  body: { padding: 20, gap: 12, paddingBottom: 48 },
  section: { ...typo.section, color: colors.navy, marginTop: 6 },
  label: { ...typo.smallStrong, color: colors.navy },
  warn: { ...typo.small, color: colors.dangerText, marginTop: -4 },
  title: { ...typo.h2, color: colors.navy },
  muted: { ...typo.caption, color: colors.muted2, lineHeight: 17 },
  card: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 14 },
  cover: { width: '100%', height: 180, borderRadius: radii.lg, backgroundColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  feeCard: { gap: 6, borderWidth: 1.5, borderColor: colors.primarySoft },
  feeAmount: { ...typo.title, color: colors.primary },
  okBox: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: radii.md, backgroundColor: colors.successBg },
  okText: { ...typo.small, color: colors.successText, lineHeight: 19 },
  audienceBox: { gap: 8, padding: 12, borderRadius: radii.md, backgroundColor: colors.primarySofter },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radii.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card },
  optionOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  reviewBox: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: radii.md, backgroundColor: colors.dangerBg },
  reviewText: { ...typo.small, color: colors.dangerText, lineHeight: 19 },
  photos: { flexDirection: 'row', gap: 10 },
  photo: { width: 110, height: 80, borderRadius: radii.md, backgroundColor: colors.border },
  addPhoto: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.primary, backgroundColor: colors.primarySoft },
  star: { position: 'absolute', top: 4, left: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(10,16,40,0.7)', alignItems: 'center', justifyContent: 'center' },
  coverTag: { position: 'absolute', left: 6, bottom: 6, backgroundColor: 'rgba(10,16,40,0.7)', borderRadius: radii.pill, paddingHorizontal: 6, paddingVertical: 2 },
  coverTagText: { ...typo.label, color: '#fff' },
  remove: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(10,16,40,0.7)', alignItems: 'center', justifyContent: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chipsRow: { flexDirection: 'row', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: radii.pill, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card },
  chipOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipText: { ...typo.smallStrong, color: colors.muted2 },
  step: { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
