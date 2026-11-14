import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import { Field, LabeledField, PrimaryButton, SheetFooter, SheetHeader, TextButton, Toggle, useDirty } from '@/components/ui';
import { colors, radii, typo } from '@/constants/theme';
import { caravansApi, type VehicleDto } from '@/features/caravans/api';
import { SeatPlan } from '@/features/caravans/SeatPlan';
import { ApiError } from '@/lib/api';
import { closeGuarded } from '@/lib/leaveGuard';

type Props = {
  visible: boolean;
  orgId: string;
  /** Editing this vehicle; null: a new one. Mount with a `key` per vehicle so the fields start from it. */
  vehicle: VehicleDto | null;
  onClose: () => void;
  onSaved: (v: VehicleDto) => void;
  onDeleted: (id: string) => void;
};

const fail = (title: string) => (err: unknown) => Alert.alert(title, err instanceof ApiError ? err.message : 'Réessaie dans un instant.');

/**
 * A vehicle: its name as students see it, its seats, whether it's air-conditioned (shown on the trip). Added, edited
 * or deleted by the owner only (the server refuses anyone else). A change reaches drafts, not departures already
 * published; deleting waits until no planned departure uses it.
 */
export function VehicleSheet({ visible, orgId, vehicle, onClose, onSaved, onDeleted }: Props) {
  const [label, setLabel] = useState(vehicle?.label ?? '');
  const [capacity, setCapacity] = useState(vehicle ? String(vehicle.capacity) : '');
  const [airConditioned, setAirConditioned] = useState(vehicle?.airConditioned ?? false);
  const [perRow, setPerRow] = useState<4 | 5>(vehicle?.seatsPerRow === 5 ? 5 : 4);
  const [saving, setSaving] = useState(false);
  // Closing with changes not saved asks first.
  const dirty = useDirty({ label, capacity, airConditioned, perRow }, vehicle?.id ?? 'new');
  const close = () => closeGuarded(dirty && !saving, onClose);
  // A catalog vehicle keeps its plan: only its name and air conditioning change.
  const fixed = vehicle?.layout ?? null;
  const seats = fixed ? vehicle!.capacity : Number(capacity);
  const valid = label.trim().length >= 2 && seats >= 4 && seats <= 90;

  const save = async () => {
    setSaving(true);
    try {
      const body = { label: label.trim(), capacity: seats, airConditioned, seatsPerRow: perRow };
      onSaved(vehicle ? await caravansApi.updateVehicle(orgId, vehicle.id, body) : await caravansApi.addVehicle(orgId, body));
    } catch (err) {
      fail('Véhicule refusé')(err);
    } finally {
      setSaving(false);
    }
  };
  const remove = () =>
    Alert.alert(`Supprimer « ${vehicle!.label} » ?`, 'Il ne sera plus proposé pour tes départs. Les trajets passés le gardent.', [
      { text: 'Garder', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => caravansApi.deleteVehicle(orgId, vehicle!.id).then(() => onDeleted(vehicle!.id), fail('Suppression impossible')) },
    ]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Fermer" />
      <KeyboardAvoidingView behavior="padding" style={{ flexShrink: 1 }}>
        <View style={styles.sheet}>
        <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 14, paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
          <SheetHeader onClose={close} subtitle={vehicle ? 'Les départs déjà publiés gardent l’ancien.' : 'Il servira pour tous tes départs.'}>
            {vehicle ? 'Modifier le véhicule' : 'Nouveau véhicule'}
          </SheetHeader>
          <LabeledField label="Nom affiché aux étudiants">
            <Field placeholder="Car Khoulé et Frères" value={label} onChangeText={setLabel} maxLength={60} autoCapitalize="words" />
          </LabeledField>
          {fixed ? (
            <View style={{ gap: 10 }}>
              <Text style={styles.label}>Plan des places · {seats} places</Text>
              <SeatPlan rows={fixed} size={28} />
              <Text style={[styles.hint, { textAlign: 'center' }]}>Le plan du modèle : il ne se modifie pas.</Text>
            </View>
          ) : (
            <>
          <LabeledField label="Places assises">
            <Field placeholder="62" keyboardType="number-pad" value={capacity} onChangeText={(t) => setCapacity(t.replace(/\D/g, '').slice(0, 2))} />
          </LabeledField>
          <Text style={[styles.hint, { marginTop: -8 }]}>Pour les passagers, chauffeur non compris (4 à 90).</Text>
          <Text style={styles.label}>Sièges par rangée</Text>
          <View style={styles.layouts}>
            {([4, 5] as const).map((n) => {
              const on = perRow === n;
              return (
                <Pressable key={n} onPress={() => setPerRow(n)} style={[styles.layout, on && styles.layoutOn]} accessibilityRole="radio" accessibilityState={{ checked: on }}>
                  <RowDiagram perRow={n} on={on} />
                  <Text style={[styles.layoutTitle, on && { color: colors.primary }]}>{n} sièges</Text>
                  <Text style={styles.hint}>{n === 4 ? '2 + couloir + 2' : 'Avec versailler'}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.hint, { marginTop: -8 }]}>
            {perRow === 5 ? 'Le versailler est le siège pliant au milieu du couloir : proposé en dernier aux étudiants.' : 'Le couloir reste libre entre les deux côtés.'}
          </Text>
            </>
          )}
          <Pressable style={styles.option} onPress={() => setAirConditioned((v) => !v)} accessibilityRole="switch" accessibilityState={{ checked: airConditioned }}>
            <Ionicons name="snow-outline" size={20} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.optionTitle}>Climatisé</Text>
              <Text style={styles.hint}>Affiché aux étudiants sur le trajet.</Text>
            </View>
            <Toggle value={airConditioned} onValueChange={setAirConditioned} accessibilityLabel="Climatisé" />
          </Pressable>
          {vehicle && <TextButton label="Supprimer le véhicule" icon="trash-outline" tone="danger" style={{ alignSelf: 'center' }} onPress={remove} />}
        </ScrollView>
        {/* Pinned, as on every form. */}
        <SheetFooter>
          <PrimaryButton label={vehicle ? 'Enregistrer' : 'Ajouter le véhicule'} disabled={!valid} loading={saving} onPress={save} />
        </SheetFooter>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** One row seen from above: 2 seats, the aisle (empty, or the folding seat), 2 seats. */
function RowDiagram({ perRow, on }: { perRow: 4 | 5; on: boolean }) {
  const seat = (key: string, middle = false) => <View key={key} style={[styles.miniSeat, on && styles.miniSeatOn, middle && styles.miniMiddle]} />;
  return (
    <View style={styles.diagram}>
      {seat('a')}
      {seat('b')}
      {perRow === 5 ? seat('m', true) : <View style={styles.miniAisle} />}
      {seat('c')}
      {seat('d')}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { ...typo.smallStrong, color: colors.navy },
  layouts: { flexDirection: 'row', gap: 10 },
  layout: { flex: 1, alignItems: 'center', gap: 4, padding: 12, borderRadius: radii.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card },
  layoutOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  layoutTitle: { ...typo.smallStrong, color: colors.navy },
  diagram: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 4 },
  miniSeat: { width: 14, height: 14, borderRadius: 3, backgroundColor: colors.border },
  miniSeatOn: { backgroundColor: colors.primary },
  miniMiddle: { width: 12, height: 12, borderRadius: 3, backgroundColor: colors.accent },
  miniAisle: { width: 14 },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,27,76,0.35)' },
  sheet: { flexShrink: 1, maxHeight: 700, backgroundColor: colors.card, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: 20 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radii.md, backgroundColor: colors.primarySofter },
  optionTitle: { ...typo.smallStrong, color: colors.navy },
  hint: { ...typo.caption, color: colors.muted2, lineHeight: 17 },
});
