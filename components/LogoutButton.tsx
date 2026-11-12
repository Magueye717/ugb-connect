import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, shadow, typo } from '@/constants/theme';
import { API_URL } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { confirmAction } from '@/lib/notice';

/**
 * « Se déconnecter », the same in every space (student, organizer, restaurant or shop, the team's spaces): a row in
 * its own card at the bottom of the account screen, asking first (a wrong tap would close every space on this phone).
 * `note`: what the person stops receiving here, said in the question.
 */
export function LogoutButton({ note }: { note?: string }) {
  const { logout } = useAuth();
  const ask = () =>
    confirmAction({
      title: 'Se déconnecter ?',
      bullets: [...(note ? [note] : []), 'Tu pourras te reconnecter à tout moment avec ton numéro'],
      confirm: 'Se déconnecter',
      keep: 'Rester connecté',
      onConfirm: logout,
    });
  return (
    <View style={{ gap: 10 }}>
    <View style={[styles.group, shadow.card]}>
      <Pressable onPress={ask} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.dangerBg }]} accessibilityRole="button" accessibilityLabel="Se déconnecter">
        <View style={styles.icon}>
          <Ionicons name="log-out-outline" size={18} color={colors.dangerText} />
        </View>
        <Text style={styles.label}>Se déconnecter</Text>
      </Pressable>
    </View>
    <Text style={styles.version} selectable>
      {buildLine()}
    </Text>
    </View>
  );
}

/**
 * « Version 1.0.0 · serveur de test (staging-api.ugbconnect.com) »: which build this phone runs and which server it
 * talks to — the server is fixed in each build, so two phones on different builds can be on different databases.
 */
function buildLine() {
  const host = API_URL.replace(/^https?:\/\//, '').split('/')[0] ?? '';
  const server = /staging/i.test(host) ? 'serveur de test' : /^(localhost|\d+\.\d+\.\d+\.\d+)(:\d+)?$/.test(host) ? 'serveur local' : 'serveur principal';
  return `Version ${Constants.expoConfig?.version ?? '?'} · ${server} (${host})`;
}

const styles = StyleSheet.create({
  group: { backgroundColor: colors.card, borderRadius: radii.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 56 },
  icon: { width: 34, height: 34, borderRadius: radii.sm, backgroundColor: colors.dangerBg, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.dangerText },
  version: { ...typo.caption, color: colors.muted2, textAlign: 'center' },
});
