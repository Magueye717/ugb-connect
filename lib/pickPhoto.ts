import * as ImagePicker from 'expo-image-picker';
import { Alert, Platform } from 'react-native';

type Options = {
  /** Crop frame, e.g. [1, 1] for a dish, [2, 1] for a cover. Without it: no crop. */
  aspect?: [number, number];
  /** Gallery: several at once, up to this many (the camera takes one). */
  multiple?: number;
  title?: string;
};

/** Camera or gallery: asked first. On the web there is no camera prompt, the file picker opens. */
function askSource(title: string): Promise<'camera' | 'library' | null> {
  if (Platform.OS === 'web') return Promise.resolve('library');
  return new Promise((resolve) =>
    Alert.alert(title, undefined, [
      { text: 'Prendre une photo', onPress: () => resolve('camera') },
      { text: 'Choisir dans la galerie', onPress: () => resolve('library') },
      { text: 'Annuler', style: 'cancel', onPress: () => resolve(null) },
    ], { cancelable: true, onDismiss: () => resolve(null) }),
  );
}

/**
 * A picture for a dish, an article, a business or a place: taken on the spot, or from the gallery. Returns the chosen
 * images (empty when cancelled or the camera is refused), ready for `uploadImage`.
 */
export async function pickPhoto({ aspect, multiple, title = 'Ajouter une photo' }: Options = {}): Promise<ImagePicker.ImagePickerAsset[]> {
  const source = await askSource(title);
  if (!source) return [];
  const crop = aspect ? { allowsEditing: true, aspect } : {};
  if (source === 'camera') {
    const { granted } = await ImagePicker.requestCameraPermissionsAsync();
    if (!granted) {
      Alert.alert('Caméra refusée', 'Autorise la caméra dans les réglages, ou choisis une photo dans ta galerie.');
      return [];
    }
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85, ...crop });
    return res.canceled ? [] : res.assets.slice(0, 1);
  }
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'], quality: 0.85,
    ...(multiple && multiple > 1 ? { allowsMultipleSelection: true, selectionLimit: multiple } : crop),
  });
  return res.canceled ? [] : res.assets.slice(0, multiple ?? 1);
}
