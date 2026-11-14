import * as ImagePicker from 'expo-image-picker';
import { Alert, Platform } from 'react-native';

import { cropPhoto } from '@/lib/crop';
import { notice } from '@/lib/notice';

type Options = {
  /** The frame proposed when the person chooses to crop, e.g. [1, 1] for a profile photo, [16, 9] for a banner. */
  aspect?: [number, number];
  /** Gallery: several at once, up to this many (the camera, and a cropped pick, take one). */
  multiple?: number;
  title?: string;
  /** Skip the camera / gallery question: only « photo entière » or « recadrer » is asked. */
  source?: 'camera' | 'library';
};

type Choice = { source: 'camera' | 'library'; crop: boolean };

/** iOS can't open the picker while the question's card is still closing. */
const AFTER_CARD_MS = Platform.OS === 'ios' ? 350 : 0;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One question, every time a photo is added: from the camera or the gallery, whole (as taken: landscape stays
 * landscape) or cropped. Whole is the first option; cropping opens our own crop screen (any shape: original, square, 4:3, 16:9…).
 * On the web there is no camera nor crop: the file picker opens.
 */
function ask(title: string, given?: 'camera' | 'library'): Promise<Choice | null> {
  if (Platform.OS === 'web') return Promise.resolve({ source: 'library', crop: false });
  return new Promise((resolve) => {
    const pick = (c: Choice) => () => resolve(c);
    notice({
      tone: 'info',
      title,
      message: 'Garde la photo entière, ou recadre-la avant de l’envoyer.',
      onDismiss: () => resolve(null),
      choices: given
        ? [
            { label: 'Photo entière', tone: 'primary', onPress: pick({ source: given, crop: false }) },
            { label: 'Recadrer', tone: 'primary', onPress: pick({ source: given, crop: true }) },
            { label: 'Annuler', tone: 'quiet', onPress: () => resolve(null) },
          ]
        : [
            { label: 'Prendre une photo', tone: 'primary', onPress: pick({ source: 'camera', crop: false }) },
            { label: 'Choisir dans la galerie', tone: 'primary', onPress: pick({ source: 'library', crop: false }) },
            { label: 'Prendre et recadrer', tone: 'quiet', onPress: pick({ source: 'camera', crop: true }) },
            { label: 'Choisir et recadrer', tone: 'quiet', onPress: pick({ source: 'library', crop: true }) },
            { label: 'Annuler', tone: 'quiet', onPress: () => resolve(null) },
          ],
    });
  });
}

/**
 * A picture for a dish, an article, an event, a banner, a place, a profile…: taken on the spot or from the gallery,
 * whole or cropped (the person chooses). Returns the chosen images (empty when cancelled or the camera is refused),
 * ready for `uploadImage`.
 */
export async function pickPhoto({ aspect, multiple, title = 'Ajouter une photo', source }: Options = {}): Promise<ImagePicker.ImagePickerAsset[]> {
  const choice = await ask(title, source);
  if (!choice) return [];
  await wait(AFTER_CARD_MS);
  if (choice.source === 'camera') {
    const { granted } = await ImagePicker.requestCameraPermissionsAsync();
    if (!granted) {
      Alert.alert('Caméra refusée', 'Autorise la caméra dans les réglages, ou choisis une photo dans ta galerie.');
      return [];
    }
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
    return res.canceled ? [] : finish(res.assets.slice(0, 1), choice.crop, aspect);
  }
  // Cropping works on one picture at a time; whole, several can be picked at once.
  const many = !choice.crop && multiple && multiple > 1;
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.85,
    ...(many ? { allowsMultipleSelection: true, selectionLimit: multiple } : {}),
  });
  return res.canceled ? [] : finish(res.assets.slice(0, many ? multiple : 1), choice.crop, aspect);
}

/** Cropping: our own screen (any shape, zoom), on the one picture picked. Cancelled there: nothing is added. */
async function finish(assets: ImagePicker.ImagePickerAsset[], crop: boolean, aspect?: [number, number]): Promise<ImagePicker.ImagePickerAsset[]> {
  if (!crop || !assets[0]) return assets;
  const a = assets[0];
  const out = await cropPhoto({ uri: a.uri, width: a.width, height: a.height }, aspect);
  return out ? [{ ...a, uri: out.uri, width: out.width, height: out.height }] : [];
}
