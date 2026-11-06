import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

// Vibration for moments that matter (a seat paid, a ticket scanned), never on every tap.
// Android uses its system haptics (no VIBRATE needed); iOS skips them in Low Power Mode and while the camera runs.
const run = (android: Haptics.AndroidHaptics, ios: () => Promise<void>) => {
  if (Platform.OS === 'web') return;
  (Platform.OS === 'android' ? Haptics.performAndroidHapticsAsync(android) : ios()).catch(() => {});
};

export const haptics = {
  /** A choice changed: switch, stepper. */
  select: () => run(Haptics.AndroidHaptics.Segment_Tick, () => Haptics.selectionAsync()),
  success: () => run(Haptics.AndroidHaptics.Confirm, () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => run(Haptics.AndroidHaptics.Long_Press, () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => run(Haptics.AndroidHaptics.Reject, () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};

/**
 * A scan's verdict (a card read, an owner found, a ticket checked): a real vibration on Android too (its Vibrator,
 * felt even with the system's touch feedback off, where the light haptics above are often off). `afterMs`: let the
 * camera close first: iOS mutes haptics while it runs.
 */
/** Time for a full-screen camera to close before a verdict is felt. */
export const CAMERA_CLOSE_MS = 400;
const verdict = (type: Haptics.NotificationFeedbackType, afterMs = 0) => {
  if (Platform.OS === 'web') return;
  const go = () => Haptics.notificationAsync(type).catch(() => {});
  if (afterMs > 0) setTimeout(go, afterMs);
  else go();
};
export const scanFeel = {
  found: (afterMs?: number) => verdict(Haptics.NotificationFeedbackType.Success, afterMs),
  nothing: (afterMs?: number) => verdict(Haptics.NotificationFeedbackType.Warning, afterMs),
  refused: (afterMs?: number) => verdict(Haptics.NotificationFeedbackType.Error, afterMs),
};

