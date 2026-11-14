import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, motion, radii, typo } from '@/constants/theme';
import { haptics } from '@/lib/haptics';


type Immersive = { on: boolean; set: (on: boolean) => void; top: number };
const ImmersiveContext = createContext<Immersive>({ on: false, set: () => undefined, top: 0 });

/**
 * For a section that wants the whole screen (the campus map): `set(true)` and the section starts at the very top of
 * the screen, under the header and the section tabs, which turn translucent. `top`: their height, to keep the
 * section's own controls below them.
 */
export const useImmersive = () => useContext(ImmersiveContext);

type View_<K extends string> = {
  key: K;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  render: () => ReactNode;
  /** Other ?vue= values that open this section (sections merged into it: « objets » and « logement » open Entraide). */
  aliases?: string[];
};

/**
 * A tab that groups several sections (Campus: Lieux · Objets perdus · Boutiques). The sections are a strip of tabs
 * with an underline, so they never look like the pill switches used inside a section (Liste | Carte…). A section
 * opened once stays alive: coming back to it is instant, with its search, filters and scroll position.
 * `?vue=<key>` opens a given section, so other screens can link straight to it.
 */
export function TabScreen<K extends string>({ title, views }: { title: string; views: View_<K>[] }) {
  // `n`: set by each notification opened (openNotificationUrl), so the same ?vue= asked again still switches.
  const { vue, n } = useLocalSearchParams<{ vue?: string; n?: string }>();
  const fromParam = views.find((v) => v.key === vue || (!!vue && v.aliases?.includes(vue)))?.key;
  const [current, setCurrent] = useState<K>(fromParam ?? views[0].key);
  const [opened, setOpened] = useState<K[]>([current]);
  const open = (k: K) => {
    setCurrent(k);
    if (!opened.includes(k)) setOpened([...opened, k]);
  };
  // A new link to this tab (another ?vue=, or the same one from a new notification) switches section (state
  // adjusted during render, no effect).
  const link = `${vue ?? ''}|${n ?? ''}`;
  const [seenLink, setSeenLink] = useState(link);
  if (link !== seenLink) {
    setSeenLink(link);
    if (fromParam) open(fromParam);
  }
  // The section that asked for the whole screen (it stays so while the others are shown: only the current one counts).
  const [immersiveKey, setImmersiveKey] = useState<K | null>(null);
  const immersive = immersiveKey === current;
  const [chrome, setChrome] = useState(0);
  const insets = useSafeAreaInsets();

  const head = (
    <>
      {/* No big title: the bottom tab already names the screen. The strip of sections is the top of it. */}
      {views.length > 1 && <SectionTabs label={title} views={views} value={current} onChange={open} />}
    </>
  );

  return (
    // The brand's blue band at the top, under the status bar, as on Accueil: the sections in white on it.
    <SafeAreaView style={styles.safe} edges={[]}>
      {immersive ? (
        <View style={[styles.band, styles.glass, { paddingTop: insets.top }]} onLayout={(e) => setChrome(e.nativeEvent.layout.height)}>
          {head}
        </View>
      ) : (
        <View style={[styles.band, { paddingTop: insets.top }]}>{head}</View>
      )}
      {views
        .filter((v) => opened.includes(v.key))
        .map((v) => (
          <ImmersiveSection key={v.key} k={v.key} on={immersiveKey === v.key} top={chrome} setKey={setImmersiveKey}>
            <View style={[styles.page, v.key !== current && styles.hidden]}>{v.render()}</View>
          </ImmersiveSection>
        ))}
    </SafeAreaView>
  );
}

function ImmersiveSection<K extends string>({ k, on, top, setKey, children }: { k: K; on: boolean; top: number; setKey: (fn: (cur: K | null) => K | null) => void; children: ReactNode }) {
  const value = useMemo<Immersive>(() => ({ on, top, set: (yes) => setKey((cur) => (yes ? k : cur === k ? null : cur)) }), [on, top, k, setKey]);
  return <ImmersiveContext.Provider value={value}>{children}</ImmersiveContext.Provider>;
}

/** The sections of a tab: icon and label, an underline that slides to the chosen one. */
function SectionTabs<K extends string>({ label, views, value, onChange }: { label: string; views: View_<K>[]; value: K; onChange: (k: K) => void }) {
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
    <View style={styles.strip} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessibilityRole="tablist" accessibilityLabel={label}>
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
            <Ionicons name={v.icon} size={17} color={on ? '#fff' : 'rgba(255,255,255,0.7)'} />
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
  band: { backgroundColor: colors.primary, borderBottomLeftRadius: radii.xl, borderBottomRightRadius: radii.xl, paddingBottom: 4 },
  strip: { flexDirection: 'row', marginTop: 2, marginHorizontal: 12 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, paddingHorizontal: 4 },
  tabText: { ...typo.smallStrong, color: 'rgba(255,255,255,0.7)', flexShrink: 1 },
  tabTextOn: { color: '#fff' },
  lineBox: { position: 'absolute', left: 0, bottom: -1, alignItems: 'center' },
  line: { width: '60%', height: 3, borderRadius: 2, backgroundColor: '#fff' },
  page: { flex: 1 },
  // Above the section (which starts at the top of the screen), see-through.
  glass: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2 },
  hidden: { display: 'none' },
});
