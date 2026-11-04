import { Redirect } from 'expo-router';

/** Old links: Sunu Taxi lives in Trajets › Sunu Taxi (with the tab bar, the same Back everywhere). */
export default function SunuTaxiScreen() {
  return <Redirect href={{ pathname: '/(tabs)/caravanes', params: { vue: 'taxi' } }} />;
}
