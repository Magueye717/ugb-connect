import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

/**
 * A photo shown whole in any frame: nothing cut, whatever its shape (a landscape shot in a square, a portrait in a
 * banner). The empty sides are filled with the same photo, blurred and slightly darkened, so the frame never looks
 * empty. Pictures are uploaded as taken (no crop), this is how the big frames show them.
 */
export function FitImage({ uri, style, transition = 200, accessibilityLabel }: { uri: string; style?: StyleProp<ViewStyle>; transition?: number; accessibilityLabel?: string }) {
  return (
    <View style={[styles.frame, style]} accessibilityLabel={accessibilityLabel} accessible={!!accessibilityLabel}>
      <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={24} transition={transition} />
      <View style={[StyleSheet.absoluteFill, styles.dim]} />
      <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="contain" transition={transition} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', backgroundColor: '#0F1B4C' },
  dim: { backgroundColor: 'rgba(10,16,40,0.25)' },
});
