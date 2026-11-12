import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/ui';
import { colors, typo } from '@/constants/theme';
import { EventsBoard } from '@/features/events/EventsBoard';

/** Every event on sale (also the Campus tab's « Événements » section): kept for links from banners and notifications. */
export default function Evenements() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.head}>
        <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />
        <Text style={styles.h1}>Événements</Text>
        <View style={{ width: 44 }} />
      </View>
      <EventsBoard />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 },
  h1: { ...typo.h3, color: colors.navy },
});
