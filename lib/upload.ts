import { File } from 'expo-file-system';

import { API_URL, ApiError, session } from '@/lib/api';

export type UploadedImage = { id: string; url: string; width: number; height: number };
export type UploadedDocument = { id: string; url: string; name: string; bytes: number };
type Purpose = 'banner' | 'event' | 'lost' | 'business' | 'place' | 'avatar' | 'alert';

/**
 * Sends a picture picked on the phone (expo-image-picker `uri`) to the server, which checks and re-encodes it.
 * Returns its id, to attach it to a banner or an event.
 *
 * The global fetch is expo/fetch (SDK 58): FormData takes a real Blob, so the picked file is wrapped in
 * expo-file-system's File (React Native's old `{ uri, name, type }` object isn't understood and fails the request).
 * The server reads the real format from the bytes, so the file name and type sent don't matter.
 */
export function uploadImage(asset: { uri: string }, purpose: Purpose): Promise<UploadedImage> {
  return send<UploadedImage>('images', asset.uri, purpose, undefined, 'Envoi de l’image impossible.');
}

/** A PDF picked with expo-document-picker (an announcement's notice): kept as sent, under its own name. */
export function uploadDocument(asset: { uri: string; name: string }, purpose: Purpose): Promise<UploadedDocument> {
  return send<UploadedDocument>('files', asset.uri, purpose, asset.name, 'Envoi du document impossible.');
}

async function send<T>(kind: 'images' | 'files', uri: string, purpose: Purpose, name: string | undefined, failure: string): Promise<T> {
  const token = await session.accessToken();
  if (!token) throw new ApiError(401, 'UNAUTHENTICATED', 'Connecte-toi pour continuer.');
  const form = new FormData();
  if (name) form.append('file', new File(uri), name);
  else form.append('file', new File(uri));
  let res: Response;
  try {
    res = await fetch(`${API_URL}/media/${kind}?purpose=${purpose}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, body: form });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Connexion impossible. Vérifie ta connexion internet et réessaie.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.code ?? 'HTTP_ERROR', data?.message ?? failure);
  return data as T;
}
