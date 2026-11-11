import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, shadow, typo } from '@/constants/theme';

/**
 * The door of an event, for whoever runs it: « Scanner les billets » at the entrance, « Valider un paiement » for a
 * request paid in cash. `org`: the organizer (a student's own entity or an organization); `event`: one event only
 * (a ticket for another one is refused), all of them otherwise.
 */
export function DoorActions({ org, event, title }: { org: string; event?: string; title?: string }) {
  const params = { org, ...(event ? { event } : {}), ...(title ? { title } : {}) };
  return (
    <View style={styles.row}>
      <Pressable style={[styles.btn, styles.scan, shadow.card]} onPress={() => router.push({ pathname: '/scanner-billets', params })} accessibilityRole="button">
        <Ionicons name="qr-code-outline" size={22} color="#fff" />
        <Text style={[styles.label, { color: '#fff' }]}>Scanner les billets</Text>
        <Text style={[styles.sub, { color: 'rgba(255,255,255,0.75)' }]}>À l’entrée</Text>
      </Pressable>
      <Pressable style={[styles.btn, styles.pay, shadow.card]} onPress={() => router.push({ pathname: '/valider-paiement', params: { org } })} accessibilityRole="button">
        <Ionicons name="cash-outline" size={22} color={colors.navy} />
        <Text style={styles.label}>Valider un paiement</Text>
        <Text style={styles.sub}>Payé en espèces</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, gap: 4, padding: 14, borderRadius: radii.lg },
  scan: { backgroundColor: colors.navy },
  pay: { backgroundColor: '#FFC46B' },
  label: { ...typo.bodyStrong, color: colors.navy, marginTop: 4 },
  sub: { ...typo.caption, color: colors.navy },
});
