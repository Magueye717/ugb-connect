import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePullRefresh } from '@/components/PullRefresh';
import { Field, OutlineButton, PrimaryButton, SafeBottom, SheetHeader } from '@/components/ui';
import { lostCategory, lostOffice, lostSafetyTip, lostTone } from '@/constants/data';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { UnreadBadge, unreadLabel } from '@/components/UnreadBadge';
import { useLost } from '@/context/LostContext';
import { useChats } from '@/features/chat/ChatContext';
import { declaredAgo, lostApi, WHEN_LABEL, type CardType, type LostItemDetail } from '@/features/lost/api';
import { LostVisual } from '@/features/lost/LostVisual';
import { CardVisual } from '@/features/lost/CardVisual';
import { ApiError } from '@/lib/api';
import { openDirections } from '@/lib/maps';

/** The card drawn for a found card: its type from the category (a licence is an identity document named so). */
const cardTypeOf = (i: LostItemDetail): CardType => (i.category === 'student-card' ? 'student' : i.category === 'bank-card' ? 'bank' : i.name === 'Permis de conduire' ? 'driving_licence' : 'national_id');
/** "Awa D." → the drawing's name; the card itself is never shown. */
const maskedHolder = (owner: string | null) => {
  if (!owner) return null;
  const [first = '', ...rest] = owner.split(' ');
  const last = rest.join(' ');
  return { firstName: first, lastName: last, initials: `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase() };
};
const fail = (title: string) => (err: unknown) => Alert.alert(title, err instanceof ApiError ? err.message : 'Réessaie dans un instant.');

// One lost or found item: what, where, where it is now, and how to reach the person — always inside the app.
export default function ObjetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { upsert } = useLost();
  const chats = useChats();
  const [item, setItem] = useState<LostItemDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [busy, setBusy] = useState(false);

  // Fresh each time it shows: a notification may bring it back after a new conversation.
  const load = useCallback(() => (id ? lostApi.get(id).then(setItem, (err) => (err instanceof ApiError && err.status === 404 ? setMissing(true) : undefined)) : undefined), [id]);
  useFocusEffect(useCallback(() => void load(), [load]));
  const pull = usePullRefresh(load);

  const back = () => (router.canGoBack() ? router.back() : router.replace({ pathname: '/(tabs)/lieux', params: { vue: 'objets' } }));
  if (!item) {
    return (
      <View style={[styles.root, styles.missing, { paddingTop: insets.top }]}>
        {missing ? (
          <>
            <Ionicons name="help-circle-outline" size={32} color={colors.muted} />
            <Text style={styles.muted}>Objet introuvable.</Text>
            <OutlineButton label="Retour" onPress={back} />
          </>
        ) : (
          <ActivityIndicator color={colors.primary} />
        )}
      </View>
    );
  }

  const cat = lostCategory(item.category);
  const tone = lostTone(item.category);
  const found = item.status === 'found';
  const isCard = item.kind !== 'object';
  const openChat = (claimId: string) => router.push(`/objet/discussion/${claimId}`);
  const status = item.returned
    ? { label: 'Rendu', fg: colors.muted2, bg: colors.bg }
    : found
      ? { label: 'Trouvé', fg: colors.successText, bg: colors.successBg }
      : { label: 'Perdu', fg: colors.orangeText, bg: '#FFE8D4' };
  // The declarer closes it; so does the owner of a found student card.
  const canClose = item.mine || item.isOwner;

  const run = async (action: () => Promise<void>, title: string) => {
    setBusy(true);
    try {
      await action();
    } catch (err) {
      fail(title)(err);
    } finally {
      setBusy(false);
    }
  };
  const foundIt = () =>
    run(async () => {
      const claim = await lostApi.foundIt(item.id);
      openChat(claim.id);
    }, 'Impossible d’ouvrir la discussion');
  const close = () =>
    Alert.alert(found ? 'Objet rendu ?' : 'Objet retrouvé ?', 'L’annonce sera fermée.', [
      { text: 'Pas encore', style: 'cancel' },
      {
        text: 'Oui',
        onPress: () =>
          run(async () => {
            const next = await lostApi.returned(item.id);
            setItem(next);
            upsert(next);
          }, 'Fermeture impossible'),
      },
    ]);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false} refreshControl={pull}>
        <View style={[styles.hero, { backgroundColor: tone.bg }]}>
          {isCard ? (
            <View style={[styles.cardHero, { paddingTop: insets.top + 56 }]}>
              <CardVisual type={cardTypeOf(item)} holder={maskedHolder(item.owner)} />
            </View>
          ) : (
            // Its photo, or a drawing of its type (keys, bag…) when none was sent.
            <LostVisual item={item} variant="hero" />
          )}
          <Pressable
            onPress={back}
            style={[styles.back, { top: insets.top + 8 }]}
            accessibilityRole="button"
            accessibilityLabel="Retour">
            <Ionicons name="arrow-back" size={20} color={colors.navy} />
          </Pressable>
        </View>

        <View style={[styles.card, shadow.raised]}>
          <View style={styles.pills}>
            <View style={[styles.pill, { backgroundColor: status.bg }]}>
              <Text style={[styles.pillText, { color: status.fg }]}>{status.label}</Text>
            </View>
            <View style={[styles.pill, { backgroundColor: colors.bg }]}>
              <Ionicons name={cat.icon} size={12} color={colors.muted2} />
              <Text style={[styles.pillText, { color: colors.muted2 }]}>{cat.label}</Text>
            </View>
          </View>
          <Text style={styles.name}>{item.name}</Text>
          {item.details && <Text style={styles.details}>{item.details}</Text>}
          {item.isOwner ? (
            <Text style={styles.owner}>C’est ta carte : {item.by} l’a trouvée.</Text>
          ) : (
            item.owner && <Text style={styles.owner}>{item.ownerNotified ? `✓ ${item.owner} a été prévenu(e)` : `Au nom de ${item.owner}`}</Text>
          )}
        </View>

        <View style={styles.body}>
          <View style={[styles.infoCard, shadow.card]}>
            <Info icon="location-outline" label={found ? 'Trouvé à' : 'Perdu à'} value={item.spot ? `${item.where} · ${item.spot}` : item.where} />
            <View style={styles.divider} />
            <Info icon="time-outline" label="Quand" value={`${WHEN_LABEL[item.when]} · déclaré ${declaredAgo(item.createdAt).toLowerCase()}`} />
            <View style={styles.divider} />
            <Info icon="person-outline" label={found ? 'Trouvé par' : 'Perdu par'} value={item.mine ? `Toi (${item.by})` : item.by} />
          </View>

          {item.returned ? (
            <View style={[styles.notice, { backgroundColor: colors.successBg }]}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              <Text style={[styles.noticeText, { color: colors.successText }]}>Rendu à son propriétaire. Affaire réglée !</Text>
            </View>
          ) : (
            <>
              {found && (
                <>
                  <Text style={styles.section}>Où le récupérer ?</Text>
                  {item.holder === 'office' ? (
                    <View style={[styles.infoCard, shadow.card]}>
                      <Info icon="business-outline" label={lostOffice.name} value={`${lostOffice.area} · ${lostOffice.hours}`} />
                      <Text style={styles.hint}>Présente-toi avec ta carte étudiant ou une pièce d’identité.</Text>
                      <OutlineButton label="Voir le bureau sur la carte" onPress={() => openDirections(lostOffice.coords, lostOffice.name)} />
                    </View>
                  ) : (
                    <View style={[styles.infoCard, shadow.card]}>
                      <Info icon="hand-left-outline" label={item.mine ? 'Tu le gardes' : `Chez ${item.by}`} value="Rendez-vous à convenir dans l’app" />
                      <View style={styles.tip}>
                        <Ionicons name="shield-checkmark-outline" size={14} color={colors.muted2} />
                        <Text style={styles.tipText}>{lostSafetyTip}</Text>
                      </View>
                    </View>
                  )}
                </>
              )}

              {/* Actions: my conversation, claim, report found. */}
              {item.myClaimId ? (
                <PrimaryButton
                  label={chats.unreadOf('lost_claim', item.myClaimId) ? `Ouvrir la discussion · ${unreadLabel(chats.unreadOf('lost_claim', item.myClaimId))}` : 'Ouvrir la discussion'}
                  onPress={() => openChat(item.myClaimId!)}
                />
              ) : item.mine || item.isOwner ? null : found ? (
                item.holder === 'finder' && <PrimaryButton label="C’est à moi" onPress={() => setClaiming(true)} />
              ) : (
                <PrimaryButton label="Je l’ai trouvé" loading={busy} onPress={foundIt} />
              )}

              {/* The declarer's conversations: one per person who wrote. */}
              {item.mine && item.conversations.length > 0 && (
                <View style={[styles.infoCard, shadow.card]}>
                  <Text style={styles.infoLabel}>Discussions</Text>
                  {item.conversations.map((c) => (
                    <Pressable key={c.claimId} style={styles.convRow} onPress={() => openChat(c.claimId)} accessibilityRole="button">
                      <Ionicons name="chatbubbles-outline" size={18} color={colors.primary} />
                      <Text style={[styles.infoValue, { flex: 1 }]}>{c.with}</Text>
                      <Text style={styles.hint}>{c.role === 'claim' ? 'Dit que c’est à lui' : c.role === 'card' ? 'Propriétaire' : 'L’a trouvé'}</Text>
                      {chats.unreadOf('lost_claim', c.claimId) ? <UnreadBadge count={chats.unreadOf('lost_claim', c.claimId)} /> : <Ionicons name="chevron-forward" size={16} color={colors.muted} />}
                    </Pressable>
                  ))}
                </View>
              )}
              {item.mine && item.conversations.length === 0 && (
                <Text style={styles.hint}>{found ? 'Personne ne s’est encore manifesté. Tu seras notifié.' : 'Tu seras notifié dès que quelqu’un pense l’avoir trouvé.'}</Text>
              )}

              {canClose && <OutlineButton label={found ? (item.isOwner ? 'Je l’ai récupérée' : 'Marquer comme rendu') : 'Je l’ai retrouvé'} onPress={close} />}
              {item.mine && item.secret && (
                <View style={styles.tip}>
                  <Ionicons name="lock-closed-outline" size={14} color={colors.muted2} />
                  <Text style={styles.tipText}>Ton détail de vérification (privé) : {item.secret}</Text>
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>

      <ClaimSheet
        visible={claiming}
        placeholder={cat.secretHint ?? 'Un détail qui ne se voit pas sur la photo…'}
        onClose={() => setClaiming(false)}
        onSend={async (proof) => {
          try {
            const claim = await lostApi.claim(item.id, proof);
            setClaiming(false);
            openChat(claim.id);
          } catch (err) {
            fail('Envoi impossible')(err);
          }
        }}
      />
    </View>
  );
}

function Info({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.info}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={16} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

/** "C'est à moi": a detail only the owner knows, so the finder can check before meeting. */
function ClaimSheet({
  visible,
  placeholder,
  onClose,
  onSend,
}: {
  visible: boolean;
  placeholder: string;
  onClose: () => void;
  onSend: (proof: string) => Promise<void>;
}) {
  const [proof, setProof] = useState('');
  const [sending, setSending] = useState(false);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} onShow={() => setProof('')}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fermer" />
      <KeyboardAvoidingView behavior="padding" style={{ flexShrink: 1 }}>
        <View style={styles.sheet}>
          <SheetHeader onClose={onClose} titleStyle={styles.sheetTitle}>Prouve que c’est à toi</SheetHeader>
          <Text style={styles.sheetText}>
            Décris un détail qui ne se voit pas sur la photo. La personne qui l’a trouvé vérifie avant de te le rendre.
          </Text>
          <Field
            icon="key-outline"
            placeholder={placeholder}
            value={proof}
            onChangeText={setProof}
            autoCapitalize="sentences"
            maxLength={140}
            autoFocus
          />
          <PrimaryButton
            label="Envoyer et ouvrir la discussion"
            disabled={proof.trim().length < 3 || sending}
            loading={sending}
            onPress={() => {
              setSending(true);
              onSend(proof.trim()).finally(() => setSending(false));
            }}
          />
          <SafeBottom />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  missing: { alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
  muted: { color: colors.muted2 },
  hero: { minHeight: 260 },
  cardHero: { paddingHorizontal: 32, paddingBottom: 44 },
  back: {
    position: 'absolute',
    left: 20,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  card: { marginTop: -28, marginHorizontal: 20, backgroundColor: colors.card, borderRadius: radii.lg, padding: 16, gap: 6 },
  pills: { flexDirection: 'row', gap: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 3, borderRadius: radii.pill },
  pillText: { ...typo.captionStrong },
  name: { ...typo.h2, color: colors.navy, marginTop: 4 },
  details: { ...typo.body, color: colors.muted2, lineHeight: 20 },
  owner: { ...typo.smallStrong, color: colors.successText },
  body: { paddingHorizontal: 20, marginTop: 16, gap: 12 },
  section: { ...typo.section, color: colors.navy, marginTop: 4 },
  infoCard: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 14, gap: 12 },
  info: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  infoLabel: { ...typo.caption, color: colors.muted2 },
  infoValue: { ...typo.bodyStrong, color: colors.navy, marginTop: 1 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  hint: { ...typo.small, color: colors.muted2 },
  tip: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  tipText: { ...typo.caption, flex: 1, color: colors.muted2, lineHeight: 17 },
  convRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderRadius: radii.md },
  noticeText: { ...typo.bodyStrong, flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,27,76,0.35)' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: 20, paddingBottom: 36, gap: 14 },
  sheetTitle: { ...typo.h3, color: colors.navy },
  sheetText: { ...typo.small, color: colors.muted2, lineHeight: 18 },
});
