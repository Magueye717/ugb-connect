import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { TextButton } from '@/components/ui';
import { colors, radii, typo } from '@/constants/theme';
import { ScanFrame } from '@/features/lost/ScanFrame';
import { useAutoScan, type ScanAttempt } from '@/features/lost/useAutoScan';

type Props = {
  /** One frame to read: `done` stops the scan (the screen shows the result), `retry` keeps scanning. */
  onScan: ScanAttempt;
  /** Before the camera is allowed: why it's needed. */
  why: string;
  /** Off: the camera isn't running (a screen that hides it), to save battery. */
  active?: boolean;
};

/**
 * Scanning a card in a screen (a card found): the live camera with a card-shaped frame. « Scanner la carte » starts the
 * reading: a line sweeps the frame (frames taken silently, never shown, erased after the reading). After a few tries,
 * « Scanner encore ». Asks for the camera in place, or sends to the settings once refused.
 */
export function CardCamera({ onScan, why, active = true }: Props) {
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [boxW, setBoxW] = useState(0);
  const live = active && !!permission?.granted;
  const scan = useAutoScan(camera, live, onScan);
  const frameW = Math.round(boxW * 0.86);
  const frameH = Math.round(frameW / 1.586);

  const fromGallery = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!res.canceled && res.assets[0]) await onScan(res.assets[0].uri).catch(() => undefined);
  };

  return (
    <View style={{ gap: 12 }}>
      <View style={styles.camera} onLayout={(e: LayoutChangeEvent) => setBoxW(e.nativeEvent.layout.width)}>
        {!permission ? null : permission.granted ? (
          <>
            {live && <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" animateShutter={false} />}
            {frameW > 0 && <ScanFrame width={frameW} height={frameH} phase={scan.phase} />}
          </>
        ) : (
          <View style={styles.permission}>
            <Ionicons name="scan-outline" size={32} color="#fff" />
            <Text style={styles.permissionText}>{why}</Text>
            <Pressable style={styles.permissionBtn} onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())} accessibilityRole="button">
              <Text style={styles.permissionBtnText}>{permission.canAskAgain ? 'Autoriser la caméra' : 'Ouvrir les réglages'}</Text>
            </Pressable>
          </View>
        )}
      </View>
      {permission?.granted && scan.phase !== 'idle' && (
        <Text style={styles.status} accessibilityLiveRegion="polite">
          {scan.phase === 'reading' ? 'Lecture en cours, ne bouge pas…' : scan.phase === 'gaveUp' ? 'Carte pas encore lisible : rapproche-la, avec plus de lumière.' : 'Scan en cours : garde la carte dans le cadre.'}
        </Text>
      )}
      {permission?.granted && (scan.phase === 'idle' || scan.phase === 'gaveUp') && (
        <Pressable style={({ pressed }) => [styles.again, pressed && { transform: [{ scale: 0.97 }] }]} onPress={scan.start} accessibilityRole="button">
          <Ionicons name="scan" size={20} color="#fff" />
          <Text style={styles.againText}>{scan.phase === 'gaveUp' ? 'Scanner encore' : 'Scanner la carte'}</Text>
        </Pressable>
      )}
      {permission?.granted && <TextButton label="Utiliser une image du téléphone" icon="images-outline" onPress={fromGallery} disabled={scan.phase === 'reading'} style={{ alignSelf: 'center' }} />}
    </View>
  );
}

const styles = StyleSheet.create({
  camera: { height: 240, borderRadius: radii.lg, overflow: 'hidden', backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
  permission: { alignItems: 'center', gap: 10, padding: 24 },
  permissionText: { ...typo.body, color: '#fff', textAlign: 'center' },
  permissionBtn: { backgroundColor: '#fff', paddingHorizontal: 16, minHeight: 38, borderRadius: radii.pill, justifyContent: 'center' },
  permissionBtnText: { color: colors.navy, fontWeight: '700' },
  status: { ...typo.smallStrong, color: colors.navy, textAlign: 'center' },
  again: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.accent, minHeight: 52, borderRadius: radii.sm },
  againText: { ...typo.title, color: '#fff' },
});
