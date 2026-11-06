import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import type { PaymentMethod } from '@/constants/data';
import { colors, radii } from '@/constants/theme';

/**
 * Official logo when the file is in the project (see `logo` in constants/data.ts), the cash icon for cash (as in the
 * cart), otherwise a badge in the brand color with the initials.
 */
export function PaymentLogo({ method, size = 40 }: { method: Pick<PaymentMethod, 'name' | 'short' | 'bg' | 'logo' | 'icon'>; size?: number }) {
  const box = { width: size, height: size, borderRadius: radii.sm };
  if (method.icon) {
    return (
      <View style={[box, styles.badge, { borderRadius: size / 2, backgroundColor: colors.successBg }]} accessibilityLabel={method.name}>
        <Ionicons name={method.icon} size={size * 0.55} color={colors.successText} />
      </View>
    );
  }
  if (method.logo) {
    // The providers' app icons are round: clipped to a circle (the Wave file has white corners).
    return <Image source={method.logo} style={[box, { borderRadius: size / 2 }]} contentFit="cover" accessibilityLabel={method.name} />;
  }
  return (
    <View style={[box, styles.badge, { backgroundColor: method.bg }]} accessibilityLabel={method.name}>
      <Text style={[styles.text, { fontSize: size * 0.33 }]}>{method.short}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center' },
  text: { color: '#fff', fontWeight: '700' },
});
