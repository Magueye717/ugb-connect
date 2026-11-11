import { StyleSheet, Text, View } from 'react-native';

import { PhoneField, phoneOk } from '@/components/PhoneField';
import { colors, radii, typo } from '@/constants/theme';
import type { OrderMethod } from '@/features/commerce/api';
import { phoneDigits } from '@/features/register/validation';

/** The providers that pay out to a number (cash is paid by hand). */
export type PayoutProvider = 'wave' | 'orange_money';
const PROVIDERS: { value: PayoutProvider; label: string }[] = [
  { value: 'wave', label: 'Wave' },
  { value: 'orange_money', label: 'Orange Money' },
];
/** Each provider's number, 9 digits typed (no +221). */
export type PayoutDigits = Partial<Record<PayoutProvider, string>>;

/** From the API's numbers (+221…) to the digits the fields hold. */
export const payoutDigitsOf = (n?: { wave: string | null; orange_money: string | null } | null): PayoutDigits => ({
  wave: n?.wave ? phoneDigits(n.wave.replace(/^\+221/, '')) : '',
  orange_money: n?.orange_money ? phoneDigits(n.orange_money.replace(/^\+221/, '')) : '',
});

const accepted = (methods: OrderMethod[]) => PROVIDERS.filter((p) => methods.includes(p.value));

/** Every provider accepted has a full number. */
export const payoutNumbersOk = (methods: OrderMethod[], numbers: PayoutDigits) => accepted(methods).every((p) => phoneOk(numbers[p.value] ?? ''));

/** What the API takes: the numbers of the providers accepted. */
export const payoutNumbersBody = (methods: OrderMethod[], numbers: PayoutDigits) => Object.fromEntries(accepted(methods).map((p) => [p.value, numbers[p.value]!]));

/**
 * « Numéro de versement » for each provider ticked above (Wave, Orange Money): required, it's where the money of the
 * orders arrives. Nothing for cash only.
 */
export function PayoutNumbers({ methods, value, onChange }: { methods: OrderMethod[]; value: PayoutDigits; onChange: (v: PayoutDigits) => void }) {
  const shown = accepted(methods);
  if (!shown.length) return null;
  return (
    <View style={styles.box}>
      <Text style={styles.title}>Numéros de versement</Text>
      <Text style={styles.hint}>L’argent des commandes payées par {shown.map((p) => p.label).join(' ou ')} arrive sur ce{shown.length > 1 ? 's' : ''} numéro{shown.length > 1 ? 's' : ''}.</Text>
      {shown.map((p) => {
        const digits = value[p.value] ?? '';
        return (
          <View key={p.value} style={{ gap: 6 }}>
            <PhoneField label={`Numéro ${p.label} *`} icon="wallet-outline" value={digits} onChange={(d) => onChange({ ...value, [p.value]: d })} accessibilityLabel={`Numéro ${p.label} de versement`} />
            {!digits && <Text style={styles.required}>Obligatoire</Text>}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  required: { ...typo.caption, color: colors.dangerText },
  box: { gap: 8, padding: 12, borderRadius: radii.md, backgroundColor: colors.primarySofter },
  title: { ...typo.smallStrong, color: colors.navy },
  hint: { ...typo.caption, color: colors.muted2, lineHeight: 17 },
});
