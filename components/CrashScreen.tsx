import * as SplashScreen from 'expo-splash-screen';
import type { ErrorBoundaryProps } from 'expo-router';
import { useEffect } from 'react';
import { Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

/**
 * What the app shows instead of closing when a screen throws (the root layout's ErrorBoundary): a message, the error
 * itself (to send to the team: it says what broke), and « Réessayer ». Plain React Native only, so it still draws when
 * a provider is what failed.
 */
export function CrashScreen({ error, retry }: ErrorBoundaryProps) {
  // The splash may still be up when it happens: take it down, or the error would stay hidden behind it.
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);
  const details = [error?.name, error?.message].filter(Boolean).join(': ') + (error?.stack ? `\n\n${error.stack.split('\n').slice(0, 12).join('\n')}` : '');

  return (
    <View style={styles.safe}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>Oups, un écran a planté</Text>
        <Text style={styles.text}>Réessaie. Si ça recommence, envoie le détail ci-dessous à l’équipe UGB Connect : il dit ce qui a cassé.</Text>
        <View style={styles.box}>
          <Text style={styles.code} selectable>
            {details || 'Erreur inconnue'}
          </Text>
        </View>
        <Pressable style={styles.primary} onPress={() => retry()} accessibilityRole="button">
          <Text style={styles.primaryText}>Réessayer</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={() => Share.share({ message: `UGB Connect · ${Platform.OS} ${Platform.Version}\n${details}` }).catch(() => {})} accessibilityRole="button">
          <Text style={styles.secondaryText}>Envoyer le détail</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F7FB' },
  body: { padding: 24, paddingTop: 72, gap: 14 },
  title: { fontSize: 22, fontWeight: '800', color: '#0F1B4C' },
  text: { fontSize: 14, lineHeight: 20, color: '#5B6478' },
  box: { padding: 12, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E3E7EF' },
  code: { fontSize: 11, lineHeight: 15, color: '#C23A4A', fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) },
  primary: { minHeight: 50, borderRadius: 25, backgroundColor: '#0F1B4C', alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  secondary: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 14, fontWeight: '700', color: '#0F1B4C' },
});
