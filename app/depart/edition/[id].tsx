import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DateField, StopTimeField } from '@/components/DatePicker';
import { EmptyState } from '@/components/states';
import { BackButton, Field, LabeledField, PrimaryButton, Segmented, StickyFooter, TextButton, useDirty } from '@/components/ui';
import { formatFcfa } from '@/constants/data';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { isOwner, useAuth } from '@/context/AuthContext';
import { caravansApi, dayLabel, type DepartureInput, type DepartureLimits, type OrgDepartureDto, type VehicleDto, type VehicleModelDto } from '@/features/caravans/api';
import { planOf, SeatPlan } from '@/features/caravans/SeatPlan';
import { VehicleSheet } from '@/features/caravans/VehicleSheet';
import { ApiError } from '@/lib/api';
import { useLeaveGuard } from '@/lib/leaveGuard';
import { notice } from '@/lib/notice';
import { toast } from '@/lib/toast';
import { useNow } from '@/lib/useNow';

type Direction = 'aller' | 'retour';
type StopRow = { place: string; time: string };
const MAX_STOPS = 15;
const DAY = 86_400_000;
/** The campus side of a trip: prefilled, editable. */
const CAMPUS = 'UGB';

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
/** Minutes after midnight, or null. */
const minutesOf = (t: string) => {
  const m = /^(\d{2}):(\d{2})$/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
};
const midnight = (at: number) => {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d;
};
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
/** A departure is planned up to two months ahead. */
const DAYS_AHEAD = 60;

/** A stop earlier than the one before is the next day only on a night trip: at most 12 h later (22h → 2h). */
const OVERNIGHT_MAX = 12 * 60;
const hLabel = (m: number) => `${pad(Math.floor((m % 1440) / 60))}h${pad(m % 60)}`;

/**
 * The stops, in route order, as dates: the first on the chosen day, each next one later. A time earlier than the stop
 * before is the next morning only on a night trip (22h → 2h); otherwise it's out of order (12h then 11h) and flagged
 * on that row. `plan` is null while a time is missing or out of order.
 */
function schedule(day: Date | null, rows: StopRow[], names: string[], now: number) {
  let offset = 0;
  // Today, a first time already gone but coming tonight (21h now, 02h chosen): that night, the day after (within 12 h).
  const first = minutesOf(rows[0]?.time ?? '');
  if (day && first !== null && sameDay(day, new Date(now))) {
    const at = new Date(day);
    at.setMinutes(first);
    if (at.getTime() <= now && at.getTime() + DAY - now <= OVERNIGHT_MAX * 60_000) offset = 1;
  }
  let prev: { abs: number; name: string } | null = null;
  const errors: (string | null)[] = rows.map(() => null);
  const out: { at: Date; nextDay: boolean }[] = [];
  let complete = !!day;
  rows.forEach((r, i) => {
    const m = minutesOf(r.time);
    if (m === null) {
      complete = false;
      return;
    }
    let abs = offset * 1440 + m;
    if (prev && abs < prev.abs) {
      if (abs + 1440 - prev.abs <= OVERNIGHT_MAX) {
        offset += 1;
        abs += 1440;
      } else {
        errors[i] = `Pas avant ${hLabel(prev.abs)} (${prev.name})`;
        complete = false;
        return;
      }
    }
    prev = { abs, name: names[i]! };
    if (day) {
      const at = new Date(day);
      at.setMinutes(abs);
      out[i] = { at, nextDay: offset > 0 };
    }
  });
  return { plan: complete && out.length === rows.length ? out : null, partial: out, errors };
}

/** As the server sets them: sales open until the departure; the minimum checked 24 h before (or at the departure). */
function deadlinesOf(departureAt: Date, now: number) {
  const bookingClosesAt = departureAt.getTime();
  const dayBefore = departureAt.getTime() - DAY;
  return { bookingClosesAt, confirmBy: dayBefore > now ? dayBefore : bookingClosesAt };
}

/** What a past or draft departure fills in (the day stays to choose when copying). */
const fromDeparture = (d: OrgDepartureDto) => ({
  direction: d.direction,
  from: d.from,
  to: d.to,
  pickups: d.pickups.map((s) => ({ place: s.place, time: hhmm(s.at) })),
  dropoffs: d.dropoffs.map((s) => ({ place: s.place, time: hhmm(s.at) })),
  vehicleId: d.vehicleId,
  price: String(d.price),
  maxSeats: d.maxSeatsPerStudent,
  minPassengers: String(d.minPassengers),
});

/**
 * The way back of a trip: its stops in reverse (the last arrêt becomes the first montée…), each the same time apart,
 * leaving at the same hour as the original.
 */
const reversedDeparture = (d: OrgDepartureDto) => {
  const x = fromDeparture(d);
  const route = [...d.pickups, ...d.dropoffs].map((st) => ({ place: st.place, at: Date.parse(st.at) }));
  const start = route[0]!.at;
  const end = route[route.length - 1]!.at;
  const back = [...route].reverse().map((st) => ({ place: st.place, time: hhmm(new Date(start + (end - st.at)).toISOString()) }));
  return {
    ...x,
    direction: (d.direction === 'aller' ? 'retour' : 'aller') as Direction,
    from: d.to,
    to: d.from,
    pickups: back.slice(0, d.dropoffs.length),
    dropoffs: back.slice(d.dropoffs.length),
  };
};

const fail = (title: string) => (err: unknown) => Alert.alert(title, err instanceof ApiError ? err.message : 'Réessaie dans un instant.');

/**
 * Creating a caravan departure (or correcting a draft), for the owner and managers of the organization: the route and
 * its stops, the day, the bus, the price, the minimum to confirm it, how students pay. A draft sells nothing; once
 * published it's on every student's Caravanes tab and can only be cancelled (everyone refunded).
 */
export default function DepartureEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'nouveau';
  const { organizer } = useAuth();
  const orgId = organizer?.orgId;
  const canEdit = !!organizer?.roles.some((r) => r === 'owner' || r === 'manager');
  const [draft, setDraft] = useState<OrgDepartureDto | null>(null);
  const [vehicles, setVehicles] = useState<VehicleDto[] | null>(null);
  const [models, setModels] = useState<VehicleModelDto[]>([]);
  const [limits, setLimits] = useState<DepartureLimits | null>(null);
  const [past, setPast] = useState<OrgDepartureDto[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId || !canEdit) return;
    const load = async () => {
      const [v, d, upcoming, done] = await Promise.all([
        caravansApi.vehicles(orgId),
        isNew ? Promise.resolve(null) : caravansApi.orgDeparture(orgId, id!),
        // To copy a trip already run: the same route comes back every week.
        isNew ? caravansApi.orgDepartures(orgId, 'upcoming') : Promise.resolve({ items: [] }),
        isNew ? caravansApi.orgDepartures(orgId, 'past') : Promise.resolve({ items: [] }),
      ]);
      setVehicles(v.items);
      setModels(v.models ?? []);
      setLimits(v.limits);
      setDraft(d);
      const seen = new Set<string>();
      setPast(
        [...upcoming.items, ...done.items]
          .sort((a, b) => Date.parse(b.departureAt) - Date.parse(a.departureAt))
          .filter((x) => {
            const key = `${x.direction}|${x.from}|${x.to}|${x.pickups.map((s) => s.place).join(',')}|${x.dropoffs.map((s) => s.place).join(',')}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .slice(0, 6),
      );
    };
    load().catch((err) => setError(err instanceof ApiError ? err.message : 'Connexion impossible.'));
  }, [orgId, canEdit, id, isNew]);

  const now = useNow();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/activites'));
  const ready = vehicles && limits && (isNew || draft);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.head}>
        <BackButton onPress={back} />
        <Text style={styles.h1}>{isNew ? 'Nouveau départ' : draft && draft.status !== 'draft' ? 'Modifier le départ' : 'Brouillon'}</Text>
        <View style={{ width: 44 }} />
      </View>
      {!canEdit ? (
        <EmptyState icon="lock-closed-outline" title="Réservé aux responsables" text="Le responsable ou un gestionnaire de l’organisation crée les départs." />
      ) : error ? (
        <EmptyState icon="cloud-offline-outline" title="Chargement impossible" text={error} action={{ label: 'Retour', onPress: back }} />
      ) : !ready || !orgId ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : draft && (draft.status === 'published' || draft.status === 'confirmed') && Date.parse(draft.departureAt) > now ? (
        <ExtendForm orgId={orgId} departure={draft} vehicles={vehicles} />
      ) : draft && draft.status !== 'draft' ? (
        <EmptyState
          icon="bus-outline"
          title="Départ verrouillé"
          text="Ce départ est parti, terminé ou annulé : il ne se modifie plus."
          action={{ label: 'Voir les passagers', onPress: () => router.replace(`/depart/${draft.id}`) }}
        />
      ) : (
        <DepartureForm
          orgId={orgId}
          owner={isOwner(organizer?.roles)}
          draft={draft}
          past={past}
          vehicles={vehicles}
          models={models}
          setVehicles={(f) => setVehicles((list) => f(list ?? []))}
          limits={limits}
        />
      )}
    </SafeAreaView>
  );
}

type FormProps = {
  orgId: string;
  owner: boolean;
  draft: OrgDepartureDto | null;
  past: OrgDepartureDto[];
  vehicles: VehicleDto[];
  /** The catalog (buses, Cheikhou Cherif minibuses): picked here, it becomes the organization's vehicle at saving. */
  models: VehicleModelDto[];
  setVehicles: (f: (list: VehicleDto[]) => VehicleDto[]) => void;
  limits: DepartureLimits;
};

/** A catalog model picked but not yet the organization's vehicle: `model:bus-53`. */
const MODEL = 'model:';

function DepartureForm({ orgId, owner, draft, past, vehicles, models, setVehicles, limits }: FormProps) {
  const init = draft ? fromDeparture(draft) : null;
  const [direction, setDirection] = useState<Direction>(init?.direction ?? 'aller');
  const [from, setFrom] = useState(init?.from ?? CAMPUS);
  const [to, setTo] = useState(init?.to ?? '');
  const [day, setDay] = useState<Date | null>(draft ? midnight(Date.parse(draft.departureAt)) : null);
  const [pickups, setPickups] = useState<StopRow[]>(init?.pickups ?? [{ place: '', time: '' }]);
  const [dropoffs, setDropoffs] = useState<StopRow[]>(init?.dropoffs ?? [{ place: '', time: '' }]);
  const [vehicleId, setVehicleId] = useState<string | null>(init?.vehicleId ?? (vehicles.length === 1 ? vehicles[0]!.id : null));
  const [price, setPrice] = useState(init?.price ?? '');
  const [maxSeats, setMaxSeats] = useState(init?.maxSeats ?? limits.defaultSeatsPerStudent);
  const [minPassengers, setMinPassengers] = useState(init?.minPassengers ?? '0');
  // The vehicle sheet: a new vehicle, or the one being edited.
  const [sheet, setSheet] = useState<VehicleDto | 'new' | null>(null);
  const [saving, setSaving] = useState<'draft' | 'publish' | null>(null);
  const [showPlan, setShowPlan] = useState(true);
  const [copiedFrom, setCopiedFrom] = useState<string | null>(null);
  const now = useNow();
  // Leaving with changes not saved asks first; a save leaves without asking.
  const dirty = useDirty({ direction, from, to, day: day?.getTime() ?? null, pickups, dropoffs, vehicleId, price, maxSeats, minPassengers });
  const guard = useLeaveGuard(dirty && !saving);

  // The models the organization doesn't have yet (the ones it has are among its vehicles).
  const catalog = models.filter((m) => !vehicles.some((v) => v.model === m.key));
  const picked = vehicleId?.startsWith(MODEL) ? catalog.find((m) => MODEL + m.key === vehicleId) : undefined;
  const vehicle = picked
    ? { label: picked.label, capacity: picked.capacity, blockedSeats: [] as number[], seatsPerRow: 4, layout: picked.layout }
    : (vehicles.find((v) => v.id === vehicleId) ?? null);
  const seats = vehicle ? vehicle.capacity - vehicle.blockedSeats.length : null;
  const timed = useMemo(() => schedule(day, [...pickups, ...dropoffs], [...pickups.map((_, i) => `montée ${i + 1}`), ...dropoffs.map((_, i) => `arrêt ${i + 1}`)], now), [day, pickups, dropoffs, now]);
  const plan = timed.plan;
  const departureAt = timed.partial[0]?.at ?? null;
  const inPast = !!departureAt && departureAt.getTime() <= now;
  // The first arrêt comes after the last montée: named so.
  const errors = timed.errors.map((e, i) => (i === pickups.length && e ? e.replace(/\(montée \d+\)/, '(dernière montée)') : e));
  if (inPast) errors[0] = 'Heure déjà passée';
  const min = Number(minPassengers || 0);
  const minTooHigh = seats !== null && min > seats;
  const priceOk = Number(price) >= 100 && Number(price) <= 100_000;
  // Live: what's still missing, said next to the button (which stays disabled until nothing is).
  const missing = [
    from.trim().length < 2 && 'le départ',
    to.trim().length < 2 && 'la destination',
    !day && 'le jour',
    [...pickups, ...dropoffs].some((r) => r.place.trim().length < 2) && 'le lieu de chaque arrêt',
    [...pickups, ...dropoffs].some((r) => !r.time) && 'les heures',
    !vehicle && 'le véhicule',
    !priceOk && 'le prix (100 à 100 000 F)',
  ].filter(Boolean) as string[];
  const blocking = errors.some(Boolean) || minTooHigh;
  const valid = !missing.length && !blocking && !!plan;
  const deadline = plan && departureAt && !inPast ? deadlinesOf(departureAt, now) : null;

  const switchDirection = (d: Direction) => {
    if (d === direction) return;
    setDirection(d);
    // The campus changes side: "UGB → Dakar" becomes "Dakar → UGB".
    setFrom(to);
    setTo(from);
  };
  // « Reprendre un trajet »: the same way again, or the way back (stops and times reversed).
  const copy = (d: OrgDepartureDto) =>
    notice({
      tone: 'info',
      title: 'Reprendre ce trajet',
      message: `${d.from} → ${d.to} · ${d.pickups.length + d.dropoffs.length} arrêts · ${formatFcfa(d.price)}`,
      choices: [
        { label: `Sens inverse : ${d.to} → ${d.from}`, tone: 'primary', onPress: () => apply(d, reversedDeparture(d)) },
        { label: `Même sens : ${d.from} → ${d.to}`, tone: 'primary', onPress: () => apply(d, fromDeparture(d)) },
        { label: 'Annuler', tone: 'quiet' },
      ],
    });
  const apply = (d: OrgDepartureDto, x: ReturnType<typeof fromDeparture>) => {
    setDirection(x.direction);
    setFrom(x.from);
    setTo(x.to);
    setPickups(x.pickups);
    setDropoffs(x.dropoffs);
    if (vehicles.some((v) => v.id === x.vehicleId)) setVehicleId(x.vehicleId);
    setPrice(x.price);
    setMaxSeats(x.maxSeats);
    setMinPassengers(x.minPassengers);
    setCopiedFrom(d.id);
  };
  const leave = () => guard.leave(() => (router.canGoBack() ? router.back() : router.replace('/activites')));

  // A model picked from the catalog becomes the organization's vehicle (the one it has, else a new one) when saving.
  const resolveVehicle = async () => {
    if (!vehicleId?.startsWith(MODEL)) return vehicleId!;
    const v = await caravansApi.vehicleFromModel(orgId, vehicleId.slice(MODEL.length));
    setVehicles((list) => (list.some((x) => x.id === v.id) ? list : [...list, v]));
    setVehicleId(v.id);
    return v.id;
  };

  const input = (vehicleId: string): DepartureInput => {
    const all = plan!;
    const at = (i: number) => all[i]!.at.toISOString();
    return {
      vehicleId,
      direction,
      from: from.trim(),
      to: to.trim(),
      pickups: pickups.map((s, i) => ({ place: s.place.trim(), at: at(i) })),
      dropoffs: dropoffs.map((s, i) => ({ place: s.place.trim(), at: at(pickups.length + i) })),
      price: Number(price),
      maxSeatsPerStudent: maxSeats,
      paymentMethods: ['cash'],
      minPassengers: min,
    };
  };

  const save = async (publish: boolean) => {
    setSaving(publish ? 'publish' : 'draft');
    try {
      const body = input(await resolveVehicle());
      let saved = draft ? await caravansApi.updateDeparture(orgId, draft.id, body) : await caravansApi.createDeparture(orgId, body);
      if (publish) {
        saved = await caravansApi.publishDeparture(orgId, saved.id);
        toast('Départ publié : les étudiants peuvent réserver.');
        guard.leave(() => router.replace(`/depart/${saved.id}`));
      } else {
        toast('Brouillon enregistré.');
        leave();
      }
    } catch (err) {
      fail(publish ? 'Publication impossible' : 'Enregistrement impossible')(err);
    } finally {
      setSaving(null);
    }
  };
  const confirmPublish = () =>
    Alert.alert('Publier ce départ ?', 'Les étudiants pourront réserver tout de suite. Un départ publié ne se modifie plus : tu pourras ajouter des arrêts ou l’annuler (les passagers sont prévenus).', [
      { text: 'Vérifier encore', style: 'cancel' },
      { text: 'Publier', onPress: () => save(true) },
    ]);
  const removeDraft = () =>
    Alert.alert('Supprimer le brouillon ?', 'Il n’a jamais été publié : personne ne l’a vu.', [
      { text: 'Garder', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () =>
          caravansApi.cancelDeparture(orgId, draft!.id, 'Brouillon supprimé').then(() => {
            toast('Brouillon supprimé.');
            leave();
          }, fail('Suppression impossible')),
      },
    ]);

  return (
    <View style={{ flex: 1 }}>
    <KeyboardAwareScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" bottomOffset={24}>
      {past.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={styles.label}>Reprendre un trajet</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            {past.map((d) => (
              <Pressable
                key={d.id}
                onPress={() => copy(d)}
                style={[styles.copy, copiedFrom === d.id && styles.copyOn]}
                accessibilityRole="button"
                accessibilityLabel={`Reprendre ${d.from} vers ${d.to}`}>
                <Text style={styles.copyRoute} numberOfLines={1}>
                  {d.from} → {d.to}
                </Text>
                <Text style={styles.muted} numberOfLines={1}>
                  {hhmm(d.departureAt).replace(':', 'h')} · {d.pickups.length + d.dropoffs.length} arrêts · {formatFcfa(d.price)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <Text style={styles.hint}>Même sens ou retour (arrêts et horaires inversés) : prix et véhicule repris, choisis juste le jour.</Text>
        </View>
      )}

      <Segmented
        options={[
          { value: 'aller', label: 'Aller' },
          { value: 'retour', label: 'Retour' },
        ]}
        value={direction}
        onChange={switchDirection}
      />
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <LabeledField label="De">
            <Field placeholder={direction === 'aller' ? CAMPUS : 'Dakar'} value={from} onChangeText={setFrom} maxLength={40} />
          </LabeledField>
        </View>
        <Ionicons name="arrow-forward" size={18} color={colors.muted} style={{ marginTop: 22 }} />
        <View style={{ flex: 1 }}>
          <LabeledField label="À">
            <Field placeholder={direction === 'aller' ? 'Dakar' : CAMPUS} value={to} onChangeText={setTo} maxLength={40} />
          </LabeledField>
        </View>
      </View>

      <DateField label="Jour du départ" value={day} onChange={setDay} min={midnight(now)} max={new Date(midnight(now).getTime() + (DAYS_AHEAD - 1) * DAY)} />


      <Stops
        title="Montées"
        icon="enter-outline"
        addLabel="Ajouter une montée"
        hint="Dans l’ordre du trajet, chacune après la précédente. La première heure est l’heure du départ."
        rows={pickups}
        setRows={setPickups}
        plan={timed.partial.slice(0, pickups.length)}
        errors={errors.slice(0, pickups.length)}
        placeholder={direction === 'aller' ? 'UGB · Village E' : 'Dakar · Colobane'}
      />
      <Stops
        title="Arrêts"
        icon="exit-outline"
        addLabel="Ajouter un arrêt"
        hint="Heure d’arrivée prévue, après la dernière montée et dans l’ordre du trajet."
        rows={dropoffs}
        setRows={setDropoffs}
        plan={timed.partial.slice(pickups.length)}
        errors={errors.slice(pickups.length)}
        placeholder={direction === 'aller' ? 'Dakar · Colobane' : 'UGB · Village E'}
      />
      {departureAt && !inPast && <Text style={styles.hint}>Départ {dayLabel(departureAt.getTime())} à {hhmm(departureAt.toISOString()).replace(':', 'h')}.</Text>}

      <Text style={styles.label}>Véhicule</Text>
      {vehicles.length === 0 && models.length === 0 && !owner && <Text style={styles.hint}>Aucun véhicule enregistré : demande au responsable de l’organisation d’en ajouter un.</Text>}
      <View style={{ gap: 8 }}>
        {vehicles.map((v) => {
          const on = v.id === vehicleId;
          return (
            <View key={v.id} style={[styles.option, on && styles.optionOn]}>
              <Pressable onPress={() => setVehicleId(v.id)} style={styles.optionMain} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={v.label}>
                <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={20} color={on ? colors.primary : colors.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionTitle}>{v.label}</Text>
                  <Text style={styles.muted}>
                    {v.capacity - v.blockedSeats.length} places{v.layout ? '' : v.seatsPerRow === 5 ? ' · 5 par rangée (versailler)' : ' · 4 par rangée'}{v.airConditioned ? ' · Climatisé' : ''}
                  </Text>
                </View>
              </Pressable>
              {owner && (
                <Pressable onPress={() => setSheet(v)} style={styles.edit} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Modifier ${v.label}`}>
                  <Ionicons name="create-outline" size={18} color={colors.primary} />
                </Pressable>
              )}
            </View>
          );
        })}
        {owner && <AddRow label="Décrire un autre véhicule" onPress={() => setSheet('new')} />}
      </View>
      {catalog.length > 0 && (
        <>
          <Text style={[styles.hint, { marginTop: 2 }]}>{vehicles.length ? 'Ou un modèle courant :' : 'Choisis ton modèle :'}</Text>
          <View style={styles.models}>
            {catalog.map((m) => {
              const on = vehicleId === MODEL + m.key;
              return (
                <Pressable
                  key={m.key}
                  onPress={() => {
                    setVehicleId(MODEL + m.key);
                    setShowPlan(true);
                  }}
                  style={[styles.model, on && styles.optionOn]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${m.label}, ${m.capacity} places à vendre`}>
                  <Ionicons name={m.kind === 'bus' ? 'bus-outline' : 'car-outline'} size={18} color={on ? colors.primary : colors.muted2} />
                  <Text style={[styles.optionTitle, on && { color: colors.primary }]} numberOfLines={2}>
                    {m.label}
                  </Text>
                  <Text style={styles.muted}>{m.capacity} places à vendre</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}
      {/* Before saving: the plan the students will book on. */}
      {vehicle && (
        <View style={[styles.planCard, shadow.card]}>
          <Pressable onPress={() => setShowPlan((v) => !v)} style={styles.planHead} accessibilityRole="button" accessibilityState={{ expanded: showPlan }}>
            <Ionicons name="grid-outline" size={16} color={colors.primary} />
            <Text style={[styles.optionTitle, { flex: 1 }]} numberOfLines={1}>
              Plan · {vehicle.label}
            </Text>
            <Text style={styles.planToggle}>{showPlan ? 'Masquer' : 'Voir le plan'}</Text>
          </Pressable>
          {showPlan && (
            <>
              <SeatPlan rows={planOf(vehicle)} size={30} />
              <Text style={[styles.hint, { textAlign: 'center' }]}>{seats} places à vendre, numérotées comme dans le véhicule. Les étudiants choisissent la leur sur ce plan.</Text>
            </>
          )}
        </View>
      )}

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <LabeledField label="Prix de la place (FCFA)">
            <Field placeholder="3500" keyboardType="number-pad" value={price} onChangeText={(t) => setPrice(t.replace(/\D/g, '').slice(0, 6))} />
          </LabeledField>
        </View>
        <View style={{ flex: 1 }}>
          <LabeledField label="Minimum de passagers" error={minTooHigh ? `Maximum ${seats}` : null}>
            <Field keyboardType="number-pad" value={minPassengers} onChangeText={(t) => setMinPassengers(t.replace(/\D/g, '').slice(0, 2))} invalid={minTooHigh} />
          </LabeledField>
        </View>
      </View>
      <Text style={styles.hint}>
        {min === 0
          ? '0 : le départ est garanti, quel que soit le nombre de passagers.'
          : deadline
            ? `Vérifié le ${dayLabel(deadline.confirmBy)} à ${hhmm(new Date(deadline.confirmBy).toISOString()).replace(':', 'h')} : avec moins de ${min} place${min > 1 ? 's' : ''} réservée${min > 1 ? 's' : ''}, le départ est annulé.${deadline.confirmBy === deadline.bookingClosesAt ? ' (Départ dans moins de 24 h : vérifié à l’heure du départ.)' : ''} Les réservations restent ouvertes jusqu’au départ.`
            : `Avec moins de ${min} place${min > 1 ? 's' : ''} réservée${min > 1 ? 's' : ''} 24 h avant (ou à l’heure du départ pour un départ plus proche), il est annulé.`}
      </Text>

      <View style={styles.row}>
        <Text style={[styles.label, { flex: 1 }]}>Places max par étudiant</Text>
        <Pressable onPress={() => setMaxSeats(Math.max(1, maxSeats - 1))} style={styles.step} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Une place de moins par étudiant (${maxSeats})`}>
          <Ionicons name="remove" size={16} color={colors.primary} />
        </Pressable>
        <Text style={styles.label}>{maxSeats}</Text>
        <Pressable
          onPress={() => setMaxSeats(Math.min(limits.maxSeatsPerStudent, maxSeats + 1))}
          style={styles.step}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`Une place de plus par étudiant (${maxSeats})`}>
          <Ionicons name="add" size={16} color={colors.primary} />
        </Pressable>
      </View>
      <Text style={[styles.hint, { marginTop: -6 }]}>Sa place et celles de ses accompagnants.</Text>

      <View style={styles.cashHint}>
        <Ionicons name="cash-outline" size={18} color={colors.successText} />
        <Text style={[styles.hint, { flex: 1, color: colors.successText }]}>
          Les étudiants demandent leurs places et viennent te payer en espèces : tu valides chaque demande à réception de l’argent (sous 24 h, sinon elle est annulée). Le billet devient alors valable.
        </Text>
      </View>

      <TextButton
        label={saving === 'draft' ? 'Enregistrement…' : 'Enregistrer le brouillon'}
        icon="save-outline"
        disabled={!valid || !!saving}
        style={{ alignSelf: 'center' }}
        onPress={() => save(false)}
      />
      {draft && <TextButton label="Supprimer le brouillon" icon="trash-outline" tone="danger" style={{ alignSelf: 'center' }} onPress={removeDraft} />}

      <VehicleSheet
        key={sheet === 'new' ? 'new' : (sheet?.id ?? 'none')}
        visible={sheet !== null}
        orgId={orgId}
        vehicle={sheet === 'new' ? null : sheet}
        onClose={() => setSheet(null)}
        onSaved={(v) => {
          setVehicles((list) => (list.some((x) => x.id === v.id) ? list.map((x) => (x.id === v.id ? v : x)) : [...list, v]));
          setVehicleId(v.id);
          setSheet(null);
        }}
        onDeleted={(vid) => {
          setVehicles((list) => list.filter((x) => x.id !== vid));
          if (vehicleId === vid) setVehicleId(null);
          setSheet(null);
        }}
      />
    </KeyboardAwareScrollView>
    {/* Always in view: the button, and live, what's still missing or wrong. */}
    <StickyFooter>
      {!valid && (
        <Text style={[styles.hint, styles.footerHint, blocking && styles.warn]} numberOfLines={2}>
          {blocking ? 'Corrige les heures en rouge.' : missing.length ? `À compléter : ${missing.join(', ')}.` : ''}
        </Text>
      )}
      <PrimaryButton label="Publier le départ" disabled={!valid || !!saving} loading={saving === 'publish'} onPress={confirmPublish} />
    </StickyFooter>
    </View>
  );
}

type StopsProps = {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  hint: string;
  /** "Ajouter une montée" */
  addLabel: string;
  rows: StopRow[];
  setRows: (f: (list: StopRow[]) => StopRow[]) => void;
  /** The computed date of each row (missing while its time is), to flag the next day. */
  plan: ({ at: Date; nextDay: boolean } | undefined)[];
  /** Out of order: what it must come after. */
  errors: (string | null)[];
  placeholder: string;
};

/** A list of stops on a line, in route order: place and time, then the row to add one more. */
function Stops({ title, icon, hint, addLabel, rows, setRows, plan, errors, placeholder }: StopsProps) {
  const set = (i: number, patch: Partial<StopRow>) => setRows((list) => list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const full = rows.length >= MAX_STOPS;
  return (
    <View style={[styles.card, shadow.card, { gap: 4 }]}>
      <View style={styles.row}>
        <Ionicons name={icon} size={18} color={colors.primary} />
        <Text style={[styles.section, { flex: 1 }]}>{title}</Text>
        <Text style={styles.muted}>{rows.length}</Text>
      </View>
      <Text style={[styles.hint, { marginBottom: 8 }]}>{hint}</Text>
      {rows.map((r, i) => (
        <View key={i} style={[styles.stopRow, { flexWrap: 'wrap' }]}>
          {/* The route: a dot per stop, joined by a line down to the add row. */}
          <View style={styles.rail}>
            <View style={styles.dot}>
              <Text style={styles.dotText}>{i + 1}</Text>
            </View>
            {(i < rows.length - 1 || !full) && <View style={styles.line} />}
          </View>
          <View style={styles.stopFields}>
            <View style={{ flex: 1 }}>
              <Field placeholder={placeholder} value={r.place} onChangeText={(t) => set(i, { place: t })} maxLength={80} accessibilityLabel={`${title} ${i + 1} : lieu`} />
            </View>
            <StopTimeField
              label={`${title.replace(/s$/, '')} ${i + 1}`}
              value={r.time}
              onChange={(t) => set(i, { time: t })}
              invalid={!!errors[i]}
              // Earlier than the stop before, on a night trip: the next morning.
              nextDay={!!plan[i]?.nextDay}
              hint={errors[i]}
            />
            {rows.length > 1 && (
              <Pressable onPress={() => setRows((list) => list.filter((_, j) => j !== i))} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Retirer l’arrêt ${i + 1}`}>
                <Ionicons name="trash-outline" size={18} color={colors.muted2} />
              </Pressable>
            )}
          </View>
          {!!errors[i] && <Text style={[styles.hint, styles.warn, styles.rowError]}>{errors[i]}</Text>}
        </View>
      ))}
      {!full && (
        <View style={styles.stopRow}>
          <View style={styles.rail}>
            <View style={[styles.dot, styles.dotAdd]}>
              <Ionicons name="add" size={14} color={colors.primary} />
            </View>
          </View>
          <View style={{ flex: 1, paddingBottom: 4 }}>
            <AddRow label={addLabel} onPress={() => setRows((list) => [...list, { place: '', time: '' }])} />
          </View>
        </View>
      )}
    </View>
  );
}

/**
 * A published departure, before the bus leaves: only additions. Its stops stay (locked), new ones can be added, and
 * the bus can be swapped for one with as many seats or more. Nothing a student booked changes.
 */
function ExtendForm({ orgId, departure: d, vehicles }: { orgId: string; departure: OrgDepartureDto; vehicles: VehicleDto[] }) {
  const [pickups, setPickups] = useState<StopRow[]>([]);
  const [dropoffs, setDropoffs] = useState<StopRow[]>([]);
  const [vehicleId, setVehicleId] = useState(d.vehicleId);
  // Stops nobody booked, marked to remove (restorable until saved).
  const [removed, setRemoved] = useState<string[]>([]);
  const toggleRemove = (stopId: string) => setRemoved((list) => (list.includes(stopId) ? list.filter((x) => x !== stopId) : [...list, stopId]));
  const [saving, setSaving] = useState(false);
  const departAt = Date.parse(d.departureAt);
  const seatsNow = d.totalSeats;
  // A new stop's time on the trip: the departure day, or the next morning for a time earlier than the departure.
  const dateOf = (time: string) => {
    const m = minutesOf(time);
    if (m === null) return null;
    const at = midnight(departAt);
    at.setMinutes(m);
    return at.getTime() < departAt ? new Date(at.getTime() + DAY) : at;
  };
  const rowsOk = (rows: StopRow[]) => rows.every((r) => r.place.trim().length >= 2 && dateOf(r.time));
  const changed = pickups.length > 0 || dropoffs.length > 0 || removed.length > 0 || vehicleId !== d.vehicleId;
  // One drop-off at least stays.
  const dropoffsLeft = d.dropoffs.filter((x) => !removed.includes(x.stopId)).length + dropoffs.length;
  const valid = changed && rowsOk(pickups) && rowsOk(dropoffs) && dropoffsLeft > 0;
  const leave = () => (router.canGoBack() ? router.back() : router.replace(`/depart/${d.id}`));

  const save = async () => {
    setSaving(true);
    try {
      const stops = (rows: StopRow[]) => rows.map((r) => ({ place: r.place.trim(), at: dateOf(r.time)!.toISOString() }));
      await caravansApi.extendDeparture(orgId, d.id, {
        ...(pickups.length ? { pickups: stops(pickups) } : {}),
        ...(dropoffs.length ? { dropoffs: stops(dropoffs) } : {}),
        ...(vehicleId !== d.vehicleId ? { vehicleId } : {}),
        ...(removed.length ? { remove: removed } : {}),
      });
      toast('Départ mis à jour : les étudiants voient les nouveaux arrêts et places.');
      leave();
    } catch (err) {
      fail('Modification impossible')(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAwareScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" bottomOffset={24}>
      <View style={styles.notice}>
        <Ionicons name="lock-closed-outline" size={18} color={colors.primary} />
        <Text style={styles.noticeText}>
          {d.from} → {d.to} · {dayLabel(departAt)} à {hhmm(d.departureAt).replace(':', 'h')}. Déjà publié{d.counts.booked ? ` (${d.counts.booked} place${d.counts.booked > 1 ? 's' : ''} vendue${d.counts.booked > 1 ? 's' : ''})` : ''} : tu peux ajouter des arrêts, retirer ceux que personne n’a réservés, ou prendre un plus grand véhicule. Les places vendues ne changent pas.
        </Text>
      </View>
      <LockedStops title="Montées" icon="enter-outline" booked={d.bookedStopIds} departureStop={d.pickups[0]?.stopId} removed={removed} onToggleRemove={toggleRemove} stops={d.pickups} rows={pickups} setRows={setPickups} addLabel="Ajouter une montée" placeholder="Louga · Gare routière" dateOf={dateOf} departAt={departAt} />
      <LockedStops title="Arrêts" icon="exit-outline" booked={d.bookedStopIds} removed={removed} onToggleRemove={toggleRemove} stops={d.dropoffs} rows={dropoffs} setRows={setDropoffs} addLabel="Ajouter un arrêt" placeholder="Rufisque · Gare" dateOf={dateOf} departAt={departAt} />

      {dropoffsLeft === 0 && <Text style={[styles.hint, styles.warn]}>Garde au moins un arrêt.</Text>}
      <Text style={styles.label}>Véhicule</Text>
      <View style={{ gap: 8 }}>
        {vehicles.map((v) => {
          const seats = v.capacity - v.blockedSeats.length;
          const current = v.id === d.vehicleId;
          const tooSmall = !current && seats < seatsNow;
          const on = v.id === vehicleId;
          return (
            <Pressable
              key={v.id}
              disabled={tooSmall}
              onPress={() => setVehicleId(v.id)}
              style={[styles.option, on && styles.optionOn, tooSmall && { opacity: 0.45 }]}
              accessibilityRole="radio"
              accessibilityState={{ checked: on, disabled: tooSmall }}>
              <View style={styles.optionMain}>
                <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={20} color={on ? colors.primary : colors.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionTitle}>{v.label}</Text>
                  <Text style={styles.muted}>
                    {seats} places{current ? ' · actuel' : tooSmall ? ' · trop petit' : seats > seatsNow ? ` · +${seats - seatsNow} places` : ''}
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.hint}>On ne retire pas de places à un départ publié : seuls les véhicules d’au moins {seatsNow} places sont proposés. Chaque place vendue garde son numéro.</Text>

      <PrimaryButton label="Enregistrer les ajouts" disabled={!valid || saving} loading={saving} onPress={save} />
    </KeyboardAwareScrollView>
  );
}

type LockedStopsProps = {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  stops: { stopId: string; place: string; at: string }[];
  rows: StopRow[];
  setRows: (f: (list: StopRow[]) => StopRow[]) => void;
  addLabel: string;
  placeholder: string;
  dateOf: (time: string) => Date | null;
  departAt: number;
  /** Stops someone boards or gets off at: they stay. */
  booked: string[];
  /** The departure itself (first pickup): it stays. */
  departureStop?: string;
  removed: string[];
  onToggleRemove: (stopId: string) => void;
};

/** The stops already sold (locked), then the new ones being added (place, time, removable before saving). */
function LockedStops({ title, icon, stops, rows, setRows, addLabel, placeholder, dateOf, departAt, booked, departureStop, removed, onToggleRemove }: LockedStopsProps) {
  const set = (i: number, patch: Partial<StopRow>) => setRows((list) => list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const full = stops.length - stops.filter((x) => removed.includes(x.stopId)).length + rows.length >= MAX_STOPS;
  return (
    <View style={[styles.card, shadow.card, { gap: 4 }]}>
      <View style={[styles.row, { marginBottom: 8 }]}>
        <Ionicons name={icon} size={18} color={colors.primary} />
        <Text style={[styles.section, { flex: 1 }]}>{title}</Text>
        <Text style={styles.muted}>{stops.length + rows.length}</Text>
      </View>
      {stops.map((s, i) => {
        const isBooked = booked.includes(s.stopId);
        const isDeparture = s.stopId === departureStop;
        const gone = removed.includes(s.stopId);
        // Booked or the departure: locked. Otherwise it can go (restorable until saved).
        const locked = isBooked || isDeparture;
        return (
          <View key={s.stopId} style={styles.stopRow}>
            <View style={styles.rail}>
              <View style={[styles.dot, locked ? styles.dotLocked : styles.dotFree, gone && styles.dotGone]}>
                <Text style={styles.dotText}>{i + 1}</Text>
              </View>
              <View style={styles.line} />
            </View>
            <View style={[styles.stopFields, styles.lockedRow, gone && styles.goneRow]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionTitle, gone && styles.goneText]} numberOfLines={1}>
                  {s.place}
                </Text>
                <Text style={styles.muted}>
                  {hhmm(s.at).replace(':', 'h')} · {gone ? 'sera retiré' : isDeparture ? 'départ' : isBooked ? 'réservé' : 'personne n’a réservé'}
                </Text>
              </View>
              {locked ? (
                <Ionicons name="lock-closed" size={14} color={colors.muted} accessibilityLabel={isDeparture ? 'Départ, ne se retire pas' : 'Réservé, ne se retire pas'} />
              ) : (
                <Pressable onPress={() => onToggleRemove(s.stopId)} hitSlop={8} accessibilityRole="button" accessibilityLabel={gone ? `Garder ${s.place}` : `Retirer ${s.place}`}>
                  {gone ? <Text style={styles.restore}>Garder</Text> : <Ionicons name="trash-outline" size={18} color={colors.dangerText} />}
                </Pressable>
              )}
            </View>
          </View>
        );
      })}
      {rows.map((r, i) => {
        const at = dateOf(r.time);
        return (
          <View key={`new-${i}`} style={styles.stopRow}>
            <View style={styles.rail}>
              <View style={[styles.dot, styles.dotNew]}>
                <Ionicons name="add" size={14} color="#fff" />
              </View>
              <View style={styles.line} />
            </View>
            <View style={styles.stopFields}>
              <View style={{ flex: 1 }}>
                <Field placeholder={placeholder} value={r.place} onChangeText={(t) => set(i, { place: t })} maxLength={80} accessibilityLabel={`Nouvel arrêt ${i + 1} : lieu`} />
              </View>
              <StopTimeField
                label={`Nouvel arrêt ${i + 1}`}
                value={r.time}
                onChange={(t) => set(i, { time: t })}
                // The next morning (a time earlier than the departure).
                nextDay={!!at && !sameDay(at, new Date(departAt))}
                hint="Placé dans le trajet selon son heure."
              />
              <Pressable onPress={() => setRows((list) => list.filter((_, j) => j !== i))} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Retirer le nouvel arrêt ${i + 1}`}>
                <Ionicons name="trash-outline" size={18} color={colors.muted2} />
              </Pressable>
            </View>
          </View>
        );
      })}
      {!full && (
        <View style={styles.stopRow}>
          <View style={styles.rail}>
            <View style={[styles.dot, styles.dotAdd]}>
              <Ionicons name="add" size={14} color={colors.primary} />
            </View>
          </View>
          <View style={{ flex: 1, paddingBottom: 4 }}>
            <AddRow label={addLabel} onPress={() => setRows((list) => [...list, { place: '', time: '' }])} />
          </View>
        </View>
      )}
      {rows.length > 0 && <Text style={[styles.hint, { marginTop: 4 }]}>Placé dans le trajet selon son heure. Les arrêts existants restent tels quels.</Text>}
    </View>
  );
}

/** A dashed row that adds one more item to the list above it. */
function AddRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.add, pressed && { opacity: 0.7 }]} accessibilityRole="button">
      <Text style={styles.addText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 },
  h1: { ...typo.h3, color: colors.navy },
  body: { padding: 20, gap: 12, paddingBottom: 48 },
  section: { ...typo.section, color: colors.navy },
  label: { ...typo.smallStrong, color: colors.navy },
  hint: { ...typo.caption, color: colors.muted2, lineHeight: 17 },
  warn: { color: colors.dangerText },
  muted: { ...typo.caption, color: colors.muted2 },
  card: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chipsRow: { flexDirection: 'row', gap: 8 },
  copy: { width: 190, gap: 2, padding: 12, borderRadius: radii.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card },
  copyOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  copyRoute: { ...typo.smallStrong, color: colors.navy },
  option: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 6, borderRadius: radii.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card },
  optionMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  edit: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  stopRow: { flexDirection: 'row', gap: 10 },
  notice: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: radii.md, backgroundColor: colors.primarySoft },
  noticeText: { ...typo.small, flex: 1, color: colors.navy, lineHeight: 19 },
  dotLocked: { backgroundColor: colors.muted },
  dotFree: { backgroundColor: colors.primary },
  dotGone: { backgroundColor: colors.border },
  goneRow: { backgroundColor: colors.dangerBg },
  goneText: { textDecorationLine: 'line-through', color: colors.muted2 },
  restore: { ...typo.smallStrong, color: colors.primary },
  dotNew: { backgroundColor: colors.accent },
  lockedRow: { minHeight: 48, paddingHorizontal: 12, borderRadius: radii.md, backgroundColor: colors.primarySofter, marginBottom: 10, paddingBottom: 0 },
  rail: { width: 24, alignItems: 'center' },
  dot: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  dotText: { ...typo.label, color: '#fff' },
  dotAdd: { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.primary, borderStyle: 'dashed', marginTop: 12 },
  line: { flex: 1, width: 2, backgroundColor: colors.primarySoft, marginVertical: 2 },
  stopFields: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 10 },
  add: { minHeight: 48, borderRadius: radii.md, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.primary, backgroundColor: colors.primarySofter, alignItems: 'center', justifyContent: 'center' },
  addText: { ...typo.smallStrong, color: colors.primary },
  optionOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  optionTitle: { ...typo.smallStrong, color: colors.navy },
  models: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  model: { width: '48.5%', gap: 4, padding: 12, borderRadius: radii.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card },
  planCard: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 14, gap: 12 },
  planHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  planToggle: { ...typo.captionStrong, color: colors.primary },
  step: { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  nextDayText: { ...typo.label, color: colors.warningText },
  rowError: { width: '100%', paddingLeft: 34, marginTop: -6, marginBottom: 8 },
  footerHint: { textAlign: 'center', marginBottom: 8 },
  cashHint: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: radii.md, backgroundColor: colors.successBg },
});
