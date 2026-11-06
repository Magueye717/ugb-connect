import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import {
  useCallback,
  useEffect,
  useId,
  useState,
  useSyncExternalStore,
} from "react";
import {
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { SpaceRows, spaceInfo } from "@/components/SpacesList";
import { SheetHeader } from "@/components/ui";
import { popIn } from "@/components/motion";
import { colors, motion, radii, shadow, typo } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";

// How far screens lift the button above what they pin at the bottom (the market's cart, the map's place card): the
// highest of the lifts asked for.
const lifts = new Map<string, number>();
let lift = 0;
const listeners = new Set<() => void>();
const setLift = (id: string, v: number) => {
  if (v > 0) lifts.set(id, v);
  else lifts.delete(id);
  lift = Math.max(0, ...lifts.values());
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/**
 * Room to leave at the end of a scrolling list so its last item can scroll clear of the space button (54 high,
 * 14 above the tab bar, plus a margin).
 */
/**
 * The floating button appears from this many spaces. With 2 or 3, switching happens from the account screen's
 * « Mes espaces » (every space has one), and the corner stays free for the screen.
 */
export const FAB_MIN_SPACES = 4;

export const SPACE_BUTTON_CLEARANCE = 54 + 14 + 16;

/** Something pinned at the bottom of this screen: the space button rises by `px` while it's focused (0: not now). */
export function useLiftSpaceButton(px: number) {
  const id = useId();
  useFocusEffect(
    useCallback(() => {
      setLift(id, px);
      return () => setLift(id, 0);
    }, [id, px]),
  );
}

/**
 * The space button: always in sight above the tab bar (bottom right), for anyone with several spaces (a student
 * with their shop, a manager of two businesses, the app creator's team). It shows the current space; a tap lists them
 * all. Hidden while the keyboard is open.
 */
export function SpaceSwitcher() {
  const { spaces, current } = useAuth();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const raised = useSyncExternalStore(subscribe, () => lift);
  const [open, setOpen] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () =>
      setKeyboard(true),
    );
    const hide = Keyboard.addListener("keyboardDidHide", () =>
      setKeyboard(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  if (spaces.length < FAB_MIN_SPACES || !current || keyboard) return null;
  // Above the tab bar (62 + the system bar); a screen's pinned bar lifts it further (animated, see FabButton).
  const bottom = 62 + Math.max(insets.bottom, 10) + 14;

  return (
    <>
      <FabButton
        spaceKey={current.key}
        icon={spaceInfo(current).icon}
        label={spaceInfo(current).title}
        bottom={bottom}
        raised={raised}
        onPress={() => setOpen(true)}
      />

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setOpen(false)}
          accessibilityLabel="Fermer"
        />
        {/* At most most of the screen: a long list of spaces scrolls, the title and ✕ stay in sight. */}
        <SafeAreaView edges={["bottom"]} style={[styles.sheet, { maxHeight: height * 0.85 }]}>
          <View style={styles.handle} />
          <SheetHeader onClose={() => setOpen(false)} titleStyle={styles.title} subtitle={`Tu es dans : ${spaceInfo(current).title}`}>
            Mes espaces
          </SheetHeader>
          <View style={{ height: 6 }} />
          <ScrollView
            style={{ flexShrink: 1 }}
            contentContainerStyle={{ gap: 6, paddingBottom: 4 }}
            showsVerticalScrollIndicator
          >
            <SpaceRows onOpen={() => setOpen(false)} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

/** The halo has been shown this session. */
let haloShown = false;

/**
 * The button itself, alive but quiet: it pops in, a soft halo pulses a few times once per session so it gets noticed, it glides up and down above a screen's pinned bar, squeezes when pressed, and its ⇄ badge turns when
 * the space changes. Transform and opacity only; no halo when the system asks to reduce motion.
 */
function FabButton({
  spaceKey,
  icon,
  label,
  bottom,
  raised,
  onPress,
}: {
  spaceKey: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  bottom: number;
  raised: number;
  onPress: () => void;
}) {
  const reduced = useReducedMotion();
  const lift = useSharedValue(raised);
  const press = useSharedValue(1);
  const halo = useSharedValue(0);
  const turn = useSharedValue(0);

  useEffect(() => {
    lift.set(withSpring(raised, motion.glide));
  }, [raised, lift]);

  // The halo pulses three times once per session (to be noticed), not at every space change: animation only where it
  // helps. A space change just turns the badge.
  useEffect(() => {
    if (reduced || haloShown) return;
    haloShown = true;
    halo.set(
      withRepeat(
        withTiming(1, { duration: 1300, easing: Easing.out(Easing.quad) }),
        3,
        false,
      ),
    );
  }, [reduced, halo]);
  useEffect(() => {
    turn.set(
      withSequence(
        withTiming(0, { duration: 0 }),
        withSpring(180, motion.spring),
      ),
    );
  }, [spaceKey, turn]);

  const wrap = useAnimatedStyle(() => ({
    transform: [{ translateY: -lift.get() }, { scale: press.get() }],
  }));
  const ring = useAnimatedStyle(() => ({
    opacity: halo.get() > 0 && halo.get() < 1 ? 0.35 * (1 - halo.get()) : 0,
    transform: [{ scale: 1 + halo.get() * 0.7 }],
  }));
  const badge = useAnimatedStyle(() => ({
    transform: [{ rotate: `${turn.get()}deg` }],
  }));

  return (
    // The entrance on the outer view, the glide and squeeze on the inner one: they never fight over `transform`.
    <Animated.View entering={popIn} style={[styles.fabWrap, { bottom }]}>
      <Animated.View style={[StyleSheet.absoluteFill, wrap]}>
        <Animated.View pointerEvents="none" style={[styles.halo, ring]} />
        <Pressable
          style={[styles.fab, shadow.raised]}
          onPress={onPress}
          onPressIn={() => press.set(withSpring(0.9, motion.spring))}
          onPressOut={() => press.set(withSpring(1, motion.spring))}
          accessibilityRole="button"
          accessibilityLabel={`Changer d’espace. Actuel : ${label}`}
        >
          <Ionicons name={icon} size={22} color="#fff" />
          <Animated.View style={[styles.swap, badge]}>
            <Ionicons name="swap-horizontal" size={11} color={colors.primary} />
          </Animated.View>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fabWrap: { position: "absolute", right: 16, width: 54, height: 54 },
  halo: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.primary,
  },
  fab: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  swap: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  backdrop: { flex: 1, backgroundColor: "rgba(15,27,76,0.4)" },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
    gap: 6,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 8,
  },
  title: { ...typo.h3, color: colors.navy },
});
