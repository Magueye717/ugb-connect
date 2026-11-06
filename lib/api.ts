import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { deleteSecure, getSecure, setSecure } from './secureStorage';

/**
 * Backend base URL. Set EXPO_PUBLIC_API_URL (e.g. https://api.ugb-connect.sn/api/v1) for real builds.
 * In development without it, the API is assumed on port 3000 of the machine running Metro, so a phone on the
 * same Wi-Fi reaches it without any configuration.
 */
function resolveBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (configured) return configured.replace(/\/$/, '');
  if (Platform.OS === 'web' && typeof window !== 'undefined') return `${window.location.protocol}//${window.location.hostname}:3000/api/v1`;
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host?.endsWith('.exp.direct')) {
    console.warn('expo start --tunnel only forwards Metro: set EXPO_PUBLIC_API_URL (see .env.local) so the app can reach the API.');
  }
  return `http://${host ?? 'localhost'}:3000/api/v1`;
}

export const API_URL = resolveBaseUrl();

const TIMEOUT_MS = 15_000;
const REFRESH_KEY = 'ugb.refreshToken';

/** Error returned by the backend (problem+json), or a network failure (status 0). `message` is French and can be shown as is. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }

  get isNetwork() {
    return this.status === 0;
  }
}

export type Tokens = { accessToken: string; accessTokenExpiresAt: string; refreshToken: string; refreshTokenExpiresAt: string };

type Options = { body?: unknown; auth?: boolean; signal?: AbortSignal };

async function send<T>(method: string, path: string, { body, auth = false }: Options, accessToken: string | null): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(auth && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Connexion impossible. Vérifie ta connexion internet et réessaie.');
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const { code, message, ...details } = (data ?? {}) as { code?: string; message?: string };
    throw new ApiError(res.status, code ?? 'HTTP_ERROR', message ?? 'Une erreur est survenue. Réessaie.', details);
  }
  return data as T;
}

// ---- Session: access token in memory, refresh token in secure storage -----------------------------------------

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
let onExpired: (() => void) | null = null;

export const session = {
  /** Called when the refresh token is refused: the user must sign in again. */
  onExpired(handler: (() => void) | null) {
    onExpired = handler;
  },
  async save(tokens: Tokens) {
    accessToken = tokens.accessToken;
    await setSecure(REFRESH_KEY, tokens.refreshToken);
  },
  async clear() {
    accessToken = null;
    await deleteSecure(REFRESH_KEY);
  },
  storedRefreshToken: () => getSecure(REFRESH_KEY),
  /** For connections that authenticate outside fetch (the chat's WebSocket). Null when signed out. */
  async accessToken(): Promise<string | null> {
    if (accessToken) return accessToken;
    return (await session.refresh()) ? accessToken : null;
  },
  /**
   * Exchanges the stored refresh token for new tokens. Concurrent callers share one request: the backend rotates
   * refresh tokens and treats a second use of the same one as theft.
   */
  refresh(): Promise<boolean> {
    refreshing ??= (async () => {
      try {
        const refreshToken = await getSecure(REFRESH_KEY);
        if (!refreshToken) return false;
        const tokens = await send<Tokens>('POST', '/auth/refresh', { body: { refreshToken } }, null);
        await session.save(tokens);
        return true;
      } catch (err) {
        // Only a refusal ends the session; a network error keeps it for the next try.
        if (err instanceof ApiError && err.status === 401) {
          await session.clear();
          return false;
        }
        throw err;
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  },
};

/** Calls the API. With `auth`, sends the access token and, on 401, refreshes once and retries. */
export async function api<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, options: Options = {}): Promise<T> {
  try {
    return await send<T>(method, path, options, accessToken);
  } catch (err) {
    if (!(options.auth && err instanceof ApiError && err.status === 401)) throw err;
    if (await session.refresh()) return send<T>(method, path, options, accessToken);
    onExpired?.();
    throw err;
  }
}

/** Sent with sign-in so the session list can show where each session lives. */
export const deviceInfo = () => ({ platform: Platform.OS, appVersion: Constants.expoConfig?.version ?? 'dev' });
