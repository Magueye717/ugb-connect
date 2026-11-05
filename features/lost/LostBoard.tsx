import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Field, Segmented } from '@/components/ui';
import { lostCategory } from '@/constants/data';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useLost } from '@/context/LostContext';
import { declaredAgo, type LostItemDto, type LostStatus } from '@/features/lost/api';
import { LostVisual } from '@/features/lost/LostVisual';
import { matches } from '@/lib/search';
import { useNow } from '@/lib/useNow';

type Tab = LostStatus | 'mine';
const TAB_LABELS: Record<Tab, string> = { found: 'Trouvés', lost: 'Perdus', mine: 'Mes objets' };

/** Where the item stands, in one word. */
function chip(o: LostItemDto): { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' } {
  if (o.returned) return { label: 'Rendu ✓', tone: 'neutral' };
  if (o.status === 'lost') return { label: 'Recherché', tone: 'danger' };
  return o.holder === 'office' ? { label: 'Au bureau', tone: 'warning' } : { label: 'Chez l’étudiant', tone: 'success' };
}
const DOT = { success: colors.success, warning: colors.warning, danger: colors.danger, neutral: colors.muted2 };

/**
 * Screen content without header or safe area: used by Campus › Objets perdus and, with `only="mine"`, by Profil ›
 * Mes objets perdus (the student's own declarations, without the Trouvés / Perdus switch).
 */
export function LostBoard({ only }: { only?: 'mine' } = {}) {
  const [tab, setTab] = useState<Tab>(only ?? 'found');
  const { items: loaded, refresh } = useLost();
  const items = loaded ?? [];
  const now = useNow();
  const [refreshing, setRefreshing] = useState(false);
  const pull = () => {
    setRefreshing(true);
    refresh().finally(() => setRefreshing(false));
  };
  // Open cases first; returned items stay visible, at the end.
  const [query, setQuery] = useState('');
  // A card can be found by the name on it: type your first name to find your student card.
  const search = (o: LostItemDto) => matches(query, [o.name, o.details, o.where, o.spot, lostCategory(o.category).label, o.owner]);
  // Mine: what I declared, and my student card someone found.
  const inTab = (o: LostItemDto, t: Tab) => (t === 'mine' ? o.mine || o.isOwner : o.status === t);
  const list = items
    .filter((o) => inTab(o, tab) && search(o))
    .sort((a, b) => Number(!!a.returned) - Number(!!b.returned));
  // Nothing here but results elsewhere: say where, rather than a dead end.
  const elsewhere = (only ? [] : (['found', 'lost', 'mine'] as Tab[]))
    .filter((t) => t !== tab)
    .map((t) => ({ t, n: items.filter((o) => inTab(o, t) && search(o)).length }))
    .filter((x) => x.n > 0);

  return (
    <>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pull} />}>
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>Perdu ou trouvé quelque chose ?</Text>
          <Text style={styles.bannerSub}>Déclare-le en 30 secondes</Text>
          <View style={styles.bannerActions}>
            <Pressable style={styles.declare} onPress={() => router.push('/objet/declarer?mode=found')} accessibilityRole="button">
              <Ionicons name="hand-left-outline" size={16} color={colors.accent} />
              <Text style={styles.declareText}>J’ai trouvé</Text>
            </Pressable>
            <Pressable style={styles.declare} onPress={() => router.push('/objet/declarer?mode=lost')} accessibilityRole="button">
              <Ionicons name="search-outline" size={16} color={colors.accent} />
              <Text style={styles.declareText}>J’ai perdu</Text>
            </Pressable>
          </View>
        </View>

        <Pressable style={[styles.scan, shadow.card]} onPress={() => router.push('/objet/scanner')} accessibilityRole="button">
          <View style={styles.scanIcon}>
            <Ionicons name="scan" size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.scanTitle}>Carte étudiant trouvée ?</Text>
            <Text style={styles.scanText}>Scanne-la : son propriétaire est prévenu tout de suite</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.muted} />
        </Pressable>

        <Field
          icon="search"
          placeholder="Téléphone, sac bleu, BU, ton prénom…"
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Rechercher un objet"
          right={
            query ? (
              <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Effacer la recherche">
                <Ionicons name="close-circle" size={18} color={colors.muted} />
              </Pressable>
            ) : null
          }
        />

        {!only && (
          <Segmented
            options={[
              { value: 'found', label: TAB_LABELS.found },
              { value: 'lost', label: TAB_LABELS.lost },
              { value: 'mine', label: TAB_LABELS.mine },
            ]}
            value={tab}
            onChange={setTab}
          />
        )}

        {query.trim() !== '' && list.length > 0 && (
          <Text style={styles.results}>
            {list.length} résultat{list.length > 1 ? 's' : ''}
          </Text>
        )}

        {!loaded && <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />}
        {loaded && list.length === 0 && (
          <View style={styles.emptyBox}>
            <Text style={styles.empty}>
              {query.trim()
                ? `Aucun objet pour « ${query.trim()} » ici.`
                : tab === 'mine'
                  ? 'Tu n’as encore rien déclaré.'
                  : 'Rien pour le moment.'}
            </Text>
            {elsewhere.map(({ t, n }) => (
              <Pressable key={t} onPress={() => setTab(t)} hitSlop={6}>
                <Text style={styles.elsewhere}>
                  {n} résultat{n > 1 ? 's' : ''} dans « {TAB_LABELS[t]} » →
                </Text>
              </Pressable>
            ))}
            {query.trim() !== '' && tab === 'found' && (
              <Pressable onPress={() => router.push('/objet/declarer?mode=lost')} hitSlop={6}>
                <Text style={styles.elsewhere}>Déclarer une perte →</Text>
              </Pressable>
            )}
          </View>
        )}

        <View style={styles.grid}>
          {list.map((o) => {
            const status = chip(o);
            const cat = lostCategory(o.category);
            const sub = [cat.label, o.kind === 'object' ? o.details : null].filter(Boolean).join(' · ');
            return (
              <Pressable
                key={o.id}
                style={({ pressed }) => [styles.card, shadow.card, pressed && { transform: [{ scale: 0.98 }] }]}
                onPress={() => router.push(`/objet/${o.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`${status.label} : ${o.name}, ${o.where}, ${declaredAgo(o.createdAt, now)}`}>
                <View style={[styles.visual, o.returned && styles.faded]}>
                  {/* Cards are never shown in photo: their type and a masked name only. */}
                  <LostVisual item={o} variant="card" />
                  <View style={styles.status}>
                    <View style={[styles.statusDot, { backgroundColor: DOT[status.tone] }]} />
                    <Text style={styles.statusText}>{status.label}</Text>
                  </View>
                </View>
                <View style={[styles.info, o.returned && styles.faded]}>
                  <Text style={styles.name} numberOfLines={2}>
                    {o.name}
                  </Text>
                  <Text style={styles.sub} numberOfLines={1}>
                    {sub}
                  </Text>
                  {o.isOwner ? (
                    <Text style={styles.owner} numberOfLines={1}>
                      C’est ta carte !
                    </Text>
                  ) : (
                    o.owner && (
                      <Text style={styles.owner} numberOfLines={1}>
                        {o.ownerNotified ? `✓ ${o.owner} prévenu(e)` : `Au nom de ${o.owner}`}
                      </Text>
                    )
                  )}
                  <View style={styles.meta}>
                    <View style={styles.where}>
                      <Ionicons name="location-outline" size={12} color={colors.muted2} />
                      <Text style={styles.whereText} numberOfLines={1}>
                        {o.where}
                      </Text>
                    </View>
                    <View style={styles.where}>
                      <Ionicons name="time-outline" size={12} color={colors.muted2} />
                      <Text style={styles.whereText} numberOfLines={1}>
                        {declaredAgo(o.createdAt, now)}
                      </Text>
                    </View>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 20, gap: 14, paddingBottom: 32 },
  banner: { backgroundColor: colors.accent, borderRadius: radii.lg, padding: 16 },
  bannerActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  bannerTitle: { ...typo.title, color: '#fff' },
  bannerSub: { ...typo.caption, color: 'rgba(255,255,255,0.9)', marginTop: 2 },
  declare: {
    flex: 1,
    justifyContent: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    minHeight: 34,
    borderRadius: radii.pill,
  },
  declareText: { ...typo.smallStrong, color: colors.accent },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  card: { width: '48%', backgroundColor: colors.card, borderRadius: radii.lg, overflow: 'hidden' },
  visual: { height: 118, backgroundColor: colors.bg },
  faded: { opacity: 0.5 },
  status: { position: 'absolute', top: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill, backgroundColor: 'rgba(255,255,255,0.95)' },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { ...typo.label, color: colors.navy },
  info: { padding: 10, gap: 3, flexGrow: 1 },
  sub: { ...typo.caption, color: colors.muted2 },
  meta: { marginTop: 'auto', paddingTop: 6, gap: 2 },
  owner: { ...typo.captionStrong, color: colors.successText },
  scan: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: radii.md, padding: 14 },
  scanIcon: { width: 42, height: 42, borderRadius: radii.sm, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  scanTitle: { ...typo.title, color: colors.navy },
  scanText: { ...typo.caption, color: colors.muted2, marginTop: 2 },
  name: { ...typo.bodyStrong, color: colors.navy },
  where: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  whereText: { ...typo.caption, color: colors.muted2, flexShrink: 1 },
  emptyBox: { alignItems: 'center', gap: 10, paddingVertical: 20 },
  empty: { color: colors.muted2, textAlign: 'center' },
  elsewhere: { color: colors.primary, fontWeight: '700' },
  results: { ...typo.smallStrong, color: colors.muted2 },
});
