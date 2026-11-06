import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, shadow, typo } from '@/constants/theme';
import { commerceApi, type BusinessKind, type InterestDto } from './api';

/** "à l'instant", "il y a 2 h", "il y a 3 j". */
const ago = (iso: string) => {
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (min < 2) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `il y a ${h} h` : `il y a ${Math.round(h / 24)} j`;
};

/**
 * The shop's side of « Intéressé »: students who want an article done on the spot (printing, repairs…), newest first
 * (30 days), each with a button to call them back. Hidden when nobody is waiting.
 */
export function InterestsCard({ target }: { target: { orgId: string; kind: BusinessKind } }) {
  const [items, setItems] = useState<InterestDto[]>([]);
  const [all, setAll] = useState(false);
  const { orgId, kind } = target;
  useFocusEffect(
    useCallback(() => {
      commerceApi.interests({ orgId, kind }).then((r) => setItems(r.items), () => undefined);
    }, [orgId, kind]),
  );
  if (!items.length) return null;
  const shown = all ? items : items.slice(0, 3);

  return (
    <View style={[styles.card, shadow.card]}>
      <View style={styles.head}>
        <Ionicons name="hand-left-outline" size={18} color={colors.primary} />
        <Text style={[styles.title, { flex: 1 }]}>Intéressés · {items.length}</Text>
      </View>
      <Text style={styles.muted}>Ils veulent un article sur place : rappelle-les pour convenir du rendez-vous.</Text>
      {shown.map((x) => (
        <View key={x.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>
              {x.student.name}
            </Text>
            <Text style={styles.muted} numberOfLines={1}>
              {x.item.name} · {ago(x.at)}
            </Text>
          </View>
          {!!x.student.phone && (
            <Pressable
              onPress={() => Linking.openURL(`tel:+221${x.student.phone.replace(/\D/g, '')}`)}
              style={styles.call}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`Appeler ${x.student.name}, ${x.student.phone}`}>
              <Ionicons name="call" size={15} color="#fff" />
              <Text style={styles.callText}>Appeler</Text>
            </Pressable>
          )}
        </View>
      ))}
      {items.length > 3 && (
        <Pressable onPress={() => setAll((v) => !v)} hitSlop={6} accessibilityRole="button">
          <Text style={styles.more}>{all ? 'Voir moins' : `Voir les ${items.length}`}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 14, gap: 10, borderWidth: 1.5, borderColor: colors.primarySoft },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { ...typo.title, color: colors.navy },
  muted: { ...typo.caption, color: colors.muted2, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  name: { ...typo.bodyStrong, color: colors.navy },
  call: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, minHeight: 34, borderRadius: radii.pill, backgroundColor: colors.success },
  callText: { ...typo.label, color: '#fff', fontWeight: '700' },
  more: { ...typo.smallStrong, color: colors.primary, textAlign: 'center' },
});
