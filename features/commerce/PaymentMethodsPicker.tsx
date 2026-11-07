import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Chip } from '@/components/ui';
import { colors, radii, typo } from '@/constants/theme';
import type { CommerceReference, OrderMethod } from './api';

const ONLINE: OrderMethod[] = ['wave', 'orange_money'];

/**
 * How students may pay a business. Wave and Orange Money only once the team has verified it (`online`): until then,
 * greyed out with what to do. Cash stays available.
 */
export function PaymentMethodsPicker({
  options,
  value,
  onChange,
  online,
}: {
  options: CommerceReference['paymentMethods'];
  value: OrderMethod[];
  onChange: (v: OrderMethod[]) => void;
  online: boolean;
}) {
  const toggle = (m: OrderMethod) => {
    const next = value.includes(m) ? value.filter((x) => x !== m) : [...value, m];
    // At least one.
    if (next.length) onChange(next);
  };
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.row}>
        {options.map((m) => {
          const locked = !online && ONLINE.includes(m.value);
          return (
            <Chip
              key={m.value}
              label={m.label}
              selected={!locked && value.includes(m.value)}
              onPress={() => toggle(m.value)}
              disabled={locked}
              role="checkbox"
              icon={locked ? 'lock-closed-outline' : m.value === 'cash' ? 'cash-outline' : 'phone-portrait-outline'}
            />
          );
        })}
      </View>
      {!online && (
        <View style={styles.notice}>
          <Ionicons name="shield-checkmark-outline" size={18} color={colors.muted2} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.noticeText}>
              Pour recevoir les paiements par Wave ou Orange Money, contacte l’équipe UGB Connect : elle vérifie ta boutique, puis les active. En attendant, tes clients paient en espèces.
            </Text>
            <Pressable onPress={() => router.push('/aide')} hitSlop={6} accessibilityRole="link">
              <Text style={styles.link}>Contacter l’équipe →</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  notice: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 12, borderRadius: radii.md, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  noticeText: { ...typo.small, color: colors.muted2, lineHeight: 19 },
  link: { ...typo.smallStrong, color: colors.primary },
});
