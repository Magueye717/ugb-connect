import { useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader, Segmented } from '@/components/ui';
import { colors } from '@/constants/theme';

type View_<K extends string> = { key: K; label: string; subtitle: string; render: () => ReactNode };

/**
 * A tab that groups several sections behind a switch (Trajets: Caravanes | Sunu Taxi…).
 * `?vue=<key>` opens a given section, so other screens can link straight to it.
 */
export function TabScreen<K extends string>({ title, views }: { title: string; views: View_<K>[] }) {
  const { vue } = useLocalSearchParams<{ vue?: string }>();
  const fromParam = views.find((v) => v.key === vue)?.key;
  const [current, setCurrent] = useState<K>(fromParam ?? views[0].key);
  // A new link to this tab with another ?vue= switches section (state adjusted during render, no effect).
  const [seenParam, setSeenParam] = useState(fromParam);
  if (fromParam !== seenParam) {
    setSeenParam(fromParam);
    if (fromParam) setCurrent(fromParam);
  }
  const view = views.find((v) => v.key === current) ?? views[0];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={title} subtitle={view.subtitle} />
      {/* One view: no switch. */}
      {views.length > 1 && (
        <View style={styles.switch}>
          <Segmented options={views.map((v) => ({ value: v.key, label: v.label }))} value={current} onChange={setCurrent} />
        </View>
      )}
      {view.render()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  switch: { paddingHorizontal: 20, paddingTop: 14 },
});
