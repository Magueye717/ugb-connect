type Slot = { start: string; end: string };

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

/**
 * Opening hours as people write them, the server's way: a closing at « 00:00 » is midnight (24:00); a closing before
 * the opening runs past midnight (19:00 → 02:00 becomes 19:00-24:00 and 00:00-02:00). Sorted; null when a time isn't
 * one, or a slot opens and closes at the same time. The server does the same.
 */
export function normalizeHours(list: Slot[]): Slot[] | null {
  const out: Slot[] = [];
  for (const s of list) {
    if (!HHMM.test(s.start) || !(HHMM.test(s.end) || s.end === '24:00')) return null;
    const a = toMin(s.start);
    const b = s.end === '00:00' || s.end === '24:00' ? 24 * 60 : toMin(s.end);
    if (a === b) return null;
    if (b > a) out.push({ start: s.start, end: b === 24 * 60 ? '24:00' : s.end });
    else out.push({ start: s.start, end: '24:00' }, { start: '00:00', end: s.end });
  }
  return out.sort((x, y) => toMin(x.start) - toMin(y.start));
}

/** Normalized and without overlaps (two slots covering the same hour): what the forms can save. */
export const hoursValid = (list: Slot[]) => {
  const n = normalizeHours(list);
  return !!n && n.length > 0 && n.every((s, i) => i === 0 || toMin(s.start) >= (n[i - 1]!.end === '24:00' ? 24 * 60 : toMin(n[i - 1]!.end)));
};

/** For editing: a service past midnight as saved (…-24:00 and 00:00-…) shown as one slot again (19:00 → 02:00). */
export function joinOvernight(list: Slot[]): Slot[] {
  const late = list.find((s) => s.end === '24:00' && s.start !== '00:00');
  const early = list.find((s) => s.start === '00:00' && s.end !== '24:00');
  if (!late || !early) return list.map((s) => ({ ...s }));
  return [...list.filter((s) => s !== late && s !== early).map((s) => ({ ...s })), { start: late.start, end: early.end }];
}
