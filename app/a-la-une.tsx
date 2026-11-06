import { router } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HeadlineItem } from '@/components/home';
import { EmptyState } from '@/components/states';
import { BackButton } from '@/components/ui';
import { colors, typo } from '@/constants/theme';
import { useCampus } from '@/context/CampusContext';

/** Every "À la une" announcement currently online (the home screen shows the first five). */
export default function ALaUne() {
  const { alerts, refresh } = useCampus();
  const items = alerts.filter((a) => a.placement === 'headline');
  const [refreshing, setRefreshing] = useState(false);
  const pull = () => {
    setRefreshing(true);
    refresh().finally(() => setRefreshing(false));
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.head}>
        <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />
        <Text style={styles.h1}>À la une</Text>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pull} />}>
        {items.length === 0 && <EmptyState icon="newspaper-outline" title="Rien à la une" text="Les annonces du campus apparaîtront ici." />}
        {items.map((a) => (
          <HeadlineItem key={a.id} a={a} more />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 },
  h1: { ...typo.h3, color: colors.navy },
  body: { padding: 20, gap: 14, paddingBottom: 32 },
});
