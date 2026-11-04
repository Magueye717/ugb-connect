import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { eventWhen } from '@/components/home';
import { EmptyState, ErrorState } from '@/components/states';
import { Field, LabeledField, PrimaryButton, SafeBottom, Segmented } from '@/components/ui';
import { formatFcfa } from '@/constants/data';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { eventsApi, type OrgEventDto } from '@/features/events/api';
import { ApiError } from '@/lib/api';

type Queue = 'pending_review' | 'changes_requested' | 'rejected';

/**
 * The admins check the events students create before their ticket sales open: approve (the student then chooses who
 * sees it and pays its publication), ask for corrections (the student gets the message as a notification and on
 * their event), or refuse.
 */
export default function EvenementsAValider() {
  const [queue, setQueue] = useState<Queue>('pending_review');
  const [items, setItems] = useState<OrgEventDto[] | null>(null);
  // The first load failed (no network…): « Impossible de charger », with « Réessayer » (not an empty list).
  const [loadFailed, setLoadFailed] = useState(false);
  const [writing, setWriting] = useState<{ event: OrgEventDto; action: 'changes' | 'reject' } | null>(null);

  const load = useCallback(() => {
    setLoadFailed(false);
    eventsApi.reviewQueue(queue).then((r) => setItems(r.items), () => setLoadFailed(true));
  }, [queue]);
  useFocusEffect(load);
  const fail = (err: unknown) => Alert.alert('Action impossible', err instanceof ApiError ? err.message : 'Réessaie dans un instant.');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
        <Text style={styles.h1}>Événements</Text>
        <Segmented
          options={[
            { value: 'pending_review', label: 'À valider' },
            { value: 'changes_requested', label: 'À corriger' },
            { value: 'rejected', label: 'Refusés' },
          ]}
          value={queue}
          onChange={(q) => {
            setItems(null);
            setQueue(q);
          }}
        />
        {!items && !loadFailed && <ActivityIndicator color={colors.primary} />}
        {!items && loadFailed && <ErrorState onRetry={load} />}
        {items?.length === 0 && <EmptyState icon="sparkles-outline" title="Rien ici" text={queue === 'pending_review' ? 'Les événements créés par les étudiants arrivent ici avant leur publication.' : undefined} />}
        {items?.map((e) => (
          <View key={e.id} style={[styles.card, shadow.card]}>
            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
              {e.images.map((uri) => (
                <Image key={uri} source={{ uri }} style={styles.image} contentFit="cover" />
              ))}
            </ScrollView>
            <View style={styles.content}>
              <Text style={styles.meta}>
                {e.categoryLabel} · par {e.organizer.name} · {e.images.length} photo{e.images.length > 1 ? 's' : ''}
              </Text>
              <Text style={styles.title}>{e.title}</Text>
              <Text style={styles.meta}>{eventWhen(e.startsAt)} → {eventWhen(e.endsAt)}</Text>
              <Text style={styles.meta}>
                {e.venue.name}
                {e.venue.address ? ` · ${e.venue.address}` : ''}
              </Text>
              {!!e.description && <Text style={styles.text}>{e.description}</Text>}
              {e.ticketTypes.map((t) => (
                <Text key={t.typeId} style={styles.meta}>
                  • {t.name} : {t.price ? formatFcfa(t.price) : 'gratuit'} · {t.capacity} places
                </Text>
              ))}
              <Text style={styles.meta}>{e.maxPerStudent} billets max par étudiant</Text>
              {e.review && (
                <Text style={[styles.meta, { color: colors.dangerText }]}>
                  {queue === 'rejected' ? 'Motif' : 'Demandé'} : {e.review.message}
                </Text>
              )}
              {queue === 'pending_review' && (
                <View style={styles.actions}>
                  <Pressable style={[styles.btn, styles.btnOk]} onPress={() => eventsApi.approve(e.id).then(load, fail)} accessibilityRole="button">
                    <Ionicons name="checkmark" size={16} color="#fff" />
                    <Text style={styles.btnOkText}>Valider</Text>
                  </Pressable>
                  <Pressable style={[styles.btn, styles.btnEdit]} onPress={() => setWriting({ event: e, action: 'changes' })} accessibilityRole="button">
                    <Ionicons name="create-outline" size={16} color={colors.warningText} />
                    <Text style={styles.btnEditText}>Corriger</Text>
                  </Pressable>
                  <Pressable style={[styles.btn, styles.btnNo]} onPress={() => setWriting({ event: e, action: 'reject' })} accessibilityRole="button" accessibilityLabel="Refuser">
                    <Ionicons name="close" size={16} color={colors.dangerText} />
                  </Pressable>
                </View>
              )}
            </View>
          </View>
        ))}
      </ScrollView>

      {writing && (
        <MessageSheet
          key={writing.event.id + writing.action}
          title={writing.action === 'changes' ? 'Demander des corrections' : 'Refuser l’événement'}
          note={writing.action === 'changes' ? `${writing.event.organizer.name} reçoit ce message en notification et sur son événement, le corrige et le renvoie.` : 'Le motif est envoyé à l’étudiant. Il ne pourra pas renvoyer cet événement.'}
          placeholder={writing.action === 'changes' ? 'Ajoute une vraie photo du lieu et précise l’heure de fin.' : 'Sortie hors campus non encadrée.'}
          confirm={writing.action === 'changes' ? 'Envoyer la demande' : 'Refuser'}
          onClose={() => setWriting(null)}
          onConfirm={(message) =>
            (writing.action === 'changes' ? eventsApi.requestChanges(writing.event.id, message) : eventsApi.reject(writing.event.id, message)).then(() => {
              setWriting(null);
              load();
            }, fail)
          }
        />
      )}
    </SafeAreaView>
  );
}

function MessageSheet(p: { title: string; note: string; placeholder: string; confirm: string; onClose: () => void; onConfirm: (message: string) => Promise<void> }) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  return (
    <Modal visible transparent animationType="slide" onRequestClose={p.onClose}>
      <Pressable style={styles.backdrop} onPress={p.onClose} accessibilityLabel="Fermer" />
      <KeyboardAvoidingView behavior="padding" style={{ flexShrink: 1 }}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{p.title}</Text>
          <Text style={styles.meta}>{p.note}</Text>
          <LabeledField label="Message à l’étudiant">
            <Field placeholder={p.placeholder} value={message} onChangeText={setMessage} maxLength={500} multiline />
          </LabeledField>
          <PrimaryButton
            label={p.confirm}
            disabled={message.trim().length < 5}
            loading={sending}
            onPress={() => {
              setSending(true);
              p.onConfirm(message.trim()).finally(() => setSending(false));
            }}
          />
          <SafeBottom />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 20, gap: 12, paddingBottom: 32 },
  h1: { ...typo.h1, color: colors.navy },
  card: { backgroundColor: colors.card, borderRadius: radii.lg, overflow: 'hidden' },
  image: { width: 320, height: 170, backgroundColor: colors.border },
  content: { padding: 14, gap: 6 },
  title: { ...typo.title, color: colors.navy },
  text: { ...typo.small, color: colors.text, lineHeight: 18 },
  meta: { ...typo.caption, color: colors.muted2, lineHeight: 17 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  btn: { flexDirection: 'row', gap: 6, minHeight: 42, paddingHorizontal: 14, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  btnOk: { flex: 1, backgroundColor: colors.successText },
  btnOkText: { color: '#fff', fontWeight: '700' },
  btnEdit: { flex: 1, borderWidth: 1.5, borderColor: colors.warningText },
  btnEditText: { color: colors.warningText, fontWeight: '700' },
  btnNo: { borderWidth: 1.5, borderColor: colors.dangerText },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,27,76,0.35)' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: 20, paddingBottom: 36, gap: 12 },
  sheetTitle: { ...typo.h3, color: colors.navy },
});
