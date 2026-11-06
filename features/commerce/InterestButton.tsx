import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text } from 'react-native';

import { formatFcfa } from '@/constants/data';
import { radii, typo } from '@/constants/theme';
import { ApiError } from '@/lib/api';
import { haptics } from '@/lib/haptics';
import { toast } from '@/lib/toast';
import { commerceApi, type BusinessDto, type ItemDto } from './api';

type Props = {
  item: Pick<ItemDto, 'id' | 'name' | 'price' | 'detail' | 'photo' | 'interested'>;
  shop: Pick<BusinessDto, 'name' | 'phone'>;
  /** `compact`: on a product card's photo. `pill`: in a line of the shop's page or the details sheet. */
  variant?: 'compact' | 'pill';
};

const WHATSAPP = '#25D366';
const intl = (phone: string) => `221${phone.replace(/\D/g, '')}`;

/**
 * « Intéressé » on an article done on the spot (printing, repairs…: nothing to order). One tap tells the shop (its
 * team is notified, the student is on its « Intéressés » list) and opens WhatsApp with the shop, the message ready:
 * the article, its price, its photo. No WhatsApp on the phone: offer to call.
 */
export function InterestButton({ item, shop, variant = 'pill' }: Props) {
  const [on, setOn] = useState(!!item.interested);
  const [busy, setBusy] = useState(false);
  // A fresh list from the server wins (render-time, no effect).
  const [seen, setSeen] = useState(item);
  if (seen.id !== item.id || seen.interested !== item.interested) {
    setSeen(item);
    setOn(!!item.interested);
  }

  const openWhatsApp = () => {
    const text = [`Bonjour ${shop.name}, je suis intéressé(e) par « ${item.name} » (${formatFcfa(item.price)}) vu sur UGB Campus.`, item.detail, item.photo].filter(Boolean).join('\n');
    Linking.openURL(`https://wa.me/${intl(shop.phone)}?text=${encodeURIComponent(text)}`).catch(() =>
      Alert.alert('WhatsApp introuvable', `${shop.name} est prévenu et va te rappeler. Tu peux aussi l’appeler au ${shop.phone}.`, [
        { text: 'Fermer', style: 'cancel' },
        { text: 'Appeler', onPress: () => Linking.openURL(`tel:+${intl(shop.phone)}`) },
      ]),
    );
  };

  const press = async () => {
    if (busy) return;
    haptics.select();
    // Told once: the next taps only open the conversation again.
    if (!on) {
      setBusy(true);
      try {
        await commerceApi.interest(item.id, true);
        setOn(true);
      } catch (err) {
        // Its own shop, or the article changed: say why, nothing opens.
        if (err instanceof ApiError && !err.isNetwork) {
          toast(err.message, 'info');
          return;
        }
        // No network: WhatsApp still opens (the message is the main thing); the shop isn't told in the app.
      } finally {
        setBusy(false);
      }
    }
    openWhatsApp();
  };

  return (
    <Pressable
      onPress={press}
      hitSlop={6}
      style={({ pressed }) => [variant === 'compact' ? styles.compact : styles.pill, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
      accessibilityState={{ busy }}
      accessibilityLabel={`Intéressé par ${item.name} : prévenir ${shop.name} et lui écrire sur WhatsApp`}>
      <Ionicons name="logo-whatsapp" size={variant === 'compact' ? 14 : 16} color="#fff" />
      <Text style={styles.text}>Intéressé</Text>
      {on && <Ionicons name="checkmark" size={variant === 'compact' ? 12 : 14} color="#fff" />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 14, minHeight: 36, borderRadius: radii.pill, backgroundColor: WHATSAPP },
  compact: { position: 'absolute', left: 5, bottom: 5, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, height: 28, borderRadius: 14, backgroundColor: WHATSAPP },
  text: { ...typo.label, color: '#fff', fontWeight: '700' },
});
