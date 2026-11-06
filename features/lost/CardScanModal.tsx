import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useRef } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radii, typo } from '@/constants/theme';
import { ScanFrame } from '@/features/lost/ScanFrame';
import { useAutoScan, type ScanAttempt } from '@/features/lost/useAutoScan';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** One frame to read: `done` closes the scan (the screen shows the result), `retry` keeps scanning. */
  onScan: ScanAttempt;
  /** At the top: what is scanned ("Ma carte étudiant"). */
  title: string;
  /** Before the camera is allowed: why it's needed. */
  why: string;
  /** When it gives up: the way without the camera ("Remplir à la main"). */
  manualLabel?: string;
};

/**
 * A card scan, full screen like a QR scanner: the camera everywhere, darkened around a card-shaped frame. The student
 * frames the card, then presses « Scanner la carte »: a line sweeps the frame while it reads (frames taken silently,
 * never shown, erased after the reading). After a few tries, « Scanner encore » or the way without the camera.
 */
export function CardScanModal({ visible, onClose, onScan, title, why, manualLabel = 'Remplir à la main' }: Props) {
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const { width } = useWindowDimensions();
  const frameW = Math.round(width * 0.86);
  const frameH = Math.round(frameW / 1.586);
  const live = visible && !!permission?.granted;
  const scan = useAutoScan(camera, live, onScan);

  // An image already on the phone (a card scanned earlier): read once, not erased (it's the student's own file).
  const fromGallery = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!res.canceled && res.assets[0]) await onScan(res.assets[0].uri).catch(() => undefined);
  };

  const status =
    scan.phase === 'reading'
      ? 'Lecture en cours, ne bouge pas…'
      : scan.phase === 'scanning'
        ? 'Scan en cours : garde la carte dans le cadre.'
        : scan.phase === 'gaveUp'
          ? 'Carte pas encore lisible : rapproche-la, avec plus de lumière.'
          : 'Place la carte dans le cadre, à plat et bien éclairée.';
  const idle = scan.phase === 'idle' || scan.phase === 'gaveUp';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        {live && <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" animateShutter={false} />}

        {/* Dark all around, clear inside the frame. */}
        {permission?.granted && (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <View style={[styles.shade, { flex: 1 }]} />
            <View style={{ flexDirection: 'row', height: frameH }}>
              <View style={[styles.shade, { flex: 1 }]} />
              <ScanFrame width={frameW} height={frameH} phase={scan.phase} />
              <View style={[styles.shade, { flex: 1 }]} />
            </View>
            <View style={[styles.shade, { flex: 1.2 }]} />
          </View>
        )}

        <SafeAreaView style={styles.ui} edges={['top', 'bottom']}>
          <View style={styles.top}>
            <Pressable onPress={onClose} style={styles.round} hitSlop={8} accessibilityRole="button" accessibilityLabel="Fermer">
              <Ionicons name="close" size={22} color="#fff" />
            </Pressable>
            <Text style={styles.title}>{title}</Text>
            <View style={{ width: 44 }} />
          </View>

          {!permission ? null : !permission.granted ? (
            <View style={styles.permission}>
              <Ionicons name="scan-outline" size={36} color="#fff" />
              <Text style={styles.permissionText}>{why}</Text>
              <Pressable style={styles.permissionBtn} onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())} accessibilityRole="button">
                <Text style={styles.permissionBtnText}>{permission.canAskAgain ? 'Autoriser la caméra' : 'Ouvrir les réglages'}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ flex: 1 }} />
          )}

          <View style={styles.bottom}>
            <Text style={styles.status} accessibilityLiveRegion="polite">
              {status}
            </Text>
            {permission?.granted && idle && (
              <Pressable style={({ pressed }) => [styles.scanBtn, pressed && { transform: [{ scale: 0.97 }] }]} onPress={scan.start} accessibilityRole="button">
                <Ionicons name="scan" size={20} color={colors.navy} />
                <Text style={styles.scanBtnText}>{scan.phase === 'gaveUp' ? 'Scanner encore' : 'Scanner la carte'}</Text>
              </Pressable>
            )}
            {scan.phase === 'gaveUp' && (
              <Pressable style={styles.manual} onPress={onClose} accessibilityRole="button">
                <Text style={styles.manualText}>{manualLabel}</Text>
              </Pressable>
            )}
            {permission?.granted && (
              <Pressable onPress={fromGallery} style={styles.gallery} hitSlop={8} accessibilityRole="button">
                <Text style={styles.galleryText}>Utiliser une image du téléphone</Text>
              </Pressable>
            )}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  shade: { backgroundColor: 'rgba(0,0,0,0.55)' },
  ui: { ...StyleSheet.absoluteFill, justifyContent: 'space-between' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  title: { ...typo.title, color: '#fff', flex: 1, textAlign: 'center' },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  permission: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  permissionText: { ...typo.body, color: '#fff', textAlign: 'center' },
  permissionBtn: { backgroundColor: '#fff', paddingHorizontal: 18, minHeight: 42, borderRadius: radii.pill, justifyContent: 'center' },
  permissionBtnText: { color: colors.navy, fontWeight: '700' },
  bottom: { gap: 14, paddingHorizontal: 24, paddingBottom: 16 },
  status: { ...typo.bodyStrong, color: '#fff', textAlign: 'center' },
  scanBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#fff', minHeight: 52, borderRadius: radii.pill },
  scanBtnText: { ...typo.title, color: colors.navy },
  manual: { alignSelf: 'center', paddingHorizontal: 18, minHeight: 44, borderRadius: radii.pill, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)', justifyContent: 'center' },
  manualText: { ...typo.smallStrong, color: '#fff' },
  gallery: { alignSelf: 'center', paddingVertical: 4 },
  galleryText: { ...typo.small, color: 'rgba(255,255,255,0.7)', textDecorationLine: 'underline' },
});
