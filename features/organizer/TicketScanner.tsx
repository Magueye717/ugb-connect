import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { popIn, riseIn } from '@/components/motion';
import { Field, TextButton } from '@/components/ui';
import { colors, motion, radii, typo } from '@/constants/theme';
import { haptics, scanFeel } from '@/lib/haptics';
import { sounds } from '@/lib/sounds';
import type { ScanResult } from './useTicketCheck';

const TONES = {
  success: { color: colors.success, icon: 'checkmark-circle', feel: () => scanFeel.found(), sound: sounds.success },
  warning: { color: colors.warning, icon: 'alert-circle', feel: () => scanFeel.nothing(), sound: sounds.warning },
  danger: { color: colors.danger, icon: 'close-circle', feel: () => scanFeel.refused(), sound: sounds.error },
} as const;

/**
 * Camera + typed-code fallback + verdict card, on a dark background (used at night, in the bus).
 * The verdict is heard, felt and seen at a glance: a sound, a vibration (Android; iOS mutes haptics while the camera runs)
 * and a green / orange / red flash over the camera, then the card with the details.
 * `onOpenList`: shows a link to the departure's passenger list under the verdict.
 * `active`: false turns the camera off (a tab that isn't on screen), to save battery.
 * `org`: the organization scanning when it isn't the organizer space's (a student's own events): a request's QR opens
 * « Valider un paiement » for it.
 */
export function TicketScanner({
  check,
  onOpenList,
  active = true,
  org,
}: {
  check: (raw: string) => Promise<ScanResult>;
  onOpenList?: (caravanId: string) => void;
  active?: boolean;
  org?: string;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [result, setResult] = useState<ScanResult | null>(null);
  const [code, setCode] = useState('');
  const flash = useSharedValue(0);
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.get() }));

  const [checking, setChecking] = useState(false);
  const [boarding, setBoarding] = useState(false);
  const boardOthers = async () => {
    if (!result?.boardOthers || !result.group || boarding) return;
    setBoarding(true);
    try {
      const others = await result.boardOthers();
      haptics.success();
      setResult({ ...result, group: { ...result.group, others }, boardOthers: undefined });
    } finally {
      setBoarding(false);
    }
  };
  const read = async (raw: string) => {
    if (result || checking || !raw.trim()) return; // the camera keeps firing while the code is in view
    // A request's QR (to pay in cash): validated on its own screen.
    if (/^UGBREQ:/i.test(raw.trim())) {
      haptics.select();
      router.push({ pathname: '/valider-paiement', params: { code: raw.trim().replace(/^UGBREQ:/i, ''), ...(org ? { org } : {}) } });
      return;
    }
    setChecking(true);
    const r = await check(raw).finally(() => setChecking(false));
    TONES[r.tone].feel();
    TONES[r.tone].sound();
    flash.set(withSequence(withTiming(0.55, { duration: motion.fast }), withTiming(0, { duration: motion.slow })));
    setResult(r);
    setCode('');
  };
  const tone = result && TONES[result.tone];

  return (
    <View style={{ gap: 16 }}>
      <View style={styles.camera}>
        {permission?.granted
          ? active && (
              <>
                <CameraView
                  style={StyleSheet.absoluteFill}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={result || checking ? undefined : ({ data }: BarcodeScanningResult) => read(data)}
                />
                <View style={styles.frame} pointerEvents="none" />
              </>
            )
          : permission && (
              <View style={styles.permission}>
                <Ionicons name="camera-outline" size={32} color="#fff" />
                <Text style={styles.permissionText}>La caméra sert à lire le QR code des billets.</Text>
                <Pressable
                  style={styles.permissionBtn}
                  onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())}
                  accessibilityRole="button">
                  <Text style={styles.permissionBtnText}>{permission.canAskAgain ? 'Autoriser la caméra' : 'Ouvrir les réglages'}</Text>
                </Pressable>
              </View>
            )}
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: tone?.color ?? 'transparent' }, flashStyle]} pointerEvents="none" />
      </View>

      {result && tone ? (
        <Animated.View entering={riseIn} style={[styles.result, { borderColor: tone.color }]} accessibilityLiveRegion="assertive">
          <Animated.View entering={popIn.delay(motion.fast)}>
            <Ionicons name={tone.icon} size={44} color={tone.color} />
          </Animated.View>
          <Text style={styles.resultTitle}>{result.title}</Text>
          <Text style={styles.resultText}>{result.text}</Text>
          {result.group && (
            <View style={styles.group}>
              <Text style={styles.groupTitle}>
                Groupe de {result.group.purchaser} · {result.group.size} billets
              </Text>
              {result.group.others.map((o) => (
                <View key={o.ticketId} style={styles.groupRow}>
                  <Ionicons name={o.admitted ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={o.admitted ? colors.success : colors.muted} />
                  <Text style={styles.groupName} numberOfLines={1}>
                    Place {o.seat} · {o.name}
                  </Text>
                  <Text style={[styles.groupState, o.admitted && { color: colors.successText }]}>{o.admitted ? 'à bord' : 'pas encore'}</Text>
                </View>
              ))}
              {result.boardOthers && result.group.others.some((o) => !o.admitted) && (
                <Pressable style={styles.boardAll} onPress={boardOthers} disabled={boarding} accessibilityRole="button">
                  <Ionicons name="people-outline" size={18} color={colors.primary} />
                  <Text style={styles.boardAllText}>
                    {boarding
                      ? 'Embarquement…'
                      : `Faire monter ${result.group.others.filter((o) => !o.admitted).length > 1 ? 'les autres' : result.group.others.find((o) => !o.admitted)!.name} aussi`}
                  </Text>
                </Pressable>
              )}
            </View>
          )}
          <Pressable style={styles.next} onPress={() => setResult(null)} accessibilityRole="button">
            <Ionicons name="qr-code-outline" size={18} color="#fff" />
            <Text style={styles.nextText}>Billet suivant</Text>
          </Pressable>
          {onOpenList && result.caravanId && (
            <TextButton label="Voir la liste des passagers" icon="list-outline" style={{ alignSelf: 'center' }} onPress={() => onOpenList(result.caravanId!)} />
          )}
        </Animated.View>
      ) : (
        <View style={{ gap: 10 }}>
          <Text style={styles.hint}>Vise le QR code du billet. Téléphone éteint ? Saisis le code écrit sous le QR.</Text>
          <Field
            icon="ticket-outline"
            placeholder="Code du billet, ex. 7KQ2MX"
            autoCapitalize="characters"
            autoCorrect={false}
            value={code}
            onChangeText={setCode}
            returnKeyType="done"
            onSubmitEditing={() => read(code)}
            right={
              code ? (
                <Pressable onPress={() => read(code)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Vérifier le code">
                  <Ionicons name="arrow-forward-circle" size={26} color={colors.accent} />
                </Pressable>
              ) : null
            }
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  camera: { aspectRatio: 1, borderRadius: radii.lg, overflow: 'hidden', backgroundColor: '#000', justifyContent: 'center' },
  frame: { position: 'absolute', top: '20%', left: '20%', right: '20%', bottom: '20%', borderWidth: 3, borderColor: colors.orange, borderRadius: radii.md },
  permission: { alignItems: 'center', gap: 12, padding: 24 },
  permissionText: { ...typo.body, color: '#fff', textAlign: 'center' },
  permissionBtn: { backgroundColor: colors.accent, borderRadius: radii.pill, paddingHorizontal: 20, minHeight: 44, justifyContent: 'center' },
  permissionBtnText: { ...typo.bodyStrong, color: '#fff' },
  hint: { ...typo.small, color: 'rgba(255,255,255,0.8)', lineHeight: 19 },
  result: { backgroundColor: colors.card, borderRadius: radii.lg, borderWidth: 2, padding: 18, gap: 8, alignItems: 'center' },
  resultTitle: { ...typo.h3, color: colors.navy, textAlign: 'center' },
  resultText: { ...typo.body, color: colors.text, textAlign: 'center', lineHeight: 20, marginBottom: 6 },
  next: {
    flexDirection: 'row',
    gap: 8,
    alignSelf: 'stretch',
    backgroundColor: colors.accent,
    minHeight: 52,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextText: { ...typo.title, color: '#fff' },
  group: { alignSelf: 'stretch', gap: 8, padding: 12, borderRadius: radii.md, backgroundColor: colors.primarySoft, marginBottom: 6 },
  groupTitle: { ...typo.label, color: colors.primary },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  groupName: { ...typo.bodyStrong, flex: 1, color: colors.navy },
  groupState: { ...typo.caption, color: colors.muted2 },
  boardAll: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', minHeight: 44, borderRadius: radii.pill, borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.card },
  boardAllText: { ...typo.bodyStrong, color: colors.primary },
});
