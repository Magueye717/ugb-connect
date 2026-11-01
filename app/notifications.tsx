import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton, FilterChips } from '@/components/ui';
import { EmptyState, ErrorState } from '@/components/states';
import { notificationFilters } from '@/constants/data';
import { colors, shadow, radii, typo } from '@/constants/theme';
import { useNotifications } from '@/context/NotificationsContext';
import { api, ApiError } from '@/lib/api';

type Filter = (typeof notificationFilters)[number];
const CATEGORY: Record<Exclude<Filter, 'Tout'>, string> = { Social: 'social', Cours: 'cours', Paiements: 'paiements' };

type Item = { id: string; category: string; type: string; title: string; body: string; icon: string; tone: string; url: string | null; read: boolean; createdAt: string };

/** Semantic tones from the server, colours from the theme. */
const TONES: Record<string, { tint: string; bg: string }> = {
  primary: { tint: colors.primary, bg: colors.primarySoft },
  success: { tint: colors.successText, bg: colors.successBg },
  warning: { tint: colors.warningText, bg: colors.warningBg },
  danger: { tint: colors.dangerText, bg: colors.dangerBg },
  purple: { tint: colors.purpleText, bg: '#EEE8FF' },
};

const DAY = 24 * 3_600_000;
const startOfDay = (t: number) => new Date(new Date(t).toDateString()).getTime();
function groupOf(at: number, now: number) {
  const today = startOfDay(now);
  return at >= today ? 'AUJOURD’HUI' : at >= today - DAY ? 'HIER' : 'PLUS ANCIEN';
}
function timeLabel(at: number, now: number) {
  const min = Math.floor((now - at) / 60_000);
  if (min < 1) return 'À l’instant';
  if (min < 60) return `${min} min`;
  if (at >= startOfDay(now)) return `${Math.floor(min / 60)} h`;
  const d = new Date(at);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function NotificationsScreen() {
  const [filter, setFilter] = useState<Filter>('Tout');
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // In a shop's space: its orders only, no categories to filter.
  const { markAllRead, scope } = useNotifications();

  const load = useCallback(async () => {
    try {
      const q = scope ? `?scope=${scope}` : filter === 'Tout' ? '' : `?category=${CATEGORY[filter]}`;
      setItems((await api<{ items: Item[] }>('GET', `/notifications${q}`, { auth: true })).items);
      setNow(Date.now());
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Connexion impossible.');
    } finally {
      setLoading(false);
    }
  }, [filter, scope]);

  // On opening, on coming back, and when the filter changes.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Opening the screen reads everything: the bell clears; what was new stays highlighted while it's open.
  useEffect(() => {
    markAllRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on opening
  }, []);

  const fresh = items.filter((n) => !n.read).length;
  const groups = ['AUJOURD’HUI', 'HIER', 'PLUS ANCIEN'];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.head}>
        <BackButton onPress={() => router.back()} />
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>{scope ? 'Notifications commandes' : 'Notifications'}</Text>
          <Text style={styles.sub}>{fresh ? `${fresh} nouvelle${fresh > 1 ? 's' : ''}` : 'Tout est lu'}</Text>
        </View>
      </View>
      {!scope && (
        <View style={{ marginTop: 14 }}>
          <FilterChips options={notificationFilters} value={filter} onChange={setFilter} />
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
        {loading && <ActivityIndicator color={colors.primary} />}
        {!loading && error && items.length === 0 && <ErrorState text={error} onRetry={load} />}
        {groups.map((g) => {
          const list = items.filter((n) => groupOf(Date.parse(n.createdAt), now) === g);
          if (!list.length) return null;
          return (
            <View key={g} style={{ gap: 10 }}>
              <Text style={styles.group}>{g}</Text>
              {list.map((n) => {
                const tone = TONES[n.tone] ?? TONES.primary;
                return (
                  <Pressable
                    key={n.id}
                    disabled={!n.url}
                    onPress={() => n.url && router.push(n.url as never)}
                    style={[styles.card, shadow.card, !n.read && styles.cardNew]}
                    accessibilityRole={n.url ? 'button' : undefined}
                    accessibilityLabel={!n.read ? `Nouveau : ${n.title}` : n.title}>
                    <View style={[styles.icon, { backgroundColor: tone.bg }]}>
                      <Ionicons name={(n.icon in Ionicons.glyphMap ? n.icon : 'notifications-outline') as keyof typeof Ionicons.glyphMap} size={18} color={tone.tint} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.title}>{n.title}</Text>
                      <Text style={styles.body2}>{n.body}</Text>
                    </View>
                    <View style={styles.side}>
                      <Text style={styles.time}>{timeLabel(Date.parse(n.createdAt), now)}</Text>
                      {!n.read && <View style={styles.newDot} />}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          );
        })}
        {!loading && !error && items.length === 0 && (
          <EmptyState
            icon="notifications-outline"
            title={scope ? 'Aucune commande notifiée' : filter === 'Tout' ? 'Aucune notification pour l’instant' : 'Rien dans cette catégorie'}
            text={scope ? 'Chaque nouvelle commande et chaque annulation arrive ici.' : undefined}
            action={filter === 'Tout' ? undefined : { label: 'Tout voir', onPress: () => setFilter('Tout') }}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 8 },
  h1: { ...typo.h1, color: colors.navy },
  sub: { color: colors.muted2, marginTop: 2 },
  body: { padding: 20, gap: 16, paddingBottom: 32 },
  group: { ...typo.label, color: colors.muted2, letterSpacing: 0.5 },
  card: { backgroundColor: colors.card, borderRadius: radii.md, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 40, height: 40, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center' },
  title: { ...typo.bodyStrong, color: colors.navy },
  body2: { ...typo.caption, color: colors.muted2, marginTop: 2 },
  time: { color: colors.muted2, fontSize: 11, marginTop: 2 },
  side: { alignSelf: 'stretch', alignItems: 'flex-end', gap: 8 },
  newDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  // New ones get a light accent border.
  cardNew: { borderWidth: 1, borderColor: colors.accentSoft, backgroundColor: colors.card },
});
