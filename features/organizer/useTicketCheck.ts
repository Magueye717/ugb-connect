import { useAuth } from '@/context/AuthContext';
import { caravansApi, newScanId, type ScanGroup } from '@/features/caravans/api';
import { boardOffline, checkOffline, loadPack } from '@/features/organizer/offline';
import { ApiError } from '@/lib/api';

export type ScanResult = {
  tone: 'success' | 'warning' | 'danger';
  title: string;
  text: string;
  /** The departure the ticket belongs to, to open its list. */
  caravanId?: string;
  /** The buyer's other seats ("Groupe : 2 billets"), to board a pair together. */
  group?: ScanGroup | null;
  /** "Faire monter les 2": boards the group's others not on board yet; returns the group's new state. */
  boardOthers?: () => Promise<ScanGroup['others']>;
};

/**
 * Checks a scanned QR code or a typed ticket code on the server, which boards the passenger when it's valid.
 * The QR is signed by the server: a screenshot of a transferred or cancelled ticket is refused.
 * `departureId`: the list the scanner was opened from (a ticket for another departure is refused).
 * `org`: the organization checking (a student's own entity, from « Mes événements »); the organizer space's otherwise.
 */
export function useTicketCheck(departureId?: string, org?: string) {
  const { organizer } = useAuth();

  /** Boards one ticket picked by id (a companion standing next to the scanned passenger), online or from the kept list. */
  const boardById = async (orgId: string, eventId: string, ticketId: string): Promise<boolean> => {
    // One id for the online try and its offline fallback: a timed-out request that did arrive counts once.
    const scanId = newScanId();
    try {
      const r = await caravansApi.scan(orgId, { ticketId, eventId, clientScanId: scanId });
      return r.result !== 'rejected';
    } catch (err) {
      if (!(err instanceof ApiError && err.isNetwork)) return false;
      const pack = await loadPack(eventId);
      return !!pack && (await boardOffline(pack, orgId, ticketId, {}, scanId)).tone !== 'danger';
    }
  };

  const withGroup = (orgId: string, r: Omit<ScanResult, 'boardOthers'>): ScanResult => {
    const { group, caravanId } = r;
    if (!group || !caravanId || r.tone === 'danger') return r;
    return {
      ...r,
      boardOthers: async () =>
        Promise.all(group.others.map(async (o) => (o.admitted ? o : { ...o, admitted: await boardById(orgId, caravanId, o.ticketId) }))),
    };
  };

  return async (raw: string): Promise<ScanResult> => {
    const value = raw.trim();
    const orgId = org ?? organizer?.orgId;
    if (!orgId) return { tone: 'danger', title: 'Pas d’organisation', text: 'Ce compte ne gère aucun départ ni événement.' };
    // Signed QR payloads have three dot-separated parts; anything short is a typed code.
    const isQr = value.split('.').length === 3;
    const scanId = newScanId();
    try {
      const r = await caravansApi.scan(orgId, {
        ...(isQr ? { qr: value } : { code: value }),
        ...(departureId ? { eventId: departureId } : {}),
        clientScanId: scanId,
      });
      return withGroup(orgId, { tone: r.tone, title: r.title, text: r.text, caravanId: r.eventId ?? undefined, group: r.result === 'rejected' ? null : r.group });
    } catch (err) {
      // No network on the road: the phone checks the QR itself with the list it keeps.
      if (err instanceof ApiError && err.isNetwork) return withGroup(orgId, await checkOffline(value, orgId, departureId, scanId));
      return {
        tone: 'danger',
        title: err instanceof ApiError && err.isNetwork ? 'Pas de connexion' : 'Vérification impossible',
        text: err instanceof ApiError ? err.message : 'Réessaie dans un instant.',
      };
    }
  };
}
