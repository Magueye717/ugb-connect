import { Redirect } from 'expo-router';

import { useAuth } from '@/context/AuthContext';

/** The Référencement space opens on what the person adds: places, restaurants and shops, or caravan organizers. */
export default function Referencement() {
  const { user } = useAuth();
  const roles = user?.roles ?? [];
  const has = (r: string) => roles.includes('admin') || roles.includes(r);
  return <Redirect href={has('place_editor') ? '/(staff)/lieux' : has('restaurant_editor') || has('shop_editor') ? '/(staff)/commerces' : '/(staff)/caravanes'} />;
}
