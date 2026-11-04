import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/ui';
import { colors } from '@/constants/theme';
import { LostBoard } from '@/features/lost/LostBoard';

/** Profil › Mes objets perdus: what the student declared (and their card someone found). Back returns to Profil. */
export default function MesObjets() {
  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profil'));
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      <ScreenHeader title="Mes objets perdus" subtitle="Tes déclarations et ta carte retrouvée" onBack={back} />
      <LostBoard only="mine" />
    </SafeAreaView>
  );
}
