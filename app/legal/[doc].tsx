import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorState } from '@/components/states';
import { BackButton, TextButton } from '@/components/ui';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { legalApi, legalHref, type LegalDoc, type LegalDocument } from '@/features/legal/api';

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
/** "4 novembre 2026". */
const dayLabel = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${d === 1 ? '1er' : d} ${MONTHS[(m ?? 1) - 1]} ${y}`;
};

/**
 * « Conditions d’utilisation » and « Politique de confidentialité », the text from the backend. Opened from the welcome
 * screen, the sign-up and the profile, signed in or not. From one, a link to the other.
 */
export default function Legal() {
  const params = useLocalSearchParams<{ doc: string }>();
  const doc: LegalDoc = params.doc === 'confidentialite' ? 'confidentialite' : 'conditions';
  const [data, setData] = useState<LegalDocument | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => legalApi.get(doc).then(setData, () => setFailed(true)), [doc]);
  useEffect(() => {
    load();
  }, [load]);
  const retry = () => {
    setFailed(false);
    load();
  };
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const other: LegalDoc = doc === 'conditions' ? 'confidentialite' : 'conditions';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.head}>
        <BackButton onPress={back} />
        <Text style={styles.h1} numberOfLines={1}>
          {data?.title ?? (doc === 'conditions' ? 'Conditions d’utilisation' : 'Confidentialité')}
        </Text>
      </View>
      {!data ? (
        failed ? (
          <View style={{ padding: 20 }}>
            <ErrorState onRetry={retry} />
          </View>
        ) : (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        )
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Text style={styles.meta}>Mise à jour le {dayLabel(data.updatedAt)} · version {data.version}</Text>
          {data.sections.map((s, i) => (
            <View key={s.title} style={[styles.card, shadow.card]}>
              <Text style={styles.title} accessibilityRole="header">
                {i + 1}. {s.title}
              </Text>
              {s.paragraphs.map((p, j) => (
                <Text key={j} style={styles.p}>
                  {p}
                </Text>
              ))}
            </View>
          ))}
          <TextButton
            label={other === 'conditions' ? 'Lire les conditions d’utilisation' : 'Lire la politique de confidentialité'}
            icon="document-text-outline"
            style={{ alignSelf: 'center' }}
            onPress={() => router.replace(legalHref(other))}
          />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 8 },
  h1: { ...typo.h3, color: colors.navy, flex: 1 },
  body: { padding: 20, gap: 12, paddingBottom: 40 },
  meta: { ...typo.caption, color: colors.muted2 },
  card: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 16, gap: 8 },
  title: { ...typo.title, color: colors.navy },
  p: { ...typo.body, color: colors.text, lineHeight: 21 },
});
