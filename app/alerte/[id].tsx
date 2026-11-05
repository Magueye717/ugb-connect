import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PhotoGallery } from '@/components/PhotoGallery';
import { EmptyState } from '@/components/states';
import { BackButton, PrimaryButton } from '@/components/ui';
import { formatDateTime } from '@/constants/data';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useCampus } from '@/context/CampusContext';
import { restosApi, type AlertDto } from '@/features/restos/api';
import { ApiError } from '@/lib/api';
import { fileSize } from '@/lib/fileSize';

/**
 * An "À la une" announcement in full: its picture (a poster, a timetable: tap to zoom), the whole text and its PDF
 * (the official notice, a form). From the home screen it's already loaded; from a push, it's fetched.
 */
export default function AlertePage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { alerts } = useCampus();
  const known = alerts.find((a) => a.id === id) ?? null;
  const [fetched, setFetched] = useState<AlertDto | null>(null);
  const [gone, setGone] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [opening, setOpening] = useState(false);
  const { width } = useWindowDimensions();
  const a = known ?? fetched;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));

  useEffect(() => {
    if (known || !id) return;
    restosApi.alert(id).then(setFetched, (err) => err instanceof ApiError && err.status === 404 && setGone(true));
  }, [id, known]);

  const openPdf = async () => {
    if (!a?.attachment) return;
    setOpening(true);
    try {
      await WebBrowser.openBrowserAsync(a.attachment.url);
    } finally {
      setOpening(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.head}>
        <BackButton onPress={back} />
        <Text style={styles.h1}>À la une</Text>
        <View style={{ width: 44 }} />
      </View>
      {!a ? (
        gone ? (
          <EmptyState icon="newspaper-outline" title="Annonce terminée" text="Elle n’est plus en ligne." />
        ) : (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        )
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {a.image && (
            <Pressable onPress={() => setZoom(true)} accessibilityRole="button" accessibilityLabel="Agrandir l’image">
              <Image source={{ uri: a.image }} style={[styles.image, { height: Math.round((width - 40) * 0.62) }]} contentFit="cover" transition={200} />
              <View style={styles.zoomHint}>
                <Ionicons name="expand-outline" size={13} color="#fff" />
              </View>
            </Pressable>
          )}
          <View style={styles.meta}>
            {!!a.tag && (
              <View style={[styles.tag, a.tone === 'danger' && { backgroundColor: colors.dangerBg }]}>
                <Text style={[styles.tagText, a.tone === 'danger' && { color: colors.dangerText }]}>{a.tag.toUpperCase()}</Text>
              </View>
            )}
            {a.eventAt && (
              <View style={styles.when}>
                <Ionicons name="calendar-outline" size={14} color={colors.muted2} />
                <Text style={styles.whenText}>{formatDateTime(Date.parse(a.eventAt))}</Text>
              </View>
            )}
          </View>
          <Text style={styles.title}>{a.title}</Text>
          {!!a.body && <Text style={styles.summary}>{a.body}</Text>}
          {!!a.details && <Text style={styles.details}>{a.details}</Text>}
          {a.attachment && (
            <View style={[styles.pdf, shadow.card]}>
              <View style={styles.pdfIcon}>
                <Ionicons name="document-text" size={24} color={colors.dangerText} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.pdfName} numberOfLines={2}>
                  {a.attachment.name}
                </Text>
                <Text style={styles.pdfSize}>PDF · {fileSize(a.attachment.bytes)}</Text>
              </View>
            </View>
          )}
          {a.attachment && <PrimaryButton label="Ouvrir le document" onPress={openPdf} loading={opening} />}
          {a.href && (
            <Pressable onPress={() => router.push(a.href as never)} style={styles.more} accessibilityRole="link">
              <Text style={styles.moreText}>Voir dans l’app →</Text>
            </Pressable>
          )}
        </ScrollView>
      )}
      <PhotoGallery photos={a?.image ? [a.image] : []} start={zoom ? 0 : null} title={a?.title ?? ''} onClose={() => setZoom(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 },
  h1: { ...typo.h3, color: colors.navy },
  body: { padding: 20, gap: 14, paddingBottom: 40 },
  image: { width: '100%', borderRadius: radii.lg, backgroundColor: colors.border },
  zoomHint: { position: 'absolute', right: 10, bottom: 10, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(10,16,40,0.6)', alignItems: 'center', justifyContent: 'center' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill, backgroundColor: colors.primarySoft },
  tagText: { ...typo.label, color: colors.primary },
  when: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  whenText: { ...typo.small, color: colors.muted2 },
  title: { ...typo.h2, color: colors.navy },
  summary: { ...typo.bodyStrong, color: colors.text, lineHeight: 22 },
  details: { ...typo.body, color: colors.text, lineHeight: 23 },
  pdf: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radii.lg, backgroundColor: colors.card },
  pdfIcon: { width: 44, height: 44, borderRadius: radii.sm, backgroundColor: colors.dangerBg, alignItems: 'center', justifyContent: 'center' },
  pdfName: { ...typo.bodyStrong, color: colors.navy },
  pdfSize: { ...typo.caption, color: colors.muted2, marginTop: 2 },
  more: { alignSelf: 'center', paddingVertical: 8 },
  moreText: { ...typo.smallStrong, color: colors.primary },
});
