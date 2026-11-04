import { File } from 'expo-file-system';

import { API_URL, ApiError, session } from '@/lib/api';

export type UploadedImage = { id: string; url: string; width: number; height: number };

/**
 * Sends a picture picked on the phone (expo-image-picker `uri`) to the server, which checks and re-encodes it.
 * Returns its id, to attach it to a banner or an event.
 *
 * The global fetch is expo/fetch (SDK 58): FormData takes a real Blob, so the picked file is wrapped in
 * expo-file-system's File (React Native's old `{ uri, name, type }` object isn't understood and fails the request).
 * The server reads the real format from the bytes, so the file name and type sent don't matter.
 */
export async function uploadImage(asset: { uri: string }, purpose: 'banner' | 'event' | 'lost' | 'business' | 'place' | 'avatar'): Promise<UploadedImage> {
  const token = await session.accessToken();
  if (!token) throw new ApiError(401, 'UNAUTHENTICATED', 'Connecte-toi pour continuer.');
  const form = new FormData();
  form.append('file', new File(asset.uri));
  let res: Response;
  try {
    res = await fetch(`${API_URL}/media/images?purpose=${purpose}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, body: form });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Connexion impossible. Vérifie ta connexion internet et réessaie.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.code ?? 'HTTP_ERROR', data?.message ?? 'Envoi de l’image impossible.');
  return data as UploadedImage;
}
