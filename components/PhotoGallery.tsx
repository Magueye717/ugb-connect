import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StatusBar, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radii, typo } from '@/constants/theme';

type Props = {
  photos: string[];
  /** Null: closed. */
  start: number | null;
  /** "Sac à dos": read out with each photo. */
  title: string;
  onClose: () => void;
};

/** Photos full screen, one per page: swipe between them, the counter says where you are. */
export function PhotoGallery({ photos, start, title, onClose }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(start ?? 0);
  const [opened, setOpened] = useState(start);
  // Opened again on another photo: start there (render-time adjustment, no effect).
  if (start !== opened) {
    setOpened(start);
    if (start !== null) setIndex(start);
  }

  return (
    <Modal visible={start !== null} animationType="fade" onRequestClose={onClose} statusBarTranslucent supportedOrientations={['portrait']}>
      <StatusBar barStyle="light-content" />
      <View style={styles.backdrop}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: (start ?? 0) * width, y: 0 }}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}>
          {photos.map((uri, i) => (
            <Image key={uri} source={{ uri }} style={{ width, height }} contentFit="contain" transition={150} accessibilityLabel={`${title}, photo ${i + 1} sur ${photos.length}`} />
          ))}
        </ScrollView>
        <View style={[styles.top, { top: insets.top + 8 }]}>
          {photos.length > 1 ? (
            <View style={styles.counter}>
              <Text style={styles.counterText}>
                {index + 1} / {photos.length}
              </Text>
            </View>
          ) : (
            <View />
          )}
          <Pressable style={styles.close} onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Fermer les photos">
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>
        </View>
        {photos.length > 1 && (
          <View style={[styles.dots, { bottom: insets.bottom + 20 }]}>
            {photos.map((uri, i) => (
              <View key={uri} style={[styles.dot, i === index && styles.dotOn]} />
            ))}
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000' },
  top: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  counter: { backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 5 },
  counterText: { ...typo.smallStrong, color: '#fff' },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  dots: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.4)' },
  dotOn: { backgroundColor: '#fff', width: 16 },
});
