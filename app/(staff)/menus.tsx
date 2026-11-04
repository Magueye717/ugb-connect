import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState, ErrorState } from '@/components/states';
import { Field, PrimaryButton, TextButton } from '@/components/ui';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useCampus } from '@/context/CampusContext';
import { currentMeal, hmLabel, MEAL_LABEL, staffApi, type CatalogueDish, type DishDto, type DishInput, type DishStatus, type Meal, type PublicRestoDto, type StaffRestoDto } from '@/features/restos/api';
import { ApiError } from '@/lib/api';
import { haptics } from '@/lib/haptics';
import { fold, matches } from '@/lib/search';
import { useNow } from '@/lib/useNow';

const fail = (title: string) => (err: unknown) => Alert.alert(title, err instanceof ApiError ? err.message : 'Réessaie dans un instant.');

/** The stock levels, as the students see them. */
const LEVELS: { status: DishStatus; label: string; bg: string; fg: string }[] = [
  { status: 'available', label: 'Dispo', bg: colors.successBg, fg: colors.successText },
  { status: 'low', label: 'Bientôt fini', bg: colors.warningBg, fg: colors.warningText },
  { status: 'out', label: 'Rupture', bg: colors.navy, fg: '#fff' },
];

/**
 * Public restaurant staff: today's menus of their restaurant(s). Lunch and dinner are published separately (dinner is
 * often known in the afternoon). During the service, one tap per dish says how much is left; "Rupture" puts an alert
 * on the students' home screen, with a notification if the staff choose so.
 */
export default function MenusDuJour() {
  const { restos: day, refresh } = useCampus();
  const [mine, setMine] = useState<StaffRestoDto[] | null>(null);
  // The first load failed (no network…): « Impossible de charger », with « Réessayer » (not "no restaurant").
  const [loadFailed, setLoadFailed] = useState(false);
  const loadMine = useCallback(() => {
    setLoadFailed(false);
    staffApi.restos().then((r) => setMine(r.items.filter((x) => x.status === 'active')), () => setLoadFailed(true));
  }, []);
  const [restoId, setRestoId] = useState<string | null>(null);
  const meal = currentMeal(useNow(), day?.restos ?? []);
  const [shown, setShown] = useState<Meal | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadMine();
      refresh();
    }, [loadMine, refresh]),
  );
  const pull = () => {
    setRefreshing(true);
    refresh().finally(() => setRefreshing(false));
  };

  const current = mine?.find((r) => r.id === restoId) ?? mine?.[0] ?? null;
  const resto = current ? day?.restos.find((r) => r.id === current.id) : undefined;
  const m: Meal = shown ?? meal.key;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAwareScrollView style={{ flex: 1 }} bottomOffset={24} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pull} />}>
          <Text style={styles.h1}>Menus du jour</Text>
          <View style={[styles.now, meal.live && styles.nowLive]}>
            <Ionicons name={meal.live ? 'restaurant' : 'time-outline'} size={16} color={meal.live ? colors.successText : colors.muted2} />
            <Text style={[styles.nowText, meal.live && { color: colors.successText }]}>
              {meal.label} · {meal.status}
            </Text>
          </View>

          {!mine && !loadFailed && <ActivityIndicator color={colors.primary} />}
          {!mine && loadFailed && <ErrorState onRetry={loadMine} />}
          {mine?.length === 0 && <EmptyState icon="restaurant-outline" title="Aucun restaurant" text="Le super administrateur t’attribue tes restaurants depuis son espace Équipe." />}
          {mine && mine.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} accessibilityRole="tablist">
              {mine.map((r) => (
                <RestoTab key={r.id} resto={r} menus={day?.restos.find((x) => x.id === r.id)?.menus} on={r.id === current?.id} onPress={() => setRestoId(r.id)} />
              ))}
            </ScrollView>
          )}

          {current && day && (
            <>
              <View style={styles.meals} accessibilityRole="tablist">
                {(['lunch', 'dinner'] as const).map((x) => (
                  <MealTab key={x} meal={x} resto={current} published={!!resto?.menus[x]} live={meal.live && meal.key === x} on={m === x} onPress={() => setShown(x)} />
                ))}
              </View>
              <MealCard key={`${current.id}-${m}-${resto?.menus[m]?.updatedAt ?? 'none'}`} resto={current} menu={resto?.menus[m] ?? null} meal={m} date={day.date} onChanged={refresh} />
            </>
          )}
        </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

/** A restaurant to work on: its name, where it is, and how many of today's two menus are published. */
function RestoTab({ resto, menus, on, onPress }: { resto: StaffRestoDto; menus?: PublicRestoDto['menus']; on: boolean; onPress: () => void }) {
  const done = (['lunch', 'dinner'] as const).filter((x) => menus?.[x]).length;
  const tone = done === 2 ? colors.successText : done === 1 ? colors.warningText : colors.muted2;
  return (
    <Pressable style={[styles.restoTab, on && styles.tabOn]} onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={`${resto.name}, ${done} menu${done > 1 ? 's' : ''} publié${done > 1 ? 's' : ''} sur 2`}>
      <View style={[styles.restoIcon, on && { backgroundColor: colors.primary }]}>
        <Ionicons name="restaurant" size={15} color={on ? '#fff' : colors.primary} />
      </View>
      <View style={{ flexShrink: 1 }}>
        <Text style={[styles.restoName, on && { color: colors.primary }]} numberOfLines={1}>
          {resto.name}
        </Text>
        <Text style={[styles.tabMeta, { color: tone }]} numberOfLines={1}>
          {done === 2 ? 'Menus publiés' : done === 1 ? '1 menu sur 2' : 'Rien de publié'}
        </Text>
      </View>
    </Pressable>
  );
}

/** Lunch or dinner: the meal, its service hours, and whether its menu is out (or being served right now). */
function MealTab({ meal, resto, published, live, on, onPress }: { meal: Meal; resto: StaffRestoDto; published: boolean; live: boolean; on: boolean; onPress: () => void }) {
  const hours = `${hmLabel(resto.services[meal].start)} – ${hmLabel(resto.services[meal].end)}`;
  return (
    <Pressable style={[styles.mealTab, on && styles.tabOn]} onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={`${MEAL_LABEL[meal]}, ${hours}, ${published ? 'publié' : 'à composer'}`}>
      <View style={styles.mealHead}>
        <Ionicons name={meal === 'lunch' ? 'sunny-outline' : 'moon-outline'} size={18} color={on ? colors.primary : colors.muted2} />
        <Text style={[styles.mealName, on && { color: colors.primary }]}>{MEAL_LABEL[meal]}</Text>
        {live && <View style={styles.liveDot} />}
      </View>
      <Text style={styles.mealHours}>{hours}</Text>
      <View style={[styles.badge, { backgroundColor: published ? colors.successBg : colors.warningBg }]}>
        <Ionicons name={published ? 'checkmark-circle' : 'create-outline'} size={12} color={published ? colors.successText : colors.warningText} />
        <Text style={[styles.badgeText, { color: published ? colors.successText : colors.warningText }]}>{published ? 'Publié' : 'À composer'}</Text>
      </View>
    </Pressable>
  );
}

/** One meal of one restaurant: compose and publish it, or (published) the stock level of each dish. */
function MealCard({ resto, menu, meal, date, onChanged }: { resto: StaffRestoDto; menu: PublicRestoDto['menus'][Meal]; meal: Meal; date: string; onChanged: () => Promise<void> }) {
  const [editing, setEditing] = useState(!menu);
  const [dishes, setDishes] = useState<DishInput[]>(() => (menu?.dishes.length ? menu.dishes.map((d) => ({ id: d.id, name: d.name, detail: d.detail })) : []));
  const [saving, setSaving] = useState(false);
  const label = MEAL_LABEL[meal].toLowerCase();

  const set = (i: number, patch: Partial<DishInput>) => setDishes((list) => list.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const filled = dishes.filter((d) => d.name.trim().length >= 2);
  const publish = async () => {
    setSaving(true);
    try {
      await staffApi.putMenu(resto.id, date, meal, filled.map((d) => ({ ...(d.id ? { id: d.id } : {}), name: d.name.trim(), detail: d.detail?.trim() ?? '' })));
      haptics.success();
      await onChanged();
      setEditing(false);
    } catch (err) {
      fail('Publication impossible')(err);
    } finally {
      setSaving(false);
    }
  };
  const unpublish = () =>
    Alert.alert(`Retirer le menu du ${label} ?`, 'Les étudiants ne le verront plus.', [
      { text: 'Garder', style: 'cancel' },
      { text: 'Retirer', style: 'destructive', onPress: () => staffApi.deleteMenu(resto.id, date, meal).then(onChanged, fail('Retrait impossible')) },
    ]);

  if (editing) {
    return (
      <View style={[styles.card, shadow.card]}>
        <Text style={styles.cardTitle}>{menu ? `Modifier le ${label}` : `Composer le ${label}`}</Text>
        <Text style={styles.muted}>
          {resto.name} · {hmLabel(resto.services[meal].start)}-{hmLabel(resto.services[meal].end)}
        </Text>
        {dishes.map((d, i) => (
          <View key={`${d.name}-${i}`} style={styles.dishEdit}>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={styles.dishName}>{d.name}</Text>
              <Field placeholder="Détail (facultatif) : riz au poisson" value={d.detail ?? ''} onChangeText={(v) => set(i, { detail: v })} maxLength={80} autoCapitalize="sentences" />
            </View>
            <Pressable onPress={() => setDishes((list) => list.filter((_, j) => j !== i))} hitSlop={8} style={styles.remove} accessibilityRole="button" accessibilityLabel={`Retirer ${d.name}`}>
              <Ionicons name="trash-outline" size={18} color={colors.dangerText} />
            </Pressable>
          </View>
        ))}
        {dishes.length < MAX_DISHES ? (
          <DishPicker meal={meal} taken={dishes.map((d) => d.name)} onPick={(d) => setDishes((list) => [...list, d])} />
        ) : (
          <Text style={styles.muted}>{MAX_DISHES} plats au plus.</Text>
        )}
        <PrimaryButton label={menu ? `Republier le ${label}` : `Publier le ${label}`} disabled={!filled.length || saving} loading={saving} onPress={publish} />
        {menu && <TextButton label="Annuler" style={{ alignSelf: 'center' }} onPress={() => setEditing(false)} />}
      </View>
    );
  }

  return (
    <View style={[styles.card, shadow.card]}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{MEAL_LABEL[meal]} publié</Text>
          <Text style={styles.muted}>Touche le niveau de stock d’un plat pendant le service.</Text>
        </View>
        <TextButton label="Modifier" icon="create-outline" onPress={() => setEditing(true)} />
      </View>
      {menu!.dishes.map((d) => (
        <DishRow key={d.id} dish={d} resto={resto.name} onSet={(status, notify) => staffApi.setDishStatus(resto.id, date, meal, d.id, status, notify).then(onChanged)} />
      ))}
      <TextButton label={`Retirer le menu du ${label}`} tone="danger" icon="eye-off-outline" style={{ alignSelf: 'center' }} onPress={unpublish} />
    </View>
  );
}

const MAX_DISHES = 12;
/** Without a search, the most likely dishes only: a search finds the others. */
const SUGGESTED = 12;

/**
 * The dishes to add to the menu: the catalogue (the usual dishes and every dish already published, this meal's
 * first), searchable; a dish not in it is added as typed, and joins it when the menu is published. A long press
 * takes a dish typed with a mistake out of the suggestions.
 */
function DishPicker({ meal, taken, onPick }: { meal: Meal; taken: string[]; onPick: (d: DishInput) => void }) {
  const [all, setAll] = useState<CatalogueDish[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const load = useCallback(() => staffApi.dishes(meal).then((r) => setAll(r.items), () => setFailed(true)), [meal]);
  useEffect(() => {
    load();
  }, [load]);
  const retry = () => {
    setFailed(false);
    load();
  };

  const q = query.trim().replace(/\s+/g, ' ');
  const used = new Set(taken.map(fold));
  const left = (all ?? []).filter((d) => !used.has(fold(d.name)));
  const shown = q ? left.filter((d) => matches(q, [d.name, d.detail])) : left.slice(0, SUGGESTED);
  // Typed by hand: offered when no dish of the catalogue (or the menu) has exactly this name.
  const fresh = q.length >= 2 && !used.has(fold(q)) && !(all ?? []).some((d) => fold(d.name) === fold(q));
  const pick = (d: DishInput) => {
    onPick(d);
    setQuery('');
    haptics.select();
  };
  const forget = (d: CatalogueDish) =>
    Alert.alert(`Retirer « ${d.name} » des suggestions ?`, 'Pour un plat mal écrit ou plus servi. Les menus déjà publiés ne changent pas.', [
      { text: 'Garder', style: 'cancel' },
      { text: 'Retirer', style: 'destructive', onPress: () => staffApi.removeDish(d.id).then(() => setAll((list) => list?.filter((x) => x.id !== d.id) ?? null), fail('Retrait impossible')) },
    ]);

  return (
    <View style={styles.picker}>
      <Text style={styles.pickerTitle}>Ajouter un plat</Text>
      <Field
        icon="search"
        placeholder="Chercher ou écrire un plat"
        value={query}
        onChangeText={setQuery}
        maxLength={60}
        autoCapitalize="sentences"
        returnKeyType="done"
        onSubmitEditing={() => fresh && pick({ name: q, detail: '' })}
        accessibilityLabel="Chercher ou écrire un plat"
      />
      {fresh && <TextButton label={`Ajouter « ${q} »`} icon="add-circle-outline" onPress={() => pick({ name: q, detail: '' })} />}
      {!all && !failed && <ActivityIndicator color={colors.primary} />}
      {failed && <TextButton label="Liste indisponible : réessayer" icon="refresh-outline" onPress={retry} />}
      {all && (
        <View style={styles.wrap}>
          {shown.map((d) => (
            <Pressable
              key={d.id}
              style={({ pressed }) => [styles.suggestion, pressed && { opacity: 0.7 }]}
              onPress={() => pick({ name: d.name, detail: d.detail })}
              onLongPress={() => forget(d)}
              accessibilityRole="button"
              accessibilityLabel={`Ajouter ${d.name}${d.detail ? `, ${d.detail}` : ''}`}
              accessibilityHint="Appui long : retirer des suggestions">
              <Ionicons name="add" size={14} color={colors.primary} />
              <Text style={styles.suggestionText} numberOfLines={1}>
                {d.name}
              </Text>
            </Pressable>
          ))}
          {!q && left.length > shown.length && <Text style={styles.muted}>+{left.length - shown.length} autres : cherche-les.</Text>}
          {q && !shown.length && !fresh && <Text style={styles.muted}>Déjà au menu.</Text>}
        </View>
      )}
    </View>
  );
}

function DishRow({ dish, resto, onSet }: { dish: DishDto; resto: string; onSet: (status: DishStatus, notify: boolean) => Promise<void> }) {
  const [saving, setSaving] = useState<DishStatus | null>(null);
  const set = (status: DishStatus) => {
    if (status === dish.status || saving) return;
    const go = (notify = false) => {
      setSaving(status);
      onSet(status, notify)
        .then(() => haptics.success())
        .catch(fail('Mise à jour impossible'))
        .finally(() => setSaving(null));
    };
    if (status !== 'out') return go();
    // The alert always shows on the home screen; the notification is the staff's call (busy service, popular dish…).
    Alert.alert(`Rupture de ${dish.name} au ${resto} ?`, 'Une alerte s’affiche sur l’accueil des étudiants jusqu’à la fin du service. Envoyer aussi une notification à tout le monde ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Sans notification', onPress: () => go(false) },
      { text: 'Notifier', onPress: () => go(true) },
    ]);
  };

  return (
    <View style={styles.dish}>
      <View>
        <Text style={[styles.dishName, dish.status === 'out' && styles.dishOut]}>{dish.name}</Text>
        {!!dish.detail && <Text style={styles.muted}>{dish.detail}</Text>}
      </View>
      <View style={styles.levels}>
        {LEVELS.map((l) => {
          const on = dish.status === l.status;
          return (
            <Pressable
              key={l.status}
              onPress={() => set(l.status)}
              style={[styles.level, on && { backgroundColor: l.bg, borderColor: l.bg }]}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${dish.name} : ${l.label}`}>
              {saving === l.status ? (
                <ActivityIndicator size="small" color={on ? l.fg : colors.primary} />
              ) : (
                <Text style={[styles.levelText, on && { color: l.fg }]} numberOfLines={1}>
                  {l.label}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 20, gap: 12, paddingBottom: 32 },
  h1: { ...typo.h1, color: colors.navy },
  now: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radii.md, backgroundColor: colors.card, alignSelf: 'flex-start' },
  nowLive: { backgroundColor: colors.successBg },
  nowText: { ...typo.smallStrong, color: colors.muted2 },
  chips: { gap: 8 },
  restoTab: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 150, maxWidth: 220, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radii.lg, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border },
  tabOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  restoIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  restoName: { ...typo.bodyStrong, color: colors.navy },
  tabMeta: { ...typo.captionStrong },
  meals: { flexDirection: 'row', gap: 10 },
  mealTab: { flex: 1, gap: 4, padding: 12, borderRadius: radii.lg, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border },
  mealHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mealName: { ...typo.bodyStrong, color: colors.navy },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  mealHours: { ...typo.caption, color: colors.muted2 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 2, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill },
  badgeText: { ...typo.label },
  chip: { paddingHorizontal: 14, minHeight: 36, borderRadius: radii.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' },
  card: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 14, gap: 12 },
  cardTitle: { ...typo.section, color: colors.navy },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  muted: { ...typo.caption, color: colors.muted2 },
  dishEdit: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  remove: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.dangerBg, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  dish: { gap: 8, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  dishName: { ...typo.bodyStrong, color: colors.text },
  dishOut: { textDecorationLine: 'line-through', color: colors.muted2 },
  picker: { gap: 10, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  pickerTitle: { ...typo.smallStrong, color: colors.navy },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%', minHeight: 36, paddingHorizontal: 12, borderRadius: radii.pill, backgroundColor: colors.primarySoft },
  suggestionText: { ...typo.smallStrong, color: colors.primary, flexShrink: 1 },
  levels: { flexDirection: 'row', gap: 6 },
  level: { flex: 1, minHeight: 34, borderRadius: radii.sm, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  levelText: { ...typo.captionStrong, color: colors.muted2 },
});
