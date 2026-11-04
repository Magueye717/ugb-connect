import { Alert } from 'react-native';

/**
 * The campus of a business or a place changed: is its point on the map still right? Asked at once, while the person
 * is on the form (and often on site): the map would otherwise keep showing the old spot.
 */
export function askToRelocate(campusLabel: string, useCurrentPosition: () => void) {
  Alert.alert(
    'Mettre à jour la position ?',
    `Nouveau campus : ${campusLabel}. Si l’endroit a changé, mets à jour sa position, sinon la carte montrera l’ancien emplacement.`,
    [
      { text: 'Garder la position', style: 'cancel' },
      { text: 'Ma position actuelle', onPress: useCurrentPosition },
    ],
  );
}
