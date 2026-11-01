import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/theme';
import type { CardType } from './api';

export type CardHolder = {
  firstName: string;
  lastName: string;
  initials: string;
  ufr?: string | null;
  campus?: string | null;
  village?: string | null;
  numberHint?: string | null;
  /** The student's own card (profile): "2002-03-12", "Saint-Louis". */
  birthDate?: string | null;
  birthPlace?: string | null;
};

/** "2002-03-12" → "12/03/2002". */
const frDate = (iso: string) => iso.split('-').reverse().join('/');

/**
 * A drawing of the card found, to show whose it is: never a photo of the real card. Each type has its look: the UGB
 * student card, the Senegalese identity card (flag stripe, labels on top), the licence (numbered fields), the bank
 * card (chip, name embossed at the bottom).
 */
export function CardVisual({ type, holder, badge }: { type: CardType; holder: CardHolder | null; badge?: string }) {
  const first = holder?.firstName ?? '•••••';
  const last = holder?.lastName ?? '•••••';
  return (
    <View style={styles.shadow}>
      {type === 'student' && <Student holder={holder} first={first} last={last} />}
      {type === 'national_id' && <NationalId holder={holder} first={first} last={last} />}
      {type === 'driving_licence' && <Licence holder={holder} first={first} last={last} />}
      {type === 'bank' && <Bank first={first} last={last} />}
      {badge && (
        <View style={styles.badge}>
          <Ionicons name="checkmark-circle" size={14} color={colors.successText} />
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}
    </View>
  );
}

type Face = { holder?: CardHolder | null; first: string; last: string };

function Photo({ initials, light }: { initials: string; light?: boolean }) {
  return (
    <View style={[styles.photo, light ? styles.photoLight : styles.photoDark]}>
      <View style={styles.silhouette}>
        <Ionicons name="person" size={46} color={light ? 'rgba(15,27,76,0.16)' : 'rgba(255,255,255,0.2)'} />
      </View>
      <Text style={[styles.photoInitials, light && { color: colors.navy }]}>{initials}</Text>
    </View>
  );
}

function Student({ holder, first, last }: Face) {
  return (
    <LinearGradient colors={['#0F1B4C', '#24409A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
      <View style={styles.watermark} />
      <View style={styles.row}>
        <View style={styles.seal}>
          <Text style={styles.sealText}>UGB</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.issuer}>UNIVERSITÉ GASTON BERGER</Text>
          <Text style={styles.docTitle}>Carte d’étudiant</Text>
        </View>
        <Ionicons name="school" size={18} color="rgba(255,255,255,0.7)" />
      </View>
      <View style={[styles.row, { flex: 1, alignItems: 'center', marginTop: 10 }]}>
        <Photo initials={holder?.initials ?? '?'} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.label}>NOM</Text>
          <Text style={styles.value} numberOfLines={1}>
            {last.toUpperCase()}
          </Text>
          <Text style={styles.label}>PRÉNOM(S)</Text>
          <Text style={styles.value} numberOfLines={1}>
            {first}
          </Text>
          {(holder?.ufr || holder?.campus) && (
            <Text style={styles.meta} numberOfLines={1}>
              {[holder.ufr ? `UFR ${holder.ufr}` : null, holder.campus, holder.village].filter(Boolean).join(' · ')}
            </Text>
          )}
          {holder?.birthDate && (
            <Text style={styles.meta} numberOfLines={1}>
              Né(e) le {frDate(holder.birthDate)}
              {holder.birthPlace ? ` à ${holder.birthPlace}` : ''}
            </Text>
          )}
        </View>
      </View>
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <Text style={styles.number}>N° {holder?.numberHint ?? 'P••••••'}</Text>
        <Text style={styles.meta}>Saint-Louis</Text>
      </View>
    </LinearGradient>
  );
}

function NationalId({ holder, first, last }: Face) {
  return (
    <View style={[styles.card, { backgroundColor: '#F6F2E6', padding: 0 }]}>
      <View style={styles.flag}>
        <View style={{ flex: 1, backgroundColor: '#00853F' }} />
        <View style={{ flex: 1, backgroundColor: '#FDEF42', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="star" size={9} color="#00853F" />
        </View>
        <View style={{ flex: 1, backgroundColor: '#E31B23' }} />
      </View>
      <View style={{ flex: 1, padding: 14, paddingTop: 10 }}>
        <Text style={[styles.issuer, { color: '#00853F' }]}>RÉPUBLIQUE DU SÉNÉGAL</Text>
        <Text style={[styles.docTitle, { color: colors.navy }]}>Carte d’identité CEDEAO</Text>
        <View style={[styles.row, { flex: 1, alignItems: 'center', marginTop: 8 }]}>
          <Photo initials={holder?.initials ?? '?'} light />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.label, styles.labelDark]}>Prénoms / Given names</Text>
            <Text style={[styles.value, styles.valueDark]} numberOfLines={1}>
              {first.toUpperCase()}
            </Text>
            <Text style={[styles.label, styles.labelDark]}>Nom / Surname</Text>
            <Text style={[styles.value, styles.valueDark]} numberOfLines={1}>
              {last.toUpperCase()}
            </Text>
            <View style={[styles.row, { gap: 14, marginTop: 4 }]}>
              <View>
                <Text style={[styles.label, styles.labelDark]}>Sexe</Text>
                <Text style={styles.small}>•</Text>
              </View>
              <View>
                <Text style={[styles.label, styles.labelDark]}>Né(e) le</Text>
                <Text style={styles.small}>{holder?.birthDate ? frDate(holder.birthDate) : '••/••/••••'}</Text>
              </View>
            </View>
          </View>
        </View>
        <View style={styles.mrz}>
          <Text style={styles.mrzText} numberOfLines={1}>
            {`IDSEN<<${last.toUpperCase().replace(/\s+/g, '<')}<<${first.toUpperCase().replace(/\s+/g, '<')}<<<<<<<<<<<<<<<<`}
          </Text>
        </View>
      </View>
    </View>
  );
}

/** EU-style licence: pale pink and lilac with fine guilloché lines, the country box, numbered fields, categories. */
function Licence({ holder, first, last }: Face) {
  return (
    <LinearGradient colors={['#FFEFF5', '#F6D9E8', '#E6DDF7']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
      {/* Guilloché: thin crossing arcs, like the security print. */}
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={[styles.guilloche, { width: 220 + i * 46, height: 220 + i * 46, borderRadius: 200, right: -120 - i * 23, top: -90 - i * 23 }]} />
      ))}
      <View style={[styles.row, { alignItems: 'center' }]}>
        <View style={styles.country}>
          <View style={styles.countryFlag}>
            <View style={{ flex: 1, backgroundColor: '#00853F' }} />
            <View style={{ flex: 1, backgroundColor: '#FDEF42' }} />
            <View style={{ flex: 1, backgroundColor: '#E31B23' }} />
          </View>
          <Text style={styles.countryCode}>SN</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.licenceTitle}>PERMIS DE CONDUIRE</Text>
          <Text style={styles.licenceIssuer}>RÉPUBLIQUE DU SÉNÉGAL</Text>
        </View>
      </View>
      <View style={[styles.row, { flex: 1, alignItems: 'center', marginTop: 8 }]}>
        <Photo initials={holder?.initials ?? '?'} light />
        <View style={{ flex: 1, gap: 3 }}>
          <Field n="1." value={last.toUpperCase()} />
          <Field n="2." value={first.toUpperCase()} />
          <Field n="5." value="SN-•••••••" small />
        </View>
      </View>
      <View style={[styles.row, { alignItems: 'center', justifyContent: 'space-between' }]}>
        <Text style={styles.licenceNo}>9.</Text>
        <View style={[styles.row, { gap: 6, flex: 1 }]}>
          {[
            { cat: 'A', icon: 'bicycle' as const },
            { cat: 'B', icon: 'car-sport' as const },
          ].map((c) => (
            <View key={c.cat} style={styles.category}>
              <Ionicons name={c.icon} size={12} color="#7A1E48" />
              <Text style={styles.categoryText}>{c.cat}</Text>
            </View>
          ))}
        </View>
        <Ionicons name="finger-print" size={22} color="rgba(122,30,72,0.35)" />
      </View>
    </LinearGradient>
  );
}

function Field({ n, value, small }: { n: string; value: string; small?: boolean }) {
  return (
    <Text style={[styles.licenceValue, small && { fontSize: 12, color: '#5B4660' }]} numberOfLines={1}>
      <Text style={styles.licenceNo}>{n} </Text>
      {value}
    </Text>
  );
}

function Bank({ first, last }: Omit<Face, 'holder'>) {
  return (
    <LinearGradient colors={['#141428', '#3B3B66']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.card, { justifyContent: 'space-between' }]}>
      <View style={styles.watermark} />
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <Text style={styles.bankName}>BANQUE</Text>
        <Ionicons name="wifi" size={18} color="rgba(255,255,255,0.7)" style={{ transform: [{ rotate: '90deg' }] }} />
      </View>
      <View style={styles.chip}>
        <View style={styles.chipLine} />
        <View style={[styles.chipLine, { top: 18 }]} />
      </View>
      <View style={{ gap: 6 }}>
        <Text style={styles.pan}>••••  ••••  ••••  ••••</Text>
        <Text style={styles.validThru}>VALID THRU  ••/••</Text>
      </View>
      <View style={[styles.row, { justifyContent: 'space-between', alignItems: 'flex-end' }]}>
        <Text style={styles.embossed} numberOfLines={1}>
          {`${first} ${last}`.toUpperCase()}
        </Text>
        <View style={styles.network}>
          <View style={[styles.disc, { backgroundColor: '#EB001B' }]} />
          <View style={[styles.disc, { backgroundColor: '#F79E1B', marginLeft: -10, opacity: 0.9 }]} />
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  shadow: { alignSelf: 'stretch', borderRadius: 18, shadowColor: '#0F1B4C', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  card: { aspectRatio: 1.586, borderRadius: 18, padding: 16, overflow: 'hidden' },
  watermark: { position: 'absolute', right: -40, bottom: -50, width: 180, height: 180, borderRadius: 90, borderWidth: 22, borderColor: 'rgba(255,255,255,0.06)' },
  row: { flexDirection: 'row', gap: 12 },
  seal: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#F5B700', alignItems: 'center', justifyContent: 'center' },
  sealText: { fontSize: 11, fontWeight: '900', color: '#0F1B4C' },
  issuer: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: 'rgba(255,255,255,0.75)' },
  docTitle: { fontSize: 15, fontWeight: '800', color: '#fff' },
  silhouette: { position: 'absolute', top: 6, left: 0, right: 0, alignItems: 'center' },
  small: { fontSize: 12, fontWeight: '700', color: '#14213D' },
  mrz: { marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: 'rgba(20,33,61,0.12)' },
  mrzText: { fontSize: 11, letterSpacing: 1.5, color: '#5B6478', fontFamily: 'Courier' },
  validThru: { fontSize: 10, fontWeight: '700', letterSpacing: 1, color: 'rgba(255,255,255,0.6)' },
  photo: { width: 66, height: 82, borderRadius: 10, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 6, overflow: 'hidden' },
  photoDark: { backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  photoLight: { backgroundColor: 'rgba(15,27,76,0.08)', borderWidth: 1, borderColor: 'rgba(15,27,76,0.12)' },
  photoInitials: { fontSize: 15, fontWeight: '800', color: '#fff' },
  label: { fontSize: 9, fontWeight: '700', letterSpacing: 0.6, color: 'rgba(255,255,255,0.6)' },
  labelDark: { color: '#5B6478' },
  value: { fontSize: 16, fontWeight: '800', color: '#fff' },
  valueDark: { color: '#14213D' },
  guilloche: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(122,30,72,0.08)' },
  country: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#1F3A8A', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 3, overflow: 'hidden' },
  countryFlag: { position: 'absolute', top: 0, left: 0, right: 0, height: 9, flexDirection: 'row' },
  countryCode: { fontSize: 15, fontWeight: '900', color: '#fff', letterSpacing: 1 },
  licenceTitle: { fontSize: 16, fontWeight: '900', letterSpacing: 1.2, color: '#7A1E48' },
  licenceIssuer: { fontSize: 10, fontWeight: '700', letterSpacing: 1, color: '#9B5C7E' },
  licenceNo: { fontSize: 11, fontWeight: '700', color: '#B0577F' },
  licenceValue: { fontSize: 15, fontWeight: '800', color: '#2E1430' },
  category: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1, borderColor: 'rgba(122,30,72,0.2)' },
  categoryText: { fontSize: 11, fontWeight: '800', color: '#7A1E48' },
  meta: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  number: { fontSize: 13, fontWeight: '700', letterSpacing: 1.5, color: '#F5B700', fontVariant: ['tabular-nums'] },
  flag: { height: 16, flexDirection: 'row' },
  bankName: { fontSize: 14, fontWeight: '900', letterSpacing: 2, color: '#fff' },
  chip: { width: 44, height: 34, borderRadius: 7, backgroundColor: '#D9B65A', overflow: 'hidden' },
  chipLine: { position: 'absolute', left: 0, right: 0, top: 10, height: 1, backgroundColor: 'rgba(0,0,0,0.25)' },
  pan: { fontSize: 18, fontWeight: '700', letterSpacing: 2, color: '#fff' },
  embossed: { flex: 1, fontSize: 14, fontWeight: '700', letterSpacing: 1.5, color: '#EDEDF5' },
  network: { flexDirection: 'row' },
  disc: { width: 26, height: 26, borderRadius: 13 },
  badge: { position: 'absolute', top: -10, right: 12, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.successBg },
  badgeText: { fontSize: 12, fontWeight: '800', color: colors.successText },
});
