import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { colors } from '@/constants/theme';
import { AuthProvider, spaceHome, useAuth } from '@/context/AuthContext';
import { CampusProvider } from '@/context/CampusContext';
import { CaravansProvider } from '@/context/CaravansContext';
import { CartProvider } from '@/context/CartContext';
import { LostProvider } from '@/context/LostContext';
import { NotificationsProvider } from '@/context/NotificationsContext';
import { OrdersProvider } from '@/context/OrdersContext';
import { OfflineBanner } from '@/components/states';
import { CropHost } from '@/components/CropHost';
import { NoticeHost } from '@/components/NoticeHost';
import { Toaster } from '@/components/Toaster';
import { TaxiProvider } from '@/context/TaxiContext';
import { ChatsProvider } from '@/features/chat/ChatContext';
import { setupNotifications, useKeepPushToken, useNotificationRouting } from '@/lib/notifications';

// A screen that throws shows what broke (and « Réessayer ») instead of closing the app.
export { CrashScreen as ErrorBoundary } from '@/components/CrashScreen';

// The native splash (the brand's blue and the logo, app.json) stays up while the saved session is checked, then fades
// out: no blank screen between the splash and the first page.
SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ duration: 350, fade: true });
/** Never more than this on the splash, even if the check is slow (weak network): the app opens anyway. */
const SPLASH_MAX_MS = 5000;

function SplashGate() {
  const { status } = useAuth();
  useEffect(() => {
    if (status !== 'restoring') {
      SplashScreen.hideAsync().catch(() => {});
      return;
    }
    const t = setTimeout(() => SplashScreen.hideAsync().catch(() => {}), SPLASH_MAX_MS);
    return () => clearTimeout(t);
  }, [status]);
  return null;
}

function NotificationRouter() {
  const { user, space } = useAuth();
  useNotificationRouting(!!user);
  useKeepPushToken(!!user);
  // Every signed-in account gets push on this phone (students, shops, organizers, staff); meal reminders are for students.
  useEffect(() => {
    if (user && space) setupNotifications({ meals: space === 'student' });
  }, [user, space]);
  return null;
}

// Each space only exists for accounts allowed in it: a student can't open the organizer screens,
// even from a link. Client-side only: the backend must check the role too.
function Screens() {
  const { space, user } = useAuth();
  // Where a blocked screen sends you: the other space when switching, sign-in when logged out.
  const home = spaceHome(space, user?.roles);
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      {/* Readable signed in or not (welcome screen, sign-up, profile). */}
      <Stack.Screen name="legal/[doc]" />
      <Stack.Screen name="espace" options={{ animation: 'fade' }} />
      {/* Paid banners: anyone signed in, from any space (a student, an organizer, a business). */}
      <Stack.Protected guard={!!space} redirectTo={home}>
        <Stack.Screen name="mes-publicites" />
        <Stack.Screen name="publicite" />
        {/* The bell: every account gets its own notifications (a shop its orders, a student their tickets…). */}
        <Stack.Screen name="notifications" />
        <Stack.Screen name="aide" />
        {/* « Y aller »: the walk on the UGB map, from any space (a place, a restaurant, a shop, a lost item). */}
        <Stack.Screen name="itineraire" />
      </Stack.Protected>
      <Stack.Protected guard={space === 'student'} redirectTo={home}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="a-la-une" />
        <Stack.Screen name="alerte/[id]" />
        <Stack.Screen name="mes-etudes" />
        <Stack.Screen name="ma-carte" />
        <Stack.Screen name="infos" />
        <Stack.Screen name="mes-billets" />
        <Stack.Screen name="mes-commandes" />
        <Stack.Screen name="mes-objets" />
        <Stack.Screen name="logement/[id]" />
        <Stack.Screen name="logement/publier" />
        <Stack.Screen name="logement/discussion/[id]" />
        <Stack.Screen name="ma-boutique" />
        <Stack.Screen name="evenement/[id]" />
        <Stack.Screen name="evenements" />
        <Stack.Screen name="services/[slug]" />
        <Stack.Screen name="services/cours" />
        <Stack.Screen name="services/objets" />
        <Stack.Screen name="services/taxi" />
        <Stack.Screen name="caravane/[id]" />
        <Stack.Screen name="resto/[id]" />
        <Stack.Screen name="panier" />
        <Stack.Screen name="commande/[id]" />
        <Stack.Screen name="billet/[id]" />
        {/* A ticket a friend offers (or a seat booked for me): accepted here, from its notification. */}
        <Stack.Screen name="cadeau/[id]" />
        <Stack.Screen name="noter/[subject]/[id]" options={{ presentation: 'transparentModal', animation: 'fade' }} />
        <Stack.Screen name="taxi/[id]" />
        <Stack.Screen name="trajet/[id]" />
        <Stack.Screen name="paiement/retour" options={{ animation: 'none' }} />
        <Stack.Screen name="lieu/[id]" />
        <Stack.Screen name="objet/[id]" />
        <Stack.Screen name="objet/declarer" />
        <Stack.Screen name="objet/scanner" />
        <Stack.Screen name="objet/discussion/[id]" />
      </Stack.Protected>
      {/* Events: a student's own, or an organization's (opened from its organizer space with `org`). */}
      <Stack.Protected guard={space === 'student' || space === 'organizer'} redirectTo={home}>
        <Stack.Screen name="mes-evenements/index" />
        <Stack.Screen name="mes-evenements/[id]" />
        {/* A ticket or seat request paid in cash: scanned or typed, then validated. */}
        <Stack.Screen name="valider-paiement" />
        {/* A student's own event: its tickets scanned at the entrance (organizations use the Scanner tab). */}
        <Stack.Screen name="scanner-billets" />
      </Stack.Protected>
      <Stack.Protected guard={space === 'organizer'} redirectTo={home}>
        <Stack.Screen name="(organisateur)" />
        <Stack.Screen name="depart/[id]" />
        <Stack.Screen name="depart/edition/[id]" />
      </Stack.Protected>
      <Stack.Protected guard={space === 'business'} redirectTo={home}>
        <Stack.Screen name="(commerce)" />
        <Stack.Screen name="commande-recue/[id]" />
        <Stack.Screen name="remise" />
        <Stack.Screen name="ventes" />
      </Stack.Protected>
      <Stack.Protected guard={space === 'admin' || space === 'resto' || space === 'alerts' || space === 'directory'} redirectTo={home}>
        <Stack.Screen name="(staff)" />
      </Stack.Protected>
      {/* Référencement: a restaurant's or a shop's profile and catalog (the backend checks the editor's kind). */}
      <Stack.Protected guard={space === 'directory'} redirectTo={home}>
        <Stack.Screen name="fiche-commerce/[id]" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    // Keyboard handling for every form and sheet (react-native-keyboard-controller): inputs and buttons stay visible.
    // The app is already edge-to-edge (Expo, Android): without these the library adds its own status-bar padding on
    // top of the screens' safe areas, and every screen looks pushed down and cut at the top.
    <KeyboardProvider statusBarTranslucent navigationBarTranslucent preserveEdgeToEdge>
    <AuthProvider>
      <NotificationsProvider>
        {/* Restaurants' menus and the home screen's alerts. */}
        <CampusProvider>
          <CartProvider>
            <OrdersProvider>
              <CaravansProvider>
                {/* Every conversation (taxi now, lost & found next) and the app's WebSocket. */}
                <ChatsProvider>
                  <TaxiProvider>
                    <LostProvider>
                      <SplashGate />
                      <NotificationRouter />
                      <StatusBar style="light" />
                      <Screens />
                      {/* Above every screen while there's no connection. */}
                      <OfflineBanner />
                      {/* Short confirmations (toast()). */}
                      <Toaster />
                      {/* Messages worth a pause, with what comes next (notice()). */}
                      <NoticeHost />
                      <CropHost />
                    </LostProvider>
                  </TaxiProvider>
                </ChatsProvider>
              </CaravansProvider>
            </OrdersProvider>
          </CartProvider>
        </CampusProvider>
      </NotificationsProvider>
    </AuthProvider>
    </KeyboardProvider>
  );
}
