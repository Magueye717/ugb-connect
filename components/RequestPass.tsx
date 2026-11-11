import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { formatFcfa } from '@/constants/data';
import { colors, radii, typo } from '@/constants/theme';

/** One ticket (or seat) of the request, with its own code. */
export type PassItem = { id: string; title: string; sub?: string; price: number; code: string | null };

type Props = {
  /** The whole request's code: every ticket waiting, paid at once. */
  code?: string | null;
  /** Each ticket waiting with its own code: paid one by one, the others staying requested. */
  items?: PassItem[];
  organizer?: { name: string; phone: string } | null;
};

/**
 * A request waiting for its payment: the codes the organizer scans (or types) once paid in cash, and how to reach
 * them (call, WhatsApp). Several tickets: swipe between « Tout payer » (one code for all) and each ticket's own
 * code — pay one, the others stay requested until the deadline.
 */
export function RequestPass({ code, items = [], organizer }: Props) {
  const digits = organizer?.phone.replace(/\D/g, '') ?? '';
  const intl = digits.startsWith('221') ? digits : `221${digits}`;
  const own = items.filter((i) => i.code);
  // One ticket, or old requests without codes per ticket: the request's code only.
  const pages: { key: string; title: string; sub: string; code: string }[] =
    own.length > 1
      ? [
          ...(code ? [{ key: 'all', title: `Tout payer · ${own.length} billets`, sub: formatFcfa(own.reduce((n, i) => n + i.price, 0)), code }] : []),
          ...own.map((i, n) => ({ key: i.id, title: `Billet ${n + 1} · ${i.title}`, sub: [i.sub, formatFcfa(i.price)].filter(Boolean).join(' · '), code: i.code! })),
        ]
      : code
        ? [{ key: 'all', title: '', sub: '', code }]
        : [];
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const several = pages.length > 1;

  return (
    <View style={{ gap: 12, alignSelf: 'stretch', alignItems: 'center' }}>
      {several && (
        <Text style={styles.lead}>
          Paie tout d’un coup, ou billet par billet : l’organisateur scanne le code de ce que tu paies. Les autres restent en demande jusqu’à l’heure limite.
        </Text>
      )}
      {pages.length > 0 && (
        <View style={{ alignSelf: 'stretch' }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
          {width > 0 && (
            <ScrollView
              horizontal
              pagingEnabled
              scrollEnabled={several}
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}>
              {pages.map((p) => (
                <View key={p.key} style={{ width, alignItems: 'center' }}>
                  <View style={[styles.qrBox, p.key === 'all' && several && styles.qrAll]}>
                    {!!p.title && <Text style={[styles.pageTitle, p.key === 'all' && { color: colors.primary }]}>{p.title}</Text>}
                    {!!p.sub && <Text style={styles.pageSub}>{p.sub}</Text>}
                    <QRCode value={`UGBREQ:${p.code}`} size={150} color={colors.navy} backgroundColor="#fff" ecl="M" />
                    <Text style={styles.code}>{p.code}</Text>
                    {!several && <Text style={styles.hint}>Montre ce code à l’organisateur en payant : il le scanne et valide ta demande.</Text>}
                  </View>
                </View>
              ))}
            </ScrollView>
          )}
          {several && (
            <View style={styles.dots} accessibilityElementsHidden>
              {pages.map((p, i) => (
                <View key={p.key} style={[styles.dot, i === index && styles.dotOn]} />
              ))}
            </View>
          )}
        </View>
      )}
      {!!organizer && (
        <View style={styles.contact}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Organisateur</Text>
            <Text style={styles.name} numberOfLines={1}>
              {organizer.name}
            </Text>
          </View>
          <Pressable style={styles.btn} onPress={() => Linking.openURL(`tel:+${intl}`)} accessibilityRole="button" accessibilityLabel={`Appeler ${organizer.name}`}>
            <Ionicons name="call" size={18} color="#fff" />
          </Pressable>
          <Pressable style={[styles.btn, { backgroundColor: '#25D366' }]} onPress={() => Linking.openURL(`https://wa.me/${intl}`)} accessibilityRole="button" accessibilityLabel={`Écrire à ${organizer.name} sur WhatsApp`}>
            <Ionicons name="logo-whatsapp" size={18} color="#fff" />
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  lead: { ...typo.caption, color: colors.muted2, textAlign: 'center', lineHeight: 17 },
  qrBox: { alignItems: 'center', gap: 6, padding: 14, borderRadius: radii.lg, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border },
  qrAll: { borderWidth: 2, borderColor: colors.primary },
  pageTitle: { ...typo.smallStrong, color: colors.navy },
  pageSub: { ...typo.caption, color: colors.muted2, marginTop: -4 },
  code: { ...typo.title, color: colors.navy, letterSpacing: 3 },
  hint: { ...typo.caption, color: colors.muted2, textAlign: 'center', maxWidth: 240 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 10 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.border },
  dotOn: { width: 18, backgroundColor: colors.primary },
  contact: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'stretch', padding: 12, borderRadius: radii.md, backgroundColor: colors.primarySoft },
  label: { ...typo.caption, color: colors.muted2 },
  name: { ...typo.bodyStrong, color: colors.navy },
  btn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
