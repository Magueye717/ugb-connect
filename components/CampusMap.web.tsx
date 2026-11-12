import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radii } from '@/constants/theme';

export type MapPin = { id: string; kind: 'place' | 'restaurant' | 'shop'; name: string; subtitle: string; lat: number; lng: number; color: string; icon: keyof typeof Ionicons.glyphMap; look?: 'pin' | 'zone' | 'dot' };
type Campus = { outline: { lat: number; lng: number }[]; bounds: { south: number; west: number; north: number; east: number }; start: { lat: number; lng: number; delta: number }; attribution: string };

/** The native map runs MapLibre in a WebView, which the web build has no use for: a plain placeholder there. */
export function CampusMap({ pins, style, insetTop = 0 }: { pins: MapPin[]; campus?: Campus | null; onOpen: (pin: MapPin) => void; style?: object; insetTop?: number; route?: { coords: [number, number][]; dashed?: boolean; fit?: boolean } | null; insetBottom?: number }) {
  return (
    <View style={[styles.box, style, { paddingTop: insetTop }]}>
      <Ionicons name="map-outline" size={28} color={colors.primary} />
      <Text style={styles.text}>{pins.length} lieux · carte disponible dans l’app mobile</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { minHeight: 120, borderRadius: radii.lg, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', gap: 6 },
  text: { fontSize: 13, fontWeight: '600', color: colors.muted2 },
});
