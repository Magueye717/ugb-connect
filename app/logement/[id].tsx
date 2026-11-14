import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { UnreadBadge } from '@/components/UnreadBadge';
import { PrimaryButton, StickyFooter, STICKY_FOOTER_SPACE, TextButton } from '@/components/ui';
import { formatFcfa } from '@/constants/data';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useChats } from '@/features/chat/ChatContext';
import { ago, FOR_LABEL, headline, housingApi, KIND, shortDate, type HousingAdDetail } from '@/features/housing/api';
import { ApiError } from '@/lib/api';
import { haptics } from '@/lib/haptics';
import { confirmAction } from '@/lib/notice';
import { toast } from '@/lib/toast';
import { useNow } from '@/lib/useNow';

const fail = (title: string) => (err: unknown) => Alert.alert(title, err instanceof ApiError ? err.message : 'Réessaie dans un instant.');

/** One housing ad: its colour band, the facts, the note, who posted it; « Écrire » (a private chat), or, mine, the chats and « Trouvé ! ». */
export default function LogementAnnonce() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const now = useNow();
  const chats = useChats();
  const [ad, setAd] = useState<HousingAdDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      housingApi.detail(id).then(setAd, (err) => (err instanceof ApiError && err.status === 404 ? setMissing(true) : fail('Annonce indisponible')(err)));
    }, [id]),
  );
  const back = () => (router.canGoBack() ? router.back() : router.replace({ pathname: '/(tabs)/lieux', params: { vue: 'logement' } }));

  if (!ad) {
    return (
      <View style={[styles.safe, { paddingTop: insets.top + 60, alignItems: 'center' }]}>
        {missing ? <Text style={styles.muted}>Cette annonce n’est plus en ligne.</Text> : <ActivityIndicator color={colors.primary} />}
        {missing && <TextButton label="Retour" onPress={back} style={{ marginTop: 12 }} />}
      </View>
    );
  }

  const k = KIND[ad.kind];
  const open = ad.state === 'open';
  const write = async () => {
    setBusy(true);
    try {
      const c = await housingApi.contact(ad.id);
      haptics.success();
      router.push(`/logement/discussion/${c.id}` as never);
    } catch (err) {
      fail('Impossible d’écrire')(err);
    } finally {
      setBusy(false);
    }
  };
  const close = () =>
    confirmAction({
      title: 'Fermer l’annonce ?',
      bullets: ['Elle disparaît du tableau', 'Les discussions restent lisibles, mais fermées'],
      confirm: 'Oui, c’est trouvé',
      keep: 'Garder en ligne',
      onConfirm: () =>
        housingApi.close(ad.id).then((next) => {
          setAd(next);
          toast('Annonce fermée. Bonne installation !');
        }, fail('Fermeture impossible')),
    });
  const report = () =>
    confirmAction({
      title: 'Signaler cette annonce ?',
      bullets: ['Arnaque, demande d’argent, contenu déplacé…', 'L’équipe du campus la vérifie'],
      confirm: 'Signaler',
      onConfirm: () => housingApi.report(ad.id).then(() => toast('Merci : l’annonce est signalée.'), fail('Signalement non envoyé')),
    });

  const facts: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }[] = [];
  if (ad.kind === 'swap') {
    if (ad.village) facts.push({ icon: 'home-outline', label: 'Sa chambre', value: `${ad.village}${ad.room ? ` · chambre ${ad.room}` : ''}` });
    facts.push({ icon: 'search-outline', label: 'Cherche', value: ad.wants.join(', ') });
  } else {
    if (ad.village) facts.push({ icon: 'home-outline', label: 'Village', value: ad.village });
    if (ad.area) facts.push({ icon: 'location-outline', label: ad.village ? 'Précision' : 'Quartier', value: ad.area });
  }
  if (ad.from || ad.to) facts.push({ icon: 'calendar-outline', label: 'Dates', value: ad.from && ad.to ? `Du ${shortDate(ad.from)} au ${shortDate(ad.to)}` : ad.from ? `Dès le ${shortDate(ad.from)}` : `Jusqu’au ${shortDate(ad.to!)}` });
  if (ad.rent) facts.push({ icon: 'cash-outline', label: 'Loyer', value: `${formatFcfa(ad.rent)} / mois par personne` });
  if (ad.places) facts.push({ icon: 'person-add-outline', label: 'Places', value: String(ad.places) });
  const forLabel = FOR_LABEL[ad.for];
  if (forLabel) facts.push({ icon: ad.for === 'girls' ? 'woman-outline' : 'man-outline', label: 'Pour', value: forLabel });

  return (
    // The bottom edge kept: the pinned button (« Trouvé ! », « Écrire ») sits above the phone's navigation bar.
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* Scrolls (and bounces) only when the content is taller than the screen. */}
      <ScrollView alwaysBounceVertical={false} overScrollMode="never" contentContainerStyle={{ paddingBottom: STICKY_FOOTER_SPACE.one + 8 }} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={k.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.band, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={back} style={styles.backBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel="Retour">
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </Pressable>
          <Animated.View entering={FadeInDown.duration(260)} style={{ gap: 8 }}>
            <View style={styles.bandIcon}>
              <Ionicons name={k.icon} size={26} color="#fff" />
            </View>
            <Text style={styles.bandKind}>{k.label.toUpperCase()}</Text>
            <Text style={styles.bandTitle}>{headline(ad)}</Text>
            <Text style={styles.bandMeta}>
              {ad.mine ? 'Ton annonce' : ad.by} · {ago(ad.createdAt, now)}
              {open ? ` · en ligne jusqu’au ${shortDate(ad.expiresAt)}` : ad.state === 'closed' ? ' · fermée' : ' · masquée'}
            </Text>
          </Animated.View>
        </LinearGradient>

        <View style={styles.body}>
          {ad.match && (
            <View style={styles.match}>
              <Ionicons name="sparkles" size={16} color={colors.successText} />
              <Text style={styles.matchText}>Échange possible : il a la chambre que tu cherches, et veut la tienne.</Text>
            </View>
          )}

          <Animated.View entering={FadeInDown.delay(60).duration(240)} style={[styles.card, shadow.card]}>
            {facts.map((f, i) => (
              <View key={f.label} style={[styles.fact, i > 0 && styles.factLine]}>
                <View style={[styles.factIcon, { backgroundColor: k.bg }]}>
                  <Ionicons name={f.icon} size={16} color={k.fg} />
                </View>
                <Text style={styles.factLabel}>{f.label}</Text>
                <Text style={styles.factValue}>{f.value}</Text>
              </View>
            ))}
          </Animated.View>

          {ad.note && (
            <Animated.View entering={FadeInDown.delay(100).duration(240)} style={[styles.card, shadow.card]}>
              <Text style={styles.noteQuote}>“</Text>
              <Text style={styles.note}>{ad.note}</Text>
            </Animated.View>
          )}

          {ad.mine && (
            <View style={{ gap: 8 }}>
              <Text style={styles.section}>Messages reçus · {ad.conversations.length}</Text>
              {ad.conversations.length === 0 ? (
                <Text style={styles.muted}>Personne ne t’a encore écrit. Tu reçois une notification dès qu’un étudiant le fait.</Text>
              ) : (
                <View style={[styles.card, shadow.card, { padding: 0 }]}>
                  {ad.conversations.map((c, i) => {
                    const unread = chats.unreadOf('housing_contact', c.contactId);
                    return (
                      <Pressable key={c.contactId} style={[styles.conv, i > 0 && styles.factLine]} onPress={() => router.push(`/logement/discussion/${c.contactId}` as never)} accessibilityRole="button">
                        <View style={[styles.factIcon, { backgroundColor: k.bg }]}>
                          <Ionicons name="chatbubble-ellipses-outline" size={16} color={k.fg} />
                        </View>
                        <Text style={[styles.factValue, { flex: 1, textAlign: 'left' }]}>{c.with}</Text>
                        {unread ? <UnreadBadge count={unread} /> : <Ionicons name="chevron-forward" size={16} color={colors.muted} />}
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          <View style={styles.safety}>
            <Ionicons name="shield-checkmark-outline" size={14} color={colors.muted2} />
            <Text style={styles.safetyText}>Ne paie jamais d’avance sans avoir vu la chambre. Rencontrez-vous dans un lieu public du campus.</Text>
          </View>
          {!ad.mine && <TextButton label="Signaler l’annonce" icon="flag-outline" tone="danger" onPress={report} style={{ alignSelf: 'center' }} />}
        </View>
      </ScrollView>

      {open && (
        <StickyFooter>
          {ad.mine ? (
            <PrimaryButton label="Trouvé ! Fermer l’annonce" icon="checkmark-done" onPress={close} />
          ) : ad.myContactId ? (
            <PrimaryButton label="Ouvrir la discussion" icon="chatbubbles-outline" onPress={() => router.push(`/logement/discussion/${ad.myContactId}` as never)} />
          ) : (
            <PrimaryButton label={`Écrire à ${ad.by.split(' ')[0]}`} icon="chatbubble-ellipses-outline" loading={busy} onPress={write} />
          )}
        </StickyFooter>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  band: { paddingHorizontal: 20, paddingBottom: 24, borderBottomLeftRadius: radii.xl, borderBottomRightRadius: radii.xl, gap: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  bandIcon: { width: 52, height: 52, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  bandKind: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, color: 'rgba(255,255,255,0.85)' },
  bandTitle: { ...typo.h2, color: '#fff' },
  bandMeta: { ...typo.caption, color: 'rgba(255,255,255,0.85)' },
  body: { padding: 20, gap: 14 },
  match: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: radii.md, backgroundColor: colors.successBg },
  matchText: { ...typo.smallStrong, color: colors.successText, flex: 1 },
  card: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 14 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  factLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  factIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  factLabel: { ...typo.small, color: colors.muted2, width: 80 },
  factValue: { ...typo.bodyStrong, color: colors.navy, flex: 1, textAlign: 'right' },
  noteQuote: { fontSize: 34, lineHeight: 34, fontWeight: '800', color: colors.border, marginBottom: -12 },
  note: { ...typo.body, color: colors.text, lineHeight: 21 },
  section: { ...typo.section, color: colors.navy },
  conv: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  muted: { ...typo.small, color: colors.muted2, lineHeight: 19 },
  safety: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  safetyText: { ...typo.caption, color: colors.muted2, flex: 1, lineHeight: 17 },
});
