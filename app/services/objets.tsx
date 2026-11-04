import { Redirect } from 'expo-router';

/** Old links: Objets perdus lives in Campus › Objets perdus (with the tab bar, the same Back everywhere). */
export default function ObjetsPerdusScreen() {
  return <Redirect href={{ pathname: '/(tabs)/lieux', params: { vue: 'objets' } }} />;
}
