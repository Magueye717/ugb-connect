import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/ui';
import { services } from '@/constants/data';
import { colors, radii, typo } from '@/constants/theme';

const copy: Record<string, { title: string; body: string }> = {
  objets: {
    title: 'Objets perdus',
    body: 'Déclare un objet perdu ou retrouve ce qui a été déposé au bureau social.',
  },
  bourses: {
    title: 'Bourses',
    body: 'Suis l’état de ta bourse CROUS et les calendriers de paiement.',
  },
  cours: {
    title: 'Cours',
    body: 'Emploi du temps, salles et changements de dernière minute.',
  },
  inscription: {
    title: 'Inscription',
    body: 'Pièces, échéances et statut de ton inscription pédagogique.',
  },
  tickets: {
    title: 'Mes billets',
    body: 'Tes réservations de caravane apparaîtront ici.',
  },
};

export default function ServiceScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const meta = copy[slug ?? ''] ?? { title: 'Service', body: 'Bientôt disponible.' };
  const svc = services.find((s) => s.key === slug);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.head}>
        <BackButton onPress={() => router.back()} />
        <Text style={styles.h1}>{meta.title}</Text>
      </View>
      <View style={{ padding: 20, alignItems: 'center', gap: 16 }}>
        <View style={[styles.icon, { backgroundColor: svc?.bg ?? colors.primarySoft }]}>
          <Ionicons name={svc?.icon ?? 'grid-outline'} size={28} color={svc?.tint ?? colors.primary} />
        </View>
        <Text style={styles.body}>{meta.body}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 8 },
  h1: { ...typo.h3, color: colors.navy, flex: 1 },
  icon: { width: 72, height: 72, borderRadius: radii.lg, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  body: { color: colors.muted2, textAlign: 'center', lineHeight: 22, fontSize: 16, paddingHorizontal: 12 },
});
