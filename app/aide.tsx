import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorState } from '@/components/states';
import { BackButton } from '@/components/ui';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { profileApi, type Support } from '@/features/profile/api';

/** The questions students ask most: answered here before they call. */
const FAQ: { q: string; a: string }[] = [
  { q: 'J’ai payé mais je n’ai pas mon billet', a: 'Ouvre « Mes billets » : le billet apparaît dès que Wave ou Orange Money confirme (souvent en quelques secondes). Sinon, le paiement est remboursé automatiquement.' },
  { q: 'Comment être remboursé d’une commande ?', a: 'Une commande refusée par le commerce, ou annulée avant qu’il l’accepte, est remboursée sur ton numéro de paiement.' },
  { q: 'J’ai perdu ma carte étudiant', a: 'Déclare-la dans Campus › Objets perdus. Si quelqu’un la scanne, tu es prévenu tout de suite.' },
  { q: 'Je n’arrive pas à me connecter', a: 'Utilise « Mot de passe oublié » sur l’écran de connexion : un code est envoyé par SMS à ton numéro.' },
];

/** "Aide & support": the FAQ, then the team (call, WhatsApp, e-mail). The contacts come from the backend. */
export default function Aide() {
  const [support, setSupport] = useState<Support | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  // The contacts couldn't be loaded: say so, with « Réessayer » (not an endless spinner).
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    profileApi.support().then(setSupport, () => setFailed(true));
  }, []);
  useEffect(load, [load]);
  const retry = () => {
    setFailed(false);
    load();
  };
  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profil'));
  const intl = (n: string) => `221${n.replace(/\D/g, '')}`;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.head}>
        <BackButton onPress={back} />
        <Text style={styles.h1}>Aide & support</Text>
      </View>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.section}>Questions fréquentes</Text>
        <View style={[styles.group, shadow.card]}>
          {FAQ.map((f, i) => (
            <Pressable key={f.q} style={[styles.faq, i > 0 && styles.line]} onPress={() => setOpen(open === i ? null : i)} accessibilityRole="button" accessibilityState={{ expanded: open === i }}>
              <View style={styles.row}>
                <Text style={styles.q}>{f.q}</Text>
                <Ionicons name={open === i ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted2} />
              </View>
              {open === i && <Text style={styles.a}>{f.a}</Text>}
            </Pressable>
          ))}
        </View>

        <Text style={styles.section}>Contacter l’équipe</Text>
        {!support ? (
          failed ? <ErrorState onRetry={retry} /> : <ActivityIndicator color={colors.primary} />
        ) : (
          <View style={{ gap: 10 }}>
            <Contact icon="call" tint={colors.primary} bg={colors.primarySoft} title="Appeler" value={support.phone} onPress={() => Linking.openURL(`tel:+${intl(support.phone)}`)} />
            <Contact icon="logo-whatsapp" tint="#128C7E" bg="#DCF8E8" title="WhatsApp" value={support.whatsapp} onPress={() => Linking.openURL(`https://wa.me/${intl(support.whatsapp)}`)} />
            <Contact icon="mail" tint={colors.orangeText} bg="#FFEDE3" title="E-mail" value={support.email} onPress={() => Linking.openURL(`mailto:${support.email}?subject=${encodeURIComponent('UGB Connect · Aide')}`)} />
            <Text style={styles.muted}>{support.hours}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Contact({ icon, tint, bg, title, value, onPress }: { icon: keyof typeof Ionicons.glyphMap; tint: string; bg: string; title: string; value: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.contact, shadow.card, pressed && { opacity: 0.9 }]} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title} : ${value}`}>
      <View style={[styles.icon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={20} color={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.q}>{title}</Text>
        <Text style={styles.muted}>{value}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 8 },
  h1: { ...typo.h3, color: colors.navy, flex: 1 },
  body: { padding: 20, gap: 12, paddingBottom: 40 },
  section: { ...typo.section, color: colors.navy, marginTop: 4 },
  group: { backgroundColor: colors.card, borderRadius: radii.lg, overflow: 'hidden' },
  faq: { padding: 14, gap: 8 },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  q: { ...typo.bodyStrong, color: colors.navy, flex: 1 },
  a: { ...typo.small, color: colors.muted2, lineHeight: 19 },
  contact: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: radii.lg, padding: 12 },
  icon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  muted: { ...typo.caption, color: colors.muted2 },
});
