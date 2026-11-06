// Scanning without network (no coverage between towns): the phone keeps each departure's "offline pack"
// (passenger list, ticket versions, the public key of the QR signatures), checks QR codes itself, and queues
// the scans. They are sent to the server as soon as the network is back; the server stays the final judge
// (e.g. two phones that boarded the same person offline: the first one sent wins, the other is flagged).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ed25519 } from '@noble/curves/ed25519.js';

import { api, ApiError } from '@/lib/api';
import type { ManifestDto, ManifestPassenger, ScanGroup } from '@/features/caravans/api';

export type OfflinePack = {
  generatedAt: string;
  key: { kid: string; alg: string; x: string };
  /** ticketId → current QR version: a QR from before a transfer is refused. */
  versions: Record<string, number>;
  /** typed code → ticketId */
  codes: Record<string, string>;
  /** ticketId → FCFA still to collect in cash at boarding (packs saved before cash have none). */
  cash?: Record<string, number>;
  manifest: ManifestDto;
};

/** "Le bus repart de cet arrêt" pressed offline, waiting to be sent (after the scans: who boarded there isn't absent). */
export type QueuedLeave = { orgId: string; departureId: string; stopId: string; leftAt: string };

/** A scan made offline, waiting to be sent. */
export type QueuedScan = {
  clientScanId: string;
  orgId: string;
  eventId: string;
  ticketId: string;
  qr?: string;
  code?: string;
  scannedAt: string;
};

export type OfflineResult = { tone: 'success' | 'warning' | 'danger'; title: string; text: string; caravanId?: string; group?: ScanGroup | null };

const PACK = (departureId: string) => `ugb.offline.pack.${departureId}`;
const PACKS = 'ugb.offline.packs';
const QUEUE = 'ugb.offline.queue';
const LEAVES = 'ugb.offline.leaves';
/** A list older than this is refreshed whenever there's network (passengers keep booking until it closes). */
export const PACK_MAX_AGE_MS = 15 * 60_000;

export const fetchPack = (orgId: string, departureId: string) => api<OfflinePack>('GET', `/org/${orgId}/departures/${departureId}/offline-pack`, { auth: true });

export async function savePack(departureId: string, pack: OfflinePack) {
  await AsyncStorage.setItem(PACK(departureId), JSON.stringify(pack));
  const ids = new Set<string>(JSON.parse((await AsyncStorage.getItem(PACKS)) ?? '[]'));
  ids.add(departureId);
  await AsyncStorage.setItem(PACKS, JSON.stringify([...ids]));
}

export async function loadPack(departureId: string): Promise<OfflinePack | null> {
  const raw = await AsyncStorage.getItem(PACK(departureId));
  return raw ? (JSON.parse(raw) as OfflinePack) : null;
}

/** Every departure kept on this phone (the Scanner tab checks against all of them). */
export async function loadPacks(): Promise<OfflinePack[]> {
  const ids: string[] = JSON.parse((await AsyncStorage.getItem(PACKS)) ?? '[]');
  return (await Promise.all(ids.map(loadPack))).filter((p): p is OfflinePack => !!p);
}

/** Packs of trips long over are dropped: the list holds names and phone numbers. */
export async function prunePacks(keep: string[]) {
  const ids: string[] = JSON.parse((await AsyncStorage.getItem(PACKS)) ?? '[]');
  const stale = ids.filter((id) => !keep.includes(id));
  await AsyncStorage.multiRemove(stale.map(PACK));
  await AsyncStorage.setItem(PACKS, JSON.stringify(ids.filter((id) => keep.includes(id))));
}

export async function queued(): Promise<QueuedScan[]> {
  return JSON.parse((await AsyncStorage.getItem(QUEUE)) ?? '[]');
}

async function enqueue(scan: QueuedScan) {
  const list = await queued();
  await AsyncStorage.setItem(QUEUE, JSON.stringify([...list, scan]));
}

export async function queuedLeaves(): Promise<QueuedLeave[]> {
  return JSON.parse((await AsyncStorage.getItem(LEAVES)) ?? '[]');
}

/** Offline "Le bus repart": kept on the phone, applied to the list at once, sent with the scans later. */
export async function queueLeave(leave: QueuedLeave) {
  const list = await queuedLeaves();
  if (list.some((x) => x.departureId === leave.departureId && x.stopId === leave.stopId)) return;
  await AsyncStorage.setItem(LEAVES, JSON.stringify([...list, leave]));
}

async function dropLeave(leave: QueuedLeave) {
  const list = await queuedLeaves();
  await AsyncStorage.setItem(LEAVES, JSON.stringify(list.filter((x) => !(x.departureId === leave.departureId && x.stopId === leave.stopId))));
}

/**
 * How current a kept list is. `complete`: downloaded once booking had closed, so no ticket can be missing from it
 * (until then a ticket bought, cancelled or transferred after the download isn't known offline).
 */
export function packFreshness(pack: OfflinePack, now = Date.now()) {
  const at = Date.parse(pack.generatedAt);
  const closes = Date.parse(pack.manifest.departure.bookingClosesAt ?? '') || Date.parse(pack.manifest.departure.departureAt);
  return { at, complete: at >= closes, stale: at < closes && now - at > PACK_MAX_AGE_MS };
}

/** Whether a kept list should be downloaded again (soon departures only; past ones are pruned elsewhere). */
export function packNeedsRefresh(pack: OfflinePack, now = Date.now()) {
  const f = packFreshness(pack, now);
  const closes = Date.parse(pack.manifest.departure.bookingClosesAt ?? '') || Date.parse(pack.manifest.departure.departureAt);
  // Booking has closed since the download: one last download makes it complete. Before that: every 15 min.
  return !f.complete && (now >= closes || now - f.at > PACK_MAX_AGE_MS);
}

async function dequeue(ids: string[]) {
  const list = await queued();
  await AsyncStorage.setItem(QUEUE, JSON.stringify(list.filter((s) => !ids.includes(s.clientScanId))));
}

// ---- Signature check (Ed25519, like the server) -----------------------------------------------------------------

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function base64url(input: string): Uint8Array {
  const clean = input.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of clean) {
    const v = B64.indexOf(ch);
    if (v < 0) throw new Error('bad base64');
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

// The signed input (base64url) and the claims (ids, numbers) are plain ASCII: no TextEncoder needed (Hermes).
const utf8 = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const text = (b: Uint8Array) => String.fromCharCode(...b);

/** The claims of a ticket QR, if its signature is the server's. */
export function readTicketQr(qr: string, key: OfflinePack['key']): { ticketId: string; eventId: string; version: number } | null {
  const parts = qr.trim().split('.');
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(text(base64url(parts[0]!)));
    if (header.alg !== 'EdDSA' || header.kid !== key.kid) return null;
    if (!ed25519.verify(base64url(parts[2]!), utf8(`${parts[0]}.${parts[1]}`), base64url(key.x))) return null;
    const p = JSON.parse(text(base64url(parts[1]!)));
    if (p.aud !== 'ticket' || p.iss !== 'ugb-campus' || typeof p.sub !== 'string' || typeof p.e !== 'string' || typeof p.v !== 'number') return null;
    return { ticketId: p.sub, eventId: p.e, version: p.v };
  } catch {
    return null;
  }
}

// ---- Offline check ----------------------------------------------------------------------------------------------

const newScanId = () => `off-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * Checks a QR code or a typed code against the packs on this phone and, when valid, boards the passenger
 * locally (queued for the server). Same answers as the server, marked "hors ligne".
 */
export async function checkOffline(raw: string, orgId: string, departureId?: string, scanId?: string): Promise<OfflineResult> {
  const packs = departureId ? [await loadPack(departureId)].filter((p): p is OfflinePack => !!p) : await loadPacks();
  if (!packs.length) {
    return { tone: 'danger', title: 'Pas de connexion', text: 'Liste non téléchargée sur ce téléphone : ouvre le départ une fois avec du réseau avant de partir.' };
  }
  const value = raw.trim();
  const isQr = value.split('.').length === 3;
  let ticketId: string | undefined;
  let pack: OfflinePack | undefined;

  if (isQr) {
    const claims = readTicketQr(value, packs[0]!.key);
    if (!claims) return { tone: 'danger', title: 'Pas un billet UGB Campus', text: 'Signature invalide : ce QR code ne vient pas de l’app. Refuse l’accès.' };
    pack = packs.find((p) => p.manifest.departure.id === claims.eventId);
    if (!pack) return { tone: 'danger', title: 'Autre départ', text: 'Ce billet n’est pas pour ce départ. Refuse l’accès.' };
    if (pack.versions[claims.ticketId] === undefined) return { tone: 'danger', title: 'Billet non valable', text: 'Billet annulé ou absent de la liste.' };
    if (pack.versions[claims.ticketId] !== claims.version) {
      return { tone: 'danger', title: 'Ancien QR code', text: 'Ce billet a été transféré à quelqu’un d’autre : ce QR ne vaut plus rien.' };
    }
    ticketId = claims.ticketId;
  } else {
    const code = value.toUpperCase();
    pack = packs.find((p) => p.codes[code]);
    ticketId = pack?.codes[code];
    if (!pack || !ticketId) return { tone: 'danger', title: 'Billet non valable', text: `${code || 'Ce code'} n’est pas sur la liste : billet annulé, faux ou mal saisi.` };
  }
  return boardOffline(pack, orgId, ticketId, isQr ? { qr: value } : { code: value.toUpperCase() }, scanId);
}

/** The buyer's other seats on the departure, as the server's scan answer gives them (from the kept list). */
function groupOf(passengers: ManifestPassenger[], p: ManifestPassenger): ScanGroup | null {
  // Packs saved before companions existed have no purchaser.
  if (!p.purchaser) return null;
  const others = passengers.filter((x) => x.purchaser?.id === p.purchaser.id && x.ticketId !== p.ticketId);
  if (!others.length) return null;
  return { size: others.length + 1, purchaser: p.purchaser.name, others: others.map((o) => ({ ticketId: o.ticketId, seat: o.seat, name: o.name, admitted: o.admitted })) };
}

/**
 * "Faire monter" from the list while offline. `scanId`: the id of the online attempt that timed out, so if that
 * request did reach the server, the queued copy is recognized as the same scan (no false "déjà à bord" at sync).
 */
export async function boardOffline(pack: OfflinePack, orgId: string, ticketId: string, how: { qr?: string; code?: string } = {}, scanId?: string): Promise<OfflineResult> {
  // With the scans already queued on this phone: someone boarded offline is on board.
  const passengers = (await withQueued(pack)).manifest.passengers;
  const p = passengers.find((x) => x.ticketId === ticketId)!;
  const eventId = pack.manifest.departure.id;
  const who = `${p.name}${p.seat ? ` · place ${p.seat}` : ''}`;
  const group = groupOf(passengers, p);
  if (p.admitted) {
    return { tone: 'warning', title: 'Déjà à bord', text: `${who}. Vérifie qu’il n’y a pas deux personnes avec ce billet.`, caravanId: eventId, group };
  }
  await enqueue({ clientScanId: scanId ?? newScanId(), orgId, eventId, ticketId, ...how, scannedAt: new Date().toISOString() });
  // Paid in cash: collect it now, like online (asked once: a second scan says "Déjà à bord").
  const cashDue = pack.cash?.[ticketId] ?? 0;
  const d = pack.manifest.departure;
  const dropoff = d.dropoffs.find((s) => s.stopId === p.dropoffStopId)?.place;
  const here = d.pickups.find((s) => !d.stopsLeft.some((l) => l.stopId === s.stopId));
  const booked = d.pickups.find((s) => s.stopId === p.pickupStopId);
  const elsewhere = here && booked && here.stopId !== booked.stopId;
  return {
    tone: elsewhere || cashDue ? 'warning' : 'success',
    title: who,
    text: [
      cashDue ? `À encaisser : ${String(cashDue).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} FCFA en espèces.` : '',
      p.companionOf ? `Accompagnant de ${p.companionOf}. Vérifie le nom sur sa pièce d’identité.` : '',
      elsewhere ? `Monte à ${here.place} au lieu de ${booked.place}.` : '',
      `Descend à ${dropoff ?? '?'}. Hors ligne : envoyé dès le retour du réseau.`,
    ]
      .filter(Boolean)
      .join(' '),
    caravanId: eventId,
    group,
  };
}

/** The queued scans applied to a cached list: what the phone shows while offline. */
export async function withQueued(pack: OfflinePack): Promise<OfflinePack> {
  const id = pack.manifest.departure.id;
  const waiting = new Set((await queued()).filter((s) => s.eventId === id).map((s) => s.ticketId));
  const left = (await queuedLeaves()).filter((l) => l.departureId === id && !pack.manifest.departure.stopsLeft.some((x) => x.stopId === l.stopId));
  if (!waiting.size && !left.length) return pack;
  const passengers = pack.manifest.passengers.map((p) => (waiting.has(p.ticketId) ? { ...p, admitted: true } : p));
  const departure = { ...pack.manifest.departure, stopsLeft: [...pack.manifest.departure.stopsLeft, ...left.map((l) => ({ stopId: l.stopId, at: l.leftAt }))] };
  return { ...pack, manifest: { ...pack.manifest, departure, passengers } };
}

type BatchResult = { result: 'admitted' | 'duplicate' | 'rejected'; title: string; text: string };

/**
 * Sends the queued scans (up to 200 at a time). Each one is recorded once even if sent twice. Returns the scans
 * the server didn't accept (boarded by another phone first, ticket cancelled meanwhile…), to show the organizer.
 */
export async function syncQueued(orgId: string): Promise<{ sent: number; problems: BatchResult[] }> {
  const scans = await syncScans(orgId);
  // Then the stops left offline: after the scans, so who boarded there offline isn't marked absent.
  const problems = [...scans.problems];
  let sent = scans.sent;
  for (const leave of (await queuedLeaves()).filter((l) => l.orgId === orgId)) {
    try {
      await api('POST', `/org/${orgId}/departures/${leave.departureId}/stops/${leave.stopId}/leave`, { auth: true, body: { leftAt: leave.leftAt } });
      sent++;
    } catch (e) {
      if (e instanceof ApiError && e.isNetwork) throw e;
      problems.push({ result: 'rejected', title: 'Départ d’un arrêt', text: e instanceof ApiError ? e.message : 'Refusé par le serveur.' });
    }
    await dropLeave(leave);
  }
  return { sent, problems };
}

async function syncScans(orgId: string): Promise<{ sent: number; problems: BatchResult[] }> {
  const mine = (await queued()).filter((s) => s.orgId === orgId).slice(0, 200);
  if (!mine.length) return { sent: 0, problems: [] };
  const res = await api<{ items: BatchResult[] }>('POST', `/org/${orgId}/admissions/batch`, {
    auth: true,
    body: {
      items: mine.map((s) => ({
        ...(s.qr ? { qr: s.qr } : s.code ? { code: s.code } : { ticketId: s.ticketId }),
        eventId: s.eventId,
        clientScanId: s.clientScanId,
        scannedAt: s.scannedAt,
      })),
    },
  });
  await dequeue(mine.map((s) => s.clientScanId));
  return { sent: mine.length, problems: res.items.filter((r) => r.result !== 'admitted') };
}
