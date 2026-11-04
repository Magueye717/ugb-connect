// "Mon équipe" of an entity (Khoulé & frère): everyone once, with their roles in each of its spaces (restaurant,
// shop, organizer). Only the owner manages it.
import { api } from '@/lib/api';

const auth = { auth: true } as const;

export type OrgSpace = 'organizer' | 'restaurant' | 'shop';
export type RoleOption = { value: string; label: string };
/** The roles of one space, e.g. Restaurant: Gérant, Employé; Organisateur: Gérant, Contrôleur. */
export type TeamSpace = { space: OrgSpace; label: string; roles: RoleOption[] };
export type TeamMember = { userId: string; firstName: string; lastName: string; owner: boolean; spaces: TeamSpace[] };
export type Assignment = { space: OrgSpace; roles: string[] };
/** Step 1 of adding someone: does the number already have an account? Its roles here, if any (to edit them). */
export type Lookup = { exists: true; firstName: string; lastName: string; assignments: Assignment[] } | { exists: false };

export const teamApi = {
  /** The spaces of the entity with the roles the owner can give, and the members. */
  team: (orgId: string) => api<{ spaces: TeamSpace[]; members: TeamMember[] }>('GET', `/org/${orgId}/team`, auth),
  lookup: (orgId: string, phone: string) => api<Lookup>('POST', `/org/${orgId}/members/lookup`, { ...auth, body: { phone } }),
  /**
   * Someone's roles in every space at once (a space without roles is taken away). By phone (a new number needs
   * firstName, lastName and password) or userId. The person is notified of new roles.
   */
  set: (orgId: string, body: { phone?: string; userId?: string; firstName?: string; lastName?: string; password?: string; assignments: Assignment[] }) =>
    api<void>('PUT', `/org/${orgId}/team`, { ...auth, body }),
  /** Out of the whole team (every space). */
  remove: (orgId: string, userId: string) => api<void>('DELETE', `/org/${orgId}/team/${userId}`, auth),
  /** One role taken away; the person keeps the others. */
  removeRole: (orgId: string, userId: string, space: OrgSpace, role: string) => api<void>('DELETE', `/org/${orgId}/team/${userId}/${space}/${role}`, auth),
};

// ---- The app creator's team (the super admin only) -------------------------------------------------------------

export type PlatformMember = { userId: string; firstName: string; lastName: string; phoneMasked: string; roles: string[]; restos: { id: string; name: string }[] };
/** A role the super admin can give: its label and the space it opens ("Référencement"). */
export type PlatformRole = { value: string; label: string; space: string | null };
export type PlatformLookup = { exists: true; firstName: string; lastName: string; roles: string[] } | { exists: false };

export const platformTeamApi = {
  list: () => api<{ items: PlatformMember[]; roles: PlatformRole[] }>('GET', '/admin/team', auth),
  lookup: (phone: string) => api<PlatformLookup>('POST', '/admin/team/lookup', { ...auth, body: { phone } }),
  /** Replaces the person's roles. resto_u_staff needs `restoIds`; a new number needs a name and a password. */
  set: (body: { phone?: string; userId?: string; roles: string[]; restoIds?: string[]; firstName?: string; lastName?: string; password?: string }) => api<void>('PUT', '/admin/team', { ...auth, body }),
  remove: (userId: string) => api<void>('DELETE', `/admin/team/${userId}`, auth),
};
