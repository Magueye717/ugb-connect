import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { colors, radii, shadow, typo } from '@/constants/theme';

/** A rounded search field and its black filter button (sorting), as on the restaurants and market lists. */
export function SearchBar({ value, onChange, placeholder, onFilter, filtered }: { value: string; onChange: (v: string) => void; placeholder: string; onFilter?: () => void; filtered?: boolean }) {
  return (
    <View style={styles.row}>
      <View style={[styles.field, shadow.card]}>
        <Ionicons name="search-outline" size={20} color={colors.muted2} />
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          value={value}
          onChangeText={onChange}
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel={placeholder}
        />
        {!!value && (
          <Pressable onPress={() => onChange('')} hitSlop={10} accessibilityLabel="Effacer la recherche">
            <Ionicons name="close-circle" size={18} color={colors.muted} />
          </Pressable>
        )}
      </View>
      {onFilter && (
        <Pressable style={styles.filter} onPress={onFilter} accessibilityRole="button" accessibilityLabel="Trier">
          <Ionicons name="options-outline" size={22} color="#fff" />
          {filtered && <View style={styles.badge} />}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  field: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, height: 52, paddingHorizontal: 16, borderRadius: radii.pill, backgroundColor: colors.card },
  input: { flex: 1, ...typo.body, color: colors.text, paddingVertical: 0 },
  filter: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#111318', alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 12, right: 12, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.accent, borderWidth: 2, borderColor: '#111318' },
});
