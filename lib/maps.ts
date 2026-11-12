import { router } from 'expo-router';
import { Linking, Platform } from 'react-native';

/**
 * « Y aller »: the walk on the UGB map, inside the app (from where the student is, the line to follow, how long). The
 * phone's map app stays one tap away from there (openInMapsApp).
 */
export function openDirections({ lat, lng }: { lat: number; lng: number }, label: string) {
  router.push({ pathname: '/itineraire', params: { lat: String(lat), lng: String(lng), name: label } } as never);
}

/** Walking directions in the phone's map app: Apple Plans on iOS, Google Maps elsewhere (app or browser). */
export function openInMapsApp({ lat, lng }: { lat: number; lng: number }, label: string) {
  const url =
    Platform.OS === 'ios'
      ? `http://maps.apple.com/?daddr=${lat},${lng}&dirflg=w&q=${encodeURIComponent(label)}`
      : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;
  Linking.openURL(url);
}
