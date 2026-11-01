// The campus places (library, rectorate, medical centre…) from the API: list, map, directions; managed by the team.
import { useCallback, useEffect, useState } from 'react';
import type { Ionicons } from '@expo/vector-icons';

import { colors } from '@/constants/theme';
import { api } from '@/lib/api';

const auth = { auth: true } as const;

export const PLACE_CATEGORIES = ['Études', 'Restauration', 'Services', 'Sport', 'Santé', 'Administration', 'Logement', 'Culte', 'Transport'] as const;
export type PlaceCategory = (typeof PLACE_CATEGORIES)[number];

export type PlaceDto = {
  id: string;
  name: string;
  category: PlaceCategory;
  description: string;
  area: string;
  campus: 'campus1' | 'campus2' | null;
  campusLabel: string | null;
  location: { lat: number; lng: number };
  hours: string | null;
  /** Ionicons name. */
  icon: string;
  /** The first is the cover. */
  photos: string[];
  /** Editing: send them back as `photos` to keep these pictures. */
  photoRefs: string[];
  active: boolean;
  sortOrder: number;
};

export type PlaceInput = {
  name: string;
  category: PlaceCategory;
  description?: string;
  area?: string;
  campus?: 'campus1' | 'campus2' | null;
  location: { lat: number; lng: number };
  hours?: string | null;
  icon?: string;
  photos?: string[];
  active?: boolean;
};

export type LatLng = { lat: number; lng: number };
/** The campus outline from OpenStreetMap: the map draws it and stays inside its box. */
export type CampusOutline = { outline: LatLng[]; bounds: { south: number; west: number; north: number; east: number }; attribution: string };

export const placesApi = {
  list: () => api<{ items: PlaceDto[] }>('GET', '/places', auth),
  campus: () => api<CampusOutline>('GET', '/places/campus', auth),
  get: (id: string) => api<PlaceDto>('GET', `/places/${id}`, auth),
  // The communication team
  all: () => api<{ items: PlaceDto[] }>('GET', '/admin/places', auth),
  create: (body: PlaceInput) => api<PlaceDto>('POST', '/admin/places', { ...auth, body }),
  update: (id: string, body: Partial<PlaceInput>) => api<PlaceDto>('PATCH', `/admin/places/${id}`, { ...auth, body }),
  remove: (id: string) => api<void>('DELETE', `/admin/places/${id}`, auth),
};

/** A colour per category: the pin, the tile, the label. */
const TONES: Record<PlaceCategory, { tint: string; bg: string; text: string }> = {
  Études: { tint: colors.purple, bg: '#EEE8FF', text: colors.purpleText },
  Restauration: { tint: colors.orange, bg: '#FFE8D4', text: colors.orangeText },
  Services: { tint: colors.primary, bg: colors.primarySoft, text: colors.primary },
  Sport: { tint: colors.green, bg: '#E5F8EC', text: colors.successText },
  Santé: { tint: colors.danger, bg: '#FDECEE', text: colors.dangerText },
  Administration: { tint: '#0E7490', bg: '#E0F7FA', text: '#0E7490' },
  Logement: { tint: '#7C5E10', bg: '#FBF1D9', text: '#7C5E10' },
  Culte: { tint: '#0F766E', bg: '#DDF5F1', text: '#0F766E' },
  Transport: { tint: '#475569', bg: '#EEF1F5', text: '#475569' },
};
export const placeTone = (c: string) => TONES[c as PlaceCategory] ?? TONES.Services;
export const placeIcon = (name: string) => name as keyof typeof Ionicons.glyphMap;

// One list for the whole app (tab, map, place page, lost-and-found picker), fetched once and refreshed on demand.
let cache: PlaceDto[] | null = null;
const listeners = new Set<(p: PlaceDto[]) => void>();
let inflight: Promise<void> | null = null;
function fetchPlaces() {
  inflight ??= placesApi
    .list()
    .then((r) => {
      cache = r.items;
      listeners.forEach((l) => l(r.items));
    })
    .catch(() => undefined)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** The campus places; null until loaded. */
export function usePlaces() {
  const [places, setPlaces] = useState<PlaceDto[] | null>(cache);
  useEffect(() => {
    listeners.add(setPlaces);
    if (!cache) fetchPlaces();
    return () => {
      listeners.delete(setPlaces);
    };
  }, []);
  const refresh = useCallback(() => fetchPlaces(), []);
  return { places, refresh };
}

// The outline never changes while the app runs: fetched once.
let outline: Promise<CampusOutline | null> | null = null;

/** The campus outline; null until loaded (or offline: the map then shows the plain plan). */
export function useCampusOutline() {
  const [campus, setCampus] = useState<CampusOutline | null>(null);
  useEffect(() => {
    let alive = true;
    outline ??= placesApi.campus().catch(() => ((outline = null), null));
    outline.then((c) => alive && setCampus(c));
    return () => {
      alive = false;
    };
  }, []);
  return campus;
}
