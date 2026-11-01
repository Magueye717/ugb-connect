import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton, Field, LabeledField, OutlineButton, PrimaryButton } from '@/components/ui';
import { formatFcfa } from '@/constants/data';
import { colors, radii, shadow, typo } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { commerceApi, type OrderDto } from '@/features/commerce/api';
import { ApiError } from '@/lib/api';
import { haptics } from '@/lib/haptics';

/**
 * The business hands over an order picked up at the counter: it scans the QR on the student's phone, or types the
 * code they say ("C7KQ2M"). The order is completed and paid out.
 */
export default function Remise() {
  const { business } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<OrderDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/commandes'));

  const handover = async (value: string) => {
    if (!business || busy) return;
    setBusy(true);
    setError(null);
    try {
      const o = await commerceApi.handover(business.orgId, value);
      haptics.success();
      setDone(o);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Réessaie dans un instant.');
    } finally {
      setBusy(false);
    }
  };
  const again = () => {
    setDone(null);
    setError(null);
    setCode('');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.head}>
        <BackButton onPress={back} />
        <Text style={styles.h1}>Remettre une commande</Text>
        <View style={{ width: 44 }} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {done ? (
            <View style={[styles.card, shadow.card, { alignItems: 'center' }]}>
              <View style={styles.okIcon}>
                <Ionicons name="checkmark" size={34} color="#fff" />
              </View>
              <Text style={styles.okTitle}>Commande {done.code} remise</Text>
              <Text style={styles.muted}>{done.customer?.name}</Text>
              <View style={styles.lines}>
                {done.lines.map((l) => (
                  <Text key={l.itemId} style={styles.line}>
                    {l.qty} × {l.name}
                  </Text>
                ))}
              </View>
              <Text style={styles.total}>{formatFcfa(done.total)} · payé</Text>
              <PrimaryButton label="Remettre une autre commande" onPress={again} style={{ alignSelf: 'stretch' }} />
            </View>
          ) : (
            <>
              <View style={styles.camera}>
                {!permission ? null : permission.granted ? (
                  <>
                    <CameraView
                      style={StyleSheet.absoluteFill}
                      facing="back"
                      barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                      onBarcodeScanned={busy || error ? undefined : ({ data }: BarcodeScanningResult) => handover(data)}
                    />
                    <View style={styles.frame} pointerEvents="none" />
                    {busy && (
                      <View style={styles.veil}>
                        <ActivityIndicator color="#fff" />
                      </View>
                    )}
                  </>
                ) : (
                  <View style={styles.permission}>
                    <Ionicons name="qr-code-outline" size={32} color="#fff" />
                    <Text style={styles.permissionText}>La caméra sert à scanner le code de la commande sur le téléphone du client.</Text>
                    <Pressable style={styles.permissionBtn} onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())}>
                      <Text style={styles.permissionBtnText}>{permission.canAskAgain ? 'Autoriser la caméra' : 'Ouvrir les réglages'}</Text>
                    </Pressable>
                  </View>
                )}
              </View>
              <Text style={styles.hint}>Vise le QR code affiché dans le suivi de commande du client.</Text>

              {error && (
                <View style={styles.error}>
                  <Ionicons name="alert-circle" size={18} color={colors.dangerText} />
                  <Text style={styles.errorText}>{error}</Text>
                  <Pressable onPress={() => setError(null)} hitSlop={8}>
                    <Text style={styles.retry}>Réessayer</Text>
                  </Pressable>
                </View>
              )}

              <LabeledField label="Ou saisis le code donné par le client">
                <Field icon="receipt-outline" placeholder="C7KQ2M" autoCapitalize="characters" autoCorrect={false} value={code} onChangeText={setCode} maxLength={10} returnKeyType="done" onSubmitEditing={() => handover(code)} />
              </LabeledField>
              <OutlineButton label="Remettre la commande" disabled={code.trim().length < 5 || busy} onPress={() => handover(code)} />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 },
  h1: { ...typo.h3, color: colors.navy },
  body: { padding: 20, gap: 14, paddingBottom: 40 },
  camera: { height: 300, borderRadius: radii.lg, overflow: 'hidden', backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
  frame: { width: 200, height: 200, borderRadius: radii.lg, borderWidth: 3, borderColor: '#fff' },
  veil: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(10,16,40,0.55)', alignItems: 'center', justifyContent: 'center' },
  permission: { alignItems: 'center', gap: 10, padding: 24 },
  permissionText: { ...typo.body, color: '#fff', textAlign: 'center' },
  permissionBtn: { backgroundColor: '#fff', paddingHorizontal: 16, minHeight: 38, borderRadius: radii.pill, justifyContent: 'center' },
  permissionBtnText: { color: colors.navy, fontWeight: '700' },
  hint: { ...typo.small, color: colors.muted2, textAlign: 'center' },
  error: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: radii.md, backgroundColor: colors.dangerBg },
  errorText: { ...typo.small, flex: 1, color: colors.dangerText },
  retry: { ...typo.smallStrong, color: colors.dangerText },
  card: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 20, gap: 8 },
  okIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  okTitle: { ...typo.h3, color: colors.navy },
  muted: { ...typo.small, color: colors.muted2 },
  lines: { alignSelf: 'stretch', padding: 12, borderRadius: radii.md, backgroundColor: colors.bg, gap: 4, marginVertical: 6 },
  line: { ...typo.bodyStrong, color: colors.text },
  total: { ...typo.bodyStrong, color: colors.successText, marginBottom: 8 },
});
