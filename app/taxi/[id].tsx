import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/states';
import { BackButton } from '@/components/ui';
import { TAXI_LOCK_MIN } from '@/constants/data';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useTaxi } from '@/context/TaxiContext';
import { Avatar, ChatButton, Rule, TripCard, useNow } from '@/features/taxi/SunuTaxiBoard';
import { useTaxiActions } from '@/features/taxi/useTaxiActions';

// One Sunu Taxi trip: every action, who's in and who's already at the meeting point.
export default function TaxiTripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const taxi = useTaxi();
  const actions = useTaxiActions();
  const now = useNow();
  const back = () => (router.canGoBack() ? router.back() : router.replace({ pathname: '/(tabs)/caravanes', params: { vue: 'taxi' } }));
  const t = taxi.trips.find((x) => x.id === id);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.head}>
        <BackButton onPress={back} />
        <Text style={styles.h1}>Trajet Sunu Taxi</Text>
        {t && t.passengers.includes(taxi.me) && now < t.chatClosesAt ? (
          <ChatButton count={taxi.unreadFor(t.id)} onPress={() => router.push(`/trajet/${t.id}`)} />
        ) : (
          <View style={{ width: 44 }} />
        )}
      </View>

      {!t ? (
        <EmptyState icon="car-outline" title="Trajet introuvable" text="Il a peut-être été annulé ou est déjà terminé." action={{ label: 'Voir les trajets', onPress: back }} />
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <TripCard
            trip={t}
            me={taxi.me}
            now={now}
            suspended={actions.suspended}
            busy={!!actions.current && actions.current.id !== t.id}
            onBusy={actions.busy}
            onJoin={() => actions.join(t)}
            onPay={() => actions.resumePayment(t)}
            onLeave={(locked) => actions.leave(t, locked)}
            onCancel={(locked) => actions.cancel(t, locked)}
            onCheckIn={() => taxi.checkIn(t.id).catch(() => undefined)}
            onDepart={() => actions.depart(t)}
            onClaim={() => actions.claim(t)}
            messageCount={taxi.unreadFor(t.id)}
            onChat={() => router.push(`/trajet/${t.id}`)}
          />

          <Text style={styles.section}>Passagers</Text>
          <View style={[styles.card, shadow.card]}>
            {Array.from({ length: t.seats }, (_, i) => {
              const p = t.passengers[i];
              const here = !!p && t.checkedIn.includes(p);
              return (
                <View key={i} style={[styles.passenger, i > 0 && styles.divider]}>
                  {p ? <Avatar initials={taxi.initialsOf(p)} highlight={p === taxi.me} here={here} /> : <View style={styles.freeSeat} />}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.name, !p && { color: colors.muted2 }]}>
                      {p ? (p === taxi.me ? 'Toi' : taxi.nameOf(p)) : 'Place libre'}
                    </Text>
                    {p && <Text style={styles.role}>{i === 0 ? 'Organisateur' : 'Place payée'}</Text>}
                  </View>
                  {here && (
                    <View style={styles.here}>
                      <Ionicons name="checkmark-circle" size={14} color={colors.successText} />
                      <Text style={styles.hereText}>Au rendez-vous</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          <Text style={styles.section}>Règles</Text>
          <View style={[styles.card, shadow.card, { gap: 10, paddingVertical: 14 }]}>
            <Rule icon="wallet-outline" text="Tu paies ta place en rejoignant : prix fixe, connu d’avance." />
            <Rule icon="lock-closed-outline" text={`Places verrouillées ${TAXI_LOCK_MIN} min avant (à mi-chemin pour un départ proche) : quitter n’est plus remboursé.`} />
            <Rule icon="shield-checkmark-outline" text="Trajet annulé par l’organisateur : remboursé à 100 %." />
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 },
  h1: { ...typo.h3, color: colors.navy },
  body: { padding: 20, gap: 12, paddingBottom: 32 },
  section: { ...typo.section, color: colors.navy, marginTop: 6 },
  card: { backgroundColor: colors.card, borderRadius: radii.lg, paddingHorizontal: 14 },
  passenger: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  freeSeat: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed' },
  name: { ...typo.title, color: colors.navy },
  role: { ...typo.caption, color: colors.muted2, marginTop: 1 },
  here: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radii.pill, backgroundColor: colors.successBg },
  hereText: { ...typo.captionStrong, color: colors.successText },
});
