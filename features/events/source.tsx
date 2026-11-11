import { createContext, useContext } from 'react';

import { api } from '@/lib/api';

import { eventsApi, type EventInput, type OrgEventDto, type TicketRequestDto } from './api';

const auth = { auth: true } as const;

/**
 * Where « Mes événements » reads and writes: a student's own events (their personal entity, reviewed by the team, a
 * paid publication), or an organization's (from its organizer space, published at once when it's verified).
 */
export type EventsSource = {
  /** The organization's id; null: the student's own events. */
  org: string | null;
  list: () => Promise<{ items: OrgEventDto[] }>;
  one: (id: string) => Promise<OrgEventDto>;
  create: (body: EventInput) => Promise<OrgEventDto>;
  update: (id: string, body: EventInput) => Promise<OrgEventDto>;
  /** Student: sent for review. Organization: published (or sent for review when it isn't verified for events). */
  submit: (id: string) => Promise<OrgEventDto>;
  cancel: (id: string, reason: string) => Promise<{ refunded: number }>;
  updatePhotos: (id: string, body: { imageIds: string[]; fixedCover: boolean }) => Promise<OrgEventDto>;
  requests: (id: string) => Promise<{ items: TicketRequestDto[] }>;
  /** `unitIds`: only those tickets (paid one by one); all waiting otherwise. */
  validate: (bookingId: string, unitIds?: string[]) => Promise<unknown>;
  refuse: (bookingId: string, reason: string | null) => Promise<unknown>;
};

export function eventsSource(org: string | null): EventsSource {
  if (!org)
    return {
      org: null,
      list: eventsApi.mine,
      one: eventsApi.mineOne,
      create: eventsApi.create,
      update: eventsApi.update,
      submit: eventsApi.submit,
      cancel: eventsApi.cancelMine,
      updatePhotos: eventsApi.updatePhotos,
      requests: eventsApi.myRequests,
      validate: eventsApi.validateMine,
      refuse: eventsApi.refuseMine,
    };
  const base = `/org/${org}/events`;
  return {
    org,
    list: () => eventsApi.ofOrg(org),
    one: (id) => api<OrgEventDto>('GET', `${base}/${id}`, auth),
    create: (body) => api<OrgEventDto>('POST', base, { ...auth, body }),
    update: (id, body) => api<OrgEventDto>('PUT', `${base}/${id}`, { ...auth, body }),
    submit: (id) => api<OrgEventDto>('POST', `${base}/${id}/publish`, auth),
    cancel: (id, reason) => api<{ refunded: number }>('POST', `${base}/${id}/cancel`, { ...auth, body: { reason } }),
    updatePhotos: (id, body) => api<OrgEventDto>('PUT', `${base}/${id}/photos`, { ...auth, body }),
    requests: (id) => eventsApi.orgRequests(org, id),
    validate: (bookingId, unitIds) => eventsApi.validateRequest(org, bookingId, unitIds),
    refuse: (bookingId, reason) => eventsApi.refuseRequest(org, bookingId, reason),
  };
}

const SourceContext = createContext<EventsSource>(eventsSource(null));
export const EventsSourceProvider = SourceContext.Provider;
export const useEventsSource = () => useContext(SourceContext);
