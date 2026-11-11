import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radii, typo } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { hourLabel } from '@/features/caravans/api';
import { useKeptLists } from '@/features/organizer/boarding';
import { TicketScanner } from '@/features/organizer/TicketScanner';
import { useTicketCheck } from '@/features/organizer/useTicketCheck';

/** Scans any ticket of the organizer's departures: the server reads which one from the QR, nothing to pick first. */
export default function Scanner() {
  const check = useTicketCheck();
  const { organizer } = useAuth();
  // The passenger list link is a departure's: an events-only organization has none.
  const caravans = !organizer?.capabilities.includes('events') || organizer.capabilities.includes('caravans');
  const [focused, setFocused] = useState(false);
  // The lists this phone checks without network, and how current each one is.
  const lists = useKeptLists(focused);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={styles.h1}>Scanner</Text>
        {/* A request paid in cash: its own QR (also recognised below), or its code typed. */}
        <Pressable style={styles.payBtn} onPress={() => router.push('/valider-paiement')} accessibilityRole="button">
          <Ionicons name="cash-outline" size={20} color={colors.navy} />
          <View style={{ flex: 1 }}>
            <Text style={styles.payTitle}>Valider un paiement</Text>
            <Text style={styles.paySub}>Demande de billet ou de place payée en espèces : scanne son QR ou tape son code.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.navy} />
        </Pressable>
        <Text style={styles.payHint}>Billets et places validés : scanne-les ci-dessous, à l’entrée ou à l’embarquement.</Text>
        {lists.length > 0 && (
          <View style={styles.ready} accessibilityLabel="Listes gardées pour scanner hors ligne">
            <Text style={styles.readyTitle}>Prêt hors ligne</Text>
            {lists.map((l) => (
              <View key={l.id} style={styles.readyRow}>
                <Ionicons name={l.complete ? 'checkmark-circle' : 'time-outline'} size={16} color={l.complete ? '#7BE0A6' : '#FFC46B'} />
                <Text style={styles.readyText} numberOfLines={2}>
                  {l.route} · liste de {hourLabel(l.at)}
                  {l.complete ? ' · complète' : ' · avant la fin des réservations, mise à jour avec le réseau'}
                </Text>
              </View>
            ))}
          </View>
        )}
        <TicketScanner active={focused} check={check} onOpenList={caravans ? (id) => router.push(`/depart/${id}`) : undefined} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.navy },
  body: { padding: 20, gap: 16, paddingBottom: 32 },
  h1: { ...typo.h1, color: '#fff' },
  ready: { gap: 6, padding: 12, borderRadius: radii.md, backgroundColor: 'rgba(255,255,255,0.08)' },
  readyTitle: { ...typo.captionStrong, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 0.5 },
  readyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  readyText: { ...typo.caption, flex: 1, color: '#fff', lineHeight: 17 },
  payBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radii.lg, backgroundColor: '#FFC46B' },
  payTitle: { ...typo.bodyStrong, color: colors.navy },
  paySub: { ...typo.caption, color: colors.navy, marginTop: 2 },
  payHint: { ...typo.caption, color: 'rgba(255,255,255,0.7)' },
});
