import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/ui';
import { colors, motion, typo } from '@/constants/theme';
import { haptics } from '@/lib/haptics';

type View_<K extends string> = { key: K; label: string; icon: keyof typeof Ionicons.glyphMap; subtitle: string; render: () => ReactNode };

/**
 * A tab that groups several sections (Campus: Lieux · Objets perdus · Boutiques). The sections are a strip of tabs
 * with an underline, so they never look like the pill switches used inside a section (Liste | Carte…). A section
 * opened once stays alive: coming back to it is instant, with its search, filters and scroll position.
 * `?vue=<key>` opens a given section, so other screens can link straight to it.
 */
export function TabScreen<K extends string>({ title, views }: { title: string; views: View_<K>[] }) {
  const { vue } = useLocalSearchParams<{ vue?: string }>();
  const fromParam = views.find((v) => v.key === vue)?.key;
  const [current, setCurrent] = useState<K>(fromParam ?? views[0].key);
  const [opened, setOpened] = useState<K[]>([current]);
  const open = (k: K) => {
    setCurrent(k);
    if (!opened.includes(k)) setOpened([...opened, k]);
  };
  // A new link to this tab with another ?vue= switches section (state adjusted during render, no effect).
  const [seenParam, setSeenParam] = useState(fromParam);
  if (fromParam !== seenParam) {
    setSeenParam(fromParam);
    if (fromParam) open(fromParam);
  }
  const view = views.find((v) => v.key === current) ?? views[0];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={title} subtitle={view.subtitle} />
      {/* One view: no strip. */}
      {views.length > 1 && <SectionTabs views={views} value={current} onChange={open} />}
      {views
        .filter((v) => opened.includes(v.key))
        .map((v) => (
          <View key={v.key} style={[styles.page, v.key !== current && styles.hidden]}>
            {v.render()}
          </View>
        ))}
    </SafeAreaView>
  );
}

/** The sections of a tab: icon and label, an underline that slides to the chosen one. */
function SectionTabs<K extends string>({ views, value, onChange }: { views: View_<K>[]; value: K; onChange: (k: K) => void }) {
  const [width, setWidth] = useState(0);
  const index = views.findIndex((v) => v.key === value);
  const w = width / views.length;
  const x = useSharedValue(0);
  const placed = useRef(false);
  useLayoutEffect(() => {
    if (!w || index < 0) return;
    // First layout: in place, no slide in from the left edge.
    x.set(placed.current ? withSpring(index * w, motion.glide) : index * w);
    placed.current = true;
  }, [index, w, x]);
  const line = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  return (
    <View style={styles.strip} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessibilityRole="tablist">
      {views.map((v) => {
        const on = v.key === value;
        return (
          <Pressable
            key={v.key}
            style={styles.tab}
            onPress={() => {
              if (on) return;
              haptics.select();
              onChange(v.key);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}>
            <Ionicons name={v.icon} size={17} color={on ? colors.primary : colors.muted2} />
            <Text style={[styles.tabText, on && styles.tabTextOn]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
              {v.label}
            </Text>
          </Pressable>
        );
      })}
      {width > 0 && (
        <Animated.View style={[styles.lineBox, { width: w }, line]}>
          <View style={styles.line} />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  strip: { flexDirection: 'row', marginTop: 10, marginHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, paddingHorizontal: 4 },
  tabText: { ...typo.smallStrong, color: colors.muted2, flexShrink: 1 },
  tabTextOn: { color: colors.primary },
  lineBox: { position: 'absolute', left: 0, bottom: -1, alignItems: 'center' },
  line: { width: '60%', height: 3, borderRadius: 2, backgroundColor: colors.primary },
  page: { flex: 1 },
  hidden: { display: 'none' },
});
