import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import { Field, LabeledField, PrimaryButton, SheetFooter } from '@/components/ui';
import { colors, radii, typo } from '@/constants/theme';
import type { CaravanStop } from '@/constants/data';
import type { PassengerDto } from '@/features/caravans/api';
import { formatPhone, phoneDigits, validatePhone } from '@/features/register/validation';

type Props = {
  /** The seat being given to a companion; null hides the sheet. */
  seat: number | null;
  /** Editing a companion already added. */
  initial: PassengerDto | null;
  /** "UGB · Village E → Dakar · Colobane": a companion boards and gets off with the student. */
  route: string | null;
  /** The departure's stops, to give the companion another montée or arrêt than mine. */
  pickups: CaravanStop[];
  dropoffs: CaravanStop[];
  /** Their own stops when they don't travel with me all the way (null: mine). */
  initialStops: CompanionStops | null;
  onClose: () => void;
  onSave: (passenger: PassengerDto, stops: CompanionStops | null) => void;
  onRemove: () => void;
};

export type CompanionStops = { pickupStopId: string; dropoffStopId: string };

/** Digits of a stored companion phone ("+221 77 123 45 67" → "771234567"). */
const localDigits = (phone: string) => phoneDigits(phone.replace(/^\+221\s?/, ''));

/**
 * "Place 8 · Pour qui ?": shown when the student picks a second seat. Name and phone of the companion, who needs
 * no account; same pickup and drop-off as the student. Mount it with a `key` per seat so it opens fresh.
 */
export function CompanionSheet({ seat, initial, route, pickups, dropoffs, initialStops, onClose, onSave, onRemove }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [digits, setDigits] = useState(initial ? localDigits(initial.phone) : '');
  const [touched, setTouched] = useState(false);
  const cleanName = name.trim().replace(/\s+/g, ' ');
  const nameError = cleanName.split(' ').length < 2 || cleanName.length < 4 ? 'Indique son prénom et son nom, comme sur sa pièce d’identité' : null;
  const phoneError = validatePhone(digits);
  // Same path as me, or their own montée and arrêt (an arrêt after their montée).
  const [own, setOwn] = useState(!!initialStops);
  const [pickupId, setPickupId] = useState(initialStops?.pickupStopId ?? null);
  const [dropoffId, setDropoffId] = useState(initialStops?.dropoffStopId ?? null);
  const boardAt = pickups.find((p) => p.stopId === pickupId)?.at ?? null;
  const reachable = dropoffs.filter((d) => boardAt === null || d.at > boardAt);
  const stopsOk = !own || (!!pickupId && !!dropoffId && reachable.some((d) => d.stopId === dropoffId));
  const canChoose = pickups.length > 1 || dropoffs.length > 1;
  const valid = !nameError && !phoneError && stopsOk;

  return (
    <Modal visible={seat !== null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fermer" />
      <KeyboardAvoidingView behavior="padding" style={{ flexShrink: 1 }}>
        <View style={styles.sheet}>
          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 14, paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
          <View style={styles.titleRow}>
            <View style={styles.seat}>
              <Text style={styles.seatText}>{seat}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Place {seat} · Pour qui ?</Text>
              <Text style={styles.sub}>Ton accompagnant n’a pas besoin de l’app. Son nom sera vérifié à l’embarquement.</Text>
            </View>
            <Pressable onPress={onClose} style={styles.close} hitSlop={10} accessibilityRole="button" accessibilityLabel="Fermer">
              <Ionicons name="close" size={20} color={colors.navy} />
            </Pressable>
          </View>
          <LabeledField label="Nom complet" error={touched ? nameError : null}>
            <Field placeholder="Awa Ndiaye" autoCapitalize="words" autoComplete="name" value={name} onChangeText={setName} invalid={touched && !!nameError} />
          </LabeledField>
          <LabeledField label="Téléphone" error={touched || digits.length === 9 ? phoneError : null}>
            <Field
              prefix="+221"
              placeholder="77 123 45 67"
              keyboardType="phone-pad"
              value={formatPhone(digits)}
              onChangeText={(t) => setDigits(phoneDigits(t))}
              invalid={(touched || digits.length === 9) && !!phoneError}
            />
          </LabeledField>
          {canChoose && (
            <View style={styles.choice}>
              <Pressable onPress={() => setOwn(false)} style={[styles.choiceBtn, !own && styles.choiceOn]} accessibilityRole="radio" accessibilityState={{ checked: !own }}>
                <Text style={[styles.choiceText, !own && styles.choiceTextOn]}>Même trajet que moi</Text>
              </Pressable>
              <Pressable onPress={() => setOwn(true)} style={[styles.choiceBtn, own && styles.choiceOn]} accessibilityRole="radio" accessibilityState={{ checked: own }}>
                <Text style={[styles.choiceText, own && styles.choiceTextOn]}>Autre trajet</Text>
              </Pressable>
            </View>
          )}
          {!own ? (
            route && (
              <View style={styles.route}>
                <Ionicons name="git-commit-outline" size={16} color={colors.primary} />
                <Text style={styles.routeText}>Même montée et même arrêt que toi : {route}</Text>
              </View>
            )
          ) : (
            <View style={{ gap: 8 }}>
              <Text style={styles.stopLabel}>Sa montée</Text>
              <View style={styles.stops}>
                {pickups.map((p) => (
                  <Pressable
                    key={p.stopId}
                    onPress={() => {
                      setPickupId(p.stopId);
                      if (dropoffId && !dropoffs.some((d) => d.stopId === dropoffId && d.at > p.at)) setDropoffId(null);
                    }}
                    style={[styles.stop, pickupId === p.stopId && styles.stopOn]}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: pickupId === p.stopId }}>
                    <Text style={[styles.stopText, pickupId === p.stopId && styles.choiceTextOn]} numberOfLines={1}>
                      {p.time} · {p.place}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.stopLabel}>Son arrêt</Text>
              <View style={styles.stops}>
                {reachable.map((d) => (
                  <Pressable key={d.stopId} onPress={() => setDropoffId(d.stopId)} style={[styles.stop, dropoffId === d.stopId && styles.stopOn]} accessibilityRole="radio" accessibilityState={{ checked: dropoffId === d.stopId }}>
                    <Text style={[styles.stopText, dropoffId === d.stopId && styles.choiceTextOn]} numberOfLines={1}>
                      ~{d.time} · {d.place}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
          </ScrollView>
          {/* Pinned, as on every form. */}
          <SheetFooter>
            <PrimaryButton
              label={initial ? 'Enregistrer' : 'Valider'}
              disabled={touched && !valid}
              onPress={() => {
                setTouched(true);
                if (valid) onSave({ name: cleanName, phone: `+221 ${formatPhone(digits)}` }, own && pickupId && dropoffId ? { pickupStopId: pickupId, dropoffStopId: dropoffId } : null);
              }}
            />
            <Pressable onPress={initial ? onRemove : onClose} hitSlop={8} accessibilityRole="button" style={styles.secondary}>
              <Text style={styles.secondaryText}>{initial ? 'Retirer cette place' : 'Annuler'}</Text>
            </Pressable>
          </SheetFooter>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,27,76,0.35)' },
  sheet: { flexShrink: 1, maxHeight: 720, backgroundColor: colors.card, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: 20 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  seat: { width: 44, height: 44, borderRadius: radii.sm, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  seatText: { ...typo.title, color: '#fff' },
  title: { ...typo.h3, color: colors.navy },
  sub: { ...typo.caption, color: colors.muted2, marginTop: 2, lineHeight: 17 },
  route: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, borderRadius: radii.md, backgroundColor: colors.primarySoft },
  routeText: { ...typo.small, flex: 1, color: colors.navy, lineHeight: 18 },
  secondary: { alignSelf: 'center', paddingVertical: 4 },
  choice: { flexDirection: 'row', gap: 8 },
  choiceBtn: { flex: 1, minHeight: 40, borderRadius: radii.pill, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  choiceOn: { borderColor: colors.primary, backgroundColor: colors.primary },
  choiceText: { ...typo.smallStrong, color: colors.navy },
  choiceTextOn: { color: '#fff' },
  stopLabel: { ...typo.smallStrong, color: colors.navy },
  stops: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  stop: { maxWidth: '100%', paddingHorizontal: 12, minHeight: 36, borderRadius: radii.pill, backgroundColor: colors.primarySoft, justifyContent: 'center' },
  stopOn: { backgroundColor: colors.primary },
  stopText: { ...typo.small, color: colors.primary },
  secondaryText: { color: colors.orangeText, fontWeight: '700' },
});
