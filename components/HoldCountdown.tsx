import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radii, typo } from '@/constants/theme';
import { useNow } from '@/lib/useNow';

/**
 * How long seats stay held before they go back to others: "Encore 7 min 12 s", live. Orange in the last two minutes,
 * then says they were released. A deadline ("avant 14:32") makes students do the sum; the time left doesn't.
 */
export function HoldCountdown({ until }: { until: string }) {
  const now = useNow(1000);
  const left = Math.max(0, Date.parse(until) - now);
  const min = Math.floor(left / 60_000);
  const sec = Math.floor((left % 60_000) / 1000);
  const ended = left === 0;
  const urgent = !ended && left < 2 * 60_000;
  const tint = ended ? colors.dangerText : urgent ? colors.warningText : colors.primary;
  const label = ended ? 'Délai dépassé : les places sont rendues.' : `Encore ${min > 0 ? `${min} min ` : ''}${String(sec).padStart(min > 0 ? 2 : 1, '0')} s pour payer`;
  return (
    <View style={[styles.pill, { backgroundColor: ended ? colors.dangerBg : urgent ? colors.warningBg : colors.primarySoft }]} accessibilityRole="timer" accessibilityLabel={ended ? label : `Encore ${min} minutes pour payer`}>
      <Ionicons name={ended ? 'alert-circle-outline' : 'time-outline'} size={16} color={tint} />
      <Text style={[styles.text, { color: tint }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.pill },
  text: { ...typo.smallStrong, fontVariant: ['tabular-nums'] },
});
