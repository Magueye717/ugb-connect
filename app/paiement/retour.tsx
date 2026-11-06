import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors, typo } from '@/constants/theme';
import { getPayment, type PaymentDto } from '@/features/payments/checkout';

/** Where each kind of payment is followed: the order, the tickets, the event, the banners, the taxi trips. */
function destination(p: PaymentDto): Href {
  switch (p.purpose) {
    case 'commerce_order':
      return `/commande/${p.purposeRef}`;
    case 'caravan_booking':
    case 'event_booking':
      return '/mes-billets';
    case 'event_publication':
      return `/mes-evenements/${p.purposeRef}`;
    case 'banner':
      return '/mes-publicites';
    case 'taxi_seat':
      return { pathname: '/(tabs)/caravanes', params: { vue: 'taxi' } };
    default:
      return '/(tabs)';
  }
}

/**
 * Where the Wave / Orange Money page sends the student back (ugbconnect://paiement/retour?ref=…). Usually the screen
 * that opened the payment is still there, waiting for the server's answer: return to it. Otherwise (the app was
 * restarted meanwhile), open what was paid for, where its status shows (paid, or still to finish), never a
 * screen unrelated to it.
 */
export default function PaymentReturn() {
  const { ref } = useLocalSearchParams<{ ref?: string }>();
  useEffect(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    if (!ref) {
      router.replace('/(tabs)');
      return;
    }
    getPayment(ref).then(
      (p) => router.replace(destination(p)),
      () => router.replace('/(tabs)'),
    );
  }, [ref]);
  return (
    <View style={styles.root} accessibilityLiveRegion="polite">
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.text}>Vérification du paiement…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: colors.bg },
  text: { ...typo.body, color: colors.muted2 },
});
