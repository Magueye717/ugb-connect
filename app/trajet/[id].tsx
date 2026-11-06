import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton, Field, PrimaryButton, SafeBottom, SheetHeader } from '@/components/ui';
import { TAXI_CHAT_HOURS, taxiQuickReplies } from '@/constants/data';
import { colors, radii, typo } from '@/constants/theme';
import { useTaxi } from '@/context/TaxiContext';
import { useConversation, type ChatMessage } from '@/features/chat/useConversation';
import { ApiError } from '@/lib/api';
import { useNow } from '@/lib/useNow';
import { toast } from '@/lib/toast';

// Same text as the quick reply in constants/data.ts.
const CHECK_IN_REPLY = 'Je suis au point de rendez-vous';

const time = (at: number) => {
  const d = new Date(at);
  return `${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}`;
};

const fail = (title: string) => (err: unknown) => Alert.alert(title, err instanceof ApiError ? err.message : 'Réessaie dans un instant.');

// Sunu Taxi trip chat: only the organizer and paying passengers, read-only 2 h after departure.
// The conversation itself (messages, live updates, report, block) is the shared chat of features/chat.
export default function TripChat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const taxi = useTaxi();
  const now = useNow();
  const scroll = useRef<ScrollViewInstance>(null);
  const [text, setText] = useState('');
  const [pinning, setPinning] = useState(false);
  const trip = taxi.trips.find((t) => t.id === id);
  const chat = useConversation(trip?.conversationId);
  const { markRead } = chat;

  // Read while it's on screen: badges clear here and on the trip list.
  useEffect(() => {
    markRead();
  }, [markRead]);

  const back = () => (router.canGoBack() ? router.back() : router.replace({ pathname: '/(tabs)/caravanes', params: { vue: 'taxi' } }));

  if (!trip || !trip.conversationId || chat.revoked) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.head}>
          <BackButton onPress={back} />
        </View>
        <View style={styles.locked}>
          <Ionicons name="lock-closed-outline" size={32} color={colors.muted} />
          <Text style={styles.lockedTitle}>Discussion réservée</Text>
          <Text style={styles.lockedText}>Seuls l’organisateur et les passagers qui ont {trip && !trip.payOnline ? 'réservé' : 'payé'} leur place peuvent la lire.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const me = chat.me;
  const isOrganizer = trip.passengers[0] === taxi.me;
  const canWrite = !!chat.conversation?.canWrite;
  const { lockAt } = trip;

  // The lock is a moment in time, not an event: shown as a system line once it has passed.
  const lockLine: ChatMessage[] = now >= lockAt ? [{ id: 'lock', kind: 'system', body: trip.payOnline ? 'Places verrouillées 🔒' : 'L’heure du rendez-vous approche 🚕', author: null, at: lockAt, clientMessageId: null }] : [];
  const thread = [...chat.messages, ...lockLine].sort((a, b) => Number(!!a.pending) - Number(!!b.pending) || a.at - b.at);

  // Passengers check in at the meeting point; the organizer is the one waiting there.
  const canCheckIn = !isOrganizer && !trip.departed && trip.myStatus === 'joined' && !trip.checkedIn.includes(taxi.me);
  const needsCheckIn = canCheckIn && now >= lockAt;

  const send = (value: string, kind: 'text' | 'quick_reply' = 'text') => {
    if (!value.trim() || !canWrite) return;
    // "I'm at the meeting point" checks in: the server posts "Awa est là ✓" for everyone.
    if (value === CHECK_IN_REPLY && canCheckIn) taxi.checkIn(trip.id).catch(fail('Impossible de confirmer'));
    else chat.send(value, kind);
    if (kind === 'text') setText('');
  };

  const moderate = (m: ChatMessage) => {
    if (!m.author || m.author.key === me || m.pending) return;
    const name = m.author.name;
    Alert.alert(name, m.body, [
      {
        text: 'Signaler le message',
        onPress: () =>
          chat.report(m).then(
            () => toast('Message signalé : l’équipe Sunu Taxi va lire la conversation.'),
            fail('Signalement non envoyé'),
          ),
      },
      {
        text: `Bloquer ${name}`,
        style: 'destructive',
        onPress: () =>
          Alert.alert(`Bloquer ${name} ?`, 'Tu ne verras plus ses messages, dans aucune discussion.', [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Bloquer', style: 'destructive', onPress: () => chat.blockAuthor(m).catch(fail('Blocage impossible')) },
          ]),
      },
      { text: 'Fermer', style: 'cancel' },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.head}>
        <BackButton onPress={back} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {trip.from.split(' · ').pop()} → {trip.to.split(' · ').pop()}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            Départ {time(trip.departureAt)} · {trip.passengers.map(taxi.nameOf).join(', ')}
          </Text>
        </View>
      </View>

      {/* Pinned taxi: what to look for at the meeting point. */}
      {trip.taxi ? (
        <Pressable
          style={styles.pin}
          disabled={!isOrganizer || !canWrite}
          onPress={() => setPinning(true)}
          accessibilityRole={isOrganizer ? 'button' : undefined}
          accessibilityLabel={`Taxi : ${trip.taxi}`}>
          <Ionicons name="car-outline" size={18} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.pinLabel}>Taxi</Text>
            <Text style={styles.pinText}>{trip.taxi}</Text>
          </View>
          {isOrganizer && canWrite && <Ionicons name="create-outline" size={16} color={colors.muted2} />}
        </Pressable>
      ) : (
        isOrganizer &&
        canWrite && (
          <Pressable style={[styles.pin, styles.pinEmpty]} onPress={() => setPinning(true)} accessibilityRole="button">
            <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
            <Text style={styles.pinCta}>Indiquer le taxi (modèle, couleur, plaque)</Text>
          </Pressable>
        )
      )}

      {needsCheckIn && (
        <View style={styles.checkIn} accessibilityLiveRegion="polite">
          <Ionicons name="location-outline" size={18} color={colors.warningText} />
          <Text style={styles.checkInText}>Tu es au point de rendez-vous ?</Text>
          <Pressable style={styles.checkInBtn} onPress={() => taxi.checkIn(trip.id).catch(fail('Impossible de confirmer'))} accessibilityRole="button">
            <Ionicons name="hand-left-outline" size={14} color="#fff" />
            <Text style={styles.checkInBtnText}>Je suis là</Text>
          </Pressable>
        </View>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView
          ref={scroll}
          contentContainerStyle={styles.thread}
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
          keyboardShouldPersistTaps="handled">
          <View style={styles.safety}>
            <Ionicons name="shield-checkmark-outline" size={14} color={colors.muted2} />
            <Text style={styles.safetyText}>
              Ne partage pas ton numéro. Appuie longuement sur un message pour le signaler.
            </Text>
          </View>

          {chat.hasMore && (
            <Pressable onPress={() => chat.loadOlder().catch((err) => Alert.alert('Messages indisponibles', err instanceof ApiError ? err.message : 'Vérifie ta connexion et réessaie.'))} style={styles.older} accessibilityRole="button">
              <Text style={styles.olderText}>Messages précédents</Text>
            </Pressable>
          )}
          {chat.loading && <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />}
          {chat.error && <Text style={styles.hidden}>{chat.error}</Text>}

          {thread.map((m) => {
            if (!m.author) {
              return (
                <View key={m.id} style={styles.system}>
                  <Text style={styles.systemText}>{m.body}</Text>
                </View>
              );
            }
            const mine = m.author.key === me;
            return (
              <Pressable
                key={m.id}
                onLongPress={() => moderate(m)}
                onPress={m.pending === 'failed' ? () => chat.retry(m) : undefined}
                style={[styles.row, mine && styles.rowMine]}
                accessibilityHint={m.pending === 'failed' ? 'Appuie pour renvoyer' : mine ? undefined : 'Appui long pour signaler ou bloquer'}>
                {!mine && (
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{m.author.initials}</Text>
                  </View>
                )}
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther, m.pending && { opacity: 0.6 }]}>
                  {!mine && (
                    <Text style={styles.author}>
                      {m.author.name}
                      {m.author.role === 'organizer' ? ' · organisateur' : ''}
                    </Text>
                  )}
                  <Text style={[styles.text, mine && { color: '#fff' }]}>{m.body}</Text>
                  <Text style={[styles.time, mine && { color: 'rgba(255,255,255,0.75)' }]}>
                    {m.pending === 'failed' ? 'Non envoyé · appuie pour renvoyer' : m.pending ? 'Envoi…' : time(m.at)}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        {!canWrite ? (
          <View style={styles.closed}>
            <Ionicons name="lock-closed-outline" size={14} color={colors.muted2} />
            <Text style={styles.closedText}>
              {chat.conversation?.status === 'closed'
                ? 'Trajet annulé · discussion fermée'
                : now >= trip.chatClosesAt
                  ? `Discussion fermée ${TAXI_CHAT_HOURS} h après le départ`
                  : 'Tu peux lire la discussion, plus y écrire'}
            </Text>
          </View>
        ) : (
          <View style={styles.composer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quick} keyboardShouldPersistTaps="handled">
              {taxiQuickReplies.map((q) => (
                <Pressable key={q} style={styles.quickChip} onPress={() => send(q, 'quick_reply')} accessibilityRole="button">
                  <Text style={styles.quickText}>{q}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="Message"
                placeholderTextColor={colors.muted}
                value={text}
                onChangeText={setText}
                multiline
                maxLength={500}
                accessibilityLabel="Écrire un message"
              />
              <Pressable
                style={[styles.send, !text.trim() && { opacity: 0.4 }]}
                disabled={!text.trim()}
                onPress={() => send(text)}
                accessibilityRole="button"
                accessibilityLabel="Envoyer">
                <Ionicons name="send" size={18} color="#fff" />
              </Pressable>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>

      <PinSheet
        visible={pinning}
        initial={trip.taxi ?? ''}
        onClose={() => setPinning(false)}
        onSave={(value) => {
          taxi.pinTaxi(trip.id, value).then(
            () => setPinning(false),
            (err) => Alert.alert('Taxi non enregistré', err instanceof ApiError ? err.message : 'Réessaie.'),
          );
        }}
      />
    </SafeAreaView>
  );
}

function PinSheet({
  visible,
  initial,
  onClose,
  onSave,
}: {
  visible: boolean;
  initial: string;
  onClose: () => void;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const valid = value.trim().length >= 4;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} onShow={() => setValue(initial)}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fermer" />
      <KeyboardAvoidingView behavior="padding" style={{ flexShrink: 1 }}>
        <View style={styles.sheet}>
          <SheetHeader onClose={onClose} titleStyle={styles.sheetTitle}>Quel taxi ?</SheetHeader>
          <Text style={styles.sheetText}>Modèle, couleur et plaque : les passagers le retrouvent plus vite, et c’est plus sûr.</Text>
          <Field
            icon="car-outline"
            placeholder="Peugeot 406 jaune · DK-1234-A"
            value={value}
            onChangeText={setValue}
            autoCapitalize="sentences"
            autoFocus
          />
          <PrimaryButton label="Épingler" disabled={!valid} onPress={() => onSave(value.trim())} />
          <SafeBottom />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 10 },
  title: { ...typo.title, color: colors.navy },
  subtitle: { ...typo.caption, color: colors.muted2, marginTop: 1 },
  locked: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 },
  lockedTitle: { ...typo.title, color: colors.navy },
  lockedText: { ...typo.small, color: colors.muted2, textAlign: 'center' },
  checkIn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 6,
    paddingVertical: 8,
    paddingLeft: 12,
    paddingRight: 8,
    borderRadius: radii.md,
    backgroundColor: colors.warningBg,
  },
  checkInText: { ...typo.smallStrong, flex: 1, color: colors.warningText },
  checkInBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingHorizontal: 12, borderRadius: radii.pill, backgroundColor: colors.accent },
  checkInBtnText: { ...typo.smallStrong, color: '#fff' },
  pin: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 20,
    marginBottom: 6,
    padding: 12,
    borderRadius: radii.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pinEmpty: { borderStyle: 'dashed', borderColor: colors.primary, backgroundColor: colors.primarySofter },
  pinLabel: { ...typo.label, color: colors.muted2, textTransform: 'uppercase' },
  pinText: { ...typo.bodyStrong, color: colors.navy },
  pinCta: { ...typo.smallStrong, flex: 1, color: colors.primary },
  thread: { padding: 16, gap: 8 },
  older: { alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 6 },
  olderText: { ...typo.smallStrong, color: colors.primary },
  safety: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: colors.card, marginBottom: 6 },
  safetyText: { fontSize: 11, color: colors.muted2, flexShrink: 1 },
  system: { alignSelf: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill, backgroundColor: '#E2E7F2' },
  systemText: { fontSize: 12, fontWeight: '600', color: colors.muted2 },
  hidden: { ...typo.caption, alignSelf: 'flex-start', fontStyle: 'italic', color: colors.muted2, paddingLeft: 36 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, maxWidth: '85%' },
  rowMine: { alignSelf: 'flex-end' },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.purple, alignItems: 'center', justifyContent: 'center' },
  avatarText: { ...typo.label, color: '#fff' },
  bubble: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.md, flexShrink: 1 },
  bubbleMine: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: colors.card, borderBottomLeftRadius: 4 },
  author: { ...typo.label, color: colors.purpleText, marginBottom: 2 },
  text: { ...typo.body, color: colors.text, lineHeight: 19 },
  time: { fontSize: 11, color: colors.muted2, alignSelf: 'flex-end', marginTop: 2 },
  closed: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 16 },
  closedText: { ...typo.small, color: colors.muted2 },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.card, paddingTop: 8, paddingBottom: 8, gap: 8 },
  quick: { gap: 8, paddingHorizontal: 12 },
  quickChip: { paddingHorizontal: 14, minHeight: 40, borderRadius: radii.pill, backgroundColor: colors.primarySoft, justifyContent: 'center' },
  quickText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12 },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 110,
    paddingHorizontal: 14,
    paddingTop: 11,
    paddingBottom: 11,
    borderRadius: radii.lg,
    backgroundColor: colors.input,
    fontSize: 16,
    color: colors.text,
  },
  send: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,27,76,0.35)' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: 20, paddingBottom: 36, gap: 14 },
  sheetTitle: { ...typo.h3, color: colors.navy },
  sheetText: { ...typo.small, color: colors.muted2, lineHeight: 18 },
});
