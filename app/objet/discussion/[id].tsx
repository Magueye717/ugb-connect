import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

import { BackButton } from '@/components/ui';
import { lostCategory, lostQuickReplies, lostSafetyTip, lostTone } from '@/constants/data';
import { colors, radii, typo } from '@/constants/theme';
import { useLost } from '@/context/LostContext';
import { useConversation, type ChatMessage } from '@/features/chat/useConversation';
import { lostApi, type ClaimDto } from '@/features/lost/api';
import { ApiError } from '@/lib/api';
import { toast } from '@/lib/toast';

const time = (at: number) => {
  const d = new Date(at);
  return `${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}`;
};
const fail = (title: string) => (err: unknown) => Alert.alert(title, err instanceof ApiError ? err.message : 'Réessaie dans un instant.');

// Private conversation about one item between its declarer and one other student (the shared chat of features/chat).
export default function ObjetDiscussion() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { upsert } = useLost();
  const scroll = useRef<ScrollViewInstance>(null);
  const [text, setText] = useState('');
  const [claim, setClaim] = useState<ClaimDto | null>(null);
  const [missing, setMissing] = useState(false);
  const chat = useConversation(claim?.conversationId);
  const { markRead } = chat;

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      lostApi.claimView(id).then(setClaim, (err) => (err instanceof ApiError && err.status === 404 ? setMissing(true) : undefined));
    }, [id]),
  );
  // Read while it's on screen: the badges clear.
  useEffect(() => {
    markRead();
  }, [markRead]);

  const back = () => (router.canGoBack() ? router.back() : router.replace({ pathname: '/(tabs)/lieux', params: { vue: 'objets' } }));
  if (!claim || missing || chat.revoked) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.head}>
          <BackButton onPress={back} />
        </View>
        {missing || chat.revoked ? <Text style={styles.empty}>Discussion introuvable.</Text> : <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />}
      </SafeAreaView>
    );
  }

  const { item } = claim;
  const cat = lostCategory(item.category);
  const tone = lostTone(item.category);
  const closed = item.returned || chat.conversation?.status === 'closed';
  const canWrite = !closed && !!chat.conversation?.canWrite;
  const canClose = item.mine || item.isOwner;
  const me = chat.me;

  const send = (value: string, kind: 'text' | 'quick_reply' = 'text') => {
    if (!value.trim() || !canWrite) return;
    chat.send(value, kind);
    if (kind === 'text') setText('');
  };

  const moderate = (m: ChatMessage) => {
    if (!m.author || m.author.key === me || m.pending) return;
    Alert.alert(claim.with, m.body, [
      {
        text: 'Signaler le message',
        onPress: () => chat.report(m).then(() => toast('Message signalé : l’équipe va lire la conversation.'), fail('Signalement non envoyé')),
      },
      {
        text: `Bloquer ${claim.with}`,
        style: 'destructive',
        onPress: () => chat.blockAuthor(m).catch(fail('Blocage impossible')),
      },
      { text: 'Fermer', style: 'cancel' },
    ]);
  };

  const markReturned = () =>
    Alert.alert(item.status === 'found' ? 'Objet rendu ?' : 'Objet retrouvé ?', 'L’annonce et la discussion seront fermées.', [
      { text: 'Pas encore', style: 'cancel' },
      {
        text: 'Oui, c’est réglé',
        onPress: () =>
          lostApi.returned(item.id).then((next) => {
            upsert(next);
            setClaim({ ...claim, item: next });
          }, fail('Fermeture impossible')),
      },
    ]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.head}>
        <BackButton onPress={back} />
        <Pressable style={styles.item} onPress={() => router.navigate(`/objet/${item.id}`)} accessibilityRole="button">
          <View style={[styles.thumb, { backgroundColor: tone.bg }]}>
            {item.photo && item.kind === 'object' ? (
              <Image source={{ uri: item.photo }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <Ionicons name={cat.icon} size={18} color={tone.tint} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              Avec {claim.with}
            </Text>
          </View>
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView
          ref={scroll}
          contentContainerStyle={styles.thread}
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
          keyboardShouldPersistTaps="handled">
          <View style={styles.safety}>
            <Ionicons name="shield-checkmark-outline" size={14} color={colors.muted2} />
            <Text style={styles.safetyText}>{lostSafetyTip}</Text>
          </View>
          {chat.hasMore && (
            <Pressable onPress={() => chat.loadOlder().catch((err) => Alert.alert('Messages indisponibles', err instanceof ApiError ? err.message : 'Vérifie ta connexion et réessaie.'))} style={styles.older} accessibilityRole="button">
              <Text style={styles.olderText}>Messages précédents</Text>
            </Pressable>
          )}
          {chat.loading && <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />}

          {chat.messages.map((m) => {
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
                style={[styles.bubble, mine ? styles.mine : styles.theirs, m.pending === 'sending' && { opacity: 0.6 }]}
                accessibilityHint={mine ? undefined : 'Appui long pour signaler'}>
                <Text style={[styles.text, mine && { color: '#fff' }]}>{m.body}</Text>
                <Text style={[styles.time, mine && { color: 'rgba(255,255,255,0.75)' }]}>{m.pending === 'failed' ? 'Échec · toucher pour réessayer' : time(m.at)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {closed ? (
          <View style={styles.closed}>
            <Ionicons name="checkmark-circle" size={16} color={colors.success} />
            <Text style={styles.closedText}>{item.status === 'found' ? 'Objet rendu' : 'Objet retrouvé'} · discussion fermée</Text>
          </View>
        ) : (
          <View style={styles.composer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quick} keyboardShouldPersistTaps="handled">
              {lostQuickReplies.map((q) => (
                <Pressable key={q} style={styles.quickChip} onPress={() => send(q, 'quick_reply')} accessibilityRole="button">
                  <Text style={styles.quickText}>{q}</Text>
                </Pressable>
              ))}
              {canClose && (
                <Pressable style={[styles.quickChip, styles.doneChip]} onPress={markReturned} accessibilityRole="button">
                  <Ionicons name="checkmark-done" size={14} color={colors.successText} />
                  <Text style={[styles.quickText, { color: colors.successText }]}>{item.status === 'found' && !item.isOwner ? 'Objet rendu' : 'Récupéré'}</Text>
                </Pressable>
              )}
            </ScrollView>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="Message"
                placeholderTextColor={colors.muted}
                value={text}
                onChangeText={setText}
                multiline
                maxLength={300}
                accessibilityLabel="Écrire un message"
              />
              <Pressable
                style={[styles.send, (!text.trim() || !canWrite) && { opacity: 0.4 }]}
                disabled={!text.trim() || !canWrite}
                onPress={() => send(text)}
                accessibilityRole="button"
                accessibilityLabel="Envoyer">
                <Ionicons name="send" size={18} color="#fff" />
              </Pressable>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  empty: { color: colors.muted2, textAlign: 'center', marginTop: 40 },
  older: { alignSelf: 'center', padding: 8 },
  olderText: { color: colors.primary, fontWeight: '700' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 10 },
  item: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  thumb: { width: 40, height: 40, borderRadius: radii.sm, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  title: { ...typo.title, color: colors.navy },
  subtitle: { ...typo.caption, color: colors.muted2, marginTop: 1 },
  thread: { padding: 16, gap: 8 },
  safety: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.md, backgroundColor: colors.card, marginBottom: 6 },
  safetyText: { fontSize: 11, color: colors.muted2, flexShrink: 1 },
  system: { alignSelf: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill, backgroundColor: '#E2E7F2' },
  systemText: { fontSize: 12, fontWeight: '600', color: colors.muted2, textAlign: 'center' },
  bubble: { maxWidth: '80%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.md },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.card, borderBottomLeftRadius: 4 },
  text: { ...typo.body, color: colors.text, lineHeight: 19 },
  time: { fontSize: 11, color: colors.muted2, alignSelf: 'flex-end', marginTop: 2 },
  closed: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 16 },
  closedText: { fontSize: 13, fontWeight: '600', color: colors.successText },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.card, paddingVertical: 8, gap: 8 },
  quick: { gap: 8, paddingHorizontal: 12 },
  quickChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, minHeight: 40, borderRadius: radii.pill, backgroundColor: colors.primarySoft },
  doneChip: { backgroundColor: colors.successBg },
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
});
