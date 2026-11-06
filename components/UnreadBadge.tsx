import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/theme';

/** New messages in a conversation: a red count (9+ above nine), nothing at zero. The same on every chat entry. */
export function UnreadBadge({ count, style }: { count: number; style?: object }) {
  if (count <= 0) return null;
  return (
    <View style={[styles.badge, style]} accessibilityLabel={`${count} nouveau${count > 1 ? 'x' : ''} message${count > 1 ? 's' : ''}`}>
      <Text style={styles.text} maxFontSizeMultiplier={1.2}>
        {count > 9 ? '9+' : count}
      </Text>
    </View>
  );
}

/** "2 nouveaux messages", for a line of text. */
export const unreadLabel = (n: number) => `${n} nouveau${n > 1 ? 'x' : ''} message${n > 1 ? 's' : ''}`;

const styles = StyleSheet.create({
  // The darker red: white numbers stay readable (≥ 4.5:1). Unread counts are red everywhere; orange means « to do ».
  badge: { minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: colors.dangerText, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 11, fontWeight: '800', color: '#fff' },
});
