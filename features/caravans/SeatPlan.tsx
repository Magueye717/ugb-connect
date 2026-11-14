import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radii, typo } from '@/constants/theme';
import type { SeatCell, SeatLayout } from '@/features/caravans/api';

/** The seats next to the driver in a vehicle without a catalog plan: the door and the driver take the left. */
const FIRST_ROW_SEATS = 2;

/**
 * The plan of a vehicle the organizer described (capacity, seats per row): the first row has 2 seats on the right of the
 * driver, then full rows numbered from the front; an even row gets an aisle in the middle, an odd one has its folding
 * middle seat there (« versailler »).
 */
export function genericRows(capacity: number, perRow: number, first = FIRST_ROW_SEATS): SeatLayout {
  if (!capacity) return [];
  const withAisle = (cells: SeatCell[]) => (perRow % 2 === 0 ? [...cells.slice(0, perRow / 2), null, ...cells.slice(perRow / 2)] : cells);
  const front: SeatCell[] = Array.from({ length: perRow }, (_, c) => {
    const n = c - (perRow - first) + 1;
    return c === 0 ? 'driver' : n >= 1 && n <= Math.min(first, capacity) ? n : null;
  });
  const rows = Array.from({ length: Math.ceil(Math.max(0, capacity - first) / perRow) }, (_, r) =>
    Array.from({ length: perRow }, (_, c): SeatCell => {
      const n = first + r * perRow + c + 1;
      return n <= capacity ? n : null;
    }),
  );
  return [front, ...rows].map(withAisle);
}

/** A vehicle's plan: its catalog plan, else drawn from its capacity and seats per row. */
export const planOf = (v: { capacity: number; seatsPerRow: number; layout?: SeatLayout | null }) => v.layout ?? genericRows(v.capacity, v.seatsPerRow);

export type SeatKind = 'window' | 'aisle' | 'middle';

/** Each seat's row (1 = front) and place: by the window, on the aisle, or in the middle (the back bench, a minibus row). */
export function seatInfo(rows: SeatLayout) {
  const width = Math.max(0, ...rows.map((r) => r.length));
  const seatCols = Array.from({ length: width }, (_, c) => c).filter((c) => rows.some((r) => typeof r[c] === 'number'));
  const middle = seatCols.length % 2 === 1 ? seatCols[(seatCols.length - 1) / 2] : -1;
  const info = new Map<number, { row: number; kind: SeatKind }>();
  rows.forEach((row, r) =>
    row.forEach((cell, c) => {
      if (typeof cell !== 'number') return;
      info.set(cell, { row: r + 1, kind: c === seatCols[0] || c === seatCols[seatCols.length - 1] ? 'window' : c === middle ? 'middle' : 'aisle' });
    }),
  );
  return info;
}

type Props = {
  rows: SeatLayout;
  /** Side of a seat. */
  size?: number;
  /** A seat as the screen wants it (tappable, taken, chosen…); by default its number. */
  renderSeat?: (n: number, size: number) => ReactNode;
};

/**
 * A seat plan seen from above, front first: the driver, the seats, the aisle, the door. Columns without any seat (the
 * aisle of a bus, a minibus's door) are narrow.
 */
export function SeatPlan({ rows, size = 40, renderSeat }: Props) {
  const width = Math.max(0, ...rows.map((r) => r.length));
  const gap = Math.round(size * 0.2);
  const narrow = Math.round(size * 0.45);
  const colWidth = Array.from({ length: width }, (_, c) => (rows.some((r) => typeof r[c] === 'number') ? size : narrow));
  const seat = renderSeat ?? ((n: number, s: number) => <PlanSeat n={n} size={s} />);

  return (
    <View style={{ gap, alignItems: 'center' }}>
      <View style={styles.front}>
        <Ionicons name="bus-outline" size={12} color={colors.primary} />
        <Text style={styles.frontText}>Avant du véhicule</Text>
      </View>
      {rows.map((row, r) => {
        const cells: ReactNode[] = [];
        for (let c = 0; c < width; c++) {
          const cell = row[c] ?? null;
          const w = colWidth[c]!;
          if (cell === 'door') {
            // Doors side by side make one: « Porte », across the seats it replaces.
            let span = 1;
            while (row[c + span] === 'door') span++;
            const total = colWidth.slice(c, c + span).reduce((a, b) => a + b, 0) + gap * (span - 1);
            cells.push(
              w === narrow && span === 1 ? (
                <View key={c} style={[styles.doorBar, { width: w, height: size }]} accessibilityLabel="Porte">
                  <View style={styles.doorLine} />
                </View>
              ) : (
                <View key={c} style={[styles.door, { width: total, height: size }]}>
                  <Text style={styles.doorText}>Porte</Text>
                </View>
              ),
            );
            c += span - 1;
          } else if (cell === 'driver') {
            cells.push(
              <View key={c} style={[styles.driver, { width: w, height: size }]} accessibilityLabel="Chauffeur">
                <MaterialCommunityIcons name="steering" size={Math.round(size * 0.5)} color={colors.muted} />
              </View>,
            );
          } else if (typeof cell === 'number') {
            cells.push(<View key={c}>{seat(cell, size)}</View>);
          } else {
            cells.push(<View key={c} style={{ width: w, height: size }} />);
          }
        }
        return (
          <View key={r} style={[styles.row, { gap }]}>
            {cells}
          </View>
        );
      })}
    </View>
  );
}

/** A seat as on a printed plan: its number, the backrest drawn under it. */
export function PlanSeat({ n, size }: { n: number; size: number }) {
  return (
    <View style={[styles.seat, { width: size, height: size }]}>
      <Text style={[styles.seatText, size < 34 && { fontSize: 11 }]}>{n}</Text>
      <View style={styles.backrest} />
    </View>
  );
}

const styles = StyleSheet.create({
  front: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primarySoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill, marginBottom: 2 },
  frontText: { ...typo.label, color: colors.primary },
  row: { flexDirection: 'row' },
  seat: { borderRadius: radii.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  seatText: { ...typo.smallStrong, color: colors.navy },
  backrest: { position: 'absolute', bottom: 4, left: '22%', right: '22%', height: 3, borderRadius: 2, backgroundColor: colors.border },
  driver: { alignItems: 'center', justifyContent: 'center', borderRadius: radii.sm, backgroundColor: colors.primarySofter },
  door: { alignItems: 'center', justifyContent: 'center', borderRadius: radii.sm, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.warningText, backgroundColor: colors.warningBg },
  doorText: { ...typo.caption, color: colors.warningText },
  doorBar: { alignItems: 'center' },
  doorLine: { width: 6, flex: 1, borderRadius: 3, backgroundColor: colors.warningBg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.warningText },
});
