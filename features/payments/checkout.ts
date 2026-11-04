// The payment step shared by every purchase (Sunu Taxi seat, caravan ticket…).
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { api } from '@/lib/api';

export type PaymentMethod = 'wave' | 'orange_money';
export const methodLabel: Record<PaymentMethod, string> = { wave: 'Wave', orange_money: 'Orange Money' };

/** `purpose` and `purposeRef`: what was paid (an order, a booking, a banner…), to open it after the payment page. */
export type PaymentPurpose = 'taxi_seat' | 'caravan_booking' | 'event_booking' | 'event_publication' | 'banner' | 'commerce_order';
export type PaymentDto = { reference: string; status: string; fulfillment: string; amount: number; checkoutUrl: string | null; expiresAt: string; purpose: PaymentPurpose; purposeRef: string };

/** Where the checkout page sends the student back: ugbcampus://paiement/retour (exp://… in Expo Go). */
export const paymentReturnUrl = () => Linking.createURL('paiement/retour');

export const getPayment = (reference: string) => api<PaymentDto>('GET', `/payments/${reference}`, { auth: true });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Opens the Wave / Orange Money page (the simulator in development) and waits for the server's answer: only the
 * server decides that money arrived, the page closing proves nothing. Returns the final payment, or the last
 * pending one if the provider hasn't confirmed yet.
 */
export async function payInBrowser(payment: { reference: string; checkoutUrl: string | null }): Promise<PaymentDto> {
  if (payment.checkoutUrl) await WebBrowser.openAuthSessionAsync(payment.checkoutUrl, paymentReturnUrl());
  let last = await getPayment(payment.reference);
  for (let i = 0; i < 5 && (last.status === 'pending' || last.status === 'created'); i++) {
    await sleep(1500);
    last = await getPayment(payment.reference);
  }
  return last;
}
