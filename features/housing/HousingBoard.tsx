import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';

import { LivePulse } from '@/components/motion';
import { SPACE_BUTTON_CLEARANCE } from '@/components/SpaceSwitcher';
import { EmptyState, ErrorState, SkeletonCard } from '@/components/states';
import { Chip } from '@/components/ui';
import { formatFcfa } from '@/constants/data';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useChats } from '@/features/chat/ChatContext';
import { ago, FOR_LABEL, headline, housingApi, KIND, shortDate, type HousingAdDto, type HousingKind } from '@/features/housing/api';
import { ApiError } from '@/lib/api';
import { useNow } from '@/lib/useNow';

type Filter = 'all' | HousingKind | 'host' | 'mine' | 'match';

/**
 * Campus → Logement: students helping each other with a roof. A bright hero to post, the swaps that fit mine
 * pointed out, chips by kind, and lively cards: what it is at a glance (colour, icon, one line), the key facts as
 * small pills, who posted it and when, and « Écrire » (a private chat: no phone number shown).
 */
export function HousingBoard({ initial = 'all' }: { initial?: Filter }) {
  const now = useNow();
  const chats = useChats();
  const [ads, setAds] = useState<HousingAdDto[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  // ?filtre=mine (Profil → « Mes annonces logement »): opens on my ads, each time it's asked (n changes).
  const { filtre, n } = useLocalSearchParams<{ filtre?: string; n?: string }>();
  const [filter, setFilter] = useState<Filter>(filtre === 'mine' ? 'mine' : initial);
  const asked = `${filtre ?? ''}|${n ?? ''}`;
  const [seen, setSeen] = useState(asked);
  if (asked !== seen) {
    setSeen(asked);
    if (filtre === 'mine') setFilter('mine');
  }
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    () =>
      housingApi.list().then(
        (r) => {
          setAds(r.items);
          setFailed(null);
        },
        (err) => setFailed(err instanceof ApiError ? err.message : 'Connexion impossible.'),
      ),
    [],
  );
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!ads) return failed ? <ErrorState text={failed} onRetry={load} /> : <View style={styles.body}><SkeletonCard /><SkeletonCard /></View>;

  // Everything online, mine included (first): a student must see their own ad right after posting it.
  const open = ads.filter((a) => a.state === 'open').sort((x, y) => Number(y.mine) - Number(x.mine));
  const mine = ads.filter((a) => a.mine);
  const matches = open.filter((a) => a.match);
  const count = (k: HousingKind | 'host') => open.filter((a) => (k === 'host' ? a.kind === 'host_offer' || a.kind === 'host_need' : a.kind === k)).length;
  const shown =
    filter === 'mine'
      ? mine
      : filter === 'match'
        ? matches
        : filter === 'all'
          ? open
          : open.filter((a) => (filter === 'host' ? a.kind === 'host_offer' || a.kind === 'host_need' : a.kind === filter));
  const publish = () => router.push('/logement/publier' as never);

  return (
    <ScrollView
      alwaysBounceVertical={false}
      overScrollMode="never"
      contentContainerStyle={styles.body}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => (setRefreshing(true), load().finally(() => setRefreshing(false)))} />}>
      {/* The invitation: bright, short, one big button. */}
      <Animated.View entering={FadeInDown.duration(260)}>
        <LinearGradient colors={['#1E2A78', colors.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.heroIcons}>
            {(['swap', 'host_offer', 'roommate'] as const).map((k, i) => (
              <View key={k} style={[styles.heroIcon, { backgroundColor: KIND[k].grad[1], marginLeft: i ? -8 : 0 }]}>
                <Ionicons name={KIND[k].icon} size={16} color="#fff" />
              </View>
            ))}
          </View>
          <Text style={styles.heroTitle}>Un toit, entre étudiants</Text>
          <Text style={styles.heroText}>Échange ta chambre, trouve où dormir à ton arrivée, partage un loyer en ville.</Text>
          <Pressable style={({ pressed }) => [styles.heroBtn, pressed && { transform: [{ scale: 0.97 }] }]} onPress={publish} accessibilityRole="button">
            <Ionicons name="add-circle" size={18} color={colors.navy} />
            <Text style={styles.heroBtnText}>Publier une annonce</Text>
          </Pressable>
        </LinearGradient>
      </Animated.View>

      {/* My swaps that fit someone's: the reason to come back. */}
      {matches.length > 0 && filter !== 'match' && (
        <Animated.View entering={FadeInDown.delay(80).duration(260)}>
          <Pressable style={[styles.match, shadow.card]} onPress={() => setFilter('match')} accessibilityRole="button">
            <View style={styles.matchIcon}>
              <LivePulse color={colors.success} size={36} />
              <Ionicons name="swap-horizontal" size={18} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.matchTitle}>
                {matches.length} échange{matches.length > 1 ? 's' : ''} possible{matches.length > 1 ? 's' : ''} pour toi
              </Text>
              <Text style={styles.matchText}>Ils ont la chambre que tu cherches, et veulent la tienne.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.successText} />
          </Pressable>
        </Animated.View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipsWrap}>
        <Chip label={`Tout · ${open.length}`} selected={filter === 'all'} onPress={() => setFilter('all')} />
        <Chip icon="swap-horizontal" label={`Échanges · ${count('swap')}`} selected={filter === 'swap'} onPress={() => setFilter('swap')} />
        <Chip icon="bed-outline" label={`Hébergement · ${count('host')}`} selected={filter === 'host'} onPress={() => setFilter('host')} />
        <Chip icon="people-outline" label={`Colocation · ${count('roommate')}`} selected={filter === 'roommate'} onPress={() => setFilter('roommate')} />
        {matches.length > 0 && <Chip icon="sparkles-outline" label={`Pour toi · ${matches.length}`} selected={filter === 'match'} onPress={() => setFilter('match')} />}
        {mine.length > 0 && <Chip icon="person-outline" label={`Mes annonces · ${mine.length}`} selected={filter === 'mine'} onPress={() => setFilter('mine')} />}
      </ScrollView>

      {shown.length === 0 && (
        <EmptyState
          icon={filter === 'mine' ? 'document-text-outline' : 'home-outline'}
          title={filter === 'mine' ? 'Aucune annonce publiée' : 'Rien pour le moment'}
          text={filter === 'mine' ? 'Publie la tienne : elle reste en ligne 2 mois.' : 'Sois le premier : publie ton annonce, les étudiants du campus la verront ici.'}
          action={{ label: 'Publier une annonce', onPress: publish }}
        />
      )}

      {shown.map((a, i) => (
        <Animated.View key={a.id} entering={FadeInDown.delay(Math.min(i, 6) * 45).duration(240)} layout={LinearTransition}>
          <AdCard ad={a} now={now} unread={a.mine ? a.contactIds.reduce((n, id) => n + chats.unreadOf('housing_contact', id), 0) : chats.unreadOf('housing_contact', a.myContactId)} />
        </Animated.View>
      ))}

      {shown.length > 0 && (
        <View style={styles.safety}>
          <Ionicons name="shield-checkmark-outline" size={14} color={colors.muted2} />
          <Text style={styles.safetyText}>Ne paie jamais d’avance sans avoir vu la chambre. Écris dans l’app : ton numéro reste privé.</Text>
        </View>
      )}
    </ScrollView>
  );
}

/** One ad: the kind's colour and icon, one line, the facts as pills, who and when, the action. */
export function AdCard({ ad: a, now, unread = 0 }: { ad: HousingAdDto; now: number; unread?: number }) {
  const k = KIND[a.kind];
  const pills: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [];
  if (a.kind === 'swap' && a.room) pills.push({ icon: 'key-outline', text: `Chambre ${a.room}` });
  if (a.from || a.to) pills.push({ icon: 'calendar-outline', text: a.from && a.to ? `${shortDate(a.from)} → ${shortDate(a.to)}` : a.from ? `Dès le ${shortDate(a.from)}` : `Jusqu’au ${shortDate(a.to!)}` });
  if (a.rent) pills.push({ icon: 'cash-outline', text: `${formatFcfa(a.rent).replace(' FCFA', ' F')}/mois` });
  if (a.places) pills.push({ icon: 'person-add-outline', text: `${a.places} place${a.places > 1 ? 's' : ''}` });
  if (a.kind !== 'swap' && a.area && a.village) pills.push({ icon: 'location-outline', text: a.area });
  const forLabel = FOR_LABEL[a.for];
  if (forLabel) pills.push({ icon: a.for === 'girls' ? 'woman-outline' : 'man-outline', text: forLabel });

  return (
    <Pressable style={({ pressed }) => [styles.card, shadow.card, a.match && styles.cardMatch, pressed && { opacity: 0.94 }]} onPress={() => router.push(`/logement/${a.id}` as never)} accessibilityRole="button" accessibilityLabel={`${k.label} : ${headline(a)}`}>
      <View style={styles.cardTop}>
        <LinearGradient colors={k.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.kindIcon}>
          <Ionicons name={k.icon} size={20} color="#fff" />
        </LinearGradient>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.kindLabel, { color: k.fg }]}>{k.label.toUpperCase()}</Text>
          <Text style={styles.title} numberOfLines={2}>
            {headline(a)}
          </Text>
        </View>
        {a.match ? (
          <View style={styles.matchPill}>
            <Ionicons name="sparkles" size={11} color="#fff" />
            <Text style={styles.matchPillText}>Échange possible</Text>
          </View>
        ) : a.mine ? (
          <View style={[styles.minePill, a.state !== 'open' && { backgroundColor: colors.border }]}>
            <Text style={[styles.minePillText, a.state !== 'open' && { color: colors.muted2 }]}>{a.state === 'open' ? 'Mon annonce' : a.state === 'closed' ? 'Fermée' : 'Masquée'}</Text>
          </View>
        ) : null}
      </View>

      {pills.length > 0 && (
        <View style={styles.pills}>
          {pills.map((p) => (
            <View key={p.text} style={styles.pill}>
              <Ionicons name={p.icon} size={12} color={colors.navy} />
              <Text style={styles.pillText}>{p.text}</Text>
            </View>
          ))}
        </View>
      )}
      {a.note && (
        <Text style={styles.note} numberOfLines={2}>
          {a.note}
        </Text>
      )}

      <View style={styles.foot}>
        <View style={[styles.avatar, { backgroundColor: k.bg }]}>
          <Text style={[styles.avatarText, { color: k.fg }]}>{a.initials}</Text>
        </View>
        <Text style={styles.by} numberOfLines={1}>
          {a.mine ? 'Toi' : a.by} · {ago(a.createdAt, now)}
        </Text>
        {a.mine ? (
          <View style={styles.msgs}>
            <Ionicons name="chatbubbles-outline" size={14} color={colors.primary} />
            <Text style={styles.msgsText}>{a.contactIds.length}</Text>
            {unread > 0 && <View style={styles.unreadDot} />}
          </View>
        ) : (
          <View style={[styles.write, a.myContactId && styles.writeSoft]}>
            <Ionicons name={a.myContactId ? 'chatbubbles' : 'chatbubble-ellipses-outline'} size={14} color={a.myContactId ? colors.primary : '#fff'} />
            <Text style={[styles.writeText, a.myContactId && { color: colors.primary }]}>{a.myContactId ? 'Discussion' : 'Écrire'}</Text>
            {unread > 0 && <View style={styles.unreadDot} />}
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 14, paddingBottom: SPACE_BUTTON_CLEARANCE },
  hero: { borderRadius: radii.lg, padding: 18, gap: 8, overflow: 'hidden' },
  heroIcons: { flexDirection: 'row', marginBottom: 4 },
  heroIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#1E2A78' },
  heroTitle: { ...typo.h3, color: '#fff' },
  heroText: { ...typo.small, color: 'rgba(255,255,255,0.85)', lineHeight: 19 },
  heroBtn: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, marginTop: 6, paddingHorizontal: 16, minHeight: 40, borderRadius: radii.pill, backgroundColor: colors.accent },
  heroBtnText: { ...typo.smallStrong, color: colors.navy },
  match: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radii.lg, backgroundColor: colors.successBg },
  matchIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' },
  matchTitle: { ...typo.bodyStrong, color: colors.successText },
  matchText: { ...typo.caption, color: colors.successText, marginTop: 1 },
  chipsWrap: { marginHorizontal: -20 },
  chips: { gap: 8, paddingHorizontal: 20 },
  card: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 14, gap: 10 },
  cardMatch: { borderWidth: 1.5, borderColor: colors.success },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  kindIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  kindLabel: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.5 },
  title: { ...typo.title, color: colors.navy },
  matchPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radii.pill, backgroundColor: colors.success },
  matchPillText: { ...typo.label, color: '#fff' },
  minePill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radii.pill, backgroundColor: colors.primarySoft },
  minePillText: { ...typo.label, color: colors.primary },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: radii.pill, backgroundColor: colors.bg },
  pillText: { ...typo.captionStrong, color: colors.navy },
  note: { ...typo.small, color: colors.text, lineHeight: 19 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  avatar: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 10, fontWeight: '800' },
  by: { ...typo.caption, color: colors.muted2, flex: 1 },
  write: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, minHeight: 32, borderRadius: radii.pill, backgroundColor: colors.primary },
  writeSoft: { backgroundColor: colors.primarySoft },
  writeText: { ...typo.captionStrong, color: '#fff' },
  msgs: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  msgsText: { ...typo.captionStrong, color: colors.primary },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger, marginLeft: 2 },
  safety: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8 },
  safetyText: { ...typo.caption, color: colors.muted2, flex: 1, lineHeight: 17 },
});
