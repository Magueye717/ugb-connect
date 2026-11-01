import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/states';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useCampus } from '@/context/CampusContext';
import { currentMeal, hmLabel, MEAL_LABEL, type DishStatus } from '@/features/restos/api';
import { openDirections } from '@/lib/maps';
import { useNow } from '@/lib/useNow';

/** A dot per dish: green available, amber nearly gone, grey sold out (and struck through). */
const STATUS: Record<DishStatus, { label: string | null; color: string }> = {
  available: { label: null, color: colors.success },
  low: { label: 'Bientôt fini', color: colors.warning },
  out: { label: 'Rupture', color: colors.muted },
};

/**
 * University restaurants: today's menus with stock levels. One meal at a time (the current one first), a compact card
 * per restaurant.
 */
export function RestoUBoard() {
  const { restos: data, refresh } = useCampus();
  const meal = currentMeal(useNow(), data?.restos ?? []);
  const [picked, setPicked] = useState<'lunch' | 'dinner' | null>(null);
  const shown = picked ?? meal.key;
  const [refreshing, setRefreshing] = useState(false);
  const pull = () => {
    setRefreshing(true);
    refresh().finally(() => setRefreshing(false));
  };

  return (
    <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pull} />}>
      <View style={styles.toolbar}>
        <View style={[styles.now, meal.live && styles.nowLive]}>
          <View style={[styles.liveDot, { backgroundColor: meal.live ? colors.success : colors.muted }]} />
          <Text style={[styles.nowText, meal.live && { color: colors.successText }]} numberOfLines={1}>
            {meal.label} · {meal.status}
          </Text>
        </View>
        <View style={styles.switch}>
          {(['lunch', 'dinner'] as const).map((k) => {
            const on = k === shown;
            return (
              <Pressable key={k} onPress={() => setPicked(k)} style={[styles.switchBtn, on && styles.switchOn]} accessibilityRole="tab" accessibilityState={{ selected: on }}>
                <Text style={[styles.switchText, on && styles.switchTextOn]}>{MEAL_LABEL[k]}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {!data && <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />}
      {data?.restos.length === 0 && <EmptyState icon="restaurant-outline" title="Aucun restaurant" text="Les menus des restaurants universitaires apparaîtront ici." />}

      {data?.restos.map((r) => {
        const service = r.services[shown];
        const dishes = r.menus[shown]?.dishes ?? [];
        const left = dishes.filter((d) => d.status !== 'out').length;
        return (
          <View key={r.id} style={[styles.card, shadow.card]}>
            <View style={styles.head}>
              <View style={styles.icon}>
                <Ionicons name="restaurant" size={16} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {r.name}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {[r.location, `${hmLabel(service.start)}-${hmLabel(service.end)}`].filter(Boolean).join(' · ')}
                </Text>
              </View>
              {r.coords && (
                <Pressable style={styles.go} onPress={() => openDirections(r.coords!, r.name)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Itinéraire vers ${r.name}`}>
                  <Ionicons name="navigate" size={14} color={colors.primary} />
                </Pressable>
              )}
              {dishes.length > 0 && (
                <View style={[styles.count, left === 0 && { backgroundColor: colors.bg }]}>
                  <Text style={[styles.countText, left === 0 && { color: colors.muted2 }]}>{left === 0 ? 'Tout épuisé' : `${left} plat${left > 1 ? 's' : ''}`}</Text>
                </View>
              )}
            </View>
            {dishes.length === 0 ? (
              <Text style={styles.empty}>Menu pas encore publié.</Text>
            ) : (
              <View style={styles.dishes}>
                {dishes.map((d, i) => (
                  <View key={d.id} style={[styles.dish, i > 0 && styles.divider]}>
                    <View style={[styles.dot, { backgroundColor: STATUS[d.status].color }]} />
                    <Text style={[styles.dishName, d.status === 'out' && styles.dishOut]} numberOfLines={1}>
                      {d.name}
                      {!!d.detail && <Text style={styles.dishDetail}> · {d.detail}</Text>}
                    </Text>
                    {STATUS[d.status].label && <Text style={[styles.dishStatus, { color: d.status === 'low' ? colors.warningText : colors.muted2 }]}>{STATUS[d.status].label}</Text>}
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}
      {!!data?.restos.length && <Text style={styles.note}>Au ticket, sur présentation de la carte étudiant.</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, paddingTop: 16, gap: 12, paddingBottom: 32 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  now: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 12, borderRadius: radii.pill, backgroundColor: colors.card },
  nowLive: { backgroundColor: colors.successBg },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  nowText: { ...typo.smallStrong, color: colors.muted2, flexShrink: 1 },
  switch: { flexDirection: 'row', padding: 3, borderRadius: radii.pill, backgroundColor: colors.card },
  switchBtn: { height: 34, paddingHorizontal: 14, borderRadius: radii.pill, justifyContent: 'center' },
  switchOn: { backgroundColor: '#111318' },
  switchText: { ...typo.smallStrong, color: colors.muted2 },
  switchTextOn: { color: '#fff' },
  card: { backgroundColor: colors.card, borderRadius: 20, padding: 12, gap: 8, borderWidth: 1, borderColor: '#EEF0F4' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15, fontWeight: '700', color: colors.navy },
  meta: { ...typo.caption, color: colors.muted2, marginTop: 1 },
  go: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  count: { paddingHorizontal: 9, height: 24, borderRadius: radii.pill, backgroundColor: colors.successBg, justifyContent: 'center' },
  countText: { fontSize: 11, fontWeight: '700', color: colors.successText },
  dishes: { borderRadius: 14, backgroundColor: '#F7F8FA', paddingHorizontal: 10 },
  dish: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dishName: { flex: 1, fontSize: 13.5, fontWeight: '600', color: colors.text },
  dishOut: { textDecorationLine: 'line-through', color: colors.muted },
  dishDetail: { fontSize: 12, fontWeight: '400', color: colors.muted2 },
  dishStatus: { fontSize: 11, fontWeight: '700' },
  empty: { ...typo.caption, color: colors.muted2, paddingVertical: 4 },
  note: { ...typo.caption, color: colors.muted2, textAlign: 'center' },
});
