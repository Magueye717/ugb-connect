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
  /** Null when living off campus (or for organizer-only accounts). */
  village: string | null;
  room: string | null;
  /** Null for organizer-only accounts. */
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
};

/** The organization this account manages. `orgId` (= `id`) is what /org/{orgId} calls use. */
export type AccountOrganizer = CaravanOrganizer & { orgId: string; slug: string; roles: string[] };

/**
 * Which part of the app is shown, decided by the backend from the account: students book, organizers check their
 * passengers, and platform roles open work spaces (restaurant stock levels, campus alerts). The first one is home;
 * the others are listed under "Mes espaces".
 */
export type Space = 'student' | 'organizer' | 'business' | 'resto' | 'alerts';

/** The restaurant or shop this account works for (owner, manager or staff): orders, catalog, team. */
export type AccountBusiness = { orgId: string; name: string; kind: 'restaurant' | 'shop'; roles: string[] };

/** The first screen of a space. */
export function spaceHome(space: Space | null) {
  if (space === 'organizer') return '/activites' as const;
  if (space === 'business') return '/commandes' as const;
  if (space === 'resto') return '/menus' as const;
  if (space === 'alerts') return '/alertes' as const;
  if (space === 'student') return '/(tabs)' as const;
  return '/(auth)/welcome' as const;
}

type AuthValue = {
  /** `restoring` while the saved session is checked at start-up. */
  status: 'restoring' | 'signedOut' | 'signedIn';
  user: Profile | null;
  /** The company or association this account manages, if any. Set by an admin on the backend. */
  organizer: AccountOrganizer | null;
  /** The restaurant or shop this account works for, if any. Created by an admin; the owner adds the team. */
  business: AccountBusiness | null;
  /** Spaces this account may open, decided by the backend: a student who also organizes has both. */
  spaces: Space[];
  space: Space | null;
  /** Throws ApiError (wrong password, locked, network): the screen shows its message. */
  login: (identifier: string, password: string) => Promise<void>;
  /** After sign-up or a password reset: tokens already obtained, load the account and enter the app. */
  completeSignIn: (tokens: Tokens) => Promise<void>;
  /** Reads the account again (after changing the profile). */
  reloadAccount: () => Promise<void>;
  /** Opens another of the account's spaces, through the /espace transition screen. */
  openSpace: (space: Space) => void;
  /** Used by /espace only: flips the guards while no protected screen is focused. */
  setSpace: (space: Space) => void;
  logout: () => Promise<void>;
};

type MeResponse = {
  id: string;
  firstName: string;
  lastName: string;
  initials: string;
  phoneMasked: string;
  student: { studentNumber: string; campus: string; onCampus: boolean; village: string | null; room: string | null; ufr: string | null; region: string | null; filiere: string | null; niveau: string | null; identity?: { birthDate: string | null; birthPlace: string | null; nationality: string | null; fromCard: boolean } | null } | null;
  spaces: Space[];
  platformRoles: string[];
  organizations: { id: string; name: string; category: string; level: string; roles: string[]; capabilities: string[] }[];
  email: { address: string; verified: boolean } | null;
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
    village: s?.village ?? null,
    room: s?.room ?? null,
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
  };
}

const isBusiness = (o: MeResponse['organizations'][number]) => o.capabilities.includes('restaurant') || o.capabilities.includes('shop');

function toBusiness(me: MeResponse): AccountBusiness | null {
  const o = me.organizations.find(isBusiness);
  return o ? { orgId: o.id, name: o.name, kind: o.capabilities.includes('shop') ? 'shop' : 'restaurant', roles: o.roles } : null;
}

async function loadOrganizer(me: MeResponse): Promise<AccountOrganizer | null> {
  // Caravans and events: a restaurant or shop has its own space.
  const membership = me.organizations.find((o) => !isBusiness(o));
  if (!membership) return null;
  const { organization: o, myRoles } = await api<OrgResponse>('GET', `/org/${membership.id}`, { auth: true });
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
  const [business, setBusiness] = useState<AccountBusiness | null>(null);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [space, setSpace] = useState<Space | null>(null);

  const reset = useCallback(() => {
    setUser(null);
    setOrganizer(null);
    setBusiness(null);
    setSpaces([]);
    setSpace(null);
    setStatus('signedOut');
  }, []);

  /** Loads the account behind the current tokens. The backend decides the spaces, not the app. */
  const loadAccount = useCallback(async () => {
    const me = await api<MeResponse>('GET', '/me', { auth: true });
    const org = me.spaces.includes('organizer') ? await loadOrganizer(me) : null;
    setUser(toProfile(me));
    setOrganizer(org);
    setBusiness(toBusiness(me));
    setSpaces(me.spaces);
    // Signing in opens the first space (a student stays a student); reloading keeps the one on screen.
    setSpace((current) => (current && me.spaces.includes(current) ? current : (me.spaces[0] ?? null)));
    setStatus('signedIn');
  }, []);

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
      space,
      login: async (identifier, password) => completeSignIn(await signIn(identifier, password)),
      completeSignIn,
      reloadAccount: loadAccount,
      openSpace: (next) => {
        if (next === space || !spaces.includes(next)) return;
        router.replace({ pathname: '/espace', params: { vers: next } });
      },
      setSpace: (next) => {
        if (spaces.includes(next)) setSpace(next);
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
    [status, user, organizer, business, spaces, space, completeSignIn, reset, loadAccount],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
