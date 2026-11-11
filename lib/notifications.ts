import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { AndroidImportance, AndroidNotificationVisibility } from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { AppState, Platform, Vibration } from 'react-native';

import { mealTimes } from '@/constants/data';
import { api } from '@/lib/api';

// Notifications carry the screen to open in `data.url` (see useNotificationRouting).
export type NotificationData = { url?: string };

const CHANNEL_ID = 'campus';
// A shop's new orders: its own channel, louder and longer (the backend picks it for `commerce.order_placed`).
const ORDERS_CHANNEL_ID = 'commandes';

// Show notifications as banners even while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let lastBuzz = 0;

/**
 * Vibrates for a notification that arrives while the app is open (push or live bell update). Once per burst: the
 * push and the live update of the same event arrive together.
 */
export function buzz() {
  if (Platform.OS === 'web') return;
  const now = Date.now();
  if (now - lastBuzz < 2500) return;
  lastBuzz = now;
  // iOS ignores patterns: one standard vibration.
  Vibration.vibrate(Platform.OS === 'android' ? [0, 250, 150, 250] : 400);
}

let setupDone = false;
// Set once the Android channel exists; otherwise Android falls back to its default channel.
let channelId: string | undefined;

/**
 * Creates the Android channels, asks for permission once, registers this phone for push (every account: a shop owner
 * gets their orders with the app closed), then schedules the daily meal reminders for students.
 * Safe to call on every launch: it only prompts when the user hasn't answered yet.
 */
export async function setupNotifications({ meals }: { meals: boolean }) {
  if (setupDone) return;
  setupDone = true;
  // Notifications are a bonus: a failure here must never break the home screen.
  try {
    // Android 13+ only shows the permission prompt once a channel exists.
    if (Platform.OS === 'android') await createAndroidChannel();

    let { granted } = await Notifications.getPermissionsAsync();
    if (!granted) ({ granted } = await Notifications.requestPermissionsAsync());
    if (!granted) return;

    await registerPushToken();
    if (meals) await scheduleMealReminders();
    else await Promise.all(['meal-lunch', 'meal-dinner'].map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)));
  } catch (e) {
    if (__DEV__) console.warn('Notifications setup failed', e);
  }
}

async function createAndroidChannel() {
  try {
    // Every field set explicitly: some Android builds reject a channel with unset optional fields.
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Infos du campus',
      description: 'Menus, caravanes et alertes du campus',
      importance: AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0F1B4C',
      showBadge: true,
      enableVibrate: true,
      enableLights: true,
      lockscreenVisibility: AndroidNotificationVisibility.PUBLIC,
    });
    channelId = CHANNEL_ID;
    await Notifications.setNotificationChannelAsync(ORDERS_CHANNEL_ID, {
      name: 'Commandes reçues',
      description: 'Les nouvelles commandes de ton restaurant ou de ta boutique',
      importance: AndroidImportance.MAX,
      vibrationPattern: [0, 400, 200, 400, 200, 400],
      lightColor: '#F97316',
      showBadge: true,
      enableVibrate: true,
      enableLights: true,
      lockscreenVisibility: AndroidNotificationVisibility.PUBLIC,
    });
  } catch (e) {
    if (__DEV__) console.warn('Android notification channel not created, using the default one', e);
  }
}

// Fixed identifiers: rescheduling replaces the previous reminder instead of stacking duplicates.
async function scheduleMealReminders() {
  const meals = [
    { id: 'meal-lunch', meal: mealTimes.lunch, minutesBefore: 15 },
    { id: 'meal-dinner', meal: mealTimes.dinner, minutesBefore: 15 },
  ];
  for (const { id, meal, minutesBefore } of meals) {
    const at = meal.start * 60 - minutesBefore;
    await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: {
        title: `${meal.label} à ${meal.start}h · Resto 1 et Resto 2`,
        body: 'Regarde ce qui reste avant d’y aller.',
        data: { url: '/(tabs)' } satisfies NotificationData,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: Math.floor(at / 60),
        minute: at % 60,
        channelId,
      },
    });
  }
}

/** Reminds the student 2 hours before the bus reaches their pickup point. */
export async function scheduleCaravanReminder(
  caravan: { id: string; from: string; to: string },
  pickup: { place: string; time: string; at: number },
) {
  const remindAt = pickup.at - 2 * 60 * 60 * 1000;
  if (remindAt <= Date.now()) return;
  try {
    const { granted } = await Notifications.getPermissionsAsync();
    if (!granted) return;
    await Notifications.scheduleNotificationAsync({
      identifier: `caravan-${caravan.id}`,
      content: {
        title: `Ta caravane ${caravan.from} → ${caravan.to} passe dans 2 h`,
        body: `Montée à ${pickup.time} · ${pickup.place}. Sois-y 15 min avant.`,
        data: { url: `/caravane/${caravan.id}` } satisfies NotificationData,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(remindAt),
        channelId,
      },
    });
  } catch (e) {
    if (__DEV__) console.warn('Caravan reminder not scheduled', e);
  }
}

/**
 * Sunu Taxi: when seats lock (usually 30 min before), remind the student to check in at the meeting point.
 * Tapping it opens the trip, where "Je suis là" is one tap away.
 */
export async function scheduleTaxiReminder(trip: { id: string; from: string; departureAt: number; lockAt: number }) {
  const remindAt = trip.lockAt;
  if (remindAt <= Date.now()) return;
  const lockMinutes = Math.round((trip.departureAt - trip.lockAt) / 60_000);
  try {
    const { granted } = await Notifications.getPermissionsAsync();
    if (!granted) return;
    await Notifications.scheduleNotificationAsync({
      identifier: `taxi-${trip.id}`,
      content: {
        title: `Ton taxi part dans ${lockMinutes} min`,
        body: `Rendez-vous ${trip.from.split(' · ').pop()}. Appuie sur « Je suis là » en arrivant.`,
        data: { url: `/taxi/${trip.id}` } satisfies NotificationData,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(remindAt),
        channelId,
      },
    });
  } catch (e) {
    if (__DEV__) console.warn('Taxi reminder not scheduled', e);
  }
}

/** No reminder once the student left, cancelled, handed over or already checked in. */
export function cancelTaxiReminder(tripId: string) {
  Notifications.cancelScheduledNotificationAsync(`taxi-${tripId}`).catch(() => {});
}

let registeredToken: string | null = null;

/**
 * Gets this device's Expo push token and gives it to the backend, which then sends ticket transfers, departure
 * confirmations, refunds, chat messages… Needs an EAS project ID (`eas init`) and a development build; Expo Go
 * on Android can't receive remote push. Returns null until both exist (the in-app bell works anyway).
 */
export async function registerPushToken(): Promise<string | null> {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (!projectId) return null;
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api('PUT', '/me/push-tokens', { auth: true, body: { token, platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web' } });
    registeredToken = token;
    return token;
  } catch {
    // Network error or Expo Go on Android: try again on next launch.
    return null;
  }
}

/**
 * Keeps this phone registered for the signed-in account: again each time the app comes back to the foreground. A
 * registration that failed once (no network, Firebase not ready, permission given later in the settings) is retried,
 * not left until the next cold start; meanwhile the account's pushes would reach no phone. The call is idempotent.
 */
export function useKeepPushToken(signedIn: boolean) {
  useEffect(() => {
    if (!signedIn) return;
    const sub = AppState.addEventListener('change', async (s) => {
      if (s !== 'active') return;
      const { granted } = await Notifications.getPermissionsAsync().catch(() => ({ granted: false }));
      if (granted) await registerPushToken();
    });
    return () => sub.remove();
  }, [signedIn]);
}

/** Sign-out: this phone stops receiving the account's notifications. Best effort. */
export async function unregisterPushToken() {
  // The next account signed in on this phone registers again.
  setupDone = false;
  if (!registeredToken) return;
  const token = registeredToken;
  registeredToken = null;
  await api('POST', '/me/push-tokens/unregister', { auth: true, body: { token } }).catch(() => undefined);
}

/**
 * Opens a notification's screen. Each opening is marked (`n=`): a tab already showing another section switches to the
 * one asked (`?vue=publics` again after the student went to « Restos privés »), see TabScreen.
 */
export function openNotificationUrl(url: string) {
  router.push(`${url}${url.includes('?') ? '&' : '?'}n=${Date.now()}` as never);
}

/**
 * Opens the screen in `data.url` when a notification is tapped, whether the app was running or
 * was launched by the tap. Only navigates once the student is signed in.
 */
export function useNotificationRouting(signedIn: boolean) {
  useEffect(() => {
    if (!signedIn) return;
    let active = true;

    const open = (response: Notifications.NotificationResponse | null) => {
      const url = (response?.notification.request.content.data as NotificationData | undefined)?.url;
      if (typeof url === 'string') {
        openNotificationUrl(url);
        Notifications.clearLastNotificationResponseAsync();
      }
    };

    Notifications.getLastNotificationResponseAsync().then((r) => active && open(r));
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    // Arrived while the app is open: shown as a banner (handler above), and the phone vibrates.
    const received = Notifications.addNotificationReceivedListener(() => buzz());
    return () => {
      active = false;
      sub.remove();
      received.remove();
    };
  }, [signedIn]);
}
