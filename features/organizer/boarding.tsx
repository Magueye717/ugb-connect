import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

import type { Caravan } from '@/constants/data';
import { useAuth } from '@/context/AuthContext';
import { caravansApi, newScanId, toCaravan, type ManifestDto, type OrgDepartureDto } from '@/features/caravans/api';
import { realtime } from '@/features/chat/realtime';
import { boardOffline, fetchPack, loadPack, loadPacks, packFreshness, packNeedsRefresh, prunePacks, queued, queuedLeaves, queueLeave, savePack, syncQueued, withQueued } from '@/features/organizer/offline';
import { ApiError } from '@/lib/api';

/** An organizer's departure, as the screens use it, plus what the day of the trip needs. */
export type OrgCaravan = Caravan & {
  plate: string | null;
  stopsLeft: string[];
  counts: OrgDepartureDto['counts'];
  claim: OrgDepartureDto['claim'];
};

export const toOrgCaravan = (d: OrgDepartureDto): OrgCaravan => ({
  ...toCaravan(d),
  plate: d.vehicle.plate,
  stopsLeft: d.stopsLeft.map((s) => s.stopId),
  counts: d.counts,
  claim: d.claim,
});

/** One line of the passenger list: what the driver needs at each stop. */
export type Passenger = ManifestDto['passengers'][number];

/** "Mes activités": the organization's departures, refreshed each time the screen shows. */
export function useOrgDepartures() {
  const { organizer } = useAuth();
  const orgId = organizer?.orgId;
  const [items, setItems] = useState<OrgCaravan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!orgId) return;
    try {
      await trySync(orgId);
      const list = (await caravansApi.orgDepartures(orgId)).items.map(toOrgCaravan);
      setItems(list);
      setError(null);
      // Before the trip: keep the lists of the next 24 h on the phone, in case there's no network on the road.
      const soonIds = list.filter((d) => d.departureAt - Date.now() < 24 * 3_600_000 && d.status !== 'cancelled').map((d) => d.id);
      for (const id of soonIds) fetchPack(orgId, id).then((pack) => savePack(id, pack), () => undefined);
      await prunePacks(list.map((d) => d.id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Connexion impossible.');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return { items, loading, error, refresh };
}

/** Tells the organizer about offline scans the server didn't accept once the network came back. */
function reportSync(problems: { title: string; text: string }[]) {
  if (!problems.length) return;
  Alert.alert(
    `${problems.length} scan${problems.length > 1 ? 's' : ''} hors ligne refusé${problems.length > 1 ? 's' : ''}`,
    problems.map((p) => `${p.title} : ${p.text}`).join('\n\n'),
  );
}

/** Sends the scans made offline. Network errors are left for the next try. */
export async function trySync(orgId: string) {
  try {
    const { problems } = await syncQueued(orgId);
    reportSync(problems);
  } catch (e) {
    if (!(e instanceof ApiError && e.isNetwork)) throw e;
  }
}

/**
 * The passenger list of one departure. Live: every scan from any of the organization's phones refreshes it
 * (real-time topic `event:<departure>`). Kept on the phone (offline pack): without network the list, QR checks
 * and boarding keep working, and the scans are sent when the network is back.
 */
export function useManifest(departureId: string | undefined) {
  const { organizer } = useAuth();
  const orgId = organizer?.orgId;
  const [caravan, setCaravan] = useState<OrgCaravan | null>(null);
  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Showing the copy kept on the phone: no network. */
  const [offline, setOffline] = useState(false);
  /** Scans (and stops left) made offline, not sent yet. */
  const [pending, setPending] = useState(0);
  /** When the list kept on the phone was downloaded, and whether booking had closed by then (nothing can be missing). */
  const [listAt, setListAt] = useState<{ at: number; complete: boolean } | null>(null);
  const soon = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = (m: ManifestDto) => {
    setCaravan(toOrgCaravan(m.departure));
    setPassengers(m.passengers);
  };

  const refresh = useCallback(async () => {
    if (!orgId || !departureId) return;
    try {
      await trySync(orgId);
      const pack = await fetchPack(orgId, departureId);
      await savePack(departureId, pack);
      show(pack.manifest);
      setListAt(packFreshness(pack));
      setOffline(false);
      setError(null);
    } catch (e) {
      const cached = e instanceof ApiError && e.isNetwork ? await loadPack(departureId) : null;
      if (cached) {
        show((await withQueued(cached)).manifest);
        setListAt(packFreshness(cached));
        setOffline(true);
        setError(null);
      } else {
        setError(e instanceof ApiError ? e.message : 'Connexion impossible.');
      }
    } finally {
      setPending((await queued()).filter((s) => s.eventId === departureId).length + (await queuedLeaves()).filter((l) => l.departureId === departureId).length);
      setLoading(false);
    }
  }, [orgId, departureId]);

  useEffect(() => {
    if (!departureId) return;
    refresh();
    const off = realtime.subscribe(`event:${departureId}`, () => {
      if (soon.current) clearTimeout(soon.current);
      soon.current = setTimeout(refresh, 300);
    });
    const offReconnect = realtime.onReconnect(refresh);
    return () => {
      off();
      offReconnect();
      if (soon.current) clearTimeout(soon.current);
    };
  }, [departureId, refresh]);

  // Offline, or scans waiting: try again every 20 s.
  useEffect(() => {
    if (!offline && !pending) return;
    const t = setInterval(refresh, 20_000);
    return () => clearInterval(t);
  }, [offline, pending, refresh]);

  const needsNetwork = (e: unknown) => {
    if (e instanceof ApiError && e.isNetwork) throw new ApiError(0, 'NETWORK', 'Pas de réseau : cette action attend la connexion. Le scan, lui, marche hors ligne.');
    throw e;
  };

  const actions = {
    /** "Faire monter" without scanning: a phone that can't show its QR. Works offline too. */
    board: async (p: Passenger) => {
      if (!orgId || !departureId) return;
      const scanId = newScanId();
      try {
        await caravansApi.scan(orgId, { ticketId: p.ticketId, eventId: departureId, clientScanId: scanId });
      } catch (e) {
        const cached = e instanceof ApiError && e.isNetwork ? await loadPack(departureId) : null;
        if (!cached) throw e;
        await boardOffline(await withQueued(cached), orgId, p.ticketId, {}, scanId);
      }
      await refresh();
    },
    /** "Faire descendre": undo a boarding (wrong person, scanned by mistake). */
    unboard: async (p: Passenger) => {
      if (!orgId) return;
      await caravansApi.unboard(orgId, p.ticketId, 'Annulé depuis la liste').catch(needsNetwork);
      await refresh();
    },
    /** After departure, the owner collects the paid seats on the organization's number. */
    claim: async (method: 'wave' | 'orange_money') => {
      if (!orgId || !departureId) return null;
      const payout = await caravansApi.claim(orgId, departureId, method).catch(needsNetwork);
      await refresh();
      return payout;
    },
    /** "Le bus repart de cet arrêt": who wasn't scanned there is absent. */
    leave: async (stopId: string) => {
      if (!orgId || !departureId) return [];
      try {
        const res = await caravansApi.leaveStop(orgId, departureId, stopId);
        await refresh();
        return res.absent;
      } catch (e) {
        // Offline: kept on the phone and sent after the scans; the absents come from the kept list.
        const cached = e instanceof ApiError && e.isNetwork ? await loadPack(departureId) : null;
        if (!cached) throw e;
        await queueLeave({ orgId, departureId, stopId, leftAt: new Date().toISOString() });
        const list = (await withQueued(cached)).manifest.passengers;
        await refresh();
        return list.filter((p) => p.pickupStopId === stopId && !p.admitted).map((p) => ({ ticketId: p.ticketId, seat: p.seat }));
      }
    },
  };

  return { caravan, passengers, loading, error, offline, pending, listAt, refresh, ...actions };
}

/**
 * Keeps the lists on this phone current while there's network: every 2 minutes, a list downloaded before booking
 * closed is downloaded again (every 15 min, and once more right after booking closes: then nothing can be missing).
 * Mounted once by the organizer space.
 */
export function useFreshPacks() {
  const { organizer } = useAuth();
  const orgId = organizer?.orgId;
  useEffect(() => {
    if (!orgId) return;
    let busy = false;
    const run = async () => {
      if (busy) return;
      busy = true;
      try {
        for (const pack of await loadPacks()) {
          if (!packNeedsRefresh(pack)) continue;
          const id = pack.manifest.departure.id;
          await fetchPack(orgId, id).then((fresh) => savePack(id, fresh), () => undefined);
        }
      } finally {
        busy = false;
      }
    };
    run();
    const t = setInterval(run, 2 * 60_000);
    return () => clearInterval(t);
  }, [orgId]);
}

/** The kept lists, for the scanner: which departures it checks offline, and how current each is. */
export function useKeptLists(active: boolean) {
  const [lists, setLists] = useState<{ id: string; route: string; at: number; complete: boolean }[]>([]);
  useEffect(() => {
    if (!active) return;
    let live = true;
    const load = () =>
      loadPacks().then((packs) => {
        if (!live) return;
        const soon = packs.filter((p) => Date.parse(p.manifest.departure.departureAt) > Date.now() - 12 * 3_600_000);
        setLists(soon.map((p) => ({ id: p.manifest.departure.id, route: `${p.manifest.departure.from} → ${p.manifest.departure.to}`, ...packFreshness(p) })));
      });
    load();
    const t = setInterval(load, 30_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [active]);
  return lists;
}
