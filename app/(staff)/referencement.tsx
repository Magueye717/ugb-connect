import { Redirect } from 'expo-router';

import { useAuth } from '@/context/AuthContext';

/** The Référencement space opens on what the person adds: places, or restaurants and shops. */
export default function Referencement() {
  const { user } = useAuth();
  const roles = user?.roles ?? [];
  return <Redirect href={roles.includes('admin') || roles.includes('place_editor') ? '/(staff)/lieux' : '/(staff)/commerces'} />;
}
