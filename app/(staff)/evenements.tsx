import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { eventWhen } from '@/components/home';
import { EmptyState, ErrorState } from '@/components/states';
import { Chip, Field, LabeledField, PrimaryButton, SafeBottom, Segmented, SheetHeader } from '@/components/ui';
import { formatFcfa } from '@/constants/data';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { eventsApi, type OrgEventDto } from '@/features/events/api';
import { ApiError } from '@/lib/api';

type Queue = 'pending_review' | 'changes_requested' | 'rejected' | 'live';
/** Three places: what waits for the admins, what runs, and the rest (sent back to the student, refused). */
type Section = 'todo' | 'live' | 'follow';

/**
 * The admins check the events students create before their ticket sales open: approve (the student then chooses who
 * sees it and pays its publication), ask for corrections (the student gets the message as a notification and on
 * their event), or refuse. « En cours »: every event validated or on sale, the soonest first, with its sales.
 */
export default function EvenementsAValider() {
  const [section, setSection] = useState<Section>('todo');
  // « Suivi »: the student's corrections to come, or the refused ones.
  const [follow, setFollow] = useState<'changes_requested' | 'rejected'>('changes_requested');
  const queue: Queue = section === 'todo' ? 'pending_review' : section === 'live' ? 'live' : follow;
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
            { value: 'todo', label: 'À valider' },
            { value: 'live', label: 'En cours' },
            { value: 'follow', label: 'Suivi' },
          ]}
          value={section}
          onChange={(s) => {
            setItems(null);
            setSection(s);
          }}
        />
        {section === 'follow' && (
          <View style={styles.chips}>
            <Chip label="À corriger" icon="create-outline" selected={follow === 'changes_requested'} onPress={() => (setItems(null), setFollow('changes_requested'))} />
            <Chip label="Refusés" icon="close-circle-outline" selected={follow === 'rejected'} onPress={() => (setItems(null), setFollow('rejected'))} />
          </View>
        )}
        {section === 'live' && !!items?.length && <Text style={styles.meta}>Validés ou en vente, les plus proches d’abord.</Text>}
        {!items && !loadFailed && <ActivityIndicator color={colors.primary} />}
        {!items && loadFailed && <ErrorState onRetry={load} />}
        {items?.length === 0 && (
          <EmptyState
            icon={section === 'live' ? 'calendar-outline' : 'sparkles-outline'}
            title={section === 'live' ? 'Aucun événement en cours' : 'Rien ici'}
            text={queue === 'pending_review' ? 'Les événements créés par les étudiants arrivent ici avant leur publication.' : section === 'live' ? 'Les événements validés ou en vente apparaissent ici jusqu’à leur fin.' : undefined}
          />
        )}
        {section === 'live' && items?.map((e) => <LiveCard key={e.id} event={e} />)}
        {section !== 'live' && items?.map((e) => (
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

/** An event that runs: where it stands (on sale, or validated and waiting for its publication), its sales, its page. */
function LiveCard({ event: e }: { event: OrgEventDto }) {
  const sold = e.ticketTypes.reduce((n, t) => n + t.sold, 0);
  const capacity = e.ticketTypes.reduce((n, t) => n + t.capacity, 0);
  const share = capacity ? Math.min(1, sold / capacity) : 0;
  const onSale = e.status === 'published';
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/evenement/[id]', params: { id: e.id } })}
      style={({ pressed }) => [styles.card, shadow.card, styles.live, pressed && { opacity: 0.9 }]}
      accessibilityRole="button"
      accessibilityLabel={`${e.title}, ${onSale ? 'en vente' : 'validé'}, ${sold} billets sur ${capacity}`}>
      <Image source={{ uri: e.images[0] }} style={styles.liveImage} contentFit="cover" />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={[styles.badge, { backgroundColor: onSale ? colors.successBg : colors.warningBg }]}>
          <Text style={[styles.badgeText, { color: onSale ? colors.successText : colors.warningText }]}>{onSale ? 'En vente' : 'Validé · publication à payer'}</Text>
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {e.title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {eventWhen(e.startsAt)} · {e.organizer.name || 'Étudiant'}
        </Text>
        <View style={styles.bar}>
          <View style={[styles.barFill, { width: `${share * 100}%` }]} />
        </View>
        <Text style={styles.meta}>
          {sold}/{capacity} billet{capacity > 1 ? 's' : ''} · {e.counts.admitted} entré{e.counts.admitted > 1 ? 's' : ''}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
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
          <SheetHeader onClose={p.onClose} titleStyle={styles.sheetTitle}>{p.title}</SheetHeader>
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
  chips: { flexDirection: 'row', gap: 8 },
  live: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 },
  liveImage: { width: 72, height: 72, borderRadius: radii.md, backgroundColor: colors.border },
  badge: { alignSelf: 'flex-start', borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { ...typo.label },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden', marginTop: 2 },
  barFill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
});
