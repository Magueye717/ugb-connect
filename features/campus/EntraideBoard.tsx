import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, typo } from '@/constants/theme';
import { HousingBoard } from '@/features/housing/HousingBoard';
import { LostBoard } from '@/features/lost/LostBoard';
import { haptics } from '@/lib/haptics';

type Part = 'objets' | 'logement';
const PARTS: { key: Part; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'objets', label: 'Objets perdus', icon: 'search-outline' },
  { key: 'logement', label: 'Logement', icon: 'bed-outline' },
];

/**
 * Campus → Entraide: what students post for each other (each with a private chat and « Trouvé ! »): lost and found,
 * housing. A switch at the top; both boards stay alive once opened (their filters and scroll kept). ?vue=objets or
 * ?vue=logement (links, notifications) open the right one.
 */
export function EntraideBoard() {
  const { vue, n } = useLocalSearchParams<{ vue?: string; n?: string }>();
  const asked: Part | null = vue === 'logement' ? 'logement' : vue === 'objets' ? 'objets' : null;
  const [part, setPart] = useState<Part>(asked ?? 'objets');
  const [opened, setOpened] = useState<Part[]>([part]);
  const show = (p: Part) => {
    setPart(p);
    if (!opened.includes(p)) setOpened([...opened, p]);
  };
  // A new link (another ?vue=, or the same one from a new notification) switches (state adjusted during render).
  const link = `${vue ?? ''}|${n ?? ''}`;
  const [seen, setSeen] = useState(link);
  if (link !== seen) {
    setSeen(link);
    if (asked) show(asked);
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.switchWrap}>
        <View style={styles.switch} accessibilityRole="tablist">
          {PARTS.map((p) => {
            const on = p.key === part;
            return (
              <Pressable
                key={p.key}
                onPress={() => {
                  if (on) return;
                  haptics.select();
                  show(p.key);
                }}
                style={[styles.item, on && styles.itemOn]}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}>
                <Ionicons name={p.icon} size={15} color={on ? '#fff' : colors.navy} />
                <Text style={[styles.text, on && styles.textOn]}>{p.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      {opened.includes('objets') && (
        <View style={[styles.page, part !== 'objets' && styles.hidden]}>
          <LostBoard />
        </View>
      )}
      {opened.includes('logement') && (
        <View style={[styles.page, part !== 'logement' && styles.hidden]}>
          <HousingBoard />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  switchWrap: { paddingHorizontal: 20, paddingTop: 12 },
  switch: { flexDirection: 'row', padding: 4, borderRadius: radii.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  item: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 36, borderRadius: radii.pill },
  itemOn: { backgroundColor: colors.primary },
  text: { ...typo.smallStrong, color: colors.navy },
  textOn: { color: '#fff' },
  page: { flex: 1 },
  hidden: { display: 'none' },
});
