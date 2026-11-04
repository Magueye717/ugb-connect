import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import Animated, { FadeInDown, interpolateColor, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, motion, radii, typo } from '@/constants/theme';
import { bellLabel, useNotifications } from '@/context/NotificationsContext';
import { haptics } from '@/lib/haptics';

/** Shortest time a spinner stays up: a fast answer would otherwise make it flash unseen, as if nothing happened. */
const MIN_SPINNER_MS = 600;

/** `loading`, held on until the spinner has been visible for at least MIN_SPINNER_MS. */
function useVisibleLoading(loading: boolean) {
  const startedAt = useRef<number | null>(null);
  const [holding, setHolding] = useState(false);
  useEffect(() => {
    if (loading) {
      startedAt.current = Date.now();
      return;
    }
    if (startedAt.current === null) return;
    const left = MIN_SPINNER_MS - (Date.now() - startedAt.current);
    startedAt.current = null;
    if (left <= 0) return;
    setHolding(true);
    const t = setTimeout(() => setHolding(false), left);
    return () => clearTimeout(t);
  }, [loading]);
  return loading || holding;
}

export function PrimaryButton({
  label,
  onPress,
  loading,
  disabled,
  accent,
  style,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  /** Orange button of the welcome screen, for the sign-up / sign-in flow. */
  accent?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const busy = useVisibleLoading(!!loading);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      style={({ pressed }) => [
        styles.primary,
        accent && styles.accent,
        pressed && styles.pressed,
        disabled && !busy && styles.disabled,
        style,
      ]}>
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryLabel}>{label}</Text>}
    </Pressable>
  );
}

export function OutlineButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.outline, pressed && styles.pressed, disabled && { opacity: 0.4 }]}>
      <Text style={styles.outlineLabel}>{label}</Text>
    </Pressable>
  );
}

/**
 * A secondary action that must still read as a button ("Choisir une photo", "Annuler", "Tout voir"): a soft pill,
 * never bare coloured text. `danger` for what removes or cancels.
 */
export function TextButton({
  label,
  onPress,
  icon,
  tone = 'primary',
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: 'primary' | 'danger' | 'accent';
  disabled?: boolean;
  style?: object;
}) {
  const t = TEXT_BUTTON_TONES[tone];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={({ pressed }) => [styles.textBtn, { backgroundColor: t.bg }, pressed && styles.pressed, disabled && { opacity: 0.4 }, style]}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}>
      {icon && <Ionicons name={icon} size={15} color={t.fg} />}
      <Text style={[styles.textBtnLabel, { color: t.fg }]} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}
const TEXT_BUTTON_TONES = {
  primary: { fg: colors.primary, bg: colors.primarySoft },
  danger: { fg: colors.dangerText, bg: colors.dangerBg },
  accent: { fg: colors.orangeText, bg: '#FFEDE3' },
};

export function Field({
  icon,
  right,
  prefix,
  invalid,
  secure,
  accent = colors.primary,
  onFocus,
  onBlur,
  ...props
}: TextInputProps & {
  icon?: keyof typeof Ionicons.glyphMap;
  right?: ReactNode;
  /** Fixed text before the input, e.g. a country code. */
  prefix?: string;
  invalid?: boolean;
  /** Password field with its own show / hide toggle. */
  secure?: boolean;
  /** Border and icon color while focused. */
  accent?: string;
}) {
  const [hidden, setHidden] = useState(true);
  const [focused, setFocused] = useState(false);
  // 0 → 1 while focused: the border takes the accent color and the field lifts a little.
  const focus = useSharedValue(0);
  const animated = useAnimatedStyle(() => ({
    // Animated styles win over static ones, so the error color is decided here too.
    borderColor: invalid ? colors.danger : interpolateColor(focus.get(), [0, 1], [colors.border, accent]),
    backgroundColor: interpolateColor(focus.get(), [0, 1], [colors.input, colors.card]),
    shadowOpacity: focus.get() * 0.12,
  }));
  return (
    <Animated.View
      style={[
        styles.field,
        { shadowColor: accent, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
        animated,
        invalid && styles.fieldInvalid,
      ]}>
      {icon ? (
        <Ionicons
          name={icon}
          size={18}
          color={invalid ? colors.danger : focused ? accent : colors.muted}
          style={styles.fieldIcon}
        />
      ) : null}
      {prefix ? (
        <View style={styles.prefix}>
          <Text style={styles.prefixText}>{prefix}</Text>
        </View>
      ) : null}
      <TextInput
        placeholderTextColor={colors.muted}
        style={styles.input}
        autoCapitalize="none"
        secureTextEntry={secure ? hidden : undefined}
        selectionColor={accent}
        onFocus={(e) => {
          setFocused(true);
          focus.set(withTiming(1, { duration: 180 }));
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          focus.set(withTiming(0, { duration: 180 }));
          onBlur?.(e);
        }}
        {...props}
      />
      {secure ? (
        <Pressable
          onPress={() => setHidden((h) => !h)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={hidden ? 'Afficher le mot de passe' : 'Masquer le mot de passe'}>
          <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.muted} />
        </Pressable>
      ) : null}
      {right}
    </Animated.View>
  );
}

export function LabeledField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {error ? (
        <Animated.Text entering={FadeInDown.duration(180)} style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Animated.Text>
      ) : null}
    </View>
  );
}

export function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.back} accessibilityRole="button" accessibilityLabel="Retour">
      <Ionicons name="arrow-back" size={20} color={colors.navy} />
    </Pressable>
  );
}

export function BellButton({ onPress }: { onPress: () => void }) {
  const { unreadCount } = useNotifications();
  return (
    <Pressable onPress={onPress} style={styles.bell} accessibilityRole="button" accessibilityLabel={bellLabel(unreadCount)}>
      <Ionicons name="notifications-outline" size={20} color={colors.navy} />
      {/* Only when something is new: a dot that's always on gets ignored. */}
      {unreadCount > 0 && <View style={styles.dot} />}
    </Pressable>
  );
}

export function StatusChip({
  label,
  tone,
}: {
  label: string;
  tone: 'success' | 'warning' | 'danger' | 'neutral';
}) {
  const map = {
    success: { bg: colors.successBg, fg: colors.success },
    warning: { bg: colors.warningBg, fg: colors.warning },
    danger: { bg: colors.dangerBg, fg: colors.danger },
    neutral: { bg: colors.bg, fg: colors.muted2 },
  }[tone];
  return (
    <View style={[styles.chip, { backgroundColor: map.bg }]}>
      <Text style={[styles.chipText, { color: map.fg }]}>{label}</Text>
    </View>
  );
}

/** Title + subtitle on the left, bell on the right (tab screens). */
export function ScreenHeader({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack?: () => void }) {
  return (
    <View style={styles.screenHead}>
      {onBack ? <BackButton onPress={onBack} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={styles.screenTitle}>{title}</Text>
        {subtitle ? <Text style={styles.screenSub}>{subtitle}</Text> : null}
      </View>
      <BellButton onPress={() => router.push('/notifications')} />
    </View>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  // One pill slides under the labels: you see where the selection went, not just that it changed.
  const [width, setWidth] = useState(0);
  const index = options.findIndex((o) => o.value === value);
  const segW = width / options.length;
  const x = useSharedValue(0);
  const placed = useRef(false);
  useLayoutEffect(() => {
    if (!segW || index < 0) return;
    // First layout: put it in place, no slide in from the left edge.
    x.set(placed.current ? withSpring(index * segW, motion.glide) : index * segW);
    placed.current = true;
  }, [index, segW, x]);
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  return (
    <View style={styles.segment} onLayout={(e) => setWidth(e.nativeEvent.layout.width - 8)}>
      {width > 0 && index >= 0 && <Animated.View style={[styles.segPill, { width: segW }, pill]} />}
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              if (on) return;
              haptics.select();
              onChange(o.value);
            }}
            style={styles.segBtn}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}>
            <Text style={[styles.segText, on && styles.segTextOn]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * A choice among a few (campus, category, role, day…): the same look in every form. 36 px tall, 44 px to the touch
 * (hit slop); off: white with a border (visible on a card and on the page), on: navy with white text. `role`: radio
 * for one choice, checkbox for several, tab for a switch.
 */
export function Chip({
  label,
  selected,
  onPress,
  role = 'radio',
  icon,
  disabled,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  role?: 'radio' | 'checkbox' | 'tab';
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
      style={({ pressed }) => [styles.choice, selected && styles.choiceOn, pressed && styles.pressed, disabled && { opacity: 0.45 }]}
      accessibilityRole={role}
      accessibilityState={role === 'tab' ? { selected, disabled: !!disabled } : { checked: selected, disabled: !!disabled }}>
      {icon && <Ionicons name={icon} size={15} color={selected ? '#fff' : colors.primary} />}
      <Text style={[styles.choiceText, selected && styles.choiceTextOn]}>{label}</Text>
    </Pressable>
  );
}

/**
 * The end of a bottom sheet: as tall as the phone's navigation bar (gesture bar, Android buttons), so the sheet's last
 * button is never under it.
 */
export function SafeBottom() {
  const insets = useSafeAreaInsets();
  return <View style={{ height: insets.bottom }} />;
}

export function FilterChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
      {options.map((o) => {
        const on = o === value;
        return (
          <Pressable key={o} onPress={() => onChange(o)} hitSlop={{ top: 2, bottom: 2 }} style={[styles.filter, on && styles.filterOn]} accessibilityRole="radio" accessibilityState={{ checked: on }}>
            <Text style={[styles.filterText, on && styles.filterTextOn]}>{o}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Main buttons: same 16 px corners everywhere (welcome, sign-up, checkout).
  primary: {
    backgroundColor: colors.accent,
    minHeight: 54,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: { ...typo.title, color: '#fff' },
  accent: {
    minHeight: 56,
    borderRadius: radii.md,
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  outline: {
    minHeight: 54,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.card,
  },
  outlineLabel: { ...typo.title, color: colors.primary },
  textBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 36, paddingHorizontal: 14, paddingVertical: 6, borderRadius: radii.pill },
  textBtnLabel: { ...typo.smallStrong, textAlign: 'center', flexShrink: 1 },
  pressed: { opacity: 0.86 },
  disabled: { opacity: 0.45 },
  field: {
    minHeight: 56,
    borderRadius: radii.md,
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  fieldInvalid: { borderColor: colors.danger, borderWidth: 1.5 },
  fieldIcon: { marginRight: 10 },
  prefix: { paddingRight: 10, marginRight: 10, borderRightWidth: 1, borderRightColor: colors.border },
  prefixText: { fontSize: 14, fontWeight: '600', color: colors.text },
  error: { ...typo.caption, color: colors.danger },
  input: { ...typo.body, flex: 1, color: colors.text, paddingVertical: 14 },
  label: { ...typo.bodyStrong, color: colors.navy },
  back: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  bell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    top: 10,
    right: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.orange,
  },
  choice: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 36, paddingHorizontal: 14, borderRadius: radii.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  choiceOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  choiceText: { ...typo.smallStrong, color: colors.navy },
  choiceTextOn: { color: '#fff' },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill },
  chipText: { fontSize: 12, fontWeight: '600' },
  screenHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 8 },
  screenTitle: { ...typo.h1, color: colors.navy },
  screenSub: { color: colors.muted2, marginTop: 2 },
  segment: { backgroundColor: colors.primarySoft, borderRadius: radii.pill, flexDirection: 'row', padding: 4 },
  segBtn: { flex: 1, minHeight: 40, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  segPill: { position: 'absolute', top: 4, bottom: 4, left: 4, borderRadius: radii.pill, backgroundColor: colors.primary },
  segText: { fontWeight: '700', color: colors.muted2 },
  segTextOn: { color: '#fff' },
  filters: { gap: 8, paddingHorizontal: 20 },
  filter: {
    paddingHorizontal: 14,
    minHeight: 40,
    borderRadius: radii.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontSize: 13, fontWeight: '600', color: colors.muted2 },
  filterTextOn: { color: '#fff' },
});
