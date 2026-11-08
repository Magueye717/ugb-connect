import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { PrimaryButton, TextButton } from '@/components/ui';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { haptics } from '@/lib/haptics';
import { dismissNotice, subscribeNotice, type Notice, type NoticeTone } from '@/lib/notice';

const TONES: Record<NoticeTone, { icon: keyof typeof Ionicons.glyphMap; fg: string; bg: string }> = {
  success: { icon: 'checkmark-circle', fg: colors.success, bg: colors.successBg },
  pending: { icon: 'time', fg: colors.warning, bg: colors.warningBg },
  info: { icon: 'information-circle', fg: colors.primary, bg: colors.primarySoft },
  warning: { icon: 'alert-circle', fg: colors.dangerText, bg: colors.dangerBg },
};

/** Where `notice()` shows: once, above every screen (root layout). */
export function NoticeHost() {
  const [n, setN] = useState<Notice | null>(null);
  useEffect(
    () =>
      subscribeNotice((next) => {
        // iOS can't open a modal while another one is still closing (the sheet that just saved): it would never show.
        // A moment's wait lets that one go first.
        if (next && Platform.OS === 'ios') setTimeout(() => setN(next), IOS_MODAL_GAP_MS);
        else setN(next);
      }),
    [],
  );
  useEffect(() => {
    if (!n) return;
    if (n.tone === 'success') haptics.success();
    else if (n.tone === 'warning') haptics.warning();
    AccessibilityInfo.announceForAccessibility([n.title, n.message].filter(Boolean).join('. '));
  }, [n]);
  if (!n) return null;
  return <NoticeCard key={n.id} notice={n} />;
}

const IOS_MODAL_GAP_MS = 320;

function NoticeCard({ notice: n }: { notice: Notice }) {
  const { height } = useWindowDimensions();
  const t = TONES[n.tone];
  const close = (then?: () => void) => {
    dismissNotice(n.id);
    then?.();
  };

  return (
    <Modal visible transparent animationType="none" onRequestClose={() => close()} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(160)} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => close()} accessibilityLabel="Fermer" />
        <Animated.View entering={ZoomIn.springify().damping(16).stiffness(220)} style={[styles.card, shadow.raised, { maxHeight: height * 0.86 }]} accessibilityViewIsModal>
          <ScrollView contentContainerStyle={styles.body} bounces={false} showsVerticalScrollIndicator={false}>
            <View style={[styles.halo, { backgroundColor: t.bg }]}>
              <Ionicons name={t.icon} size={40} color={t.fg} />
            </View>
            <Text style={styles.title} accessibilityRole="header">
              {n.title}
            </Text>
            {!!n.message && <Text style={styles.message}>{n.message}</Text>}

            {!!n.steps?.length && (
              <View style={styles.steps}>
                {n.steps.map((s, i) => (
                  <View key={i} style={styles.step}>
                    <View style={[styles.stepDot, i === 0 && { backgroundColor: t.fg }]}>
                      <Text style={[styles.stepNum, i === 0 && { color: '#fff' }]}>{i + 1}</Text>
                    </View>
                    <Text style={[styles.stepText, i === 0 && { color: colors.navy, fontWeight: '700' }]}>{s}</Text>
                  </View>
                ))}
              </View>
            )}
            {!!n.bullets?.length && (
              <View style={styles.bullets}>
                {n.bullets.map((b, i) => (
                  <View key={i} style={styles.bullet}>
                    <View style={[styles.bulletDot, { backgroundColor: t.fg }]} />
                    <Text style={styles.bulletText}>{b}</Text>
                  </View>
                ))}
              </View>
            )}
            {!!n.footnote && (
              <View style={styles.footnote}>
                <Ionicons name="notifications-outline" size={14} color={colors.muted2} />
                <Text style={styles.footnoteText}>{n.footnote}</Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.actions}>
            {n.choices ? (
              n.choices.map((c) =>
                c.tone === 'quiet' ? (
                  <TextButton key={c.label} label={c.label} onPress={() => close(c.onPress)} style={{ alignSelf: 'center' }} />
                ) : (
                  <Pressable
                    key={c.label}
                    onPress={() => close(c.onPress)}
                    style={({ pressed }) => [styles.choice, c.tone === 'danger' ? styles.choiceDanger : styles.choicePrimary, pressed && { opacity: 0.85 }]}
                    accessibilityRole="button">
                    <Text style={styles.choiceText}>{c.label}</Text>
                  </Pressable>
                ),
              )
            ) : (
              <>
                <PrimaryButton label={n.primary?.label ?? 'Compris'} onPress={() => close(n.primary?.onPress)} />
                {n.secondary && <TextButton label={n.secondary.label} onPress={() => close(n.secondary?.onPress)} style={{ alignSelf: 'center' }} />}
              </>
            )}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,27,76,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 420, backgroundColor: colors.card, borderRadius: radii.xl, overflow: 'hidden' },
  body: { alignItems: 'center', gap: 10, paddingHorizontal: 22, paddingTop: 26, paddingBottom: 8 },
  halo: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  title: { ...typo.h3, color: colors.navy, textAlign: 'center' },
  message: { ...typo.body, color: colors.muted2, textAlign: 'center', lineHeight: 21 },
  steps: { alignSelf: 'stretch', gap: 10, marginTop: 6, padding: 14, borderRadius: radii.lg, backgroundColor: colors.bg },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  stepDot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.border },
  stepNum: { ...typo.label, color: colors.muted2 },
  stepText: { ...typo.small, color: colors.muted2, flex: 1, lineHeight: 19 },
  footnote: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  footnoteText: { ...typo.caption, color: colors.muted2, flexShrink: 1, textAlign: 'center' },
  actions: { gap: 8, paddingHorizontal: 22, paddingTop: 12, paddingBottom: 18 },
  bullets: { alignSelf: 'stretch', gap: 8, marginTop: 4, padding: 14, borderRadius: radii.lg, backgroundColor: colors.bg },
  bullet: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  bulletDot: { width: 7, height: 7, borderRadius: 4, marginTop: 6 },
  bulletText: { ...typo.small, color: colors.text, flex: 1, lineHeight: 19 },
  choice: { minHeight: 50, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  choiceDanger: { backgroundColor: colors.dangerText },
  choicePrimary: { backgroundColor: colors.primary },
  choiceText: { ...typo.title, color: '#fff', textAlign: 'center' },
});
