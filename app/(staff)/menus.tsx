import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/states';
import { Field, PrimaryButton, Segmented, TextButton } from '@/components/ui';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useCampus } from '@/context/CampusContext';
import { currentMeal, hmLabel, MEAL_LABEL, staffApi, type DishDto, type DishInput, type DishStatus, type Meal, type PublicRestoDto, type StaffRestoDto } from '@/features/restos/api';
import { ApiError } from '@/lib/api';
import { haptics } from '@/lib/haptics';
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
  const [restoId, setRestoId] = useState<string | null>(null);
  const meal = currentMeal(useNow(), day?.restos ?? []);
  const [shown, setShown] = useState<Meal | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      staffApi.restos().then((r) => setMine(r.items.filter((x) => x.status === 'active')), () => setMine((m) => m ?? []));
      refresh();
    }, [refresh]),
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
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pull} />}>
          <Text style={styles.h1}>Menus du jour</Text>
          <View style={[styles.now, meal.live && styles.nowLive]}>
            <Ionicons name={meal.live ? 'restaurant' : 'time-outline'} size={16} color={meal.live ? colors.successText : colors.muted2} />
            <Text style={[styles.nowText, meal.live && { color: colors.successText }]}>
              {meal.label} · {meal.status}
            </Text>
          </View>

          {!mine && <ActivityIndicator color={colors.primary} />}
          {mine?.length === 0 && <EmptyState icon="restaurant-outline" title="Aucun restaurant" text="Le super administrateur t’attribue tes restaurants depuis son espace Équipe." />}
          {mine && mine.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {mine.map((r) => {
                const on = r.id === current?.id;
                return (
                  <Pressable key={r.id} onPress={() => setRestoId(r.id)} style={[styles.chip, on && styles.chipOn]} accessibilityRole="tab" accessibilityState={{ selected: on }}>
                    <Text style={[styles.chipText, on && { color: '#fff' }]}>{r.name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {current && day && (
            <>
              <Segmented
                options={(['lunch', 'dinner'] as const).map((x) => ({ value: x, label: `${MEAL_LABEL[x]} · ${hmLabel(current.services[x].start)}` }))}
                value={m}
                onChange={setShown}
              />
              <MealCard key={`${current.id}-${m}-${resto?.menus[m]?.updatedAt ?? 'none'}`} resto={current} menu={resto?.menus[m] ?? null} meal={m} date={day.date} onChanged={refresh} />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** One meal of one restaurant: compose and publish it, or (published) the stock level of each dish. */
function MealCard({ resto, menu, meal, date, onChanged }: { resto: StaffRestoDto; menu: PublicRestoDto['menus'][Meal]; meal: Meal; date: string; onChanged: () => Promise<void> }) {
  const [editing, setEditing] = useState(!menu);
  const [dishes, setDishes] = useState<DishInput[]>(() => (menu?.dishes.length ? menu.dishes.map((d) => ({ id: d.id, name: d.name, detail: d.detail })) : [{ name: '', detail: '' }]));
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
          <View key={i} style={styles.dishEdit}>
            <View style={{ flex: 1, gap: 6 }}>
              <Field placeholder={`Plat ${i + 1} (ex. Thiébou dieun)`} value={d.name} onChangeText={(v) => set(i, { name: v })} maxLength={60} autoCapitalize="sentences" />
              <Field placeholder="Détail (facultatif) : riz au poisson" value={d.detail ?? ''} onChangeText={(v) => set(i, { detail: v })} maxLength={80} autoCapitalize="sentences" />
            </View>
            {dishes.length > 1 && (
              <Pressable onPress={() => setDishes((list) => list.filter((_, j) => j !== i))} hitSlop={8} style={styles.remove} accessibilityRole="button" accessibilityLabel={`Retirer le plat ${i + 1}`}>
                <Ionicons name="trash-outline" size={18} color={colors.dangerText} />
              </Pressable>
            )}
          </View>
        ))}
        {dishes.length < 12 && <TextButton label="Ajouter un plat" icon="add-circle-outline" onPress={() => setDishes((list) => [...list, { name: '', detail: '' }])} />}
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
  h1: { ...typo.h2, color: colors.navy },
  now: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radii.md, backgroundColor: colors.card, alignSelf: 'flex-start' },
  nowLive: { backgroundColor: colors.successBg },
  nowText: { ...typo.smallStrong, color: colors.muted2 },
  chips: { gap: 8 },
  chip: { paddingHorizontal: 14, minHeight: 36, borderRadius: radii.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typo.smallStrong, color: colors.navy },
  card: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 14, gap: 12 },
  cardTitle: { ...typo.section, color: colors.navy },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  muted: { ...typo.caption, color: colors.muted2 },
  dishEdit: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  remove: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.dangerBg, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  dish: { gap: 8, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  dishName: { ...typo.bodyStrong, color: colors.text },
  dishOut: { textDecorationLine: 'line-through', color: colors.muted },
  levels: { flexDirection: 'row', gap: 6 },
  level: { flex: 1, minHeight: 34, borderRadius: radii.sm, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  levelText: { ...typo.captionStrong, color: colors.muted2 },
});
