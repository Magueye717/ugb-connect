import { router } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { CaravanOrganizer } from '@/constants/data';
import { signIn } from '@/features/register/auth';
import { CAMPUSES } from '@/features/register/validation';
import { api, session, type Tokens } from '@/lib/api';
import { unregisterPushToken } from '@/lib/notifications';

/** The signed-in person, as the screens display it. Built from GET /me. */
export type Profile = {
  id: string;
  firstName: string;
  lastName: string;
  initials: string;
  /** Display line: "UGB · Campus 1 · Village E · Ch. 214". */
  campus: string;
  /** The profile picture; null: the initials show. */
  avatarUrl: string | null;
  /** Lives in a campus village (then `village` and `room`). */
  onCampus: boolean;
  /** "campus1" / "campus2" (delivery zone by default); null without a student profile. */
  campusCode: 'campus1' | 'campus2' | null;
  /** Null when living off campus (or for organizer-only accounts). */
  village: string | null;
  room: string | null;
  /** Has a student profile (a student, even before giving their number). */
  isStudent: boolean;
  /** Null for organizer-only accounts, and for a student who hasn't given it yet (optional at sign-up). */
  studentId: string | null;
  /** Masked by the server: "+221 77 ••• •• 02". */
  phone: string;
  /** "UFR SAT", for display. */
  ufr: string | null;
  /** UFR code ("SAT") and home region: announcements are targeted on them. Null until the student gives them. */
  ufrCode: string | null;
  region: string | null;
  filiere: string | null;
  niveau: string | null;
  email: string | null;
  /** Platform roles (admin, content_editor…): what the work spaces show. */
  roles: string[];
  /** Birth date ("2002-03-12"), place of birth, nationality: optional, best read from the student card. */
  identity: { birthDate: string | null; birthPlace: string | null; nationality: string | null; fromCard: boolean } | null;
  /**
   * Given this academic year: what's filled changes from this date (the next rentrée), an empty field can still be
   * filled. Null: free to change. UFR and region; the card's details.
   */
  originEditableFrom: string | null;
  identityEditableFrom: string | null;
};

/** The organization this account manages. `orgId` (= `id`) is what /org/{orgId} calls use. */
export type AccountOrganizer = CaravanOrganizer & { orgId: string; slug: string; roles: string[] };

/**
 * The kind of part of the app shown, decided by the backend from the account: students book, organizers check their
 * passengers, restaurants and shops take orders, and the platform team's roles open work spaces (administration,
 * public restaurants' menus, communication, places and businesses). The screens' guards check this.
 */
export type Space = 'student' | 'organizer' | 'business' | 'admin' | 'resto' | 'alerts' | 'directory';

/**
 * One space the account can open. An entity may run several: "Khoulé & frère" has a restaurant space, a shop
 * space and an organizer space, each with its own team. `key` is what /espace?vers= opens.
 */
export type AppSpace = { key: string; type: Space; kind: 'restaurant' | 'shop' | null; orgId: string | null; name: string; roles: string[]; logoUrl: string | null; /** A student's own entity (their shop). */ personal: boolean };
/**
 * The shop a student owns ("Ma boutique"): the one they opened, or one Référencement added for their number (an
 * account owns one entity, so one shop at most). A shop where they're only Gérant or Employé isn't theirs.
 */
export const ownShop = (spaces: AppSpace[]) => spaces.find((x) => x.type === 'business' && x.kind === 'shop' && x.roles.includes('owner')) ?? null;


/** The restaurant or shop of the space on screen (owner, manager or staff): orders, catalog, team. */
export type AccountBusiness = { orgId: string; name: string; kind: 'restaurant' | 'shop'; roles: string[] };

/** Only the owner of a space manages its team and edits its information. */
export const isOwner = (roles: string[] | undefined) => !!roles?.includes('owner');

/** The first screen of a space. */
export function spaceHome(space: Space | null) {
  if (space === 'organizer') return '/activites' as const;
  if (space === 'business') return '/commandes' as const;
  if (space === 'admin') return '/equipe-plateforme' as const;
  if (space === 'resto') return '/menus' as const;
  if (space === 'alerts') return '/alertes' as const;
  if (space === 'directory') return '/referencement' as const;
  if (space === 'student') return '/(tabs)' as const;
  return '/(auth)/welcome' as const;
}

type AuthValue = {
  /** `restoring` while the saved session is checked at start-up. */
  status: 'restoring' | 'signedOut' | 'signedIn';
  user: Profile | null;
  /** The organizer space on screen: its organization (caravans, events). */
  organizer: AccountOrganizer | null;
  /** The restaurant or shop space on screen. */
  business: AccountBusiness | null;
  /** Spaces this account may open, decided by the backend: a student who also runs a shop has both. */
  spaces: AppSpace[];
  /** The space on screen, and its type (what the screens' guards check). */
  current: AppSpace | null;
  space: Space | null;
  /** Throws ApiError (wrong password, locked, network): the screen shows its message. */
  login: (identifier: string, password: string) => Promise<void>;
  /** After sign-up or a password reset: tokens already obtained, load the account and enter the app. */
  completeSignIn: (tokens: Tokens) => Promise<void>;
  /** Reads the account again (after changing the profile). */
  reloadAccount: () => Promise<void>;
  /** Opens another of the account's spaces (by key), through the /espace transition screen. */
  openSpace: (key: string) => void;
  /** Used by /espace only: flips the guards while no protected screen is focused. */
  setSpace: (key: string) => void;
  logout: () => Promise<void>;
};

type MeResponse = {
  id: string;
  firstName: string;
  lastName: string;
  initials: string;
  phoneMasked: string;
  student: { studentNumber: string; campus: string; onCampus: boolean; village: string | null; room: string | null; ufr: string | null; region: string | null; filiere: string | null; niveau: string | null; identity?: { birthDate: string | null; birthPlace: string | null; nationality: string | null; fromCard: boolean } | null; originEditableFrom?: string | null; identityEditableFrom?: string | null } | null;
  spaces: AppSpace[];
  platformRoles: string[];
  organizations: { id: string; name: string; category: string; level: string; roles: string[]; capabilities: string[]; space: string }[];
  email: { address: string; verified: boolean } | null;
  avatarUrl: string | null;
};

type OrgResponse = {
  organization: { id: string; slug: string; name: string; category: string; level: string; rating: number | null; trips: number };
  myRoles: string[];
};

const AuthContext = createContext<AuthValue | null>(null);

// Drop Welcome / Login / Register from history; the index route then opens the account's space.
function enterApp() {
  if (router.canDismiss()) router.dismissAll();
  router.replace('/');
}

function toProfile(me: MeResponse): Profile {
  const s = me.student;
  const campusLabel = CAMPUSES.find((c) => c.key === s?.campus)?.label;
  return {
    id: me.id,
    firstName: me.firstName,
    lastName: me.lastName,
    initials: me.initials,
    campus: !s ? 'UGB' : s.onCampus && s.village ? `UGB · ${campusLabel} · ${s.village} · Ch. ${s.room}` : `UGB · ${campusLabel} · Hors campus`,
    avatarUrl: me.avatarUrl,
    onCampus: !!s?.onCampus,
    campusCode: s ? (s.campus as 'campus1' | 'campus2') : null,
    village: s?.village ?? null,
    room: s?.room ?? null,
    isStudent: !!s,
    studentId: s?.studentNumber ?? null,
    phone: `+221 ${me.phoneMasked}`,
    ufr: s?.ufr ? `UFR ${s.ufr}` : null,
    ufrCode: s?.ufr ?? null,
    region: s?.region ?? null,
    filiere: s?.filiere ?? null,
    niveau: s?.niveau ?? null,
    email: me.email?.address ?? null,
    roles: me.platformRoles,
    identity: s?.identity ?? null,
    originEditableFrom: s?.originEditableFrom ?? null,
    identityEditableFrom: s?.identityEditableFrom ?? null,
  };
}

async function loadOrganizer(orgId: string): Promise<AccountOrganizer | null> {
  const { organization: o, myRoles } = await api<OrgResponse>('GET', `/org/${orgId}`, { auth: true });
  return {
    id: o.id,
    orgId: o.id,
    slug: o.slug,
    name: o.name,
    kind: o.category as CaravanOrganizer['kind'],
    level: o.level as CaravanOrganizer['level'],
    rating: o.rating,
    trips: o.trips,
    roles: myRoles,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthValue['status']>('restoring');
  const [user, setUser] = useState<Profile | null>(null);
  const [organizer, setOrganizer] = useState<AccountOrganizer | null>(null);
  const [spaces, setSpaces] = useState<AppSpace[]>([]);
  const [key, setKey] = useState<string | null>(null);
  const current = spaces.find((x) => x.key === key) ?? null;
  const space = current?.type ?? null;
  const business = useMemo<AccountBusiness | null>(
    () => (current?.type === 'business' && current.orgId && current.kind ? { orgId: current.orgId, name: current.name, kind: current.kind, roles: current.roles } : null),
    [current],
  );

  const reset = useCallback(() => {
    setUser(null);
    setOrganizer(null);
    setSpaces([]);
    setKey(null);
    setStatus('signedOut');
  }, []);

  /** Loads the account behind the current tokens. The backend decides the spaces, not the app. */
  const loadAccount = useCallback(async () => {
    const me = await api<MeResponse>('GET', '/me', { auth: true });
    // Removed from every team, nothing left to open: signed out (the backend refuses a new sign-in too).
    if (!me.spaces.length) {
      await session.clear();
      reset();
      router.replace('/(auth)/login');
      return;
    }
    setUser(toProfile(me));
    setSpaces(me.spaces);
    // Signing in opens the first space (a student stays a student); reloading keeps the one on screen if it's still there.
    setKey((k) => (k && me.spaces.some((x) => x.key === k) ? k : me.spaces[0]!.key));
    setStatus('signedIn');
  }, []);

  // An organizer space shows its organization (rating, trips, my roles): loaded when it's the one on screen.
  const organizerOrgId = current?.type === 'organizer' ? current.orgId : null;
  useEffect(() => {
    let alive = true;
    if (!organizerOrgId) {
      setOrganizer(null);
      return;
    }
    loadOrganizer(organizerOrgId).then((o) => alive && setOrganizer(o), () => alive && setOrganizer(null));
    return () => {
      alive = false;
    };
  }, [organizerOrgId]);

  // Start-up: a saved refresh token means a session to restore.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if ((await session.storedRefreshToken()) && (await session.refresh()) && !cancelled) {
          await loadAccount();
          return;
        }
      } catch {
        // Offline at start-up: the token stays saved and is tried again on the next launch.
      }
      if (!cancelled) setStatus('signedOut');
    })();
    return () => {
      cancelled = true;
    };
  }, [loadAccount]);

  // The backend refused the refresh token (expired, revoked, signed out elsewhere): back to sign-in.
  useEffect(() => {
    session.onExpired(() => {
      reset();
      router.replace('/(auth)/login');
    });
    return () => session.onExpired(null);
  }, [reset]);

  const completeSignIn = useCallback(
    async (tokens: Tokens) => {
      await session.save(tokens);
      await loadAccount();
      enterApp();
    },
    [loadAccount],
  );

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user,
      organizer,
      business,
      spaces,
      current,
      space,
      login: async (identifier, password) => completeSignIn(await signIn(identifier, password)),
      completeSignIn,
      reloadAccount: loadAccount,
      openSpace: (next) => {
        if (next === key || !spaces.some((x) => x.key === next)) return;
        router.replace({ pathname: '/espace', params: { vers: next } });
      },
      setSpace: (next) => {
        if (spaces.some((x) => x.key === next)) setKey(next);
      },
      logout: async () => {
        await unregisterPushToken();
        const refreshToken = await session.storedRefreshToken();
        // Best effort: even offline, the device forgets the session.
        if (refreshToken) await api('POST', '/auth/logout', { auth: true, body: { refreshToken } }).catch(() => undefined);
        await session.clear();
        reset();
        router.replace('/(auth)/login');
      },
    }),
    [status, user, organizer, business, spaces, current, space, key, completeSignIn, reset, loadAccount],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
