import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/states';
import { Field, LabeledField, PrimaryButton, Segmented, StatusChip, TextButton } from '@/components/ui';
import { formatFcfa } from '@/constants/data';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useCampus } from '@/context/CampusContext';
import { BANNER_STATUS, bannersApi, type BannerDto } from '@/features/banners/api';
import { ApiError } from '@/lib/api';
import { useNow } from '@/lib/useNow';

type View_ = 'review' | 'live' | 'done';
const day = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
const ctaText = (b: BannerDto) => (b.cta ? `Bouton « ${b.cta.label} » → ${b.cta.target === 'url' ? b.cta.value : b.cta.target === 'app' ? 'écran de l’app' : `${b.cta.target === 'whatsapp' ? 'WhatsApp' : 'appel'} ${b.cta.value}`}` : null);

/**
 * The communication team checks every paid banner before it reaches the students' home screen: validated, it runs
 * on its days; refused, the publisher is refunded and told why. A running banner can be withdrawn.
 */
export default function Bannieres() {
  const { refresh } = useCampus();
  const [items, setItems] = useState<BannerDto[] | null>(null);
  const [tab, setTab] = useState<View_>('review');
  const [deciding, setDeciding] = useState<{ banner: BannerDto; action: 'reject' | 'withdraw' } | null>(null);
  const now = useNow();

  const load = useCallback(() => {
    bannersApi.review().then((r) => setItems(r.items), () => setItems((x) => x ?? []));
  }, []);
  useFocusEffect(load);
  const fail = (err: unknown) => Alert.alert('Action impossible', err instanceof ApiError ? err.message : 'Réessaie dans un instant.');
  const done = () => {
    load();
    refresh();
  };

  const running = (b: BannerDto) => b.status === 'approved' && Date.parse(b.endsAt) > now;
  const list = (items ?? []).filter((b) => (tab === 'review' ? b.status === 'pending_review' : tab === 'live' ? running(b) : b.status !== 'pending_review' && !running(b)));
  const waiting = (items ?? []).filter((b) => b.status === 'pending_review').length;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
        <Text style={styles.h1}>Bannières</Text>
        <Segmented
          options={[
            { value: 'review', label: waiting ? `À valider · ${waiting}` : 'À valider' },
            { value: 'live', label: 'Validées' },
            { value: 'done', label: 'Historique' },
          ]}
          value={tab}
          onChange={setTab}
        />
        {!items && <ActivityIndicator color={colors.primary} />}
        {items && list.length === 0 && (
          <EmptyState icon="images-outline" title={tab === 'review' ? 'Rien à valider' : 'Aucune bannière'} text={tab === 'review' ? 'Les bannières payées arrivent ici avant leur diffusion.' : undefined} />
        )}
        {list.map((b) => {
          const s = BANNER_STATUS[b.status];
          return (
            <View key={b.id} style={[styles.card, shadow.card]}>
              <Image source={{ uri: b.image }} style={styles.image} contentFit="cover" />
              <View style={styles.content}>
                <View style={styles.row}>
                  <StatusChip label={s.label} tone={s.tone} />
                  <Text style={styles.meta}>{b.kind === 'event' ? 'Événement' : 'Publicité'}</Text>
                </View>
                <Text style={styles.title}>{b.title}</Text>
                {!!b.description && <Text style={styles.text}>{b.description}</Text>}
                {ctaText(b) && <Text style={styles.meta}>{ctaText(b)}</Text>}
                <Text style={styles.meta}>
                  Du {day(b.startsAt)} au {day(new Date(Date.parse(b.endsAt) - 1).toISOString())} · {b.packageName} · {formatFcfa(b.price)}
                </Text>
                {b.reviewReason && <Text style={[styles.meta, { color: colors.dangerText }]}>Motif : {b.reviewReason}</Text>}
                {b.status === 'pending_review' && (
                  <View style={styles.actions}>
                    <Pressable style={[styles.btn, styles.btnOk]} onPress={() => bannersApi.approve(b.id).then(done, fail)} accessibilityRole="button">
                      <Ionicons name="checkmark" size={16} color="#fff" />
                      <Text style={styles.btnOkText}>Valider</Text>
                    </Pressable>
                    <Pressable style={[styles.btn, styles.btnNo]} onPress={() => setDeciding({ banner: b, action: 'reject' })} accessibilityRole="button">
                      <Ionicons name="close" size={16} color={colors.dangerText} />
                      <Text style={styles.btnNoText}>Refuser</Text>
                    </Pressable>
                  </View>
                )}
                {tab === 'live' && (
                  <TextButton label="Retirer de l’accueil" tone="danger" icon="eye-off-outline" onPress={() => setDeciding({ banner: b, action: 'withdraw' })} />
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>

      {deciding && (
        <ReasonSheet
          key={deciding.banner.id + deciding.action}
          title={deciding.action === 'reject' ? `Refuser « ${deciding.banner.title} »` : `Retirer « ${deciding.banner.title} »`}
          note={deciding.action === 'reject' ? `Le motif est envoyé à l’annonceur, remboursé de ${formatFcfa(deciding.banner.price)}.` : 'Elle quitte l’accueil tout de suite, sans remboursement.'}
          confirm={deciding.action === 'reject' ? 'Refuser et rembourser' : 'Retirer'}
          onClose={() => setDeciding(null)}
          onConfirm={(reason) =>
            (deciding.action === 'reject' ? bannersApi.reject(deciding.banner.id, reason) : bannersApi.withdraw(deciding.banner.id, reason)).then(() => {
              setDeciding(null);
              done();
            }, fail)
          }
        />
      )}
    </SafeAreaView>
  );
}

function ReasonSheet({ title, note, confirm, onClose, onConfirm }: { title: string; note: string; confirm: string; onClose: () => void; onConfirm: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fermer" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{title}</Text>
          <Text style={styles.meta}>{note}</Text>
          <LabeledField label="Motif">
            <Field placeholder="Image trompeuse, contenu interdit…" value={reason} onChangeText={setReason} maxLength={200} />
          </LabeledField>
          <PrimaryButton
            label={confirm}
            disabled={reason.trim().length < 3}
            loading={sending}
            onPress={() => {
              setSending(true);
              onConfirm(reason.trim()).finally(() => setSending(false));
            }}
          />
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
  image: { width: '100%', height: 150, backgroundColor: colors.border },
  content: { padding: 14, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { ...typo.title, color: colors.navy },
  text: { ...typo.small, color: colors.text, lineHeight: 18 },
  meta: { ...typo.caption, color: colors.muted2, lineHeight: 17 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  btn: { flex: 1, flexDirection: 'row', gap: 6, minHeight: 42, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  btnOk: { backgroundColor: colors.success },
  btnOkText: { color: '#fff', fontWeight: '700' },
  btnNo: { borderWidth: 1.5, borderColor: colors.dangerText },
  btnNoText: { color: colors.dangerText, fontWeight: '700' },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,27,76,0.35)' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: 20, paddingBottom: 36, gap: 12 },
  sheetTitle: { ...typo.h3, color: colors.navy },
});
