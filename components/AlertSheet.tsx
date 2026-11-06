import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PdfView } from '@/components/PdfView';
import { PhotoGallery } from '@/components/PhotoGallery';
import { formatDateTime } from '@/constants/data';
import { colors, radii, shadow, typo } from '@/constants/theme';
import type { AlertDto } from '@/features/restos/api';
import { documentMeta } from '@/lib/fileSize';

type Props = { alert: AlertDto; visible: boolean; onClose: () => void };

/**
 * « S’imprégner »: an "À la une" announcement in a popup that scrolls. Its photos (tap to zoom) or its PDF, page
 * by page, first; then the whole text. The PDF can still be opened on its own (to download or share it).
 */
export function AlertSheet({ alert: a, visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [zoom, setZoom] = useState<number | null>(null);
  const urgent = a.tone === 'danger';

  const openPdf = () => a.attachment && WebBrowser.openBrowserAsync(a.attachment.url);
  const goTo = () => {
    onClose();
    router.push(a.href as never);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Fermer" />
        <View style={[styles.sheet, { maxHeight: height * 0.92, paddingBottom: insets.bottom }]}>
          <View style={styles.grip} />
          <View style={styles.head}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[styles.tag, urgent && { color: colors.dangerText }]}>{(a.tag ?? 'Info').toUpperCase()}</Text>
              <Text style={styles.title}>{a.title}</Text>
            </View>
            <Pressable onPress={onClose} style={styles.close} hitSlop={8} accessibilityRole="button" accessibilityLabel="Fermer">
              <Ionicons name="close" size={20} color={colors.navy} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {a.images.length > 0 && (
              <View style={{ gap: 10 }}>
                {a.images.map((uri, i) => (
                  <DocumentPhoto key={uri} uri={uri} width={width - 40} label={`Agrandir la photo ${i + 1}`} onPress={() => setZoom(i)} />
                ))}
              </View>
            )}

            {a.attachment && <PdfView url={a.attachment.url} />}

            {a.eventAt && (
              <View style={styles.when}>
                <Ionicons name="calendar-outline" size={14} color={colors.muted2} />
                <Text style={styles.whenText}>{formatDateTime(Date.parse(a.eventAt))}</Text>
              </View>
            )}
            {!!a.body && <Text style={styles.summary}>{a.body}</Text>}
            {!!a.details && <Text style={styles.details}>{a.details}</Text>}

            {a.attachment && (
              <Pressable style={[styles.pdf, shadow.card]} onPress={openPdf} accessibilityRole="button" accessibilityLabel={`Ouvrir le document ${a.attachment.label}`}>
                <View style={styles.pdfIcon}>
                  <Ionicons name="document-text" size={22} color={colors.dangerText} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pdfName} numberOfLines={2}>
                    {a.attachment.label}
                  </Text>
                  <Text style={styles.pdfSize}>{documentMeta(a.attachment)} · Ouvrir</Text>
                </View>
                <Ionicons name="open-outline" size={18} color={colors.primary} />
              </Pressable>
            )}
            {a.href && (
              <Pressable onPress={goTo} style={styles.more} accessibilityRole="link">
                <Text style={styles.moreText}>Voir dans l’app →</Text>
              </Pressable>
            )}
          </ScrollView>
        </View>
        <PhotoGallery photos={a.images} start={zoom} title={a.title} onClose={() => setZoom(null)} />
      </View>
    </Modal>
  );
}

/**
 * A photo shown like a page of the PDF: the whole width, its own proportions (a poster stays tall, nothing cut or
 * boxed), a white sheet with a light shadow. Tap: full screen, to zoom.
 */
function DocumentPhoto({ uri, width, label, onPress }: { uri: string; width: number; label: string; onPress: () => void }) {
  // Height over width, known once the picture loads; a page-like 4:3 until then.
  const [ratio, setRatio] = useState(0.75);
  return (
    // The shadow on the outside, the rounded clip inside (iOS drops a shadow on a view that clips).
    <Pressable onPress={onPress} accessibilityRole="imagebutton" accessibilityLabel={label} style={[styles.pageShadow, shadow.card]}>
      <View style={styles.page}>
      <Image
        source={{ uri }}
        style={{ width, height: Math.round(width * ratio) }}
        contentFit="contain"
        transition={200}
        onLoad={(e) => e.source.width > 0 && setRatio(Math.min(e.source.height / e.source.width, 3))}
      />
      </View>
      <View style={styles.zoomHint}>
        <Ionicons name="expand-outline" size={13} color="#fff" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10,16,40,0.45)' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg },
  grip: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginTop: 8 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 10 },
  tag: { ...typo.label, color: colors.muted2 },
  title: { ...typo.h3, color: colors.navy },
  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24, gap: 14 },
  pageShadow: { borderRadius: 8, backgroundColor: '#fff' },
  page: { borderRadius: 8, overflow: 'hidden' },
  zoomHint: { position: 'absolute', right: 10, bottom: 10, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(10,16,40,0.6)', alignItems: 'center', justifyContent: 'center' },
  when: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  whenText: { ...typo.small, color: colors.muted2 },
  summary: { ...typo.bodyStrong, color: colors.text, lineHeight: 22 },
  details: { ...typo.body, color: colors.text, lineHeight: 23 },
  pdf: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radii.md, backgroundColor: colors.card },
  pdfIcon: { width: 40, height: 40, borderRadius: radii.sm, backgroundColor: colors.dangerBg, alignItems: 'center', justifyContent: 'center' },
  pdfName: { ...typo.bodyStrong, color: colors.navy },
  pdfSize: { ...typo.caption, color: colors.muted2, marginTop: 2 },
  more: { alignSelf: 'center', paddingVertical: 8 },
  moreText: { ...typo.smallStrong, color: colors.primary },
});
