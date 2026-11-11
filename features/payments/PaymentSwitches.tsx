import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Field, Toggle } from '@/components/ui';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { ApiError } from '@/lib/api';
import { confirmAction, notice } from '@/lib/notice';
import { toast } from '@/lib/toast';

import { methodLabel, type PaymentMethod } from './checkout';
import { setPaymentMethod, storeMethods, usePaymentMethods } from './methods';

const since = (iso: string) => new Date(iso).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * The admins' switch for Wave and Orange Money, app-wide (an outage at the provider). Off: no new payment with it,
 * businesses and organizers are notified, so are students whose payment with it is still waiting, and everyone sees
 * a banner on the home. Cash keeps working.
 */
export function PaymentSwitches() {
  const methods = usePaymentMethods();
  const [busy, setBusy] = useState<PaymentMethod | null>(null);
  const [note, setNote] = useState('');

  const apply = async (method: PaymentMethod, enabled: boolean) => {
    setBusy(method);
    try {
      storeMethods((await setPaymentMethod(method, enabled, enabled ? null : note.trim() || null)).items);
      setNote('');
      toast(enabled ? `${methodLabel[method]} réactivé : commerces et organisateurs prévenus.` : `${methodLabel[method]} désactivé : commerces, organisateurs et paiements en attente prévenus.`);
    } catch (err) {
      notice({ tone: 'warning', title: 'Changement impossible', message: err instanceof ApiError ? err.message : 'Réessaie dans un instant.' });
    } finally {
      setBusy(null);
    }
  };

  const toggle = (method: PaymentMethod, enabled: boolean) =>
    enabled
      ? notice({
          tone: 'info',
          title: `Réactiver ${methodLabel[method]} ?`,
          bullets: ['Les paiements reprennent tout de suite', 'Commerces et organisateurs sont prévenus', 'Le bandeau disparaît de l’accueil'],
          choices: [
            { label: 'Réactiver', onPress: () => apply(method, true), tone: 'primary' },
            { label: 'Annuler', tone: 'quiet' },
          ],
        })
      : confirmAction({
          title: `Désactiver ${methodLabel[method]} ?`,
          bullets: ['Plus aucun nouveau paiement avec lui, dans toute l’app', 'Commerces, organisateurs et étudiants avec un paiement en attente sont prévenus', 'Un bandeau s’affiche sur l’accueil de tous'],
          confirm: 'Désactiver',
          onConfirm: () => apply(method, false),
        });

  // Not loaded yet: both shown as on, switches wait.
  const list = methods.length ? methods : (['wave', 'orange_money'] as const).map((method) => ({ method, available: true, offSince: null, note: null }));
  return (
    <View style={[styles.card, shadow.card]}>
      <Text style={styles.section}>Paiements mobiles</Text>
      <Text style={styles.muted}>En cas de panne chez un opérateur : désactive-le pour toute l’app. Les espèces restent possibles.</Text>
      {list.map((m) => (
        <View key={m.method} style={styles.row}>
          <Ionicons name={m.available ? 'checkmark-circle' : 'pause-circle'} size={20} color={m.available ? colors.successText : colors.warningText} />
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>{methodLabel[m.method]}</Text>
            <Text style={styles.muted}>{m.available ? 'Actif' : `Désactivé depuis ${since(m.offSince!)}${m.note ? ` · ${m.note}` : ''}`}</Text>
          </View>
          <Toggle value={m.available} disabled={!methods.length || busy === m.method} onValueChange={(v) => toggle(m.method, v)} accessibilityLabel={`${methodLabel[m.method]} actif`} />
        </View>
      ))}
      <Field icon="chatbox-ellipses-outline" placeholder="Raison affichée (facultatif), ex. Panne chez l’opérateur" value={note} onChangeText={setNote} maxLength={200} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 16, gap: 12 },
  section: { ...typo.section, color: colors.navy },
  label: { ...typo.bodyStrong, color: colors.navy },
  muted: { ...typo.caption, color: colors.muted2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
