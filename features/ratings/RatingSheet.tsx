import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import { Field, PrimaryButton, SafeBottom, TextButton } from '@/components/ui';
import { colors, radii, typo } from '@/constants/theme';
import { ApiError } from '@/lib/api';
import { haptics } from '@/lib/haptics';
import { toast } from '@/lib/toast';
import { ratingQuestion, ratingsApi, STAR_WORDS, type RateableDto } from './api';

/** Five big stars, one tap. */
export function Stars({ value, onChange, size = 38 }: { value: number; onChange?: (n: number) => void; size?: number }) {
  return (
    <View style={styles.stars} accessibilityRole={onChange ? 'adjustable' : 'image'} accessibilityLabel={`${value} étoile${value > 1 ? 's' : ''} sur 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          disabled={!onChange}
          hitSlop={4}
          onPress={() => {
            haptics.select();
            onChange?.(n);
          }}
          accessibilityRole="button"
          accessibilityLabel={`${n} étoile${n > 1 ? 's' : ''}`}>
          <Ionicons name={n <= value ? 'star' : 'star-outline'} size={size} color={n <= value ? colors.warning : colors.muted} />
        </Pressable>
      ))}
    </View>
  );
}

/**
 * The rating question, as a sheet: the stars, a word if they want, then « Envoyer ». Optional: « Plus tard » asks
 * again another time, « Ne pas noter » never; closing the sheet is « Plus tard » (`prompted`) or nothing (opened from
 * a page).
 */
export function RatingSheet({ item, initial, prompted, onClose, onDone }: { item: RateableDto; initial?: { stars: number | null; comment: string }; prompted?: boolean; onClose: () => void; onDone?: (stars: number) => void }) {
  const [stars, setStars] = useState(initial?.stars ?? 0);
  const [comment, setComment] = useState(initial?.comment ?? '');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    try {
      await ratingsApi.rate(item.subject, item.id, stars, comment);
      haptics.success();
      toast(`Merci ! Ta note aide les autres étudiants.`);
      onDone?.(stars);
      onClose();
    } catch (err) {
      Alert.alert('Note non envoyée', err instanceof ApiError ? err.message : 'Réessaie dans un instant.');
    } finally {
      setBusy(false);
    }
  };
  const later = () => {
    if (prompted) ratingsApi.later(item.subject, item.id).catch(() => undefined);
    onClose();
  };
  const decline = () => {
    ratingsApi.decline(item.subject, item.id).catch(() => undefined);
    onClose();
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={later}>
      <Pressable style={styles.backdrop} onPress={later} accessibilityLabel="Plus tard" />
      <KeyboardAvoidingView behavior="padding" style={{ flexShrink: 1 }}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.kicker}>{item.ratedName ? `NOTER ${item.ratedName.toUpperCase()}` : 'TA NOTE'}</Text>
          <Text style={styles.question}>{ratingQuestion(item)}</Text>
          <Text style={styles.muted}>Facultatif · anonyme pour les autres étudiants · une note par {item.subject === 'order' ? 'commerce' : item.subject === 'caravan' ? 'trajet' : 'événement'}.</Text>
          <Stars value={stars} onChange={setStars} />
          <Text style={[styles.word, !stars && { opacity: 0 }]}>{STAR_WORDS[stars] || ' '}</Text>
          {stars > 0 && <Field placeholder={stars <= 2 ? 'Qu’est-ce qui n’a pas été ? (facultatif)' : 'Un mot ? (facultatif)'} value={comment} onChangeText={setComment} maxLength={500} multiline />}
          <PrimaryButton label="Envoyer ma note" disabled={!stars || busy} loading={busy} onPress={send} />
          {prompted ? (
            <View style={styles.row}>
              <TextButton label="Plus tard" onPress={later} />
              <TextButton label="Ne pas noter" onPress={decline} />
            </View>
          ) : (
            <TextButton label="Fermer" style={{ alignSelf: 'center' }} onPress={onClose} />
          )}
          <SafeBottom />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,27,76,0.4)' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, paddingHorizontal: 20, paddingTop: 10, gap: 10 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 6 },
  kicker: { ...typo.label, color: colors.primary, letterSpacing: 0.4 },
  question: { ...typo.h3, color: colors.navy },
  muted: { ...typo.caption, color: colors.muted2 },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 6 },
  word: { ...typo.smallStrong, color: colors.navy, textAlign: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
});
