import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Field, FilterChips } from '@/components/ui';
import { colors, radii, typo } from '@/constants/theme';
import { PLACE_CATEGORIES, placeIcon, placeTone, usePlaces, type PlaceCategory } from '@/features/places/api';
import { matches } from '@/lib/search';

type Filter = 'Tout' | PlaceCategory;
// A few rows at first: the list of campus places is long (70+).
const FIRST = 6;
// With no search: the main place of each kind first (BU, restaurant, a village…), the rest behind « Voir tous ».
const USUAL: PlaceCategory[] = ['Études', 'Restauration', 'Logement', 'Administration', 'Santé', 'Sport', 'Services', 'Transport', 'Culte'];

/**
 * "Où l'as-tu trouvé ?": search the campus places (the Lieux tab) or filter them by category, or « Autre » to type it
 * ("Arrêt de bus du Village B"). Once chosen, the place shows as one card with « Changer ».
 * `value` is the place's name or the text typed; null until chosen.
 */
export function PlacePicker({ value, onChange }: { value: string | null; onChange: (where: string | null) => void }) {
  const places = usePlaces().places ?? [];
  // « Autre » when chosen, or when the value isn't a known place (once the places are loaded).
  const [otherPicked, setOther] = useState<boolean | null>(null);
  const other = otherPicked ?? (!!value && places.length > 0 && !places.some((p) => p.name === value));
  const [typed, setText] = useState<string | null>(null);
  const text = typed ?? (other ? (value ?? '') : '');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('Tout');
  const [all, setAll] = useState(false);

  const chosen = !other ? places.find((p) => p.name === value) : undefined;
  if (chosen) {
    const tone = placeTone(chosen.category);
    return (
      <View style={[styles.picked, { borderColor: tone.tint }]}>
        <View style={[styles.icon, { backgroundColor: tone.bg }]}>
          <Ionicons name={placeIcon(chosen.icon)} size={18} color={tone.tint} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>
            {chosen.name}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {[chosen.category, chosen.area].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <Pressable onPress={() => onChange(null)} hitSlop={8} style={styles.change} accessibilityRole="button" accessibilityLabel="Changer de lieu">
          <Text style={styles.changeText}>Changer</Text>
        </Pressable>
      </View>
    );
  }

  const filters: Filter[] = ['Tout', ...PLACE_CATEGORIES.filter((c) => places.some((p) => p.category === c))];
  const found = places.filter((p) => (filter === 'Tout' || p.category === filter) && matches(q, [p.name, p.area, p.category]));
  const usual = USUAL.map((c) => found.find((p) => p.category === c)).filter((p) => !!p);
  const shown = all || q ? found : filter === 'Tout' ? usual.slice(0, FIRST) : found.slice(0, FIRST);
  const pickOther = () => {
    setOther(true);
    onChange(text.trim() || null);
  };

  return (
    <View style={{ gap: 10 }}>
      {!other && (
        <>
          <Field icon="search" placeholder="Chercher : BU, Village H, Amphi A…" value={q} onChangeText={setQ} autoCorrect={false} returnKeyType="search" />
          <FilterChips
            options={filters}
            value={filter}
            onChange={(f) => {
              setFilter(f);
              setAll(false);
            }}
          />
          <View style={styles.list}>
            {shown.map((p, i) => {
              const tone = placeTone(p.category);
              return (
                <Pressable
                  key={p.id}
                  onPress={() => onChange(p.name)}
                  style={({ pressed }) => [styles.row, i > 0 && styles.rowLine, pressed && { backgroundColor: colors.bg }]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: false }}>
                  <View style={[styles.icon, { backgroundColor: tone.bg }]}>
                    <Ionicons name={placeIcon(p.icon)} size={16} color={tone.tint} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>
                      {p.name}
                    </Text>
                    {!!p.area && (
                      <Text style={styles.sub} numberOfLines={1}>
                        {p.area}
                      </Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.muted2} />
                </Pressable>
              );
            })}
            {!shown.length && <Text style={styles.none}>Aucun lieu ne correspond. Choisis « Autre » pour l’écrire.</Text>}
          </View>
          {!all && !q && found.length > FIRST && (
            <Pressable onPress={() => setAll(true)} style={styles.more} accessibilityRole="button">
              <Text style={styles.moreText}>{filter === 'Tout' ? `Voir tous les lieux (${found.length})` : `Voir les ${found.length - FIRST} autres`}</Text>
              <Ionicons name="chevron-down" size={16} color={colors.primary} />
            </Pressable>
          )}
        </>
      )}

      <Pressable
        onPress={
          other
            ? () => {
                setOther(false);
                onChange(null);
              }
            : pickOther
        }
        style={[styles.otherBtn, other && styles.otherOn]}
        accessibilityRole="button">
        <Ionicons name={other ? 'list-outline' : 'create-outline'} size={16} color={colors.primary} />
        <Text style={styles.moreText}>{other ? 'Choisir dans la liste des lieux' : 'Pas dans la liste ? Autre lieu'}</Text>
      </Pressable>
      {other && (
        <Field
          icon="location-outline"
          placeholder="Où exactement ? Ex. Arrêt de bus du Village B"
          value={text}
          onChangeText={(v) => {
            setText(v);
            onChange(v.trim() || null);
          }}
          autoFocus
          autoCapitalize="sentences"
          maxLength={40}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { borderRadius: radii.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  icon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  name: { ...typo.bodyStrong, color: colors.navy },
  sub: { ...typo.small, color: colors.muted2, marginTop: 1 },
  none: { ...typo.small, color: colors.muted2, padding: 14, textAlign: 'center' },
  more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 40 },
  moreText: { ...typo.smallStrong, color: colors.primary },
  otherBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 42, borderRadius: radii.pill, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary },
  otherOn: { borderStyle: 'solid', backgroundColor: colors.primarySoft },
  picked: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radii.lg, borderWidth: 1.5, backgroundColor: colors.card },
  change: { paddingHorizontal: 12, height: 32, borderRadius: radii.pill, backgroundColor: colors.primarySoft, justifyContent: 'center' },
  changeText: { ...typo.smallStrong, color: colors.primary },
});
